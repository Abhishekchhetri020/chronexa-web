// canPlace — hot-path constraint check, AssemblyScript port.
//
// Mirrors the JS canPlace() in csp_solver.js. All inputs are flat typed
// arrays so the host can pass them by pointer with zero allocation per
// call. The host wraps this in adapter.js which translates the JS
// SchoolData/State objects into the flat layout once at build time.
//
// Return value: 0 = placeable. >0 = FAIL enum (see js/solver/constraints.js).

// Flat layout the host fills before calling canPlace():
//   teacherOcc:        Uint32Array  length = teacherCount * days
//   classOcc:          Uint32Array  length = classCount   * days
//   classGroupOcc:     Uint32Array  length = classCount   * days * periodsPerDay
//   roomOcc:           Uint32Array  length = roomCount    * days
//   teacherAvail:      Uint32Array  length = teacherCount * days
//   teacherDayLoad:    Int32Array   length = teacherCount * days
//   classDayLoad:      Int32Array   length = classCount   * days
//   classSubjectDayCt: Int32Array   length = classCount   * subjectCount * days
//   lessonTeacherFlat: Int32Array   (jagged via lessonTeacherStart/Count)
//   lessonClassFlat:   Int32Array   (jagged via lessonClassStart/Count)
//   lessonClassGMask:  Uint32Array  (parallel to lessonClassFlat)
//   lessonTeacherStart/Count: Int32Array length = lessonCount
//   lessonClassStart/Count:   Int32Array length = lessonCount
//   lessonSubject:     Int32Array   length = lessonCount
//   teacherMaxPerDay:  Int32Array   length = teacherCount (-1 = unlimited)
//   classMaxPerDay:    Int32Array   length = classCount
//   subjectDailyLimit: Int32Array   length = classCount * subjectCount * days
//   slotDay/slotPeriod: Int32Array  length = totalSlots
//
// Constants the host provides via setShape() before any canPlace() call:
const FAIL_TEACHER_CONFLICT: i32 = 1;
const FAIL_TEACHER_UNAVAILABLE: i32 = 2;
const FAIL_TEACHER_MAX_PER_DAY: i32 = 3;
const FAIL_CLASS_CONFLICT: i32 = 4;
const FAIL_CLASS_MAX_PER_DAY: i32 = 6;
const FAIL_SUBJECT_DAILY_LIMIT: i32 = 7;
const FAIL_ROOM_CONFLICT: i32 = 8;

// Shape (set once by host via setShape).
let days: i32 = 0;
let periodsPerDay: i32 = 0;
let teacherCount: i32 = 0;
let classCount: i32 = 0;
let subjectCount: i32 = 0;
let roomCount: i32 = 0;
let totalSlots: i32 = 0;

// Pointers to host-allocated typed arrays. AS exposes these as i32 base
// addresses. The host calls bindArrays() once per solve.
let teacherOccPtr: usize = 0;
let classOccPtr: usize = 0;
let classGroupOccPtr: usize = 0;
let roomOccPtr: usize = 0;
let teacherAvailPtr: usize = 0;
let teacherDayLoadPtr: usize = 0;
let classDayLoadPtr: usize = 0;
let classSubjectDayCtPtr: usize = 0;
let lessonTeacherFlatPtr: usize = 0;
let lessonClassFlatPtr: usize = 0;
let lessonClassGMaskPtr: usize = 0;
let lessonTeacherStartPtr: usize = 0;
let lessonTeacherCountPtr: usize = 0;
let lessonClassStartPtr: usize = 0;
let lessonClassCountPtr: usize = 0;
let lessonSubjectPtr: usize = 0;
let teacherMaxPerDayPtr: usize = 0;
let classMaxPerDayPtr: usize = 0;
let subjectDailyLimitPtr: usize = 0;
let slotDayPtr: usize = 0;
let slotPeriodPtr: usize = 0;

export function setShape(
  d: i32, ppd: i32, tc: i32, cc: i32, sc: i32, rc: i32, ts: i32
): void {
  days = d; periodsPerDay = ppd; teacherCount = tc; classCount = cc;
  subjectCount = sc; roomCount = rc; totalSlots = ts;
}

// One call per solve, binding all the flat-buffer pointers in one go.
// Order matches the field list in the file header.
export function bindArrays(
  pTeacherOcc: usize, pClassOcc: usize, pClassGroupOcc: usize, pRoomOcc: usize,
  pTeacherAvail: usize, pTeacherDayLoad: usize, pClassDayLoad: usize,
  pClassSubjectDayCt: usize,
  pLessonTeacherFlat: usize, pLessonClassFlat: usize, pLessonClassGMask: usize,
  pLessonTeacherStart: usize, pLessonTeacherCount: usize,
  pLessonClassStart: usize, pLessonClassCount: usize,
  pLessonSubject: usize,
  pTeacherMaxPerDay: usize, pClassMaxPerDay: usize, pSubjectDailyLimit: usize,
  pSlotDay: usize, pSlotPeriod: usize
): void {
  teacherOccPtr = pTeacherOcc; classOccPtr = pClassOcc;
  classGroupOccPtr = pClassGroupOcc; roomOccPtr = pRoomOcc;
  teacherAvailPtr = pTeacherAvail;
  teacherDayLoadPtr = pTeacherDayLoad; classDayLoadPtr = pClassDayLoad;
  classSubjectDayCtPtr = pClassSubjectDayCt;
  lessonTeacherFlatPtr = pLessonTeacherFlat;
  lessonClassFlatPtr = pLessonClassFlat;
  lessonClassGMaskPtr = pLessonClassGMask;
  lessonTeacherStartPtr = pLessonTeacherStart;
  lessonTeacherCountPtr = pLessonTeacherCount;
  lessonClassStartPtr = pLessonClassStart;
  lessonClassCountPtr = pLessonClassCount;
  lessonSubjectPtr = pLessonSubject;
  teacherMaxPerDayPtr = pTeacherMaxPerDay;
  classMaxPerDayPtr = pClassMaxPerDay;
  subjectDailyLimitPtr = pSubjectDailyLimit;
  slotDayPtr = pSlotDay;
  slotPeriodPtr = pSlotPeriod;
}

// canPlace — port of canPlace() from csp_solver.js. Returns 0 if the
// (lessonIdx, slot, roomIdx) placement is feasible, otherwise the FAIL
// enum value. Mirrors group-aware class conflict, teacher availability,
// teacher/class max-per-day, subject daily limit, room conflict.
export function canPlace(lessonIdx: i32, slot: i32, roomIdx: i32): i32 {
  const d = load<i32>(slotDayPtr + (slot << 2));
  const p = load<i32>(slotPeriodPtr + (slot << 2));
  const bit: u32 = (1 << <u32>p);

  // Teacher loop
  const tStart = load<i32>(lessonTeacherStartPtr + (lessonIdx << 2));
  const tCount = load<i32>(lessonTeacherCountPtr + (lessonIdx << 2));
  for (let k: i32 = 0; k < tCount; k++) {
    const t = load<i32>(lessonTeacherFlatPtr + ((tStart + k) << 2));
    const td = t * days + d;
    const occ = load<u32>(teacherOccPtr + (td << 2));
    if ((occ & bit) !== 0) return FAIL_TEACHER_CONFLICT;
    const avail = load<u32>(teacherAvailPtr + (td << 2));
    if ((avail & bit) === 0) return FAIL_TEACHER_UNAVAILABLE;
    const maxDay = load<i32>(teacherMaxPerDayPtr + (t << 2));
    if (maxDay >= 0 && load<i32>(teacherDayLoadPtr + (td << 2)) >= maxDay) {
      return FAIL_TEACHER_MAX_PER_DAY;
    }
  }

  // Class loop with group-aware conflict
  const cStart = load<i32>(lessonClassStartPtr + (lessonIdx << 2));
  const cCount = load<i32>(lessonClassCountPtr + (lessonIdx << 2));
  const subject = load<i32>(lessonSubjectPtr + (lessonIdx << 2));
  for (let k: i32 = 0; k < cCount; k++) {
    const c = load<i32>(lessonClassFlatPtr + ((cStart + k) << 2));
    const cd = c * days + d;
    const gMask = load<u32>(lessonClassGMaskPtr + ((cStart + k) << 2));
    const occMask = load<u32>(classGroupOccPtr + ((cd * periodsPerDay + p) << 2));
    if ((occMask & gMask) !== 0) return FAIL_CLASS_CONFLICT;
    const maxDay = load<i32>(classMaxPerDayPtr + (c << 2));
    if (maxDay >= 0 && load<i32>(classDayLoadPtr + (cd << 2)) >= maxDay) {
      return FAIL_CLASS_MAX_PER_DAY;
    }
    const subjKey = ((c * subjectCount) + subject) * days + d;
    const sLimit = load<i32>(subjectDailyLimitPtr + (subjKey << 2));
    if (sLimit >= 0 && load<i32>(classSubjectDayCtPtr + (subjKey << 2)) >= sLimit) {
      return FAIL_SUBJECT_DAILY_LIMIT;
    }
  }

  if (roomIdx >= 0) {
    const rd = roomIdx * days + d;
    const occ = load<u32>(roomOccPtr + (rd << 2));
    if ((occ & bit) !== 0) return FAIL_ROOM_CONFLICT;
  }

  return 0;
}
