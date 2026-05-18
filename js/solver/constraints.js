// Constraint catalog — mirrors the SmartCspSolver weights and failure
// reason names. Lives separately so other modules (UI, violations list,
// XML writer) can import the same identifiers.
//
// The hard constraints are checked inline inside `csp_solver.js#canPlace`
// because they all run in the inner placement loop and need access to the
// solver's flat IntArray model — pulling them out would defeat the
// optimization. What we export here is the catalog: names, IDs, weights,
// and human-readable descriptions.

/** Penalty weights (matches Kotlin ConstraintWeight). */
export const Weight = Object.freeze({
  HARD: Number.MAX_SAFE_INTEGER,
  NEAR_HARD: 50,
  HIGH_SOFT: 25,
  MED_SOFT: 20,
  LOW_SOFT: 10,
  HINT: 5,
});

/** Failure-reason → numeric ID. Used inside the search loop. */
export const FAIL = Object.freeze({
  NO_FEASIBLE_SLOT: 0,
  TEACHER_CONFLICT: 1,
  TEACHER_UNAVAILABLE: 2,
  TEACHER_MAX_PER_DAY: 3,
  CLASS_CONFLICT: 4,
  CLASS_UNAVAILABLE: 5,
  CLASS_MAX_PER_DAY: 6,
  SUBJECT_DAILY_LIMIT: 7,
  ROOM_CONFLICT: 8,
  ROOM_UNAVAILABLE: 9,
  LAB_DOUBLE_OOB: 10,
  LAB_DOUBLE_TEACHER_CONFLICT: 11,
  LAB_DOUBLE_TEACHER_UNAVAILABLE: 12,
  LAB_DOUBLE_TEACHER_MAX_PER_DAY: 13,
  LAB_DOUBLE_CLASS_CONFLICT: 14,
  LAB_DOUBLE_CLASS_UNAVAILABLE: 15,
  LAB_DOUBLE_CLASS_MAX_PER_DAY: 16,
  LAB_DOUBLE_SUBJECT_DAILY_LIMIT: 17,
  LAB_DOUBLE_ROOM_CONFLICT: 18,
  LAB_DOUBLE_ROOM_UNAVAILABLE: 19,
  REQUIRED_ROOM_TYPE: 20,
  FIXED_SLOT_MISMATCH: 21,
});

/** Numeric ID → name string. */
export const FAIL_NAME = Object.freeze({
  0: "no_feasible_slot",
  1: "teacher_conflict",
  2: "teacher_unavailable",
  3: "teacher_max_periods_per_day",
  4: "class_conflict",
  5: "class_unavailable",
  6: "class_max_periods_per_day",
  7: "subject_daily_limit",
  8: "room_conflict",
  9: "room_unavailable",
  10: "lab_double_out_of_bounds",
  11: "lab_double_teacher_conflict",
  12: "lab_double_teacher_unavailable",
  13: "lab_double_teacher_max_per_day",
  14: "lab_double_class_conflict",
  15: "lab_double_class_unavailable",
  16: "lab_double_class_max_per_day",
  17: "lab_double_subject_daily_limit",
  18: "lab_double_room_conflict",
  19: "lab_double_room_unavailable",
  20: "required_room_type_unmet",
  21: "fixed_slot_mismatch",
});

/** Catalog rows (UI uses these for the violations list). */
export const HARD_CONSTRAINTS = Object.freeze([
  {
    id: "HARD_no_two_lessons_same_teacher_same_slot",
    description: "A teacher can teach at most one lesson per (day, period).",
    weight: Weight.HARD,
  },
  {
    id: "HARD_no_two_lessons_same_class_same_slot",
    description: "A class can attend at most one lesson per (day, period).",
    weight: Weight.HARD,
  },
  {
    id: "HARD_no_two_lessons_same_room_same_slot",
    description: "A room can host at most one lesson per (day, period).",
    weight: Weight.HARD,
  },
  {
    id: "HARD_required_room_type",
    description: "Lesson must be placed in a room matching `requiredRoomType`.",
    weight: Weight.HARD,
  },
  {
    id: "HARD_teacher_availability_mask",
    description: "Lesson cannot be placed in a slot marked unavailable for one of its teachers.",
    weight: Weight.HARD,
  },
  {
    id: "HARD_fixed_day_period",
    description: "Lesson with `fixedDay`/`fixedPeriod` must occupy that slot.",
    weight: Weight.HARD,
  },
  {
    id: "HARD_lab_double_period_consecutive",
    description: "Lab-double lessons span two consecutive periods on the same day in the same room.",
    weight: Weight.HARD,
  },
]);

/** Default soft weights — same keys as Kotlin ConstraintConfig.defaultSoftWeights. */
export const DEFAULT_SOFT_WEIGHTS = Object.freeze({
  teacher_gaps: Weight.LOW_SOFT,
  class_gaps: Weight.LOW_SOFT,
  subject_distribution: Weight.MED_SOFT,
  teacher_room_stability: Weight.HINT,
  teacher_consecutive_overload: Weight.NEAR_HARD,
  class_consecutive_overload: Weight.NEAR_HARD,
  teacher_last_period_overflow: Weight.HIGH_SOFT,
  period_load_balance: Weight.MED_SOFT,
});

/** Soft constraint catalog — for the violations panel. */
export const SOFT_CONSTRAINTS = Object.freeze([
  { id: "teacher_gaps", description: "Minimize idle gaps in each teacher's daily timetable." },
  { id: "class_gaps", description: "Minimize idle gaps in each class's daily timetable." },
  { id: "subject_distribution", description: "Avoid more than 2 periods of the same subject in one day." },
  { id: "teacher_room_stability", description: "Prefer keeping a teacher in the same room when possible." },
  { id: "teacher_consecutive_overload", description: "Respect maxConsecutivePeriods per teacher." },
  { id: "class_consecutive_overload", description: "Respect maxConsecutivePeriods per class." },
  { id: "teacher_last_period_overflow", description: "Avoid stacking last-period duties on one teacher." },
  { id: "period_load_balance", description: "Spread load across preferred periods of the day." },
]);

// ---------------------------------------------------------------------------
// CKrit* constraint family — JS ports of the ASC Tabu Search criterion classes.
//
// Each function takes (assignment, lessonsById, schoolData) and returns
// `{violations: int, weight: int}` — `violations` is a non-negative count of
// rule breaks, `weight` is the per-violation penalty (matches the original
// ASC penalty table; see docs/SOLVER_V2.md and Chronexa-AUDIT-Master.md).
//
// Shapes:
//   assignment   — Array<{lessonId, day, period, classroomId?, teacherId, classIds[]}>
//                  (a SolveResponse.assignment[] entry)
//   lessonsById  — Map<string, Lesson> or plain object keyed by lesson.id
//   schoolData   — full SchoolData; we only touch: classroomsupervisions[],
//                  coursegroups[], classes[], teachers[], subjects[],
//                  bell.periods[]
//
// Conventions: `day` is 0-based; `period` is 1-based (matches AssignmentEntry).
// Functions never mutate inputs.
// ---------------------------------------------------------------------------

/** Weight table for the CKrit* family. Source: Chronexa-AUDIT-Master.md table. */
export const CKRIT_WEIGHTS = Object.freeze({
  ckrit_sluzba: 50000,
  ckrit_course_group: 150,
  ckrit_triedny: 10,
  ckrit_resty: 10,
  ckrit_vhodne_na_spojenie: 150,
});

function lessonsByIdMap(lessonsById) {
  // Accept Map<string,Lesson> | Record<string,Lesson> | undefined.
  if (!lessonsById) return null;
  if (typeof lessonsById.get === "function") return lessonsById;
  const m = new Map();
  for (const k of Object.keys(lessonsById)) m.set(k, lessonsById[k]);
  return m;
}

/**
 * CKritSluzba — hall-duty supervision conflict.
 * A teacher pre-occupied via `classroomsupervisions[]` for some (day,period)
 * must not simultaneously have a teaching assignment in that slot.
 * Returns one violation per double-booked (teacher, day, period) supervision.
 */
export function CKritSluzba(assignment, lessonsById, schoolData) {
  const w = CKRIT_WEIGHTS.ckrit_sluzba;
  const sups = (schoolData && schoolData.classroomsupervisions) || [];
  if (!sups.length || !assignment || !assignment.length) {
    return { violations: 0, weight: w };
  }
  // Index assignment by (teacherId, day, period) for O(1) lookup.
  const taught = new Set();
  for (const a of assignment) {
    if (a.teacherId == null) continue;
    taught.add(`${a.teacherId}|${a.day | 0}|${a.period | 0}`);
  }
  let violations = 0;
  for (const s of sups) {
    if (!s || s.teacherid == null || s.day == null || s.period == null) continue;
    const key = `${s.teacherid}|${s.day | 0}|${s.period | 0}`;
    if (taught.has(key)) violations++;
  }
  return { violations, weight: w };
}

/**
 * CKritCourseGroup — students in a course-group must attend the same elective
 * lesson at the same time. v1 check: for each coursegroup, all lessons whose
 * subjectId is in its `subjectids[]` should coincide on (day,period). Each
 * pair that does not coincide is one violation.
 */
export function CKritCourseGroup(assignment, lessonsById, schoolData) {
  const w = CKRIT_WEIGHTS.ckrit_course_group;
  const groups = (schoolData && schoolData.coursegroups) || [];
  if (!groups.length || !assignment || !assignment.length) {
    return { violations: 0, weight: w };
  }
  const lookup = lessonsByIdMap(lessonsById);
  // Build subjectId → list of (day, period) it appears at, via the assignment.
  const subjectSlots = new Map();
  for (const a of assignment) {
    const l = lookup && lookup.get(a.lessonId);
    const subjectId = (l && l.subjectId) || a.subjectId;
    if (!subjectId) continue;
    if (!subjectSlots.has(subjectId)) subjectSlots.set(subjectId, []);
    subjectSlots.get(subjectId).push(`${a.day | 0}|${a.period | 0}`);
  }
  let violations = 0;
  for (const g of groups) {
    const sids = (g && g.subjectids) || [];
    if (sids.length < 2) continue;
    // Gather all slots used by ANY subject in this group.
    const slotCounts = new Map();
    for (const sid of sids) {
      const slots = subjectSlots.get(sid) || [];
      for (const k of slots) slotCounts.set(k, (slotCounts.get(k) || 0) + 1);
    }
    // For a group of S subjects, each (day,period) should host exactly S
    // coinciding lessons; anything less means at least one subject is missing
    // from that synchronisation point — count the gap.
    for (const [, count] of slotCounts) {
      if (count > 0 && count < sids.length) violations += (sids.length - count);
    }
  }
  return { violations, weight: w };
}

/**
 * CKritTriedny — class-teacher last-period preference. The class-teacher of a
 * class should ideally teach the last period of their class's day. Mild
 * penalty for each class whose class-teacher does not appear in the last
 * teaching period of any day. `schoolData.classes[i].classTeacherId` (or
 * `teacherid`) names the class-teacher; we tolerate either spelling.
 */
export function CKritTriedny(assignment, lessonsById, schoolData) {
  const w = CKRIT_WEIGHTS.ckrit_triedny;
  const classes = (schoolData && schoolData.classes) || [];
  if (!classes.length || !assignment || !assignment.length) {
    return { violations: 0, weight: w };
  }
  const periods = (schoolData.bell && schoolData.bell.periods) || [];
  const teaching = periods.filter(p => p.isTeaching !== false);
  const lastPeriod = teaching.length ? (teaching[teaching.length - 1].index | 0) : 8;
  // For each class, days on which the class-teacher does NOT occupy lastPeriod.
  // Group assignments by class.
  const classDayLast = new Map(); // key=`${classId}|${day}` -> teacherId at last
  for (const a of assignment) {
    if ((a.period | 0) !== lastPeriod) continue;
    for (const cid of (a.classIds || [])) {
      classDayLast.set(`${cid}|${a.day | 0}`, a.teacherId);
    }
  }
  // Days the class actually has assignments (so empty days don't count).
  const classDays = new Map(); // classId -> Set<day>
  for (const a of assignment) {
    for (const cid of (a.classIds || [])) {
      if (!classDays.has(cid)) classDays.set(cid, new Set());
      classDays.get(cid).add(a.day | 0);
    }
  }
  let violations = 0;
  for (const c of classes) {
    const ct = c.classTeacherId || c.teacherid || c.classteacher;
    if (!ct) continue;
    const days = classDays.get(c.id);
    if (!days) continue;
    for (const d of days) {
      const occupant = classDayLast.get(`${c.id}|${d}`);
      if (occupant !== ct) violations++;
    }
  }
  return { violations, weight: w };
}

/**
 * CKritResty — residue / leftover accounting. v1 counts unplaced lessons that
 * would have required a substitute (i.e. lessons present in `lessonsById` but
 * not in the `assignment`). One violation per unplaced lesson.
 */
export function CKritResty(assignment, lessonsById, schoolData) {
  const w = CKRIT_WEIGHTS.ckrit_resty;
  // Resolve full lesson list from lessonsById, falling back to schoolData.lessons.
  let allLessons = [];
  const lookup = lessonsByIdMap(lessonsById);
  if (lookup) {
    for (const [, l] of lookup) allLessons.push(l);
  } else if (schoolData && Array.isArray(schoolData.lessons)) {
    allLessons = schoolData.lessons;
  }
  if (!allLessons.length) return { violations: 0, weight: w };
  const placed = new Set((assignment || []).map(a => a.lessonId));
  let unplaced = 0;
  for (const l of allLessons) {
    if (!placed.has(l.id)) unplaced++;
  }
  return { violations: unplaced, weight: w };
}

/**
 * CKritVhodneNaSpojenie — parallel-lesson merge opportunity. When two
 * different classes are taught the same subject at the same (day,period),
 * prefer placing them in the same room (so the classes could be joined).
 * Each cross-class pair with the same (day, period, subjectId) but different
 * `classroomId` is one violation.
 */
export function CKritVhodneNaSpojenie(assignment, lessonsById, schoolData) {
  const w = CKRIT_WEIGHTS.ckrit_vhodne_na_spojenie;
  if (!assignment || assignment.length < 2) {
    return { violations: 0, weight: w };
  }
  const lookup = lessonsByIdMap(lessonsById);
  // Bucket by (day, period, subjectId) → list of {classIds, roomId}.
  const buckets = new Map();
  for (const a of assignment) {
    const l = lookup && lookup.get(a.lessonId);
    const subjectId = (l && l.subjectId) || a.subjectId;
    if (!subjectId) continue;
    const key = `${a.day | 0}|${a.period | 0}|${subjectId}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ classIds: a.classIds || [], roomId: a.classroomId });
  }
  let violations = 0;
  for (const [, rows] of buckets) {
    if (rows.length < 2) continue;
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        // Only different classes are a "merge candidate" pair.
        const sameClass = rows[i].classIds.some(c => rows[j].classIds.indexOf(c) !== -1);
        if (sameClass) continue;
        if (rows[i].roomId !== rows[j].roomId) violations++;
      }
    }
  }
  return { violations, weight: w };
}

/** Map of CKrit* function id → function. Used by the violations panel. */
export const CKRIT_FUNCTIONS = Object.freeze({
  ckrit_sluzba: CKritSluzba,
  ckrit_course_group: CKritCourseGroup,
  ckrit_triedny: CKritTriedny,
  ckrit_resty: CKritResty,
  ckrit_vhodne_na_spojenie: CKritVhodneNaSpojenie,
});
