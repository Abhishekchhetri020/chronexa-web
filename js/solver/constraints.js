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
