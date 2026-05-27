// canPlace — hot-path constraint check, AssemblyScript port (world-class).
//
// Mirrors the JS canPlace() in csp_solver.js line-for-line. Returns 0 if
// the (lessonIdx, slot, roomIdx) placement is feasible, otherwise the
// FAIL enum value matching js/solver/constraints.js.
//
// All inputs are flat typed arrays so the host can pass them by pointer
// with zero allocation per call. Partner sets for relations are flattened
// into CSR-style (Start/Count/Flat) arrays in buildModel so we can iterate
// them without object-graph traversal.
//
// Layout documented in the README. Constants + pointers bound once per
// solve via setShape() + bindArrays().

// FAIL codes — numeric values MUST match js/solver/constraints.js FAIL enum.
const FAIL_FIXED_SLOT_MISMATCH:           i32 = 21;
const FAIL_TEACHER_CONFLICT:              i32 = 1;
const FAIL_TEACHER_UNAVAILABLE:           i32 = 2;
const FAIL_TEACHER_MAX_PER_DAY:           i32 = 3;
const FAIL_CLASS_BELL_PERIOD_INVALID:     i32 = 29;
const FAIL_CLASS_CONFLICT:                i32 = 4;
const FAIL_CLASS_MAX_PER_DAY:             i32 = 6;
const FAIL_SUBJECT_DAILY_LIMIT:           i32 = 7;
const FAIL_SUBJECT_DAILY_MIN_VIOLATION:   i32 = 30;
const FAIL_ROOM_CONFLICT:                 i32 = 8;
const FAIL_RELATION_SAME_DAY_FORBIDDEN:   i32 = 22;
const FAIL_RELATION_CANNOT_FOLLOW:        i32 = 23;
const FAIL_RELATION_MUST_SAME_DAY:        i32 = 24;
const FAIL_RELATION_FIRST_OR_LAST:        i32 = 25;
const FAIL_RELATION_MUST_FOLLOW:          i32 = 26;
const FAIL_RELATION_SIMULTANEOUS:         i32 = 27;
const FAIL_RELATION_BREAK_BETWEEN:        i32 = 28;

// Solver shape (set once by host via setShape).
let days: i32 = 0;
let periodsPerDay: i32 = 0;
let subjectCount: i32 = 0;
let totalSlots: i32 = 0;

// Host-allocated typed array pointers. Order matches bindArrays() signature.
let teacherOccPtr: usize = 0;
let teacherAvailPtr: usize = 0;
let classGroupOccPtr: usize = 0;
let roomOccPtr: usize = 0;
let teacherDayLoadPtr: usize = 0;
let classDayLoadPtr: usize = 0;
let classSubjectDayCtPtr: usize = 0;
let classSubjectTotalPlacedPtr: usize = 0;
let slotDayPtr: usize = 0;
let slotPeriodPtr: usize = 0;

// Per-lesson static pointers.
let lessonTeacherStartPtr: usize = 0;
let lessonTeacherCountPtr: usize = 0;
let lessonTeacherFlatPtr: usize = 0;
let lessonClassStartPtr: usize = 0;
let lessonClassCountPtr: usize = 0;
let lessonClassFlatPtr: usize = 0;
let lessonClassPackedPtr: usize = 0;
let lessonSubjectPtr: usize = 0;
let lessonFixedSlotPtr: usize = 0;
let lessonMustFirstLastPtr: usize = 0;
let lessonAssignedPtr: usize = 0;
let lessonAssignedSlotPtr: usize = 0;

// Per-teacher/class static pointers.
let teacherMaxPerDayPtr: usize = 0;
let classMaxPerDayPtr: usize = 0;
let classValidPeriodMaskPtr: usize = 0;
let subjectDailyLimitPtr: usize = 0;
let subjectDailyMinPtr: usize = 0;
let sessionsByClassSubjectPtr: usize = 0;

// Relation CSR flattened pointers (0 = no relations of this type).
let n1PartnersStartPtr: usize = 0;
let n1PartnersCountPtr: usize = 0;
let n1PartnersFlatPtr: usize = 0;
let n0PartnersStartPtr: usize = 0;
let n0PartnersCountPtr: usize = 0;
let n0PartnersFlatPtr: usize = 0;
let sdPartnersStartPtr: usize = 0;
let sdPartnersCountPtr: usize = 0;
let sdPartnersFlatPtr: usize = 0;
let fAnyStartPtr: usize = 0;
let fAnyCountPtr: usize = 0;
let fAnyFlatPtr: usize = 0;
let fBeforeStartPtr: usize = 0;
let fBeforeCountPtr: usize = 0;
let fBeforeFlatPtr: usize = 0;
let fAfterStartPtr: usize = 0;
let fAfterCountPtr: usize = 0;
let fAfterFlatPtr: usize = 0;
let simPartnersStartPtr: usize = 0;
let simPartnersCountPtr: usize = 0;
let simPartnersFlatPtr: usize = 0;
let n7PartnersStartPtr: usize = 0;
let n7PartnersCountPtr: usize = 0;
let n7PartnersFlatPtr: usize = 0;
let breakPeriodsPtr: usize = 0;
let breakPeriodsLength: i32 = 0;

export function setShape(
  d: i32, ppd: i32, sc: i32, ts: i32
): void {
  days = d; periodsPerDay = ppd; subjectCount = sc; totalSlots = ts;
}

// Bind all host-allocated typed arrays in one call. Order matches file header.
export function bindArrays(
  pTeacherOcc: usize, pTeacherAvail: usize,
  pClassGroupOcc: usize, pRoomOcc: usize,
  pTeacherDayLoad: usize, pClassDayLoad: usize,
  pClassSubjectDayCt: usize, pClassSubjectTotalPlaced: usize,
  pSlotDay: usize, pSlotPeriod: usize,
  pLessonTeacherStart: usize, pLessonTeacherCount: usize, pLessonTeacherFlat: usize,
  pLessonClassStart: usize, pLessonClassCount: usize,
  pLessonClassFlat: usize, pLessonClassPacked: usize,
  pLessonSubject: usize, pLessonFixedSlot: usize, pLessonMustFirstLast: usize,
  pLessonAssigned: usize, pLessonAssignedSlot: usize,
  pTeacherMaxPerDay: usize, pClassMaxPerDay: usize,
  pClassValidPeriodMask: usize,
  pSubjectDailyLimit: usize, pSubjectDailyMin: usize, pSessionsByClassSubject: usize
): void {
  teacherOccPtr = pTeacherOcc;
  teacherAvailPtr = pTeacherAvail;
  classGroupOccPtr = pClassGroupOcc;
  roomOccPtr = pRoomOcc;
  teacherDayLoadPtr = pTeacherDayLoad;
  classDayLoadPtr = pClassDayLoad;
  classSubjectDayCtPtr = pClassSubjectDayCt;
  classSubjectTotalPlacedPtr = pClassSubjectTotalPlaced;
  slotDayPtr = pSlotDay;
  slotPeriodPtr = pSlotPeriod;
  lessonTeacherStartPtr = pLessonTeacherStart;
  lessonTeacherCountPtr = pLessonTeacherCount;
  lessonTeacherFlatPtr = pLessonTeacherFlat;
  lessonClassStartPtr = pLessonClassStart;
  lessonClassCountPtr = pLessonClassCount;
  lessonClassFlatPtr = pLessonClassFlat;
  lessonClassPackedPtr = pLessonClassPacked;
  lessonSubjectPtr = pLessonSubject;
  lessonFixedSlotPtr = pLessonFixedSlot;
  lessonMustFirstLastPtr = pLessonMustFirstLast;
  lessonAssignedPtr = pLessonAssigned;
  lessonAssignedSlotPtr = pLessonAssignedSlot;
  teacherMaxPerDayPtr = pTeacherMaxPerDay;
  classMaxPerDayPtr = pClassMaxPerDay;
  classValidPeriodMaskPtr = pClassValidPeriodMask;
  subjectDailyLimitPtr = pSubjectDailyLimit;
  subjectDailyMinPtr = pSubjectDailyMin;
  sessionsByClassSubjectPtr = pSessionsByClassSubject;
}

// Bind relation CSR arrays (call after bindArrays). Any can be 0 = absent.
export function bindRelations(
  pN1Start: usize, pN1Count: usize, pN1Flat: usize,
  pN0Start: usize, pN0Count: usize, pN0Flat: usize,
  pSDStart: usize, pSDCount: usize, pSDFlat: usize,
  pFAnyStart: usize, pFAnyCount: usize, pFAnyFlat: usize,
  pFBeforeStart: usize, pFBeforeCount: usize, pFBeforeFlat: usize,
  pFAfterStart: usize, pFAfterCount: usize, pFAfterFlat: usize,
  pSimStart: usize, pSimCount: usize, pSimFlat: usize,
  pN7Start: usize, pN7Count: usize, pN7Flat: usize,
  pBreakPeriods: usize, breakCount: i32
): void {
  n1PartnersStartPtr = pN1Start; n1PartnersCountPtr = pN1Count; n1PartnersFlatPtr = pN1Flat;
  n0PartnersStartPtr = pN0Start; n0PartnersCountPtr = pN0Count; n0PartnersFlatPtr = pN0Flat;
  sdPartnersStartPtr = pSDStart; sdPartnersCountPtr = pSDCount; sdPartnersFlatPtr = pSDFlat;
  fAnyStartPtr = pFAnyStart; fAnyCountPtr = pFAnyCount; fAnyFlatPtr = pFAnyFlat;
  fBeforeStartPtr = pFBeforeStart; fBeforeCountPtr = pFBeforeCount; fBeforeFlatPtr = pFBeforeFlat;
  fAfterStartPtr = pFAfterStart; fAfterCountPtr = pFAfterCount; fAfterFlatPtr = pFAfterFlat;
  simPartnersStartPtr = pSimStart; simPartnersCountPtr = pSimCount; simPartnersFlatPtr = pSimFlat;
  n7PartnersStartPtr = pN7Start; n7PartnersCountPtr = pN7Count; n7PartnersFlatPtr = pN7Flat;
  breakPeriodsPtr = pBreakPeriods;
  breakPeriodsLength = breakCount;
}

// Core hot loop: teacher + class + room + fixed-slot + subject-daily-limit + subject-daily-min
// This is where 95%+ of canPlace time is spent on typical schools.
// Returns 0 = feasible, FAIL code otherwise.
function canPlaceCore(lessonIdx: i32, slot: i32, roomIdx: i32): i32 {
  const d: i32 = load<i32>(slotDayPtr + (slot << 2));
  const p: i32 = load<i32>(slotPeriodPtr + (slot << 2));
  const bit: u32 = (1 << <u32>p) >>> 0;

  // Fixed-slot check (n_9 / fixedDay+fixedPeriod locked cards).
  const fixed: i32 = load<i32>(lessonFixedSlotPtr + (lessonIdx << 2));
  if (fixed >= 0 && fixed !== slot) return FAIL_FIXED_SLOT_MISMATCH;

  // Teacher loop
  const tStart: i32 = load<i32>(lessonTeacherStartPtr + (lessonIdx << 2));
  const tCount: i32 = load<i32>(lessonTeacherCountPtr + (lessonIdx << 2));
  for (let k: i32 = 0; k < tCount; k++) {
    const t: i32 = load<i32>(lessonTeacherFlatPtr + ((tStart + k) << 2));
    const td: i32 = t * days + d;
    const occ: u32 = load<u32>(teacherOccPtr + (td << 2));
    if ((occ & bit) !== 0) return FAIL_TEACHER_CONFLICT;
    const avail: u32 = load<u32>(teacherAvailPtr + (td << 2));
    if ((avail & bit) === 0) return FAIL_TEACHER_UNAVAILABLE;
    const maxDay: i32 = load<i32>(teacherMaxPerDayPtr + (t << 2));
    if (maxDay >= 0 && load<i32>(teacherDayLoadPtr + (td << 2)) >= maxDay) {
      return FAIL_TEACHER_MAX_PER_DAY;
    }
  }

  // Class loop with group-aware conflict + bell mask + subject daily min/max.
  const cStart: i32 = load<i32>(lessonClassStartPtr + (lessonIdx << 2));
  const cCount: i32 = load<i32>(lessonClassCountPtr + (lessonIdx << 2));
  const subject: i32 = load<i32>(lessonSubjectPtr + (lessonIdx << 2));
  for (let k: i32 = 0; k < cCount; k++) {
    const c: i32 = load<i32>(lessonClassFlatPtr + ((cStart + k) << 2));
    const cd: i32 = c * days + d;

    // Per-class bell mask — reject periods outside this class's bell.
    if (classValidPeriodMaskPtr !== 0) {
      const bellMask: u32 = load<u32>(classValidPeriodMaskPtr + (c << 2));
      if ((bellMask & bit) === 0) return FAIL_CLASS_BELL_PERIOD_INVALID;
    }

    // Group-aware conflict using packed (divIdx | mask<<16). Two lessons
    // sharing a class+slot conflict when either is whole-class, divisions
    // differ, or masks intersect within the same division.
    const lessonPacked: u32 = load<u32>(lessonClassPackedPtr + ((cStart + k) << 2));
    const occPacked: u32 = load<u32>(classGroupOccPtr + (((cd * periodsPerDay + p) << 2)));
    if (occPacked !== 0) {
      const lessonDiv: u32 = lessonPacked & 0xFFFF;
      const occDiv: u32 = occPacked & 0xFFFF;
      if (lessonDiv === 0xFFFF || occDiv === 0xFFFF || lessonDiv !== occDiv) {
        return FAIL_CLASS_CONFLICT;
      }
      if (((lessonPacked >>> 16) & (occPacked >>> 16)) !== 0) return FAIL_CLASS_CONFLICT;
    }

    const maxDay: i32 = load<i32>(classMaxPerDayPtr + (c << 2));
    if (maxDay >= 0 && load<i32>(classDayLoadPtr + (cd << 2)) >= maxDay) {
      return FAIL_CLASS_MAX_PER_DAY;
    }

    const subjectKey: i32 = ((c * subjectCount) + subject) * days + d;
    const sLimit: i32 = load<i32>(subjectDailyLimitPtr + (subjectKey << 2));
    if (sLimit >= 0 && load<i32>(classSubjectDayCtPtr + (subjectKey << 2)) >= sLimit) {
      return FAIL_SUBJECT_DAILY_LIMIT;
    }

    // Forward-checking for minimum daily distribution.
    if (subjectDailyMinPtr !== 0) {
      const csKey: i32 = c * subjectCount + subject;
      const idealMin: i32 = load<i32>(subjectDailyMinPtr + (csKey << 2));
      if (idealMin > 0) {
        const countOnDay: i32 = load<i32>(classSubjectDayCtPtr + (subjectKey << 2));
        if (countOnDay >= idealMin) {
          const totalSessions: i32 = load<i32>(sessionsByClassSubjectPtr + (csKey << 2));
          const placedTotal: i32 = load<i32>(classSubjectTotalPlacedPtr + (csKey << 2));
          const remaining: i32 = totalSessions - placedTotal - 1;
          let hungryDays: i32 = 0;
          const base: i32 = csKey * days;
          for (let dd: i32 = 0; dd < days; dd++) {
            if (dd !== d) {
              const ddKey: i32 = ((c * subjectCount) + subject) * days + dd;
              if (load<i32>(classSubjectDayCtPtr + (ddKey << 2)) < idealMin) hungryDays++;
            }
          }
          if (remaining < hungryDays) return FAIL_SUBJECT_DAILY_MIN_VIOLATION;
        }
      }
    }
  }

  // Room conflict
  if (roomIdx >= 0) {
    const rd: i32 = roomIdx * days + d;
    const occ: u32 = load<u32>(roomOccPtr + (rd << 2));
    if ((occ & bit) !== 0) return FAIL_ROOM_CONFLICT;
  }

  return 0;
}

// Helper for relation checks: partner is placed at slot `ps`, check `slotPeriod[ps]`.
@inline
function slotPeriod(ps: i32): i32 {
  return load<i32>(slotPeriodPtr + (ps << 2));
}
@inline
function slotDayOf(ps: i32): i32 {
  return load<i32>(slotDayPtr + (ps << 2));
}

// canPlace — full port including relation checks.
export function canPlace(lessonIdx: i32, slot: i32, roomIdx: i32): i32 {
  const core = canPlaceCore(lessonIdx, slot, roomIdx);
  if (core !== 0) return core;

  const d: i32 = load<i32>(slotDayPtr + (slot << 2));
  const p: i32 = load<i32>(slotPeriodPtr + (slot << 2));

  // n_1: cannot-same-day
  if (n1PartnersStartPtr !== 0) {
    const s: i32 = load<i32>(n1PartnersStartPtr + (lessonIdx << 2));
    const c: i32 = load<i32>(n1PartnersCountPtr + (lessonIdx << 2));
    for (let k: i32 = 0; k < c; k++) {
      const pIdx: i32 = load<i32>(n1PartnersFlatPtr + ((s + k) << 2));
      if (load<u8>(lessonAssignedPtr + pIdx) !== 0) {
        const ps: i32 = load<i32>(lessonAssignedSlotPtr + (pIdx << 2));
        if (ps >= 0 && slotDayOf(ps) === d) return FAIL_RELATION_SAME_DAY_FORBIDDEN;
      }
    }
  }

  // n_0: cannot-follow (adjacent periods)
  if (n0PartnersStartPtr !== 0) {
    const s: i32 = load<i32>(n0PartnersStartPtr + (lessonIdx << 2));
    const c: i32 = load<i32>(n0PartnersCountPtr + (lessonIdx << 2));
    for (let k: i32 = 0; k < c; k++) {
      const pIdx: i32 = load<i32>(n0PartnersFlatPtr + ((s + k) << 2));
      if (load<u8>(lessonAssignedPtr + pIdx) !== 0) {
        const ps: i32 = load<i32>(lessonAssignedSlotPtr + (pIdx << 2));
        if (ps >= 0 && slotDayOf(ps) === d) {
          const diff: i32 = slotPeriod(ps) - p;
          if (diff === 1 || diff === -1) return FAIL_RELATION_CANNOT_FOLLOW;
        }
      }
    }
  }

  // n_8/n_10: must-same-day (if partner placed on different day, reject)
  if (sdPartnersStartPtr !== 0) {
    const s: i32 = load<i32>(sdPartnersStartPtr + (lessonIdx << 2));
    const c: i32 = load<i32>(sdPartnersCountPtr + (lessonIdx << 2));
    for (let k: i32 = 0; k < c; k++) {
      const pIdx: i32 = load<i32>(sdPartnersFlatPtr + ((s + k) << 2));
      if (load<u8>(lessonAssignedPtr + pIdx) !== 0) {
        const ps: i32 = load<i32>(lessonAssignedSlotPtr + (pIdx << 2));
        if (ps >= 0 && slotDayOf(ps) !== d) return FAIL_RELATION_MUST_SAME_DAY;
      }
    }
  }

  // n_16: must be first or last period
  if (lessonMustFirstLastPtr !== 0) {
    if (load<u8>(lessonMustFirstLastPtr + lessonIdx) !== 0) {
      if (p !== 0 && p !== periodsPerDay - 1) return FAIL_RELATION_FIRST_OR_LAST;
    }
  }

  // n_5: must-follow-any (partner must be exactly one period away on same day)
  if (fAnyStartPtr !== 0) {
    const s: i32 = load<i32>(fAnyStartPtr + (lessonIdx << 2));
    const c: i32 = load<i32>(fAnyCountPtr + (lessonIdx << 2));
    for (let k: i32 = 0; k < c; k++) {
      const pIdx: i32 = load<i32>(fAnyFlatPtr + ((s + k) << 2));
      if (load<u8>(lessonAssignedPtr + pIdx) !== 0) {
        const ps: i32 = load<i32>(lessonAssignedSlotPtr + (pIdx << 2));
        if (ps < 0) continue;
        if (slotDayOf(ps) !== d) return FAIL_RELATION_MUST_FOLLOW;
        const diff: i32 = slotPeriod(ps) - p;
        if (diff !== 1 && diff !== -1) return FAIL_RELATION_MUST_FOLLOW;
      }
    }
  }

  // n_12 / n_13: simultaneous (if partner on same day, periods must match)
  if (simPartnersStartPtr !== 0) {
    const s: i32 = load<i32>(simPartnersStartPtr + (lessonIdx << 2));
    const c: i32 = load<i32>(simPartnersCountPtr + (lessonIdx << 2));
    for (let k: i32 = 0; k < c; k++) {
      const pIdx: i32 = load<i32>(simPartnersFlatPtr + ((s + k) << 2));
      if (load<u8>(lessonAssignedPtr + pIdx) !== 0) {
        const ps: i32 = load<i32>(lessonAssignedSlotPtr + (pIdx << 2));
        if (ps < 0) continue;
        if (slotDayOf(ps) === d && slotPeriod(ps) !== p) return FAIL_RELATION_SIMULTANEOUS;
      }
    }
  }

  // n_7: no break between (break period must not sit between this and partner)
  if (n7PartnersStartPtr !== 0 && breakPeriodsPtr !== 0 && breakPeriodsLength > 0) {
    const s: i32 = load<i32>(n7PartnersStartPtr + (lessonIdx << 2));
    const c: i32 = load<i32>(n7PartnersCountPtr + (lessonIdx << 2));
    for (let k: i32 = 0; k < c; k++) {
      const pIdx: i32 = load<i32>(n7PartnersFlatPtr + ((s + k) << 2));
      if (load<u8>(lessonAssignedPtr + pIdx) !== 0) {
        const ps: i32 = load<i32>(lessonAssignedSlotPtr + (pIdx << 2));
        if (ps < 0) continue;
        if (slotDayOf(ps) !== d) continue;
        const pp: i32 = slotPeriod(ps);
        const lo: i32 = p < pp ? p : pp;
        const hi: i32 = p > pp ? p : pp;
        for (let b: i32 = 0; b < breakPeriodsLength; b++) {
          const bp: i32 = load<i32>(breakPeriodsPtr + (b << 2));
          if (bp > lo && bp < hi) return FAIL_RELATION_BREAK_BETWEEN;
        }
      }
    }
  }

  // n_6 ordered must-follow — "before" partners at (d, p+1)
  if (fBeforeStartPtr !== 0) {
    const s: i32 = load<i32>(fBeforeStartPtr + (lessonIdx << 2));
    const c: i32 = load<i32>(fBeforeCountPtr + (lessonIdx << 2));
    for (let k: i32 = 0; k < c; k++) {
      const pIdx: i32 = load<i32>(fBeforeFlatPtr + ((s + k) << 2));
      if (load<u8>(lessonAssignedPtr + pIdx) !== 0) {
        const ps: i32 = load<i32>(lessonAssignedSlotPtr + (pIdx << 2));
        if (ps < 0) continue;
        if (!(slotDayOf(ps) === d && slotPeriod(ps) === p + 1)) return FAIL_RELATION_MUST_FOLLOW;
      }
    }
  }

  // n_6 ordered must-follow — "after" partners at (d, p-1)
  if (fAfterStartPtr !== 0) {
    const s: i32 = load<i32>(fAfterStartPtr + (lessonIdx << 2));
    const c: i32 = load<i32>(fAfterCountPtr + (lessonIdx << 2));
    for (let k: i32 = 0; k < c; k++) {
      const pIdx: i32 = load<i32>(fAfterFlatPtr + ((s + k) << 2));
      if (load<u8>(lessonAssignedPtr + pIdx) !== 0) {
        const ps: i32 = load<i32>(lessonAssignedSlotPtr + (pIdx << 2));
        if (ps < 0) continue;
        if (!(slotDayOf(ps) === d && slotPeriod(ps) === p - 1)) return FAIL_RELATION_MUST_FOLLOW;
      }
    }
  }

  return 0;
}
