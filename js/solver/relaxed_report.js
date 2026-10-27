// Relaxed-conditions report — aSc's "OK. Show me the relaxed conditions."
//
// After a run, list every card relationship and every per-teacher limit the
// timetable breaks, grouped by importance (strict / high / normal / low), so
// "generated with relaxation" names WHAT was relaxed. Read-only: evaluates
// school.cards as they are.

import { check as checkRelation, TYPS } from "./relation_enforcer.js";

export const IMPORTANCE_ORDER = ["strict", "high", "normal", "low"];

function importanceOf(rel) {
  const i = rel.importance || "normal";
  return IMPORTANCE_ORDER.includes(i) ? i : "normal";
}

/** Relations that at least one placed card violates, with violation counts. */
export function relationViolations(school) {
  const out = [];
  for (const rel of school.relations || []) {
    if (rel.disabled || !TYPS[rel.typ]) continue;
    const only = { ...school, relations: [rel] };
    let count = 0;
    const examples = [];
    for (const c of school.cards || []) {
      const r = checkRelation(only, c.lessonId, c.day, c.period);
      const msgs = [...r.hard, ...r.soft];
      if (!msgs.length) continue;
      count++;
      if (examples.length < 3) examples.push({ lessonId: c.lessonId, day: c.day, period: c.period, message: msgs[0] });
    }
    if (count) out.push({ kind: "relation", id: rel.id, typ: rel.typ, label: TYPS[rel.typ].label,
      importance: importanceOf(rel), count, examples });
  }
  return out;
}

const num = (v) => {
  if (v === "" || v == null || v === "*" || v === "i") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/** Per-teacher limits (edit sheet fields, falling back to the Constraints dialog keys). */
export function teacherLimits(t) {
  const c = t.constraints || {};
  return {
    maxPerDay:     num(t.maxPerDay) ?? num(c.lessonsPerDayMax),
    minPerDay:     num(c.lessonsPerDayMin),
    maxConsec:     num(t.maxConsecutivePeriods) ?? num(c.teachers_maxconsecutiveperiods),
    maxGapsDay:    num(t.maxGapsPerDay) ?? num(c.teachers_maxgapsday),
    maxGapsWeek:   num(c.teachers_maxgapsweek),
    maxDaysWeek:   num(c.maxDaysPerWeek),
  };
}

/** Teacher occupancy: Map teacherId → Map day → sorted periods. */
function occupancy(school) {
  const lessonById = new Map((school.lessons || []).map((l) => [l.id, l]));
  const occ = new Map();
  for (const c of school.cards || []) {
    const l = lessonById.get(c.lessonId);
    if (!l) continue;
    const span = Math.max(1, l.periodsPerCard | 0);
    for (const t of l.teacherIds || []) {
      if (!occ.has(t)) occ.set(t, new Map());
      const days = occ.get(t);
      if (!days.has(c.day)) days.set(c.day, new Set());
      for (let k = 0; k < span; k++) days.get(c.day).add(c.period + k);
    }
  }
  for (const days of occ.values()) for (const [d, s] of days) days.set(d, [...s].sort((a, b) => a - b));
  return occ;
}

function longestRun(ps) {
  let best = 0, run = 0;
  for (let i = 0; i < ps.length; i++) { run = i && ps[i] === ps[i - 1] + 1 ? run + 1 : 1; best = Math.max(best, run); }
  return best;
}

/** Teacher limits the placement exceeds. Limits are soft in the solver, hence "relaxed". */
export function limitViolations(school) {
  const occ = occupancy(school);
  const out = [];
  for (const t of school.teachers || []) {
    const L = teacherLimits(t);
    const days = occ.get(t.id);
    if (!days) continue;
    const name = t.name || t.short || t.id;
    let gapsWeek = 0;
    const push = (rule, limit, actual, where) =>
      out.push({ kind: "limit", entity: "teacher", id: t.id, name, rule, limit, actual, where, importance: "normal" });
    for (const [d, ps] of [...days].sort((a, b) => a[0] - b[0])) {
      const gaps = ps[ps.length - 1] - ps[0] + 1 - ps.length;
      gapsWeek += gaps;
      if (L.maxGapsDay != null && gaps > L.maxGapsDay) push("Max gaps per day", L.maxGapsDay, gaps, d);
      if (L.maxPerDay != null && ps.length > L.maxPerDay) push("Max lessons per day", L.maxPerDay, ps.length, d);
      if (L.minPerDay != null && ps.length < L.minPerDay) push("Min lessons per day", L.minPerDay, ps.length, d);
      const run = longestRun(ps);
      if (L.maxConsec != null && run > L.maxConsec) push("Max consecutive periods", L.maxConsec, run, d);
    }
    if (L.maxGapsWeek != null && gapsWeek > L.maxGapsWeek) push("Max gaps per week", L.maxGapsWeek, gapsWeek, null);
    if (L.maxDaysWeek != null && days.size > L.maxDaysWeek) push("Max days per week", L.maxDaysWeek, days.size, null);
  }
  return out;
}

/** Everything the current timetable relaxes, grouped by importance. */
export function relaxedReport(school) {
  // Solver output can carry expanded ids ("<lesson>#2"); score against the lesson.
  const known = new Set((school.lessons || []).map((l) => l.id));
  const cards = (school.cards || []).map((c) => {
    const base = String(c.lessonId).replace(/#\d+$/, "");
    return known.has(c.lessonId) || !known.has(base) ? c : { ...c, lessonId: base };
  });
  school = { ...school, cards };
  const items = [...relationViolations(school), ...limitViolations(school)];
  const byImportance = Object.fromEntries(IMPORTANCE_ORDER.map((k) => [k, items.filter((i) => i.importance === k)]));
  return { total: items.length, items, byImportance };
}
