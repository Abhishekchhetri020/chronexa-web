// Web Worker wrapper around csp_solver.solve.
//
// Message contract (frontend ↔ worker):
//   in:  { type: "solve", school, options, seed? }
//   out: { type: "progress", iter, softScore, hardConflicts, backtracks, durationMs }
//   out: { type: "done", result: SolveResponse }
//   out: { type: "error", message }
//
// Progress posting is coalesced: the solver's onProgress callback updates a
// `latest` snapshot, and a 500ms setInterval ships it to the main thread.
// This keeps the channel quiet on tight branches but live during long ones.
//
// The worker is an ES module: load it as `new Worker(url, { type: "module" })`.

// Static-analyzable dynamic import — Vite splits csp_solver into its own
// hashed chunk, so cache-busting no longer needs a ?v= query.
// Buffer messages received before the dynamic import resolves.
let solve = null;
const _pending = [];
import("./csp_solver.js").then(mod => {
  solve = mod.solve;
  while (_pending.length) handle(_pending.shift());
}).catch(err => {
  self.postMessage({ type: "error", message: "solver load failed: " + (err && err.message || err) });
});

function handle(ev) {
  const msg = ev.data || {};
  if (msg.type !== "solve") return;

  let latest = null;
  let sentAt = 0;
  const TICK_MS = 500;

  const onProgress = (p) => {
    latest = p;
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (now - sentAt >= TICK_MS) {
      sentAt = now;
      self.postMessage({ type: "progress", ...p });
    }
  };
  const ticker = setInterval(() => {
    if (latest) {
      sentAt = (typeof performance !== "undefined" ? performance.now() : Date.now());
      self.postMessage({ type: "progress", ...latest });
    }
  }, TICK_MS);

  try {
    const result = solve(msg.school, {
      ...(msg.options || {}),
      seed: msg.seed,
      onProgress,
    });
    // Flush the final progress snapshot (if any) before done.
    if (latest) self.postMessage({ type: "progress", ...latest });
    self.postMessage({ type: "done", result });
  } catch (e) {
    // Include the stack — "Maximum call stack size exceeded" with no frames
    // made a data-dependent crash undiagnosable from the UI.
    self.postMessage({ type: "error", message: String((e && (e.stack || e.message)) || e) });
  } finally {
    clearInterval(ticker);
  }
}

self.onmessage = (ev) => {
  if (solve) handle(ev);
  else _pending.push(ev);
};
