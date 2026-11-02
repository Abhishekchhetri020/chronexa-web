// Run the solver and APPLY the result to the school — one place, both callers.
//
// The pre-launch dialog collects mode / speed / conditions and then hands a cfg
// to whoever opened it (`onConfirm`). Until now nothing supplied that callback
// from the Generate button, so pressing "Build best timetable" closed the dialog
// and changed nothing: the user sat looking at "12 unplaced". The master-solver
// wizard had its own copy of this logic; this module is the shareable one.

/**
 * @param {object} school  the live APP.school
 * @param {object} cfg     { mode, generatorMode, timeLimitSec, algorithm, complexity, conditions }
 * @param {(phase:string, detail:string)=>void} [onProgress]
 * @returns {Promise<{placed:number,total:number,status:string}>}
 */
export async function runAndApply(school, cfg, onProgress) {
  const log = (phase, detail) => { try { if (onProgress) onProgress(phase, detail); } catch {} };
  const total = (school.lessons || []).reduce((n, l) => n + (l.periodsPerWeek || 0), 0);
  if (!school || !(school.lessons || []).length) return { placed: 0, total: 0, status: "no lessons" };
  if (!window.SolverUI || typeof window.SolverUI.run !== "function") {
    return { placed: 0, total, status: "solver unavailable" };
  }

  const options = {
    timeLimitSec: Math.max(5, Number(cfg && cfg.timeLimitSec) || 60),
    verbose: false,
  };
  if (cfg && cfg.mode === "improve") { options.improveOnly = true; options.warmStart = true; }
  if (cfg && cfg.generatorMode === "add_unplaced") { options.addUnplacedOnly = true; options.warmStart = true; }

  // "rebuild" must start from nothing, or the solver keeps the old cards.
  if (!options.improveOnly && !options.addUnplacedOnly) {
    window.APP.mutate("Clear placed cards before generate", (s) => { s.cards = []; });
  }

  log("run", `solving ${total} periods…`);
  const algorithm = (cfg && cfg.algorithm) || "browser";
  let source;
  try {
    source = window.SolverUI.run({ school, options, algorithm });
  } catch (e) {
    return { placed: 0, total, status: "solver threw: " + (e && e.message) };
  }

  const result = await new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    try {
      if (typeof source.subscribe === "function") {
        source.subscribe((ev) => {
          if (!ev) return;
          if (ev.type === "progress") log("progress", String(ev.placed || ev.progress || ""));
          if (ev.type === "error") finish({ error: ev.message });
          if (ev.type === "done") finish(ev.result || ev.data || ev);
        });
      }
      if (typeof source.onResult === "function") source.onResult = (r) => finish(r);
    } catch {}
    setTimeout(() => finish(null), (options.timeLimitSec + 20) * 1000);
  });

  const assignment = result && (result.assignment || (result.result && result.result.assignment));
  if (!assignment) {
    return { placed: (school.cards || []).length, total, status: (result && result.error) || "no result" };
  }
  const cards = assignment.map((a) => ({
    lessonId: a.lessonId, day: a.day, period: a.period,
    classroomId: a.classroomId || null,
  }));
  window.APP.mutate("Apply generated timetable", (s) => { s.cards = cards; });
  if (window.CreateNew && typeof window.CreateNew.refreshIndex === "function") window.CreateNew.refreshIndex();
  log("applied", `${cards.length}/${total}`);
  return { placed: cards.length, total, status: "ok" };
}

export default { runAndApply };
