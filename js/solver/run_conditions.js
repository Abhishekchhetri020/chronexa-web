// Conditions for this run — aSc's "Draft generation" switchboard.
//
// aSc lets the user switch whole families of constraints off for a quick
// draft and back on for the real run. Here each family is On or Off; an Off
// family is removed from the COPY of the school the solver receives, never
// from the file. Stored in school.globals.runConditions = { off: [familyId] }.

const TEACHER_LIMIT_FIELDS = ["maxPerDay", "maxConsecutivePeriods", "maxGapsPerDay", "maxLastPeriodOverflow", "intervalMaxDays"];
const TEACHER_LIMIT_KEYS = ["teachers_maxgapsweek", "teachers_maxgapsday", "teachers_maxconsecutiveperiods",
  "lessonsPerDayMin", "lessonsPerDayMax", "maxDaysPerWeek", "maxOnConditional"];

const hasValue = (v) => v !== undefined && v !== null && v !== "" && v !== "*";

/** Families present in this school, with how many items each switches. */
export function listFamilies(school, typeLabels = {}) {
  const out = [];
  const byTyp = new Map();
  for (const r of school.relations || []) {
    if (r.disabled) continue;
    byTyp.set(r.typ, (byTyp.get(r.typ) || 0) + 1);
  }
  for (const [typ, n] of [...byTyp].sort()) {
    out.push({ id: "rel:" + typ, group: "Card relationships", label: typeLabels[typ] || typ, count: n });
  }
  const tl = (school.teachers || []).filter((t) =>
    TEACHER_LIMIT_FIELDS.some((f) => hasValue(t[f])) || TEACHER_LIMIT_KEYS.some((k) => hasValue(t.constraints && t.constraints[k]))).length;
  if (tl) out.push({ id: "teacher-limits", group: "Limits", label: "Teacher limits (gaps, lessons per day, consecutive, days)", count: tl });
  const cl = (school.classes || []).filter((c) => c.constraints && Object.keys(c.constraints).length).length;
  if (cl) out.push({ id: "class-limits", group: "Limits", label: "Class constraints (lunch, class-teacher slot, teaching window)", count: cl });
  return out;
}

export function offSet(school) {
  const rc = school && school.globals && school.globals.runConditions;
  return new Set((rc && rc.off) || []);
}

/** The school the solver should see: Off families stripped from a copy. */
export function applyRunConditions(school) {
  const off = offSet(school);
  if (!off.size) return school;
  const out = { ...school };
  out.relations = (school.relations || []).map((r) => (off.has("rel:" + r.typ) ? { ...r, disabled: true } : r));
  if (off.has("teacher-limits")) {
    out.teachers = (school.teachers || []).map((t) => {
      const n = { ...t };
      for (const f of TEACHER_LIMIT_FIELDS) delete n[f];
      if (t.constraints) { n.constraints = { ...t.constraints }; for (const k of TEACHER_LIMIT_KEYS) delete n.constraints[k]; }
      return n;
    });
  }
  if (off.has("class-limits")) out.classes = (school.classes || []).map((c) => ({ ...c, constraints: {} }));
  return out;
}
