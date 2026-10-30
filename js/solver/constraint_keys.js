// Constraint-key registry — ONE table that answers, for every limit the UI can
// store, which solver actually reads it.
//
// Why this file exists (Round 3 bug R3-B1, and the aSc practice it copies):
// entity dialogs and solvers had no shared registry, so a dialog could happily
// persist a key that no solver ever read. aSc ships exactly this registry —
// the editor fetches `getConstraintKeyResolutionData` on load and its AI layer
// refuses to set a key that is not in it. We now do the same, but statically.
//
// Rules
//  - Every key a dialog writes MUST have a row here (`dialogs` lists it).
//  - `solvers.js|wasm|cloud` holds the field name that solver reads, or null.
//    null everywhere + `uiOnly` = stored but not enforced: the dialog must say
//    so, and `__tests__/constraint_keys.test.js` enforces the honesty.
//  - The test greps the three solver sources for each field name, so the table
//    cannot drift away from the code it describes.
//
// aSc key names are kept verbatim (`teachers_maxgapsday`, `m_nMaxVyucOd`, …) so
// XML import/export stays lossless. Where Chronexa renamed a key, `ascKey` says
// what aSc calls it.

export const SOLVERS = Object.freeze(["js", "wasm", "cloud"]);

/** Files the drift test reads for each solver. */
export const SOLVER_SOURCES = Object.freeze({
  js: "js/solver/csp_solver.js",
  wasm: "js/solver/wasm/cp_sat_solver.mjs",
  cloud: "backend/solver_cpsat.py",
});

/**
 * @typedef {Object} ConstraintKeyRow
 * @property {string} entity        teacher | class | classroom | subject | school
 * @property {string} key           stored key (aSc name unless ascKey differs)
 * @property {string} [ascKey]      aSc's own name when Chronexa differs
 * @property {string} label         what the dialog calls it
 * @property {"int"|"intOrAny"|"bool"|"mask"|"object"} kind
 * @property {"hard"|"soft"|"none"} weight
 * @property {string|null} dialog   which dialog writes it (null = not in a dialog)
 * @property {string} [topLevel]    duplicate field on the entity itself
 * @property {Object} solvers       { js, wasm, cloud } field names or null
 * @property {Object} [probes]      source tokens when the field name is not literal
 * @property {string} [uiOnly]      reason it is stored but unenforced
 */

/** @type {readonly ConstraintKeyRow[]} */
export const CONSTRAINT_KEYS = Object.freeze([
  // ── Teachers ────────────────────────────────────────────────────────────
  {
    entity: "teacher", key: "teachers_maxgapsweek", label: "Max gaps per week",
    kind: "intOrAny", weight: "soft", dialog: "teacher",
    solvers: { js: "teacherMaxGapsPerWeek", wasm: null, cloud: "gap_cap_week" },
  },
  {
    entity: "teacher", key: "teachers_maxgapsday", label: "Max gaps per day",
    kind: "intOrAny", weight: "soft", dialog: "teacher", topLevel: "maxGapsPerDay",
    solvers: { js: "teacherMaxGapsPerDay", wasm: null, cloud: "gap_cap_day" },
  },
  {
    entity: "teacher", key: "teachers_maxconsecutiveperiods", label: "Max consecutive periods",
    kind: "intOrAny", weight: "soft", dialog: "teacher", topLevel: "maxConsecutivePeriods",
    solvers: { js: "teacherMaxConsec", wasm: "teacherMaxConsec", cloud: "tmax_consec" },
  },
  {
    entity: "teacher", key: "lessonsPerDayMax", label: "Number of lessons per day — Till",
    kind: "intOrAny", weight: "hard", dialog: "teacher", topLevel: "maxPerDay",
    solvers: { js: "teacherMaxPerDay", wasm: "teacherMaxPerDay", cloud: "teacher_max_per_day" },
  },
  {
    entity: "teacher", key: "maxDaysPerWeek", label: "Max days per week",
    kind: "intOrAny", weight: "soft", dialog: "teacher", topLevel: "intervalMaxDays",
    solvers: { js: "teacherIntervalMaxDays", wasm: "teacherIntervalMaxDays", cloud: null },
  },
  {
    entity: "teacher", key: "maxLastPeriodOverflow", label: "Last-period overflow",
    kind: "intOrAny", weight: "soft", dialog: null,
    solvers: { js: "teacherLastPeriodCap", wasm: "teacherLastPeriodCap", cloud: null },
  },
  {
    entity: "teacher", key: "lessonsPerDayMin", label: "Number of lessons per day — From",
    kind: "intOrAny", weight: "none", dialog: "teacher",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Stored for aSc parity; no solver enforces a daily minimum yet.",
  },
  {
    entity: "teacher", key: "maxOnConditional", label: "Max. on the question marked",
    kind: "intOrAny", weight: "none", dialog: "teacher",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Needs the question-marked (conditional) card flag, which Chronexa does not have yet.",
  },
  {
    entity: "teacher", key: "supervisionMinCount", label: "Supervisions: Min Count",
    kind: "int", weight: "none", dialog: "teacher",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Supervision duty is not scheduled by any solver yet.",
  },
  {
    entity: "teacher", key: "supervisionMaxCount", label: "Supervisions: Max Count",
    kind: "int", weight: "none", dialog: "teacher",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Supervision duty is not scheduled by any solver yet.",
  },
  {
    entity: "teacher", key: "supervisionMinMinutes", label: "Supervisions: Min Minutes",
    kind: "int", weight: "none", dialog: "teacher",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Supervision duty is not scheduled by any solver yet.",
  },
  {
    entity: "teacher", key: "supervisionMaxMinutes", label: "Supervisions: Max Minutes",
    kind: "int", weight: "none", dialog: "teacher",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Supervision duty is not scheduled by any solver yet.",
  },
  {
    entity: "teacher", key: "maxquestionmarked", label: "Max question-marked cards",
    kind: "intOrAny", weight: "none", dialog: null,
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Imported from aSc; the conditional-card concept is not implemented.",
  },
  {
    entity: "teacher", key: "maxquestionmarkedinterval", label: "Question-marked interval",
    kind: "object", weight: "none", dialog: null,
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Imported from aSc; the conditional-card concept is not implemented.",
  },

  // ── Classes ─────────────────────────────────────────────────────────────
  {
    entity: "class", key: "classTeacherPos", ascKey: "classteacherpos",
    label: "Class-teacher positions", kind: "mask", weight: "soft", dialog: "class",
    solvers: { js: "classTeacherPosMask", wasm: "classTeacherPosMask", cloud: "ctp" },
  },
  {
    entity: "class", key: "lunch_periodfrom", label: "Lunch break — from",
    kind: "intOrAny", weight: "soft", dialog: "class",
    solvers: { js: "classLunchMask", wasm: "classLunchMask", cloud: "lunch" },
  },
  {
    entity: "class", key: "lunch_periodto", label: "Lunch break — to",
    kind: "intOrAny", weight: "soft", dialog: "class",
    solvers: { js: "classLunchMask", wasm: "classLunchMask", cloud: "lunch" },
  },
  {
    entity: "class", key: "m_nMaxVyucOd", label: "Teaching window — from",
    kind: "intOrAny", weight: "soft", dialog: "class",
    solvers: { js: "classTeachingMask", wasm: "classTeachingMask", cloud: "outside" },
  },
  {
    entity: "class", key: "m_nMaxVyucDo", label: "Teaching window — to",
    kind: "intOrAny", weight: "soft", dialog: "class",
    solvers: { js: "classTeachingMask", wasm: "classTeachingMask", cloud: "outside" },
  },
  {
    entity: "class", key: "m_nMinBlokOd", label: "Required block — from",
    kind: "intOrAny", weight: "soft", dialog: "class",
    solvers: { js: "classBlockMask", wasm: "classBlockMask", cloud: null },
  },
  {
    entity: "class", key: "m_nMinBlokDo", label: "Required block — to",
    kind: "intOrAny", weight: "soft", dialog: "class",
    solvers: { js: "classBlockMask", wasm: "classBlockMask", cloud: null },
  },
  {
    entity: "class", key: "m_bDruheHodiny", label: "Second periods",
    kind: "bool", weight: "soft", dialog: "class",
    solvers: { js: "classDruheHodiny", wasm: "classDruheHodiny", cloud: null },
  },
  {
    entity: "class", key: "m_bKoncitNaraz", label: "Finish at the same time",
    kind: "bool", weight: "soft", dialog: "class",
    solvers: { js: "classKoncitNaraz", wasm: null, cloud: null },
  },
  {
    entity: "class", key: "m_nManualnyBlok", label: "Manual block",
    kind: "int", weight: "soft", dialog: "class",
    solvers: { js: "classManualnyBlok", wasm: "classManualnyBlok", cloud: null },
  },
  {
    entity: "class", key: "minperiodsday", label: "Lessons per day — from",
    kind: "intOrAny", weight: "soft", dialog: "class", topLevel: "minPerDay",
    solvers: { js: "classMinPerDay", wasm: null, cloud: "cunder" },
  },
  {
    entity: "class", key: "maxperiodsday", label: "Lessons per day — till",
    kind: "intOrAny", weight: "hard", dialog: "class", topLevel: "maxPerDay",
    solvers: { js: "classMaxPerDay", wasm: null, cloud: "class_max_per_day" },
  },
  {
    entity: "class", key: "maxdaysweek", label: "Max days per week",
    kind: "intOrAny", weight: "none", dialog: "class",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Imported from aSc; not enforced for classes.",
  },
  {
    entity: "class", key: "maxneedspreparation", label: "Max lessons needing preparation",
    kind: "intOrAny", weight: "none", dialog: "class",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Stored for aSc parity; no solver enforces it.",
  },
  {
    entity: "class", key: "maxquestionmarked", label: "Max question-marked cards",
    kind: "intOrAny", weight: "none", dialog: null,
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Imported from aSc; the conditional-card concept is not implemented.",
  },

  // ── Classrooms ──────────────────────────────────────────────────────────
  {
    entity: "classroom", key: "maxCardsPos", label: "Max cards on one period",
    kind: "int", weight: "none", dialog: "classroom",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Stored for aSc parity; no solver enforces it.",
  },
  {
    entity: "classroom", key: "maxStudentsPos", label: "Max students on one period",
    kind: "int", weight: "none", dialog: "classroom",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Stored for aSc parity; no solver enforces it.",
  },

  // ── Subjects ────────────────────────────────────────────────────────────
  {
    entity: "subject", key: "maxParallel", label: "Max cards on one period",
    kind: "int", weight: "hard", dialog: null,
    solvers: { js: "subjectMaxParallel", wasm: "subjectMaxParallel", cloud: "subject_max_parallel" },
    probes: { wasm: "sj.maxParallel" },
  },

  // ── Subject-level scheduling fields (entity fields, not `constraints`) ───
  // Every one of these is stored by the Subject dialog and read by no solver —
  // the R3-B3 pattern, now visible in one place instead of guessed at.
  {
    entity: "subject", key: "noStartPeriods", label: "Cannot start in period(s)",
    kind: "object", weight: "hard", dialog: "subject",
    solvers: { js: "subjectStartBan", wasm: "subjectStartBan", cloud: null },
    probes: { wasm: "subjectStartBan" },
  },
  {
    entity: "subject", key: "noEndPeriods", label: "Cannot end in period(s)",
    kind: "object", weight: "hard", dialog: "subject",
    solvers: { js: "subjectEndBan", wasm: "subjectEndBan", cloud: null },
    probes: { wasm: "subjectEndBan" },
  },
  {
    entity: "subject", key: "minParallel", label: "Min at the same time",
    kind: "int", weight: "soft", dialog: "subject",
    solvers: { js: "subjectMinParallel", wasm: null, cloud: null },
  },
  { entity: "subject", key: "maxPerDay", label: "Max per day",
    kind: "intOrAny", weight: "none", dialog: "subject",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Stored on the subject; the solver applies no per-subject daily cap from this field." },
  { entity: "subject", key: "cardDistribution", label: "Card distribution",
    kind: "object", weight: "none", dialog: "subject",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Preference only — the spread scorers ignore it; use a Card-distribution relation instead." },
  { entity: "subject", key: "doubleLessonsSpanBreaks", label: "Doubles may span breaks",
    kind: "bool", weight: "none", dialog: "subject",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Stored for aSc parity; the double-placement check does not consult it." },
  { entity: "subject", key: "canBeOverLunch", label: "Can be over lunch",
    kind: "bool", weight: "none", dialog: "subject",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Stored for aSc parity; the lunch-window scorer does not consult it." },
  { entity: "subject", key: "homeworkPrepRequired", label: "Homework needs preparation",
    kind: "bool", weight: "none", dialog: "subject",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Feeds homework compliance reporting, not scheduling." },
  { entity: "subject", key: "maxStudents", label: "Max students",
    kind: "int", weight: "none", dialog: "subject",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Capacity is not enforced when placing cards." },
  { entity: "subject", key: "teacherContractLength", label: "Teacher contract length",
    kind: "int", weight: "none", dialog: "subject",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "HR metadata; not a scheduling input." },
  { entity: "subject", key: "temporarySubject", label: "Temporary subject",
    kind: "bool", weight: "none", dialog: "subject",
    solvers: { js: null, wasm: null, cloud: null },
    uiOnly: "Lifecycle flag for temporary subjects; not a scheduling input." },

  // ── School-wide defaults (globals.constraints) ───────────────────────────
  { entity: "school", key: "teacherMaxPerDay", label: "Teachers — max lessons per day",
    kind: "int", weight: "hard", dialog: null,
    solvers: { js: "teacherMaxPerDay", wasm: null, cloud: null } },
  { entity: "school", key: "teacherMaxConsecutive", label: "Teachers — max consecutive",
    kind: "int", weight: "soft", dialog: null,
    solvers: { js: "teacherMaxConsecutive", wasm: null, cloud: null } },
  { entity: "school", key: "teacherMaxLastPeriod", label: "Teachers — last-period cap",
    kind: "int", weight: "soft", dialog: null,
    solvers: { js: "teacherMaxLastPeriod", wasm: null, cloud: null } },
  { entity: "school", key: "teacherMaxGapsPerDay", label: "Teachers — max gaps per day",
    kind: "int", weight: "soft", dialog: null,
    solvers: { js: "teacherMaxGapsPerDay", wasm: null, cloud: null } },
  { entity: "school", key: "teacherMaxGapsPerWeek", label: "Teachers — max gaps per week",
    kind: "int", weight: "soft", dialog: null,
    solvers: { js: "teacherMaxGapsPerWeek", wasm: null, cloud: null } },
  { entity: "school", key: "classMaxPerDay", label: "Classes — max lessons per day",
    kind: "int", weight: "hard", dialog: null,
    solvers: { js: "classMaxPerDay", wasm: null, cloud: null } },
  { entity: "school", key: "classMaxConsecutive", label: "Classes — max consecutive",
    kind: "int", weight: "soft", dialog: null,
    solvers: { js: "classMaxConsecutive", wasm: null, cloud: null } },
  { entity: "school", key: "classMaxGapsPerDay", label: "Classes — max gaps per day",
    kind: "int", weight: "soft", dialog: null,
    solvers: { js: "classMaxGapsPerDay", wasm: null, cloud: null } },
  { entity: "school", key: "subjectDailyLimit", label: "Subjects — per-day limit",
    kind: "int", weight: "hard", dialog: null,
    solvers: { js: "subjectDailyLimit", wasm: null, cloud: null } },
]);

/** Sentinels used by the aSc-format fields: "*" and "i" both mean "no cap". */
export function hasValue(v) {
  return v !== undefined && v !== null && v !== "" && v !== "*" && v !== "i";
}

export function rowsFor(entity) {
  return CONSTRAINT_KEYS.filter((r) => r.entity === entity);
}

export function findRow(entity, key) {
  return CONSTRAINT_KEYS.find((r) => r.entity === entity && r.key === key) || null;
}

/** Which solvers read this row, as ["js","wasm",…]. Empty = stored but inert. */
export function enforcedBy(row) {
  if (!row) return [];
  return SOLVERS.filter((s) => Boolean(row.solvers[s]));
}

export function isEnforced(entity, key) {
  const row = findRow(entity, key);
  return enforcedBy(row).length > 0;
}

/** Rows a dialog may write that no solver reads. */
export function deadRows() {
  return CONSTRAINT_KEYS.filter((r) => enforcedBy(r).length === 0);
}

/** Dead rows, grouped by entity, for the dialogs and for tests. */
export function deadKeysByEntity() {
  const out = {};
  for (const r of deadRows()) (out[r.entity] = out[r.entity] || []).push(r.key);
  return out;
}

/** Honest help text for an unenforced field; null when it is enforced. */
export function enforcementHelp(entity, key) {
  const row = findRow(entity, key);
  if (!row) return "Not in the constraint registry — the solver will ignore it.";
  if (enforcedBy(row).length) return null;
  const solvers = enforcedBy(row).join(", ") || "no solver";
  return `${row.uiOnly || "No solver reads this key"} (enforced by: ${solvers}).`;
}

/**
 * Compare a school's stored data against the registry: which structured keys are
 * set but inert. Used by the UI warning and by the regression test.
 */
export function auditSchool(school) {
  const hits = [];
  if (!school) return hits;
  const push = (entity, row, owner) => {
    if (!row || enforcedBy(row).length) return;
    hits.push({ entity, key: row.key, ownerId: owner && owner.id, ownerName: owner && owner.name });
  };
  for (const t of school.teachers || []) {
    for (const [k, v] of Object.entries(t.constraints || {})) {
      if (hasValue(v)) push("teacher", findRow("teacher", k), t);
    }
  }
  for (const c of school.classes || []) {
    for (const [k, v] of Object.entries(c.constraints || {})) {
      if (hasValue(v)) push("class", findRow("class", k), c);
    }
  }
  for (const r of school.classrooms || []) {
    for (const [k, v] of Object.entries(r.constraints || {})) {
      if (hasValue(v)) push("classroom", findRow("classroom", k), r);
    }
  }
  for (const s of school.subjects || []) {
    for (const [k, v] of Object.entries(s.constraints || {})) {
      if (hasValue(v)) push("subject", findRow("subject", k), s);
    }
  }
  return hits;
}

export default {
  SOLVERS, SOLVER_SOURCES, CONSTRAINT_KEYS,
  hasValue, rowsFor, findRow, enforcedBy, isEnforced,
  deadRows, deadKeysByEntity, enforcementHelp, auditSchool,
};
