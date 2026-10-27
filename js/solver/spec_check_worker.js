// Web Worker for the specification check (see spec_check.js).
//
//   in:  { type: "start", school, parts?, timeLimitSec? }
//   out: { type: "item", result, index, total }      one per tested object
//   out: { type: "ask", result, index, total }       paused on a failure
//   in:  { type: "answer", action: "retry" | "relax" | "skip" | "end" }
//   out: { type: "done", results, ended }
let answer = null;
const waitAnswer = () => new Promise((res) => { answer = res; });

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  if (msg.type === "answer" && answer) { const a = answer; answer = null; a(msg.action); return; }
  if (msg.type !== "start") return;
  try {
    const { listObjects, testObject } = await import("./spec_check.js");
    const objs = listObjects(msg.school, msg.parts);
    const results = [];
    const opts = { timeLimitSec: msg.timeLimitSec || 2 };
    for (let i = 0; i < objs.length; i++) {
      let r = testObject(msg.school, objs[i], opts);
      while (r.status === "failed") {
        self.postMessage({ type: "ask", result: r, index: i, total: objs.length });
        const action = await waitAnswer();
        if (action === "end") { results.push(r); self.postMessage({ type: "done", results, ended: true }); return; }
        if (action === "skip") { r = { ...r, status: "skipped" }; break; }
        r = testObject(msg.school, objs[i], { ...opts, timeLimitSec: opts.timeLimitSec * 2, dropRelations: action === "relax" });
        if (r.status === "passed" && action === "relax") r = { ...r, status: "relaxed" };
      }
      results.push(r);
      self.postMessage({ type: "item", result: r, index: i, total: objs.length });
    }
    self.postMessage({ type: "done", results, ended: false });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message || err) });
  }
};
