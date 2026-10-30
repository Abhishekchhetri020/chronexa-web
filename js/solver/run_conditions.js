// Conditions for this run — aSc's "Draft generation" switchboard.
//
// aSc lets the user switch whole families of constraints off for a quick
// draft and back on for the real run. Here each family is On or Off; an Off
// family is removed from the COPY of the school the solver receives, never
// from the file. Stored in school.globals.runConditions = { off: [familyId] }.

import { rowsFor, hasValue as keyHasValue } from "./constraint_keys.js";

// Derived from the constraint registry rather than hand-listed, so a key added
// to the Teacher constraints dialog is switched by this family automatically
// and can never be silently left behind in a draft run.
const TEACHER_ROWS = rowsFor("teacher").filter((r) => r.dialog === "teacher");
const TEACHER_LIMIT_KEYS = TEACHER_ROWS.map((r) => r.key);
const TEACHER_LIMIT_FIELDS = [...new Set(TEACHER_ROWS.map((r) => r.topLevel).filter(Boolean))];

const hasValue = keyHasValue;

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
