// Web Worker wrapper around csp_solver.solve.
//
// Message contract (frontend ↔ worker):
//   in:  { type: "solve", school, options, seed? }
//   out: { type: "progress", iter, softScore, hardConflicts, durationMs }
//   out: { type: "done", result: SolveResponse }
//   out: { type: "error", message }
//
// The worker is an ES module: load it as `new Worker(url, { type: "module" })`.

import { solve } from "./csp_solver.js";

self.onmessage = (ev) => {
  const msg = ev.data || {};
  if (msg.type !== "solve") return;
  try {
    const onProgress = (p) => self.postMessage({ type: "progress", ...p });
    const result = solve(msg.school, {
      ...(msg.options || {}),
      seed: msg.seed,
      onProgress,
    });
    self.postMessage({ type: "done", result });
  } catch (e) {
    self.postMessage({ type: "error", message: String((e && e.message) || e) });
  }
};
