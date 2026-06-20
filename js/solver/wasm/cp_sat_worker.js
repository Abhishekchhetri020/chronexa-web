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

self.onmessage = async (ev) => {
  const m = ev.data || {};
  if (m.type !== "solve") return;
  if (typeof WebAssembly.promising !== "function") {
    self.postMessage({ type: "error", message: "This browser doesn't support JSPI (WebAssembly.promising). The in-browser CP-SAT solver needs Chrome/Edge 132+, Firefox, or Safari 18.4+. Use “Run on cloud” instead." });
    return;
  }
  try {
    const result = await buildAndSolve(m.school, {
      // Symmetry-breaking is too costly for the asyncify WASM build (it blocks
      // first-solution finding); the portfolio + LNS reach good placement
      // without it.
      symBreak: false,
      ...(m.options || {}),
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
    self.postMessage({ type: "done", result });
  } catch (err) {
    self.postMessage({ type: "error", message: (err && (err.stack || err.message)) || String(err) });
  }
};
