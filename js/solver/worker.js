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

import { solve } from "./csp_solver.js";

self.onmessage = (ev) => {
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
    self.postMessage({ type: "error", message: String((e && e.message) || e) });
  } finally {
    clearInterval(ticker);
  }
};
