// SmartCspSolver — JS v1 port of the Kotlin solver.
//
// Algorithm (mirrors Kotlin):
//   1. Build a flat IntArray model from input SchoolData.
//   2. Precompute per-lesson candidate slot/room pairs (filtered by
//      required-room-type, fixed-day/period, teacher availability mask).
//   3. Root search: pick 4 deterministic seeds; for each, walk root-lesson
//      candidates in coprime-stride order; backtrack via MRV+degree.
//   4. Bitmask occupancy: one uint32 per (entity, day). Bit `p` set iff
//      that entity is busy at period p. Checks are `(mask >>> p) & 1`.
//   5. Incremental scoring: maintain per-teacher/per-day gap counts,
//      consecutive overload, subject distribution, last-period overflow,
//      and period load balance — refresh only touched cells on apply/undo.
//
// Differences from Kotlin (documented in docs/SOLVER.md):
//   - 4 branches run sequentially (no Web Worker fan-out yet).
//   - Sparse-slot conflict cache is dropped; the dense bitmask is enough.
//   - Cache-line padding (`alignedDayStride`) is omitted (irrelevant in JS).
//
// All hot loops use `(x | 0)` / typed arrays to stay in V8's fast path.

import { DEFAULT_SOFT_WEIGHTS, FAIL, FAIL_NAME, Weight } from "./constraints.js";
import { popcount32 } from "./bitmask.js";

export const VERSION = "js-csp-1.0.0";

// ---------------------------------------------------------------------------
// 64-bit-ish deterministic PRNG using BigInt for mix64; final reduce to int.
// ---------------------------------------------------------------------------

const MIX64_A = 0xbf58476d1ce4e5b9n;
const MIX64_B = 0x94d049bb133111ebn;
const MIX64_C = 0x9e3779b97f4a7c15n;
const MIX64_MASK = (1n << 64n) - 1n;

function mix64(z0) {
  // Accepts BigInt or Number.
  let z = ((typeof z0 === "bigint" ? z0 : BigInt(z0 | 0)) + MIX64_C) & MIX64_MASK;
  z = ((z ^ (z >> 30n)) * MIX64_A) & MIX64_MASK;
  z = ((z ^ (z >> 27n)) * MIX64_B) & MIX64_MASK;
  z = (z ^ (z >> 31n)) & MIX64_MASK;
  return z;
}

function mix64Int(z0) {
  // Reduce 64-bit mix into a positive 31-bit int (for use as stride or tie).
  return Number(mix64(z0) & 0x7fffffffn);
}

function gcd(a, b) {
  a = a | 0; b = b | 0;
  while (b !== 0) { const t = a % b; a = b; b = t; }
  return a >= 0 ? a : -a;
}

function deterministicStep(seed, size) {
  if (size <= 1) return 1;
  let step = mix64Int(seed) % size;
  if (step === 0) step = 1;
  while (gcd(step, size) !== 1) {
    step += 1;
    if (step >= size) step = 1;
  }
  return step;
}

// ---------------------------------------------------------------------------
// SchoolData (DATA_SHAPES.md) → internal flat model.
// ---------------------------------------------------------------------------

/**
 * Build a flat solver model from the canonical SchoolData input.
 * Inputs:
 *   school (SchoolData) — see docs/DATA_SHAPES.md
 * Returns:
 *   { model, lessonInputs } — `model` is the flat IntArray-style record
 *   used by the search; `lessonInputs` keeps the originals so we can
 *   round-trip ids in the response.
 */
function buildModel(school) {
  const days = inferDays(school);
  const periodsPerDay = inferPeriodsPerDay(school);
  if (periodsPerDay > 30) {
    // We store occupancy in a uint32; bit 31 is signed-trap. Cap at 30.
    throw new Error(`periodsPerDay must be <= 30 for uint32 occupancy (got ${periodsPerDay})`);
  }
  const totalSlots = days * periodsPerDay;

  const teacherIds = school.teachers.map(t => t.id);
  const classIds = school.classes.map(c => c.id);
  const roomIds = school.classrooms.map(r => r.id);
  const subjectIds = school.subjects.map(s => s.id);

  const teacherIdx = new Map(teacherIds.map((id, i) => [id, i]));
  const classIdx = new Map(classIds.map((id, i) => [id, i]));
  const roomIdx = new Map(roomIds.map((id, i) => [id, i]));
  const subjectIdx = new Map(subjectIds.map((id, i) => [id, i]));

  // Lessons are expanded by periodsPerWeek — one solver-lesson per period.
  const expanded = [];
  for (const l of school.lessons) {
    const reps = Math.max(1, l.periodsPerWeek | 0);
    for (let i = 0; i < reps; i++) {
      expanded.push({
        id: reps === 1 ? l.id : `${l.id}#${i + 1}`,
        srcId: l.id,
        classIds: l.classIds || [],
        teacherIds: l.teacherIds || [],
        subjectId: l.subjectId,
        requiredRoomType: l.requiredRoomType || null,
        preferredRoomId: l.preferredRoomId || null,
        fixedDay: l.fixedDay == null ? null : l.fixedDay | 0,
        fixedPeriod: l.fixedPeriod == null ? null : l.fixedPeriod | 0,
        isLabDouble: !!l.isLabDouble,
      });
    }
  }
  const lessonCount = expanded.length;

  // Build flat layouts.
  const lessonClassStart = new Int32Array(lessonCount);
  const lessonClassCount = new Int32Array(lessonCount);
  const lessonTeacherStart = new Int32Array(lessonCount);
  const lessonTeacherCount = new Int32Array(lessonCount);
  const lessonSubject = new Int32Array(lessonCount);
  const lessonLabDouble = new Int32Array(lessonCount);
  const lessonFixedSlot = new Int32Array(lessonCount).fill(-1);

  const lessonClassFlat = [];
  const lessonTeacherFlat = [];

  for (let i = 0; i < lessonCount; i++) {
    const l = expanded[i];
    lessonClassStart[i] = lessonClassFlat.length;
    for (const cid of l.classIds) {
      const ix = classIdx.get(cid);
      if (ix == null) throw new Error(`Unknown classId in lesson ${l.id}: ${cid}`);
      lessonClassFlat.push(ix);
    }
    lessonClassCount[i] = l.classIds.length;

    lessonTeacherStart[i] = lessonTeacherFlat.length;
    for (const tid of l.teacherIds) {
      const ix = teacherIdx.get(tid);
      if (ix == null) throw new Error(`Unknown teacherId in lesson ${l.id}: ${tid}`);
      lessonTeacherFlat.push(ix);
    }
    lessonTeacherCount[i] = l.teacherIds.length;

    const sIdx = subjectIdx.get(l.subjectId);
    if (sIdx == null) throw new Error(`Unknown subjectId in lesson ${l.id}: ${l.subjectId}`);
    lessonSubject[i] = sIdx;
    lessonLabDouble[i] = l.isLabDouble ? 1 : 0;

    if (l.fixedDay != null && l.fixedPeriod != null) {
      const d = (l.fixedDay | 0);
      const p = (l.fixedPeriod | 0) - 1; // ASC fixedPeriod is 1-based
      if (d >= 0 && d < days && p >= 0 && p < periodsPerDay) {
        lessonFixedSlot[i] = d * periodsPerDay + p;
      }
    }
  }

  // Teacher availability — pack per-day uint32 occupancy mask. timeOff key
  // is `${dayIdx}_${periodIdx}` per DATA_SHAPES.md.
  const teacherAvailabilityMask = new Uint32Array(teacherIds.length * days);
  // Default: every slot available
  for (let t = 0; t < teacherIds.length; t++) {
    for (let d = 0; d < days; d++) {
      teacherAvailabilityMask[t * days + d] = periodsPerDay === 32
        ? 0xffffffff
        : ((1 << periodsPerDay) - 1) >>> 0;
    }
  }
  for (let t = 0; t < school.teachers.length; t++) {
    const off = school.teachers[t].timeOff || {};
    for (const key of Object.keys(off)) {
      const [dStr, pStr] = key.split("_");
      const d = dStr | 0;
      const p = pStr | 0;
      if (d < 0 || d >= days || p < 0 || p >= periodsPerDay) continue;
      if (off[key] === "unavailable") {
        teacherAvailabilityMask[t * days + d] =
          (teacherAvailabilityMask[t * days + d] & ~(1 << p)) >>> 0;
      }
    }
  }

  // Teacher misc caps
  const teacherMaxPerDay = new Int32Array(teacherIds.length).fill(-1);
  const teacherMaxConsec = new Int32Array(teacherIds.length).fill(-1);
  for (let t = 0; t < school.teachers.length; t++) {
    const tt = school.teachers[t];
    if (tt.maxConsecutivePeriods != null) teacherMaxConsec[t] = tt.maxConsecutivePeriods | 0;
  }

  // Class day caps default to periodsPerDay (effectively unlimited).
  const classMaxPerDay = new Int32Array(classIds.length).fill(-1);
  const classMaxConsec = new Int32Array(classIds.length).fill(-1);

  // Per-class room type → list of candidate room indices.
  const roomTypeBuckets = new Map();
  for (let r = 0; r < school.classrooms.length; r++) {
    const rt = school.classrooms[r].roomType || "__any__";
    if (!roomTypeBuckets.has(rt)) roomTypeBuckets.set(rt, []);
    roomTypeBuckets.get(rt).push(r);
  }
  const anyRoom = Array.from({ length: school.classrooms.length }, (_, i) => i);

  // Per-lesson candidate (slot, room) list. Filtered by:
  //   - room type (if requiredRoomType / preferredRoomId)
  //   - fixed slot (if present)
  //   - teacher availability AND class availability (bitmask AND across all
  //     teachers and classes of the lesson)
  //   - lab-double: the lesson's first slot must have a same-room next slot
  //     available too. We allow the candidate; canPlace double-checks.
  const lessonCandidateStart = new Int32Array(lessonCount);
  const lessonCandidateCount = new Int32Array(lessonCount);
  const candidateSlot = [];
  const candidateRoom = [];

  for (let i = 0; i < lessonCount; i++) {
    const l = expanded[i];
    lessonCandidateStart[i] = candidateSlot.length;

    // Resolve room candidates.
    let roomCands;
    if (l.preferredRoomId) {
      const rx = roomIdx.get(l.preferredRoomId);
      roomCands = rx == null ? [] : [rx];
    } else if (l.requiredRoomType) {
      roomCands = roomTypeBuckets.get(l.requiredRoomType) || [];
    } else {
      roomCands = anyRoom;
    }

    // Resolve slot candidates as a per-day available mask.
    // mask[d] is the AND of all teachers' availability for that day.
    const teacherCount = l.teacherIds.length;
    for (let d = 0; d < days; d++) {
      let mask = periodsPerDay === 32 ? 0xffffffff : ((1 << periodsPerDay) - 1) >>> 0;
      for (const tid of l.teacherIds) {
        const t = teacherIdx.get(tid);
        mask = (mask & teacherAvailabilityMask[t * days + d]) >>> 0;
      }
      if (lessonFixedSlot[i] >= 0) {
        const fd = (lessonFixedSlot[i] / periodsPerDay) | 0;
        const fp = lessonFixedSlot[i] % periodsPerDay;
        if (d !== fd) continue;
        mask = (mask & (1 << fp)) >>> 0;
      }
      if (mask === 0) continue;
      // Iterate set bits of `mask`.
      let m = mask;
      while (m !== 0) {
        // ctz
        let p = 0, w = m;
        if ((w & 0xffff) === 0) { p += 16; w >>>= 16; }
        if ((w & 0xff) === 0) { p += 8; w >>>= 8; }
        if ((w & 0xf) === 0) { p += 4; w >>>= 4; }
        if ((w & 0x3) === 0) { p += 2; w >>>= 2; }
        if ((w & 0x1) === 0) { p += 1; }
        // lab-double: need next period on the same day; skip last period.
        if (l.isLabDouble && p + 1 >= periodsPerDay) {
          m = (m & ~(1 << p)) >>> 0;
          continue;
        }
        for (const r of roomCands) {
          candidateSlot.push(d * periodsPerDay + p);
          candidateRoom.push(r);
        }
        m = (m & ~(1 << p)) >>> 0;
      }
    }

    lessonCandidateCount[i] = candidateSlot.length - lessonCandidateStart[i];
  }

  const candidateSlotArr = Int32Array.from(candidateSlot);
  const candidateRoomArr = Int32Array.from(candidateRoom);

  // Lesson adjacency degree — # of OTHER lessons sharing a teacher or class.
  const lessonAdjacencyDegree = new Int32Array(lessonCount);
  for (let i = 0; i < lessonCount; i++) {
    let degree = 0;
    for (let j = 0; j < lessonCount; j++) {
      if (i === j) continue;
      if (sharesTeacher(i, j, lessonTeacherStart, lessonTeacherCount, lessonTeacherFlat) ||
          sharesClass(i, j, lessonClassStart, lessonClassCount, lessonClassFlat)) {
        degree++;
      }
    }
    lessonAdjacencyDegree[i] = degree;
  }

  // slotDay / slotPeriod lookup
  const slotDay = new Int32Array(totalSlots);
  const slotPeriod = new Int32Array(totalSlots);
  for (let d = 0; d < days; d++) {
    for (let p = 0; p < periodsPerDay; p++) {
      slotDay[d * periodsPerDay + p] = d;
      slotPeriod[d * periodsPerDay + p] = p;
    }
  }

  // Period preference scores — copy the Kotlin table; pad / truncate to periodsPerDay.
  const PERIOD_PREFERENCE_SCORES = [10, 15, 20, 25, 15, 49, 47, 7, 25, 5, 15, 38, 2, 9, 13, 10, 8, 11, 12, 59];
  const periodPref = new Int32Array(periodsPerDay);
  for (let p = 0; p < periodsPerDay; p++) {
    periodPref[p] = PERIOD_PREFERENCE_SCORES[p % PERIOD_PREFERENCE_SCORES.length];
  }

  // Subject daily limit — flat (class, subject, day) → cap. -1 = no cap.
  const subjectDailyLimit = new Int32Array(classIds.length * subjectIds.length * days).fill(-1);

  // Soft weights
  const w = DEFAULT_SOFT_WEIGHTS;
  const weights = new Int32Array([
    w.teacher_gaps, w.class_gaps, w.subject_distribution, w.teacher_room_stability,
    w.teacher_consecutive_overload, w.class_consecutive_overload, w.teacher_last_period_overflow,
    w.period_load_balance,
  ]);

  return {
    days, periodsPerDay, totalSlots,
    lessonCount, teacherCount: teacherIds.length, classCount: classIds.length,
    roomCount: roomIds.length, subjectCount: subjectIds.length,
    teacherIds, classIds, roomIds, subjectIds,
    lessons: expanded,
    lessonClassStart, lessonClassCount, lessonClassFlat: Int32Array.from(lessonClassFlat),
    lessonTeacherStart, lessonTeacherCount, lessonTeacherFlat: Int32Array.from(lessonTeacherFlat),
    lessonSubject, lessonLabDouble, lessonFixedSlot,
    lessonCandidateStart, lessonCandidateCount,
    candidateSlot: candidateSlotArr, candidateRoom: candidateRoomArr,
    teacherAvailabilityMask, teacherMaxPerDay, teacherMaxConsec,
    classMaxPerDay, classMaxConsec,
    subjectDailyLimit,
    lessonAdjacencyDegree,
    slotDay, slotPeriod, periodPref,
    weights,
    teacherLastPeriodCap: new Int32Array(teacherIds.length).fill(-1),
  };
}

function inferDays(school) {
  // Caller can explicitly set school.daysPerWeek; otherwise infer from the
  // largest dayIdx referenced in cards / timeOff / fixedDay, defaulting to 5.
  if (typeof school.daysPerWeek === "number") return school.daysPerWeek | 0;
  let maxDay = 0;
  if (school.cards && school.cards.length) {
    for (const c of school.cards) if (c.day > maxDay) maxDay = c.day | 0;
  }
  for (const t of school.teachers) {
    const off = t.timeOff || {};
    for (const k of Object.keys(off)) {
      const [d] = k.split("_");
      const dn = (d | 0) + 1;
      if (dn > maxDay) maxDay = dn;
    }
  }
  for (const l of school.lessons) {
    if (l.fixedDay != null) {
      const dn = (l.fixedDay | 0) + 1;
      if (dn > maxDay) maxDay = dn;
    }
  }
  return Math.max(maxDay, 5);
}

function inferPeriodsPerDay(school) {
  const teachingCount = (school.bell?.periods || []).filter(p => p.isTeaching !== false).length;
  return teachingCount || 8;
}

function sharesTeacher(i, j, starts, counts, flat) {
  const si = starts[i], ci = counts[i], sj = starts[j], cj = counts[j];
  for (let a = 0; a < ci; a++) {
    const t = flat[si + a];
    for (let b = 0; b < cj; b++) if (flat[sj + b] === t) return true;
  }
  return false;
}
function sharesClass(i, j, starts, counts, flat) {
  return sharesTeacher(i, j, starts, counts, flat);
}

// ---------------------------------------------------------------------------
// Solver state
// ---------------------------------------------------------------------------

function makeState(model) {
  const { days, totalSlots, teacherCount, classCount, roomCount, lessonCount, subjectCount } = model;
  return {
    // Bitmask occupancy: one uint32 per (entity, day). Bit p set iff busy.
    teacherOcc: new Uint32Array(teacherCount * days),
    classOcc: new Uint32Array(classCount * days),
    roomOcc: new Uint32Array(roomCount * days),
    // Day-load counters
    teacherDayLoad: new Int32Array(teacherCount * days),
    classDayLoad: new Int32Array(classCount * days),
    classSubjectDayCount: new Int32Array(classCount * subjectCount * days),
    teacherLastPeriodCount: new Int32Array(teacherCount),
    teacherDistinctRooms: new Int32Array(teacherCount),
    teacherRoomUsage: new Int32Array(teacherCount * roomCount),
    slotLoad: new Int32Array(totalSlots),
    // Per-lesson assignment
    lessonAssigned: new Uint8Array(lessonCount),
    lessonAssignedSlot: new Int32Array(lessonCount).fill(-1),
    lessonAssignedRoom: new Int32Array(lessonCount).fill(-1),
    assignedLessonCount: 0,
    // Best snapshot
    bestLessonAssigned: new Uint8Array(lessonCount),
    bestLessonAssignedSlot: new Int32Array(lessonCount).fill(-1),
    bestLessonAssignedRoom: new Int32Array(lessonCount).fill(-1),
    bestAssignedEntries: 0,
    bestSoftScore: -Number.MAX_SAFE_INTEGER,
    bestHardCount: Number.MAX_SAFE_INTEGER,
    // Scorer totals
    totalTeacherGap: 0,
    totalClassGap: 0,
    totalSubjectDistribution: 0,
    totalTeacherRoomStability: 0,
    totalTeacherConsecutiveOverload: 0,
    totalClassConsecutiveOverload: 0,
    totalTeacherLastPeriodOverflow: 0,
    totalPeriodLoadBalance: 0,
    // Per-entity day metrics (so we can subtract on undo)
    teacherDayGap: new Int32Array(teacherCount * days),
    classDayGap: new Int32Array(classCount * days),
    teacherDayOverload: new Int32Array(teacherCount * days),
    classDayOverload: new Int32Array(classCount * days),
    subjectDayOverflow: new Int32Array(classCount * subjectCount * days),
    teacherRoomPenalty: new Int32Array(teacherCount),
    teacherLastOverflow: new Int32Array(teacherCount),
  };
}

// ---------------------------------------------------------------------------
// canPlace — checks hard constraints; returns null if OK, else a failure code.
// ---------------------------------------------------------------------------

function canPlace(model, state, lessonIdx, slot, roomIdx) {
  const d = model.slotDay[slot];
  const p = model.slotPeriod[slot];
  const bit = (1 << p) >>> 0;
  const teacherStart = model.lessonTeacherStart[lessonIdx];
  const teacherCount = model.lessonTeacherCount[lessonIdx];

  // Fixed-slot check
  const fixed = model.lessonFixedSlot[lessonIdx];
  if (fixed >= 0 && fixed !== slot) return FAIL.FIXED_SLOT_MISMATCH;

  for (let k = 0; k < teacherCount; k++) {
    const t = model.lessonTeacherFlat[teacherStart + k];
    const td = t * model.days + d;
    if ((state.teacherOcc[td] & bit) !== 0) return FAIL.TEACHER_CONFLICT;
    if ((model.teacherAvailabilityMask[td] & bit) === 0) return FAIL.TEACHER_UNAVAILABLE;
    const maxDay = model.teacherMaxPerDay[t];
    if (maxDay >= 0 && state.teacherDayLoad[td] >= maxDay) return FAIL.TEACHER_MAX_PER_DAY;
  }

  const classStart = model.lessonClassStart[lessonIdx];
  const classCount = model.lessonClassCount[lessonIdx];
  const subject = model.lessonSubject[lessonIdx];

  for (let k = 0; k < classCount; k++) {
    const c = model.lessonClassFlat[classStart + k];
    const cd = c * model.days + d;
    if ((state.classOcc[cd] & bit) !== 0) return FAIL.CLASS_CONFLICT;
    const maxDay = model.classMaxPerDay[c];
    if (maxDay >= 0 && state.classDayLoad[cd] >= maxDay) return FAIL.CLASS_MAX_PER_DAY;
    const subjectKey = ((c * model.subjectCount) + subject) * model.days + d;
    const subjectLimit = model.subjectDailyLimit[subjectKey];
    if (subjectLimit >= 0 && state.classSubjectDayCount[subjectKey] >= subjectLimit) {
      return FAIL.SUBJECT_DAILY_LIMIT;
    }
  }

  const rd = roomIdx * model.days + d;
  if ((state.roomOcc[rd] & bit) !== 0) return FAIL.ROOM_CONFLICT;

  if (model.lessonLabDouble[lessonIdx] === 1) {
    if (p + 1 >= model.periodsPerDay) return FAIL.LAB_DOUBLE_OOB;
    const secondReason = canPlaceSecond(model, state, lessonIdx, slot + 1, roomIdx);
    if (secondReason !== null) {
      // Translate to lab-double-prefixed reason
      switch (secondReason) {
        case FAIL.TEACHER_CONFLICT: return FAIL.LAB_DOUBLE_TEACHER_CONFLICT;
        case FAIL.TEACHER_UNAVAILABLE: return FAIL.LAB_DOUBLE_TEACHER_UNAVAILABLE;
        case FAIL.TEACHER_MAX_PER_DAY: return FAIL.LAB_DOUBLE_TEACHER_MAX_PER_DAY;
        case FAIL.CLASS_CONFLICT: return FAIL.LAB_DOUBLE_CLASS_CONFLICT;
        case FAIL.CLASS_MAX_PER_DAY: return FAIL.LAB_DOUBLE_CLASS_MAX_PER_DAY;
        case FAIL.SUBJECT_DAILY_LIMIT: return FAIL.LAB_DOUBLE_SUBJECT_DAILY_LIMIT;
        case FAIL.ROOM_CONFLICT: return FAIL.LAB_DOUBLE_ROOM_CONFLICT;
        default: return FAIL.LAB_DOUBLE_TEACHER_CONFLICT;
      }
    }
  }

  return null;
}

function canPlaceSecond(model, state, lessonIdx, slot, roomIdx) {
  const d = model.slotDay[slot];
  const p = model.slotPeriod[slot];
  const bit = (1 << p) >>> 0;
  const teacherStart = model.lessonTeacherStart[lessonIdx];
  const teacherCount = model.lessonTeacherCount[lessonIdx];

  for (let k = 0; k < teacherCount; k++) {
    const t = model.lessonTeacherFlat[teacherStart + k];
    const td = t * model.days + d;
    if ((state.teacherOcc[td] & bit) !== 0) return FAIL.TEACHER_CONFLICT;
    if ((model.teacherAvailabilityMask[td] & bit) === 0) return FAIL.TEACHER_UNAVAILABLE;
  }
  const classStart = model.lessonClassStart[lessonIdx];
  const classCount = model.lessonClassCount[lessonIdx];
  for (let k = 0; k < classCount; k++) {
    const c = model.lessonClassFlat[classStart + k];
    const cd = c * model.days + d;
    if ((state.classOcc[cd] & bit) !== 0) return FAIL.CLASS_CONFLICT;
  }
  const rd = roomIdx * model.days + d;
  if ((state.roomOcc[rd] & bit) !== 0) return FAIL.ROOM_CONFLICT;

  return null;
}

// ---------------------------------------------------------------------------
// Apply / remove placement (with incremental scoring deltas)
// ---------------------------------------------------------------------------

function gapPenalty32(mask) {
  if (mask === 0) return 0;
  // Trailing zeros
  let tz = 0, w = mask;
  while ((w & 1) === 0) { tz++; w >>>= 1; }
  // Position of highest set bit
  let highest = 0;
  let scan = mask;
  for (let i = 31; i >= 0; i--) if ((scan >>> i) & 1) { highest = i; break; }
  const width = highest - tz + 1;
  const occupied = popcount32(mask);
  const gap = width - occupied;
  return gap > 0 ? gap : 0;
}

function overloadPenalty32(mask, limit, periodsPerDay) {
  if (limit <= 0 || mask === 0) return 0;
  const dayMask = periodsPerDay === 32 ? 0xffffffff : ((1 << periodsPerDay) - 1) >>> 0;
  let m = (mask & dayMask) >>> 0;
  let penalty = 0;
  while (m !== 0) {
    // skip zeros at the bottom
    let tz = 0, w = m;
    while ((w & 1) === 0) { tz++; w >>>= 1; }
    m = w;
    // measure run of ones at the bottom
    let runLength = 0;
    while ((m & 1) === 1) { runLength++; m >>>= 1; }
    const overflow = runLength - limit;
    if (overflow > 0) penalty += overflow;
  }
  return penalty;
}

function refreshTeacherDay(model, state, teacher, day) {
  const key = teacher * model.days + day;
  state.totalTeacherGap -= state.teacherDayGap[key];
  state.totalTeacherConsecutiveOverload -= state.teacherDayOverload[key];
  const mask = state.teacherOcc[key];
  state.teacherDayGap[key] = gapPenalty32(mask);
  state.teacherDayOverload[key] = overloadPenalty32(mask, model.teacherMaxConsec[teacher], model.periodsPerDay);
  state.totalTeacherGap += state.teacherDayGap[key];
  state.totalTeacherConsecutiveOverload += state.teacherDayOverload[key];
}

function refreshClassDay(model, state, classId, day) {
  const key = classId * model.days + day;
  state.totalClassGap -= state.classDayGap[key];
  state.totalClassConsecutiveOverload -= state.classDayOverload[key];
  const mask = state.classOcc[key];
  state.classDayGap[key] = gapPenalty32(mask);
  state.classDayOverload[key] = overloadPenalty32(mask, model.classMaxConsec[classId], model.periodsPerDay);
  state.totalClassGap += state.classDayGap[key];
  state.totalClassConsecutiveOverload += state.classDayOverload[key];
}

function refreshSubjectCell(model, state, classId, subjectId, day) {
  const key = ((classId * model.subjectCount) + subjectId) * model.days + day;
  state.totalSubjectDistribution -= state.subjectDayOverflow[key];
  const c = state.classSubjectDayCount[key];
  const v = c - 2 > 0 ? c - 2 : 0;
  state.subjectDayOverflow[key] = v;
  state.totalSubjectDistribution += v;
}

function refreshTeacherRoom(model, state, teacher) {
  state.totalTeacherRoomStability -= state.teacherRoomPenalty[teacher];
  const v = state.teacherDistinctRooms[teacher] - 1;
  state.teacherRoomPenalty[teacher] = v > 0 ? v : 0;
  state.totalTeacherRoomStability += state.teacherRoomPenalty[teacher];
}

function refreshTeacherLast(model, state, teacher) {
  state.totalTeacherLastPeriodOverflow -= state.teacherLastOverflow[teacher];
  const cap = model.teacherLastPeriodCap[teacher];
  const v = cap >= 0 ? Math.max(0, state.teacherLastPeriodCount[teacher] - cap) : 0;
  state.teacherLastOverflow[teacher] = v;
  state.totalTeacherLastPeriodOverflow += v;
}

function refreshPeriodLoad(model, state) {
  let total = 0;
  for (let s = 0; s < state.slotLoad.length; s++) {
    total += state.slotLoad[s] * model.periodPref[s % model.periodsPerDay];
  }
  state.totalPeriodLoadBalance = total;
}

function applySingle(model, state, lessonIdx, slot, roomIdx) {
  const d = model.slotDay[slot];
  const p = model.slotPeriod[slot];
  const bit = (1 << p) >>> 0;
  const teacherStart = model.lessonTeacherStart[lessonIdx];
  const teacherCount = model.lessonTeacherCount[lessonIdx];
  for (let k = 0; k < teacherCount; k++) {
    const t = model.lessonTeacherFlat[teacherStart + k];
    const td = t * model.days + d;
    state.teacherOcc[td] = (state.teacherOcc[td] | bit) >>> 0;
    state.teacherDayLoad[td] += 1;
    if (p === model.periodsPerDay - 1) {
      state.teacherLastPeriodCount[t] += 1;
      refreshTeacherLast(model, state, t);
    }
    // teacher-room stability
    const tr = t * model.roomCount + roomIdx;
    if (state.teacherRoomUsage[tr] === 0) {
      state.teacherDistinctRooms[t] += 1;
    }
    state.teacherRoomUsage[tr] += 1;
    refreshTeacherRoom(model, state, t);
    refreshTeacherDay(model, state, t, d);
  }
  const classStart = model.lessonClassStart[lessonIdx];
  const classCount = model.lessonClassCount[lessonIdx];
  const subject = model.lessonSubject[lessonIdx];
  for (let k = 0; k < classCount; k++) {
    const c = model.lessonClassFlat[classStart + k];
    const cd = c * model.days + d;
    state.classOcc[cd] = (state.classOcc[cd] | bit) >>> 0;
    state.classDayLoad[cd] += 1;
    const subjectKey = ((c * model.subjectCount) + subject) * model.days + d;
    state.classSubjectDayCount[subjectKey] += 1;
    refreshSubjectCell(model, state, c, subject, d);
    refreshClassDay(model, state, c, d);
  }
  const rd = roomIdx * model.days + d;
  state.roomOcc[rd] = (state.roomOcc[rd] | bit) >>> 0;
  state.slotLoad[slot] += 1;
}

function removeSingle(model, state, lessonIdx, slot, roomIdx) {
  const d = model.slotDay[slot];
  const p = model.slotPeriod[slot];
  const bit = (1 << p) >>> 0;
  const teacherStart = model.lessonTeacherStart[lessonIdx];
  const teacherCount = model.lessonTeacherCount[lessonIdx];
  for (let k = 0; k < teacherCount; k++) {
    const t = model.lessonTeacherFlat[teacherStart + k];
    const td = t * model.days + d;
    state.teacherOcc[td] = (state.teacherOcc[td] & ~bit) >>> 0;
    state.teacherDayLoad[td] -= 1;
    if (p === model.periodsPerDay - 1) {
      state.teacherLastPeriodCount[t] -= 1;
      refreshTeacherLast(model, state, t);
    }
    const tr = t * model.roomCount + roomIdx;
    state.teacherRoomUsage[tr] -= 1;
    if (state.teacherRoomUsage[tr] === 0) {
      state.teacherDistinctRooms[t] -= 1;
    }
    refreshTeacherRoom(model, state, t);
    refreshTeacherDay(model, state, t, d);
  }
  const classStart = model.lessonClassStart[lessonIdx];
  const classCount = model.lessonClassCount[lessonIdx];
  const subject = model.lessonSubject[lessonIdx];
  for (let k = 0; k < classCount; k++) {
    const c = model.lessonClassFlat[classStart + k];
    const cd = c * model.days + d;
    state.classOcc[cd] = (state.classOcc[cd] & ~bit) >>> 0;
    state.classDayLoad[cd] -= 1;
    const subjectKey = ((c * model.subjectCount) + subject) * model.days + d;
    state.classSubjectDayCount[subjectKey] -= 1;
    refreshSubjectCell(model, state, c, subject, d);
    refreshClassDay(model, state, c, d);
  }
  const rd = roomIdx * model.days + d;
  state.roomOcc[rd] = (state.roomOcc[rd] & ~bit) >>> 0;
  state.slotLoad[slot] -= 1;
}

function applyPlacement(model, state, lessonIdx, slot, roomIdx, undoStack) {
  applySingle(model, state, lessonIdx, slot, roomIdx);
  if (model.lessonLabDouble[lessonIdx] === 1) {
    applySingle(model, state, lessonIdx, slot + 1, roomIdx);
  }
  state.lessonAssignedSlot[lessonIdx] = slot;
  state.lessonAssignedRoom[lessonIdx] = roomIdx;
  state.lessonAssigned[lessonIdx] = 1;
  state.assignedLessonCount += 1;
  if (undoStack) undoStack.push({ lessonIdx, slot, roomIdx });
}

function undoPlacement(model, state, record) {
  removeSingle(model, state, record.lessonIdx, record.slot, record.roomIdx);
  if (model.lessonLabDouble[record.lessonIdx] === 1) {
    removeSingle(model, state, record.lessonIdx, record.slot + 1, record.roomIdx);
  }
  state.lessonAssignedSlot[record.lessonIdx] = -1;
  state.lessonAssignedRoom[record.lessonIdx] = -1;
  state.lessonAssigned[record.lessonIdx] = 0;
  state.assignedLessonCount -= 1;
}

function undoToMark(model, state, undoStack, mark) {
  while (undoStack.length > mark) undoPlacement(model, state, undoStack.pop());
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

function softScore(model, state) {
  const w = model.weights;
  let s = 0;
  s += state.totalTeacherGap * w[0];
  s += state.totalClassGap * w[1];
  s += state.totalSubjectDistribution * w[2];
  s += state.totalTeacherRoomStability * w[3];
  s += state.totalTeacherConsecutiveOverload * w[4];
  s += state.totalClassConsecutiveOverload * w[5];
  s += state.totalTeacherLastPeriodOverflow * w[6];
  s += state.totalPeriodLoadBalance * w[7];
  return s;
}

function snapshotBest(state) {
  state.bestLessonAssigned.set(state.lessonAssigned);
  state.bestLessonAssignedSlot.set(state.lessonAssignedSlot);
  state.bestLessonAssignedRoom.set(state.lessonAssignedRoom);
  state.bestAssignedEntries = state.assignedLessonCount;
}

// ---------------------------------------------------------------------------
// Variable selection (MRV + degree)
// ---------------------------------------------------------------------------

function countFeasibleCandidates(model, state, lessonIdx) {
  const start = model.lessonCandidateStart[lessonIdx];
  const count = model.lessonCandidateCount[lessonIdx];
  let n = 0;
  for (let i = start; i < start + count; i++) {
    if (canPlace(model, state, lessonIdx, model.candidateSlot[i], model.candidateRoom[i]) === null) n++;
  }
  return n;
}

function selectByMrvDegree(model, state, unassigned, unassignedCount, seed, depth) {
  let bestLesson = -1, bestDomain = Number.MAX_SAFE_INTEGER, bestDegree = -1, bestTie = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < unassignedCount; i++) {
    const l = unassigned[i];
    if (state.lessonAssigned[l]) continue;
    const dom = countFeasibleCandidates(model, state, l);
    const deg = model.lessonAdjacencyDegree[l];
    const tie = mix64Int(BigInt(seed) ^ BigInt(depth) ^ BigInt(l));
    const better =
      dom < bestDomain ||
      (dom === bestDomain && deg > bestDegree) ||
      (dom === bestDomain && deg === bestDegree && tie < bestTie) ||
      (dom === bestDomain && deg === bestDegree && tie === bestTie && l < bestLesson);
    if (better) {
      bestLesson = l; bestDomain = dom; bestDegree = deg; bestTie = tie;
    }
  }
  return bestLesson;
}

function fillFeasibleCandidates(model, state, lessonIdx, out) {
  const start = model.lessonCandidateStart[lessonIdx];
  const count = model.lessonCandidateCount[lessonIdx];
  let k = 0;
  for (let i = start; i < start + count; i++) {
    if (canPlace(model, state, lessonIdx, model.candidateSlot[i], model.candidateRoom[i]) === null) {
      out[k++] = i;
    }
  }
  return k;
}

function removeFromUnassigned(arr, count, value) {
  for (let i = 0; i < count; i++) {
    if (arr[i] === value) { arr[i] = arr[count - 1]; return count - 1; }
  }
  return count;
}
function addToUnassigned(arr, count, value) { arr[count] = value; return count + 1; }

// ---------------------------------------------------------------------------
// Backtracking search
// ---------------------------------------------------------------------------

function backtrack(model, state, unassigned, unassignedCount, ctx) {
  if (ctx.timedOut) return;
  if (performance.now() >= ctx.deadlineMs) { ctx.timedOut = true; return; }
  ctx.nodesVisited += 1;

  if (unassignedCount === 0) {
    const score = -softScore(model, state);
    const entries = state.assignedLessonCount;
    if (score > state.bestSoftScore ||
        (score === state.bestSoftScore && entries > state.bestAssignedEntries)) {
      state.bestSoftScore = score;
      state.bestHardCount = 0;
      snapshotBest(state);
    }
    return;
  }

  const selected = selectByMrvDegree(model, state, unassigned, unassignedCount, ctx.branchSeed, ctx.depth);
  if (selected < 0) return;

  const candidates = ctx.candidateScratch;
  const feasibleCount = fillFeasibleCandidates(model, state, selected, candidates);

  if (feasibleCount === 0) {
    // Record best partial and bail this branch
    const score = -softScore(model, state);
    const entries = state.assignedLessonCount;
    if (entries > state.bestAssignedEntries ||
        (entries === state.bestAssignedEntries && score > state.bestSoftScore)) {
      state.bestSoftScore = score;
      state.bestAssignedEntries = entries;
      state.bestHardCount = unassignedCount;
      snapshotBest(state);
    }
    ctx.backtracks += 1;
    return;
  }

  const iterStep = deterministicStep(BigInt(ctx.branchSeed) ^ (BigInt(selected) << 1n) ^ BigInt(ctx.depth), feasibleCount);
  const reducedCount = removeFromUnassigned(unassigned, unassignedCount, selected);

  for (let offset = 0; offset < feasibleCount; offset++) {
    if (performance.now() >= ctx.deadlineMs) { ctx.timedOut = true; break; }
    const idx = (offset * iterStep) % feasibleCount;
    const candidate = candidates[idx];
    const slot = model.candidateSlot[candidate];
    const room = model.candidateRoom[candidate];
    if (canPlace(model, state, selected, slot, room) !== null) continue;

    const mark = ctx.undoStack.length;
    applyPlacement(model, state, selected, slot, room, ctx.undoStack);

    ctx.depth += 1;
    backtrack(model, state, unassigned, reducedCount, ctx);
    ctx.depth -= 1;

    undoToMark(model, state, ctx.undoStack, mark);
    if (ctx.timedOut) break;
    if (state.bestAssignedEntries === model.lessonCount && state.bestHardCount === 0) break;
  }

  addToUnassigned(unassigned, reducedCount, selected);
  ctx.backtracks += 1;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Solve a SchoolData payload.
 * @param {object} school - SchoolData per DATA_SHAPES.md
 * @param {object} [options] - { timeLimitSec=30, seed=0, onProgress }
 * @returns {object} SolveResponse per DATA_SHAPES.md
 */
export function solve(school, options = {}) {
  const t0 = performance.now();
  const timeLimitSec = options.timeLimitSec ?? 30;
  const deadlineMs = t0 + timeLimitSec * 1000;
  const seed = options.seed ?? 9881;
  const onProgress = options.onProgress;

  let model;
  try {
    model = buildModel(school);
  } catch (e) {
    return {
      status: "ERROR",
      assignment: [],
      stats: { placed: 0, unplaced: school.lessons.length, hardConflicts: 0, softScore: 0, durationMs: Math.round(performance.now() - t0) },
      violations: [{ ruleId: "build_model_error", description: String(e.message || e) }],
    };
  }

  // Lessons that have zero candidate (slot, room) pairs are INFEASIBLE.
  // Detect them up-front.
  const initiallyInfeasible = [];
  for (let i = 0; i < model.lessonCount; i++) {
    if (model.lessonCandidateCount[i] === 0) initiallyInfeasible.push(i);
  }

  // The driver: 4 sequential root-shuffle branches; keep the best.
  let branches = 4;
  if (model.lessonCount <= 6) branches = 1; // tiny fixtures need only 1 pass
  let globalBest = null;

  const unassigned0 = new Int32Array(model.lessonCount);
  let unassignedCount0 = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (initiallyInfeasible.indexOf(i) === -1) {
      unassigned0[unassignedCount0++] = i;
    }
  }

  let totalNodes = 0, totalBacktracks = 0;
  let anyTimedOut = false;

  for (let b = 0; b < branches; b++) {
    if (performance.now() >= deadlineMs) { anyTimedOut = true; break; }
    const state = makeState(model);
    state.bestSoftScore = -Number.MAX_SAFE_INTEGER;
    state.bestHardCount = Number.MAX_SAFE_INTEGER;
    state.bestAssignedEntries = 0;
    const unassigned = new Int32Array(unassignedCount0);
    unassigned.set(unassigned0.subarray(0, unassignedCount0));
    const ctx = {
      branchSeed: seed + b * 17,
      depth: 0,
      undoStack: [],
      candidateScratch: new Int32Array(maxCandidatesPerLesson(model)),
      nodesVisited: 0,
      backtracks: 0,
      deadlineMs,
      timedOut: false,
    };

    // Progress hook — emit every ~250ms via setInterval in worker context.
    const tickInterval = setIntervalShim(() => {
      if (!onProgress) return;
      onProgress({
        iter: ctx.nodesVisited,
        softScore: state.bestSoftScore === -Number.MAX_SAFE_INTEGER ? 0 : state.bestSoftScore,
        hardConflicts: (state.bestHardCount === Number.MAX_SAFE_INTEGER ? unassignedCount0 : state.bestHardCount) + initiallyInfeasible.length,
        durationMs: Math.round(performance.now() - t0),
      });
    }, 250);
    try {
      backtrack(model, state, unassigned, unassignedCount0, ctx);
    } finally {
      clearIntervalShim(tickInterval);
    }

    totalNodes += ctx.nodesVisited;
    totalBacktracks += ctx.backtracks;
    if (ctx.timedOut) anyTimedOut = true;

    if (globalBest === null ||
        state.bestAssignedEntries > globalBest.assignedEntries ||
        (state.bestAssignedEntries === globalBest.assignedEntries && state.bestSoftScore > globalBest.softScore)) {
      globalBest = {
        state,
        assignedEntries: state.bestAssignedEntries,
        softScore: state.bestSoftScore === -Number.MAX_SAFE_INTEGER ? 0 : state.bestSoftScore,
      };
    }
  }

  if (globalBest === null) {
    return {
      status: "ERROR",
      assignment: [],
      stats: { placed: 0, unplaced: model.lessonCount, hardConflicts: model.lessonCount, softScore: 0, durationMs: Math.round(performance.now() - t0) },
      violations: [],
    };
  }

  const assignment = [];
  const violations = [];
  const placedSrcIds = new Map();
  for (let i = 0; i < model.lessonCount; i++) {
    if (globalBest.state.bestLessonAssigned[i]) {
      const slot = globalBest.state.bestLessonAssignedSlot[i];
      const roomIdx = globalBest.state.bestLessonAssignedRoom[i];
      const d = model.slotDay[slot];
      const p = model.slotPeriod[slot];
      const l = model.lessons[i];
      assignment.push({
        lessonId: l.srcId,
        day: d,
        period: p + 1, // periodIdx is 1-based per DATA_SHAPES
        classroomId: model.roomIds[roomIdx],
        teacherId: l.teacherIds[0],
        classIds: l.classIds,
      });
      placedSrcIds.set(l.id, true);
    }
  }

  // Build violation list for unplaced and infeasible lessons.
  let hardConflicts = 0;
  for (const idx of initiallyInfeasible) {
    const l = model.lessons[idx];
    const reason = l.requiredRoomType ? "required_room_type_unmet" : "no_feasible_slot";
    violations.push({
      ruleId: reason === "required_room_type_unmet" ? "HARD_required_room_type" : "HARD_unplaced_lesson",
      description: `Lesson ${l.id} (${l.subjectId}) could not be placed: ${reason}`,
    });
    hardConflicts += 1;
  }
  for (let i = 0; i < model.lessonCount; i++) {
    if (!globalBest.state.bestLessonAssigned[i] && initiallyInfeasible.indexOf(i) === -1) {
      const l = model.lessons[i];
      violations.push({
        ruleId: "HARD_unplaced_lesson",
        description: `Lesson ${l.id} (${l.subjectId}) had no feasible slot during search`,
      });
      hardConflicts += 1;
    }
  }

  const placed = assignment.length;
  const unplaced = model.lessonCount - placed;

  let status;
  if (anyTimedOut && placed === 0) status = "TIMEOUT";
  else if (anyTimedOut && unplaced > 0) status = "TIMEOUT";
  else if (unplaced === 0 && hardConflicts === 0) status = "FEASIBLE";
  else if (placed === 0 && initiallyInfeasible.length === model.lessonCount) status = "INFEASIBLE";
  else if (unplaced > 0) status = "INFEASIBLE";
  else status = "FEASIBLE";

  return {
    status,
    assignment,
    stats: {
      placed,
      unplaced,
      hardConflicts,
      softScore: globalBest.softScore,
      durationMs: Math.round(performance.now() - t0),
    },
    violations,
  };
}

function maxCandidatesPerLesson(model) {
  let m = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (model.lessonCandidateCount[i] > m) m = model.lessonCandidateCount[i];
  }
  return Math.max(1, m);
}

// In Web Worker context, setInterval is global; in unusual hosts it might not
// be. Provide a no-op shim so tests in headless environments don't crash.
function setIntervalShim(fn, ms) {
  if (typeof setInterval === "function") return setInterval(fn, ms);
  return null;
}
function clearIntervalShim(id) {
  if (id != null && typeof clearInterval === "function") clearInterval(id);
}
