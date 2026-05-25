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
  RELATION_SAME_DAY_FORBIDDEN: 22,
  RELATION_CANNOT_FOLLOW: 23,
  RELATION_MUST_SAME_DAY: 24,
  RELATION_FIRST_OR_LAST: 25,
  RELATION_MUST_FOLLOW: 26,
  RELATION_SIMULTANEOUS: 27,
  RELATION_BREAK_BETWEEN: 28,
  CLASS_BELL_PERIOD_INVALID: 29,
  SUBJECT_DAILY_MIN_VIOLATION: 30,
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
  22: "relation_same_day_forbidden",
  23: "relation_cannot_follow",
  24: "relation_must_same_day",
  25: "relation_first_or_last",
  26: "relation_must_follow",
  27: "relation_simultaneous",
  28: "relation_break_between",
  29: "class_bell_period_invalid",
  30: "subject_daily_min_violation",
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
  // CKritOkno equivalent — teacher gaps in the middle of the day are a
  // strong soft pull (was LOW_SOFT; bumped to NEAR_HARD to match the legacy
  // C/Kotlin scorer's "-200,000 hard veto" intent without making it a
  // true hard rule).
  teacher_gaps: Weight.NEAR_HARD,
  class_gaps: Weight.LOW_SOFT,
  subject_distribution: Weight.MED_SOFT,
  teacher_room_stability: Weight.HINT,
  teacher_consecutive_overload: Weight.NEAR_HARD,
  class_consecutive_overload: Weight.NEAR_HARD,
  teacher_last_period_overflow: Weight.HIGH_SOFT,
  period_load_balance: Weight.MED_SOFT,
  soft_relation_violation: Weight.LOW_SOFT,
  teacher_consec_heavy_days: Weight.LOW_SOFT,
  // CSIntegerCDNeededCards (sibling-subject deficit) — strong pull to
  // place behind-quota subjects ahead of already-saturated ones.
  sibling_subject_deficit: Weight.HIGH_SOFT,
  // Per-teacher conditional time-off — placement allowed but penalised
  // so the solver avoids it when there's an alternative.
  teacher_conditional_placement: Weight.MED_SOFT,
  // classTeacherPos enforcement — at marked slots, the class's homeroom
  // teacher should be the one teaching. Anyone else → soft penalty.
  class_teacher_pos_violation: Weight.MED_SOFT,
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
// CKrit* constraint family — JS ports of the CLASSIC Tabu Search criterion classes.
//
// Each function takes (assignment, lessonsById, schoolData) and returns
// `{violations: int, weight: int}` — `violations` is a non-negative count of
// rule breaks, `weight` is the per-violation penalty (matches the original
// CLASSIC penalty table; see docs/SOLVER_V2.md and Chronexa-AUDIT-Master.md).
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

// Group bitmask for a (lesson, class) pair, matching the solver's
// lessonClassGroupMask construction in csp_solver.buildModel (lines 232-246).
// Required so checkPlacement treats Group-Boys-PE + Group-Girls-Music at the
// same II-B slot as a legal split, not a class-conflict.
function _classGroupMask(school, lesson, classId) {
  const allGroups = Array.isArray(school && school.groups) ? school.groups : [];
  // Per-class ordered group list — bit index = position in this filtered list.
  const classGroups = [];
  for (const g of allGroups) {
    if (!g || g.classId !== classId) continue;
    if (classGroups.length >= 32) break;
    classGroups.push(g);
  }
  const n = classGroups.length;
  const fullMask = (n === 0) ? 1 : (n >= 32 ? 0xffffffff : ((1 << n) - 1) >>> 0);
  const lgIds = (lesson && lesson.groupIds) || [];
  let mask = 0;
  let sawEntire = false;
  for (const gid of lgIds) {
    const bit = classGroups.findIndex(cg => cg.id === gid);
    if (bit < 0) continue;
    if (classGroups[bit].entireClass) { sawEntire = true; break; }
    mask = (mask | (1 << bit)) >>> 0;
  }
  if (sawEntire || mask === 0) mask = fullMask;
  return mask >>> 0;
}

// ---------------------------------------------------------------------------
// checkPlacement — per-cell hard/soft violation checker for the editor.
//
// Used by js/ui/editor/constraint_explainer.js to produce the hover tooltip.
// Pure function: takes the canonical SchoolData + a candidate (lessonId, day,
// period, roomId) and returns { hard: string[], soft: string[] } — short
// human-readable messages, one per broken rule.
//
// Mirrors the hard checks inside canPlace() (csp_solver.js) but operates on
// the current S.cards array (the live editor state) instead of the internal
// occupancy bitmasks. This is fine for editor sizes (≤ 2000 cards); avoids
// the cost of maintaining a live solver state in the UI.
// ---------------------------------------------------------------------------
export function checkPlacement(school, lessonId, day, period, roomId) {
  const result = { hard: [], soft: [] };
  if (!school || !school._idx) return result;
  const idx = school._idx;
  const lesson = idx.lessonById[lessonId];
  if (!lesson) {
    result.hard.push("Unknown lesson");
    return result;
  }

  const dayLabel = (d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] || `D${d}`;

  // Lookups for labels.
  const subj = idx.subjectById[lesson.subjectId];
  const subjName = subj ? (subj.name || subj.abbr || lesson.subjectId) : lesson.subjectId;
  const teacherNames = (lesson.teacherIds || [])
    .map(tid => idx.teacherById[tid])
    .map((t, i) => t ? (t.name || t.abbr) : (lesson.teacherIds || [])[i])
    .filter(Boolean);
  const teacherDisplay = teacherNames.length ? teacherNames.join(", ") : "Teacher";
  const classNames = (lesson.classIds || [])
    .map(cid => idx.classById[cid])
    .map((c, i) => c ? c.name : (lesson.classIds || [])[i])
    .filter(Boolean);
  const myClasses = new Set(lesson.classIds || []);
  const myTeachers = new Set(lesson.teacherIds || []);
  const rid = roomId || lesson.preferredRoomId;
  const room = rid ? idx.classroomById[rid] : null;

  // 1. Fixed-day / fixed-period mismatch (hard).
  if (lesson.fixedDay != null && lesson.fixedDay !== day) {
    result.hard.push(`${subjName} is fixed to ${dayLabel(lesson.fixedDay)} (not ${dayLabel(day)})`);
  }
  if (lesson.fixedPeriod != null && lesson.fixedPeriod !== period) {
    result.hard.push(`${subjName} is fixed to period ${lesson.fixedPeriod} (not P${period})`);
  }

  // 2. Period non-teaching? (soft — placement legal but unusual).
  const periods = (school.bell && school.bell.periods) || [];
  const periodObj = periods.find(p => p.index === period);
  if (periodObj && periodObj.isTeaching === false) {
    result.soft.push(`P${period} is a non-teaching slot (${periodObj.label || "break"})`);
  }

  // 2b. Per-class bell schedule (Top-30 #3). If any class on this lesson has
  // a bellId whose periods don't include this period, flag as hard — mirrors
  // csp_solver.canPlace's FAIL.CLASS_BELL_PERIOD_INVALID so the verification
  // halo + auto-fix pass both surface the violation.
  const bells = Array.isArray(school.bells) ? school.bells : [];
  if (bells.length) {
    for (const cid of (lesson.classIds || [])) {
      const cls = idx.classById[cid];
      if (!cls || !cls.bellId) continue;
      const bell = bells.find(b => b.id === cls.bellId);
      if (!bell || !Array.isArray(bell.periods)) continue;
      const inBell = bell.periods.some(p => (p.index | 0) === (period | 0));
      if (!inBell) {
        const clsName = cls.name || cid;
        result.hard.push(`${clsName} bell schedule (${bell.name || "bell"}) has no period ${period}`);
      }
    }
  }

  // Build a per-slot view from S.cards, excluding this exact placement (so
  // re-checking a card on its own slot doesn't flag itself).
  const sameSlot = (school.cards || []).filter(c =>
    c.day === day && c.period === period &&
    !(c.lessonId === lessonId && c.classroomId === rid)
  );

  // 3. Teacher conflict + availability (hard) + preferred-off (soft).
  for (const tid of (lesson.teacherIds || [])) {
    const teacher = idx.teacherById[tid];
    const tName = teacher ? (teacher.name || teacher.abbr) : tid;
    for (const c of sameSlot) {
      const other = idx.lessonById[c.lessonId];
      if (!other) continue;
      if ((other.teacherIds || []).includes(tid)) {
        const otherSubj = idx.subjectById[other.subjectId];
        const otherClasses = (other.classIds || [])
          .map(cid => (idx.classById[cid] || {}).name).filter(Boolean).join(", ");
        const otherSubjName = otherSubj ? (otherSubj.name || otherSubj.abbr) : other.subjectId;
        result.hard.push(
          `${tName} already teaches ${otherClasses || "another class"} → ${otherSubjName} in this period`
        );
      }
    }
    if (teacher && teacher.timeOff) {
      const key = day + "_" + period;
      const mark = teacher.timeOff[key];
      if (mark === "unavailable") {
        result.hard.push(`${tName} is marked unavailable ${dayLabel(day)} P${period}`);
      } else if (mark === "preferred") {
        result.soft.push(`${tName} prefers not to teach ${dayLabel(day)} P${period}`);
      }
    }
  }

  // 4. Class conflict (hard). Group-aware: two lessons sharing a class at the
  // same slot conflict only when their group bitmasks intersect (matches
  // canPlace in csp_solver.js — lines 1075-1077). Without this guard, every
  // legitimate group-split (e.g. Group-Boys-PE + Group-Girls-Music in the
  // same class+slot) was flagged as a false-positive class-conflict.
  for (const c of sameSlot) {
    const other = idx.lessonById[c.lessonId];
    if (!other) continue;
    let flagged = false;
    for (const cid of (other.classIds || [])) {
      if (!myClasses.has(cid)) continue;
      const myMask    = _classGroupMask(school, lesson, cid);
      const otherMask = _classGroupMask(school, other,  cid);
      if ((myMask & otherMask) === 0) continue;
      const cls = idx.classById[cid];
      const otherSubj = idx.subjectById[other.subjectId];
      const otherSubjName = otherSubj ? (otherSubj.name || otherSubj.abbr) : other.subjectId;
      result.hard.push(
        `Class ${cls ? cls.name : cid} already has ${otherSubjName} in this period`
      );
      flagged = true;
      break;
    }
    if (flagged) continue;
  }

  // 5. Room conflict + required-room-type (hard).
  if (rid) {
    for (const c of sameSlot) {
      const otherRid = c.classroomId || (idx.lessonById[c.lessonId] || {}).preferredRoomId;
      if (otherRid === rid) {
        const other = idx.lessonById[c.lessonId];
        const otherSubj = other ? idx.subjectById[other.subjectId] : null;
        const otherSubjName = otherSubj ? (otherSubj.name || otherSubj.abbr) : (other ? other.subjectId : "another lesson");
        result.hard.push(
          `Room ${room ? room.name : rid} is full — already hosts ${otherSubjName} (max 1 lesson per slot)`
        );
        break;
      }
    }
    if (lesson.requiredRoomType && room && room.roomType && room.roomType !== lesson.requiredRoomType) {
      result.hard.push(
        `${subjName} needs a "${lesson.requiredRoomType}" room (this one is "${room.roomType}")`
      );
    }
  } else if (lesson.requiredRoomType) {
    result.hard.push(`${subjName} needs a "${lesson.requiredRoomType}" room (none assigned)`);
  }

  // 6. Class-teacher last-period soft preference (CKritTriedny).
  // If this class has a class-teacher and the slot is the last period, prefer
  // the class-teacher in it. Inverse: if THIS lesson's teacher is not the
  // class-teacher and we're placing them in last period, mention the
  // preference. Cheaper to just flag absence when the slot IS last.
  const teaching = periods.filter(p => p.isTeaching !== false);
  const lastPeriod = teaching.length ? teaching[teaching.length - 1].index : null;
  if (lastPeriod != null && period === lastPeriod) {
    for (const cid of (lesson.classIds || [])) {
      const cls = idx.classById[cid];
      const ct = cls && (cls.classTeacherId || cls.teacherid || cls.classteacher);
      if (!ct) continue;
      if (!myTeachers.has(ct)) {
        const ctObj = idx.teacherById[ct];
        const ctName = ctObj ? (ctObj.name || ctObj.abbr) : ct;
        result.soft.push(
          `Class teacher of ${cls.name} (${ctName}) prefers last period`
        );
      }
    }
  }

  // 7. Multi-period lesson: needs period+1..period+N also free (hard).
  const extraSlots = (lesson.lessonLength || (lesson.isLabDouble ? 2 : 1)) - 1;
  if (extraSlots > 0) {
    for (let ep = 1; ep <= extraSlots; ep++) {
      const nextPeriod = period + ep;
      const next = periods.find(p => p.index === nextPeriod);
      if (!next || next.isTeaching === false) {
        result.hard.push(`${extraSlots + 1}-period lesson needs ${extraSlots + 1} consecutive teaching periods`);
        break;
      } else {
        const nextSlot = (school.cards || []).filter(c =>
          c.day === day && c.period === nextPeriod &&
          !(c.lessonId === lessonId)
        );
        const labClassBusy = nextSlot.some(c => {
          const other = idx.lessonById[c.lessonId];
          if (!other) return false;
          for (const cid of (other.classIds || [])) {
            if (!myClasses.has(cid)) continue;
            if ((_classGroupMask(school, lesson, cid) & _classGroupMask(school, other, cid)) !== 0) {
              return true;
            }
          }
          return false;
        });
        if (labClassBusy) result.hard.push(`P+${nextPeriod}: class already busy`);
        const labTeacherBusy = nextSlot.some(c =>
          ((idx.lessonById[c.lessonId] || {}).teacherIds || []).some(tid => myTeachers.has(tid)));
        if (labTeacherBusy) result.hard.push(`P+${nextPeriod}: ${teacherDisplay} already busy`);
        if (rid) {
          const labRoomBusy = nextSlot.some(c =>
            (c.classroomId || (idx.lessonById[c.lessonId] || {}).preferredRoomId) === rid);
          if (labRoomBusy) result.hard.push(`P+${nextPeriod}: room ${room ? room.name : rid} already busy`);
        }
      }
    }
  }

  return result;
}

// Audit §12.2 — supervision-criteria validator. Checks current
// classroomsupervisions[] against school.settings.supervisionCriteria and
// returns a violation list. Surfaces in the verification panel so the
// admin sees which supervisions break their own rules. Solver doesn't
// yet attempt to optimise against these — first-pass enforcement is
// "tell the user what's broken", second pass (future) is "have the
// solver prefer assignments that don't violate".
export function validateSupervisionCriteria(school) {
  const out = [];
  if (!school) return out;
  const crit = (school.settings && school.settings.supervisionCriteria) || {};
  const sups = Array.isArray(school.classroomsupervisions) ? school.classroomsupervisions : [];
  if (!sups.length) return out;
  const idx = school._idx || {};
  const tBy = idx.teacherById || Object.fromEntries((school.teachers || []).map(t => [t.id, t]));
  const periods = (school.bell && school.bell.periods) || [];
  const lastPeriod = periods.length ? periods[periods.length - 1].index : -1;
  const firstPeriod = periods.length ? periods[0].index : -1;
  const byTeacherDay = {};
  const byTeacherWeek = {};
  for (const s of sups) {
    if (!s.teacherid) continue;
    const tk = s.teacherid + "_" + (s.day != null ? s.day : "?");
    byTeacherDay[tk] = (byTeacherDay[tk] || 0) + 1;
    byTeacherWeek[s.teacherid] = (byTeacherWeek[s.teacherid] || 0) + 1;
    const teacher = tBy[s.teacherid];
    const tName = (teacher && (teacher.abbr || teacher.name)) || s.teacherid;
    const desc = (msg) => ({ ruleId: "supervision_criteria",
      severity: "soft", supervisionId: s.id,
      description: tName + " supervision " + msg });
    if (crit.avoidLastPeriod && lastPeriod >= 0 && s.period === lastPeriod) {
      out.push(desc("on last period (avoidLastPeriod=on)"));
    }
    if (crit.avoidFirstPeriod && firstPeriod >= 0 && s.period === firstPeriod) {
      out.push(desc("on first period (avoidFirstPeriod=on)"));
    }
    if (teacher && teacher.timeOff && crit.noSupervisionOnTimeOff) {
      const key = s.day + "_" + s.period;
      const mark = teacher.timeOff[key];
      if (mark === "unavailable") out.push(desc("on teacher's time-off slot"));
    }
  }
  if (crit.maxPerTeacherPerDay > 0) {
    for (const k of Object.keys(byTeacherDay)) {
      if (byTeacherDay[k] > crit.maxPerTeacherPerDay) {
        const [tid, d] = k.split("_");
        const teacher = tBy[tid];
        const tName = (teacher && (teacher.abbr || teacher.name)) || tid;
        out.push({ ruleId: "supervision_criteria",
          severity: "hard",
          description: tName + " has " + byTeacherDay[k] + " supervisions on day " + d
            + " (max " + crit.maxPerTeacherPerDay + ")" });
      }
    }
  }
  if (crit.maxPerTeacherPerWeek > 0) {
    for (const tid of Object.keys(byTeacherWeek)) {
      if (byTeacherWeek[tid] > crit.maxPerTeacherPerWeek) {
        const teacher = tBy[tid];
        const tName = (teacher && (teacher.abbr || teacher.name)) || tid;
        out.push({ ruleId: "supervision_criteria",
          severity: "hard",
          description: tName + " has " + byTeacherWeek[tid] + " supervisions / week (max "
            + crit.maxPerTeacherPerWeek + ")" });
      }
    }
  }
  return out;
}

// Audit §15.2 — student-elective conflict detector. Walks
// school.studentSubjects, computes the per-student card-set (class
// lessons + electives), and flags any (student, day, period) where
// the student would be in two cards at once. Pure read function;
// returns an array of { ruleId, severity, description, studentId,
// day, period }. Verification UI can render these alongside the
// solver-level violations.
export function studentScheduleConflicts(school) {
  const out = [];
  if (!school || !Array.isArray(school.students) || !school.students.length) return out;
  const cardsByClass = (school._idx && school._idx.cardsByClass) || {};
  const lessonById = (school._idx && school._idx.lessonById) ||
    Object.fromEntries((school.lessons || []).map(l => [l.id, l]));
  const subjectById = (school._idx && school._idx.subjectById) || {};
  const enrollByStudent = {};
  for (const e of (school.studentSubjects || [])) {
    if (!enrollByStudent[e.studentId]) enrollByStudent[e.studentId] = [];
    enrollByStudent[e.studentId].push(e);
  }
  for (const st of school.students) {
    const buckets = {}; // "d_p" → [card]
    const note = (c) => {
      const k = c.day + "_" + c.period;
      (buckets[k] = buckets[k] || []).push(c);
    };
    if (st.classId) {
      for (const c of (cardsByClass[st.classId] || [])) note(c);
    }
    for (const e of (enrollByStudent[st.id] || [])) {
      // Find electives that match this enrollment but aren't already in class
      for (const c of (school.cards || [])) {
        const lesson = lessonById[c.lessonId];
        if (!lesson || lesson.subjectId !== e.subjectId) continue;
        if (st.classId && (lesson.classIds || []).includes(st.classId)) continue;
        note(c);
      }
    }
    for (const key of Object.keys(buckets)) {
      const arr = buckets[key];
      if (arr.length < 2) continue;
      const [dStr, pStr] = key.split("_");
      const labels = arr.map(c => {
        const l = lessonById[c.lessonId];
        const s = l && subjectById[l.subjectId];
        return (s && (s.abbr || s.name)) || (l && l.subjectId) || c.lessonId;
      }).join(" + ");
      const fullName = ((st.firstName || "") + " " + (st.lastName || "")).trim() || st.id;
      out.push({
        ruleId: "student_schedule_conflict",
        severity: "hard",
        studentId: st.id,
        day: parseInt(dStr, 10),
        period: parseInt(pStr, 10),
        description: `${fullName} double-booked at D${dStr} P${pStr}: ${labels}`,
      });
    }
  }
  return out;
}
