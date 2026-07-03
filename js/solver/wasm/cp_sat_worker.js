/* Chronexa — in-browser OR-Tools CP-SAT worker.
 *
 * Runs the full CP-SAT portfolio (6 full subsolvers + LNS) entirely client-side
 * via the committed static WASM build in ./dist. Spawned by backend_client.js
 * when the user picks the "Run CP-SAT in browser" algorithm.
 *
 * Message protocol (matches js/solver/worker.js so backend_client treats it the
 * same way):
 *   in : { type:"solve", school, options }
 *   out: { type:"progress", iter, softScore, hardConflicts, durationMs }
 *        { type:"done", result }      // SolveResponse (same shape as the backend)
 *        { type:"error", message }
 *
 * Requirements: the page must be cross-origin isolated (COOP/COEP) so WASM
 * threads + SharedArrayBuffer are available — see sw.js (coi headers).
 */

// The committed dist/ is the JSPI build (native wasm exceptions). It needs
// WebAssembly.promising (Chrome 132+, modern Firefox/Safari). The runtime
// loader auto-selects JSPI when promising is a function.
import { buildAndSolve } from "./cp_sat_solver.mjs";

// Mirror solver diagnostics to the page: worker console output is invisible
// in some tooling contexts, so forward console.error lines as {type:"log"}
// messages (clients that don't handle the type ignore them).
{
  const _err = console.error.bind(console);
  console.error = (...a) => {
    _err(...a);
    try { self.postMessage({ type: "log", line: a.map(String).join(" ") }); } catch {}
  };
}

self.onmessage = async (ev) => {
  const m = ev.data || {};
  if (m.type !== "solve") return;
  if (typeof WebAssembly.promising !== "function") {
    self.postMessage({ type: "error", message: "This browser doesn't support JSPI (WebAssembly.promising). The in-browser CP-SAT solver needs Chrome/Edge 132+, Firefox, or Safari 18.4+. Use “Run on cloud” instead." });
    return;
  }
  try {
    // Single search worker: the OR-Tools WASM JSPI build does not reliably
    // enforce maxTimeInSeconds with multiple pthread workers (nested worker
    // deadlock). Single-threaded solve is slower but actually terminates.
    const timeLimit = (m.options && m.options.timeLimitSec) || 90;
    // JS-level watchdog: if the solver exceeds the budget by 30%, force-abort.
    // The OR-Tools maxTimeInSeconds is our primary limiter, but the WASM
    // pthread build sometimes deadlocks and ignores it — this guarantees we
    // never hang. The watchdog first tries a clean cancel via cancelCheck (the
    // next solution callback fires stopSearch), then terminates the worker as
    // a last resort for the deadlock case (stuck inside pthreads).
    let watchdogFired = false;
    const watchdog = setTimeout(() => {
      watchdogFired = true;
      self.postMessage({ type: "error", message: "WASM solver watchdog timed out (> " + (timeLimit * 1.3) + "s). The solver may be stuck — try a different algorithm." });
      setTimeout(() => { try { self.close(); } catch {} }, 500);
    }, timeLimit * 1300);
    const result = await buildAndSolve(m.school, {
      symBreak: false,
      ...(m.options || {}),
      numWorkers: 1,           // forced — JSPI pthread deadlock workaround (caller override ignored)
      cancelCheck: () => watchdogFired,
      progressFn: (placed, ms) => {
        try {
          self.postMessage({
            type: "progress",
            iter: placed | 0,
            softScore: 0,
            hardConflicts: 0,
            durationMs: ms | 0,
          });
        } catch {}
      },
    });
    clearTimeout(watchdog);
    if (!watchdogFired) self.postMessage({ type: "done", result });
  } catch (err) {
    self.postMessage({ type: "error", message: (err && (err.stack || err.message)) || String(err) });
  }
};
