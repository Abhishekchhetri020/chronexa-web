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

  // Lessons are expanded by periodsPerWeek / periodsPerCard — one solver-
  // lesson per SESSION. A lab-double (isLabDouble = true) consumes 2
  // consecutive periods per session, so a lesson with periodsperweek=2 +
  // periodspercard=2 expands to 1 session (not 2). Without this divide,
  // warm-start places the first session, applySingle marks BOTH periods
  // teacher-busy via the lab-double extension, and the second pseudo-
  // session can't place at the same teacher slot.
  const expanded = [];
  for (const l of school.lessons) {
    const periodsPerCard = l.isLabDouble ? 2 : 1;
    const totalPeriods = l.periodsPerWeek | 0;
    const reps = Math.max(1, Math.round(totalPeriods / periodsPerCard));
    for (let i = 0; i < reps; i++) {
      // Allowed-room set, in priority order:
      //   1. classroomIdsExpanded — user-curated via the Home/Shared/Teacher's/
      //      Subject's checkbox expansion (Top 30 #7). When set, this wins
      //      because it's the explicit user choice.
      //   2. _lessonRoomIds — XML's lesson-level classroomids list (Top 30 #6).
      //   3. preferredRoomId — single-room fallback.
      //   4. empty → no-room (homeroom) sentinel.
      let allowedRoomIds = [];
      if (Array.isArray(l.classroomIdsExpanded) && l.classroomIdsExpanded.length) {
        allowedRoomIds = l.classroomIdsExpanded.slice();
      } else if (Array.isArray(l._lessonRoomIds) && l._lessonRoomIds.length) {
        allowedRoomIds = l._lessonRoomIds.slice();
      } else if (l.preferredRoomId) {
        allowedRoomIds = [l.preferredRoomId];
      }
      expanded.push({
        id: reps === 1 ? l.id : `${l.id}#${i + 1}`,
        srcId: l.id,
        classIds: l.classIds || [],
        teacherIds: l.teacherIds || [],
        groupIds: l.groupIds || [],
        subjectId: l.subjectId,
        requiredRoomType: l.requiredRoomType || null,
        preferredRoomId: l.preferredRoomId || null,
        allowedRoomIds,
        fixedDay: l.fixedDay == null ? null : l.fixedDay | 0,
        fixedPeriod: l.fixedPeriod == null ? null : l.fixedPeriod | 0,
        isLabDouble: !!l.isLabDouble,
      });
    }
  }
  const lessonCount = expanded.length;

  // Groups (per-class subdivisions). Without this, the solver treats every
  // class-shared lesson as a whole-class conflict and refuses to place
  // simultaneous group lessons (e.g. Boys-PE + Girls-Music).
  // Per class: assign each group a bit index 0..31. Cap at 32 groups per
  // class — schools in practice use <16. Group with entireClass=true gets
  // a sentinel that we expand to "all bits set" when computing lesson masks.
  const classGroups = []; // classGroups[c] = [{id, isEntire}, …]
  for (let c = 0; c < classIds.length; c++) classGroups.push([]);
  const groupBitByGroupId = Object.create(null); // groupId → { classIdx, bit, isEntire }
  if (Array.isArray(school.groups)) {
    for (const g of school.groups) {
      const c = classIdx.get(g.classId);
      if (c == null) continue;
      const bucket = classGroups[c];
      if (bucket.length >= 32) continue; // mask is uint32
      const bit = bucket.length;
      bucket.push({ id: g.id, isEntire: !!g.entireClass });
      groupBitByGroupId[g.id] = { classIdx: c, bit, isEntire: !!g.entireClass };
    }
  }
  const classGroupCount = new Int32Array(classIds.length);
  const classFullGroupMask = new Uint32Array(classIds.length);
  for (let c = 0; c < classIds.length; c++) {
    const n = classGroups[c].length;
    classGroupCount[c] = n;
    classFullGroupMask[c] = n >= 32 ? 0xffffffff : ((1 << n) - 1) >>> 0;
    // Classes with no <group> definitions still need a sentinel so the
    // "whole-class" lesson can occupy something. Reserve bit 0 as default.
    if (n === 0) classFullGroupMask[c] = 1;
  }

  // Build flat layouts.
  const lessonClassStart = new Int32Array(lessonCount);
  const lessonClassCount = new Int32Array(lessonCount);
  const lessonTeacherStart = new Int32Array(lessonCount);
  const lessonTeacherCount = new Int32Array(lessonCount);
  const lessonSubject = new Int32Array(lessonCount);
  const lessonLabDouble = new Int32Array(lessonCount);
  const lessonFixedSlot = new Int32Array(lessonCount).fill(-1);

  const lessonClassFlat = [];
  const lessonClassGroupMask = []; // parallel to lessonClassFlat
  const lessonTeacherFlat = [];

  for (let i = 0; i < lessonCount; i++) {
    const l = expanded[i];
    lessonClassStart[i] = lessonClassFlat.length;
    for (const cid of l.classIds) {
      const ix = classIdx.get(cid);
      if (ix == null) throw new Error(`Unknown classId in lesson ${l.id}: ${cid}`);
      lessonClassFlat.push(ix);
      // Group mask for this class entry: OR of bits for the lesson's groupIds
      // that belong to this class. If any of them is "entire class", expand
      // to the full class mask. If the lesson has no groupIds at all (older
      // template school), default to whole-class so it conflicts with everything.
      let mask = 0;
      let sawEntire = false;
      const lgIds = l.groupIds || [];
      for (const gid of lgIds) {
        const bb = groupBitByGroupId[gid];
        if (!bb || bb.classIdx !== ix) continue;
        if (bb.isEntire) { sawEntire = true; break; }
        mask = (mask | (1 << bb.bit)) >>> 0;
      }
      if (sawEntire || mask === 0) mask = classFullGroupMask[ix];
      lessonClassGroupMask.push(mask >>> 0);
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
      const p = (l.fixedPeriod | 0) - 1; // CLASSIC fixedPeriod is 1-based
      if (d >= 0 && d < days && p >= 0 && p < periodsPerDay) {
        lessonFixedSlot[i] = d * periodsPerDay + p;
      }
    }
  }

  // Teacher availability + conditional masks. The UI's time-off matrix
  // has three states (0 available, 1 conditional, 2 blocked) and ships
  // in two on-disk shapes: 2D array (new) and "d_p" string-keyed map
  // (legacy). The solver supports both.
  //   - blocked  → bit cleared in teacherAvailabilityMask
  //   - conditional → bit SET in teacherConditionalMask (still placeable
  //     but soft-penalised at scoring time)
  const teacherAvailabilityMask = new Uint32Array(teacherIds.length * days);
  const teacherConditionalMask  = new Uint32Array(teacherIds.length * days);
  for (let t = 0; t < teacherIds.length; t++) {
    for (let d = 0; d < days; d++) {
      teacherAvailabilityMask[t * days + d] = periodsPerDay === 32
        ? 0xffffffff
        : ((1 << periodsPerDay) - 1) >>> 0;
    }
  }
  function applyTimeOffState(t, d, p, state) {
    if (d < 0 || d >= days || p < 0 || p >= periodsPerDay) return;
    if (state === 2) {
      teacherAvailabilityMask[t * days + d] =
        (teacherAvailabilityMask[t * days + d] & ~(1 << p)) >>> 0;
    } else if (state === 1) {
      teacherConditionalMask[t * days + d] =
        (teacherConditionalMask[t * days + d] | (1 << p)) >>> 0;
    }
  }
  for (let t = 0; t < school.teachers.length; t++) {
    const off = school.teachers[t].timeOff;
    if (!off) continue;
    if (Array.isArray(off)) {
      for (let d = 0; d < off.length; d++) {
        const row = off[d];
        if (!Array.isArray(row)) continue;
        for (let p = 0; p < row.length; p++) applyTimeOffState(t, d, p, row[p] | 0);
      }
    } else if (typeof off === "object") {
      for (const key of Object.keys(off)) {
        const parts = String(key).split("_");
        if (parts.length !== 2) continue;
        const d = parts[0] | 0;
        const p1 = parts[1] | 0;
        const p = (p1 >= 1 && p1 <= periodsPerDay) ? (p1 - 1) : p1;
        const v = off[key];
        let state = 0;
        if (v === "unavailable" || v === "blocked" || v === 2) state = 2;
        else if (v === "conditional" || v === "preferred" || v === 1) state = 1;
        applyTimeOffState(t, d, p, state);
      }
    }
  }

  // Top 30 #17 — globals.constraints Tier-1. School-wide defaults that
  // per-entity sentinels inherit when their own field is null/undefined/"*".
  // 8 supported keys: teacherMaxPerDay, teacherMaxConsecutive,
  // teacherMaxLastPeriod, teacherMaxGapsPerDay, classMaxPerDay,
  // classMaxConsecutive, classMaxGapsPerDay, subjectDailyLimit.
  // Per-entity fields still WIN when set; globals only act as fallback.
  const g = (school.globals && school.globals.constraints) || {};
  function gFallback(perEntity, key) {
    if (perEntity != null && perEntity !== "*" && perEntity !== "i") return perEntity | 0;
    if (g[key] != null && g[key] !== "*" && g[key] !== "i") return g[key] | 0;
    return -1;
  }

  // Teacher misc caps
  const teacherMaxPerDay = new Int32Array(teacherIds.length).fill(-1);
  const teacherMaxConsec = new Int32Array(teacherIds.length).fill(-1);
  for (let t = 0; t < school.teachers.length; t++) {
    const tt = school.teachers[t];
    teacherMaxPerDay[t] = gFallback(tt.maxPerDay, "teacherMaxPerDay");
    teacherMaxConsec[t] = gFallback(tt.maxConsecutivePeriods, "teacherMaxConsecutive");
  }

  // Class day caps default to periodsPerDay (effectively unlimited).
  const classMaxPerDay = new Int32Array(classIds.length).fill(-1);
  const classMaxConsec = new Int32Array(classIds.length).fill(-1);
  for (let c = 0; c < (school.classes || []).length; c++) {
    const cc = school.classes[c];
    classMaxPerDay[c] = gFallback(cc.maxPerDay,           "classMaxPerDay");
    classMaxConsec[c] = gFallback(cc.maxConsecutivePeriods, "classMaxConsecutive");
  }

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

    // Resolve room candidates. Per Swift port semantics (ASCSolver.swift:740),
    // lessons without an explicit room (`preferredRoomId` empty AND no
    // `requiredRoomType`) do NOT consume a room — they implicitly use the
    // class's homeroom. Modelled here with the sentinel roomIdx = -1, which
    // `canPlace` / `applySingle` / `removeSingle` treat as "no room
    // collision check". Without this, 851/951 GD Goenka lessons all fight
    // for the same 9-room pool (378 room-slots ≪ 851 lessons), capping the
    // solver at ~40% placement. With it, the solver matches the Swift
    // baseline of 944+/951.
    // Per Swift port semantics: no preferredRoomId AND no requiredRoomType
    // → implicit no-room (homeroom). With an explicit allowed-room list we
    // can pick any room from it (lets the per-card variation flow through
    // to cold-path search, not just warm-start replay).
    let roomCands;
    const allowed = Array.isArray(l.allowedRoomIds) ? l.allowedRoomIds : null;
    if (allowed && allowed.length) {
      const ids = [];
      for (const rid of allowed) {
        const rx = roomIdx.get(rid);
        if (rx != null && !ids.includes(rx)) ids.push(rx);
      }
      roomCands = ids.length ? ids : [-1];
    } else if (l.preferredRoomId) {
      const rx = roomIdx.get(l.preferredRoomId);
      roomCands = rx == null ? [-1] : [rx];
    } else if (l.requiredRoomType) {
      const bucket = roomTypeBuckets.get(l.requiredRoomType) || [];
      roomCands = bucket.length > 0 ? bucket : [-1];
    } else {
      roomCands = [-1];
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
    w.soft_relation_violation ?? 10,
    w.teacher_consec_heavy_days ?? 10,
    w.sibling_subject_deficit ?? 25,
    w.teacher_conditional_placement ?? 20,
    w.class_teacher_pos_violation ?? 20,
  ]);

  // Sibling-subject deficit target — for each (class, subject), sum of
  // periodsperweek across all lessons that include this class with that
  // subject. The deficit scorer pulls the solver toward placing
  // behind-quota subjects first.
  const classSubjectTarget = new Int32Array(classIds.length * subjectIds.length);
  for (const l of school.lessons) {
    const sIdx = subjectIdx.get(l.subjectId);
    if (sIdx == null) continue;
    const ppw = l.periodsPerWeek | 0;
    if (ppw <= 0) continue;
    for (const cid of (l.classIds || [])) {
      const cIdx = classIdx.get(cid);
      if (cIdx == null) continue;
      classSubjectTarget[cIdx * subjectIds.length + sIdx] += ppw;
    }
  }

  // Top 30 #5 — classTeacherPos enforcement. Each class can specify a 6×9
  // mark grid for "the homeroom teacher should be here" slots. If the cell
  // is marked AND the lesson placed at (class, day, period) doesn't include
  // the class's homeroom teacher, soft-penalise.
  // Shape coming from the dialog: class.constraints.classTeacherPos =
  // [[["001000000", ...×6]]]  (1 term × 1 week × 6 days × 9 periods).
  const classTeacherPosMask = new Uint8Array(classIds.length * days * periodsPerDay);
  const classHomeroomTeacher = new Int32Array(classIds.length).fill(-1);
  for (const c of (school.classes || [])) {
    const cIdx = classIdx.get(c.id);
    if (cIdx == null) continue;
    const hrTid = c._teacherId || c.teacherId;
    if (hrTid) {
      const ti = teacherIdx.get(hrTid);
      if (ti != null) classHomeroomTeacher[cIdx] = ti;
    }
    const wire = c.constraints && c.constraints.classTeacherPos;
    if (!Array.isArray(wire) || !wire[0] || !Array.isArray(wire[0][0])) continue;
    const grid = wire[0][0]; // [day][period-char]
    for (let d = 0; d < grid.length && d < days; d++) {
      const row = grid[d];
      if (typeof row !== "string") continue;
      for (let p = 0; p < row.length && p < periodsPerDay; p++) {
        if (row[p] === "1") classTeacherPosMask[(cIdx * days + d) * periodsPerDay + p] = 1;
      }
    }
  }

  // ─── Card relationships (a.k.a. "constraints") ─────────────────────────
  // Pre-compute relation constraints into per-lesson partner sets that
  // canPlace can check in O(partners) per placement. Each typ has its own
  // semantics (cannot-same-day, cannot-follow, must-same-day, must-be-
  // first-or-last, …) but all of them share the same partner-set scaffold.
  //
  // typ groups handled here (all hard):
  //   n_1  — cannot-same-day        : ≥2 different subjects must NOT share a day
  //   n_0  — cannot-follow          : ≥2 different subjects must NOT be in
  //                                   consecutive periods on the same day
  //   n_8  — must-same-day          : different-subject partners must share day
  //   n_10 — must-same-day (multi)  : same as n_8 but across listed classes
  //   n_16 — must-be-first-or-last  : every matched lesson must occupy P1 or
  //                                   the last period of the day
  //
  // Soft typs (n_4 distribution, n_11 divided-same-day, n_14 same-period,
  // n_17 afternoon, plus the "optimise" weights) hook the soft scorer
  // and are not yet wired here.
  const lessonN1Partners  = new Array(lessonCount);
  const lessonN0Partners  = new Array(lessonCount);
  const lessonSamedayPart = new Array(lessonCount); // n_8 / n_10
  const lessonMustFollowAny = new Array(lessonCount); // n_5: arbitrary order
  const lessonMustFollowBefore = new Array(lessonCount); // n_6: must be at p AND a partner at p+1
  const lessonMustFollowAfter  = new Array(lessonCount); // n_6: must be at p AND a partner at p-1
  const lessonSimultaneous = new Array(lessonCount); // n_12 / n_13
  const lessonN7Partners = new Array(lessonCount);
  for (let i = 0; i < lessonCount; i++) lessonN7Partners[i] = null;
  const lessonMustFirstLast = new Uint8Array(lessonCount);
  // Pre-compute break period indices (0-based) — for n_7 check.
  const breakPeriods = [];
  const bellPeriods = (school.bell && school.bell.periods) || [];
  for (let pi = 0; pi < bellPeriods.length; pi++) {
    if (bellPeriods[pi] && bellPeriods[pi].isTeaching === false) breakPeriods.push(pi);
  }
  for (let i = 0; i < lessonCount; i++) {
    lessonN1Partners[i]  = null;
    lessonN0Partners[i]  = null;
    lessonSamedayPart[i] = null;
    lessonMustFollowAny[i] = null;
    lessonMustFollowBefore[i] = null;
    lessonMustFollowAfter[i] = null;
    lessonSimultaneous[i] = null;
  }
  function gatherMatched(rel) {
    const subjSet = new Set(rel.subjectids || []);
    const classSet = new Set(rel.classids || []);
    const out = [];
    for (let i = 0; i < lessonCount; i++) {
      const l = expanded[i];
      if (subjSet.size && !subjSet.has(l.subjectId)) continue;
      if (classSet.size && !(l.classIds || []).some(cid => classSet.has(cid))) continue;
      out.push(i);
    }
    return out;
  }
  function pairCrossSubject(matched, sinkArr) {
    for (let a = 0; a < matched.length; a++) {
      for (let b = a + 1; b < matched.length; b++) {
        const la = expanded[matched[a]];
        const lb = expanded[matched[b]];
        if (la.subjectId === lb.subjectId) continue;
        (sinkArr[matched[a]] = sinkArr[matched[a]] || new Set()).add(matched[b]);
        (sinkArr[matched[b]] = sinkArr[matched[b]] || new Set()).add(matched[a]);
      }
    }
  }
  const rels = Array.isArray(school.relations) ? school.relations : [];
  for (const rel of rels) {
    if (!rel || rel.disabled) continue;
    const matched = gatherMatched(rel);
    if (matched.length < (rel.typ === "n_16" ? 1 : 2)) continue;
    switch (rel.typ) {
      case "n_1":
        pairCrossSubject(matched, lessonN1Partners);
        break;
      case "n_0":
        pairCrossSubject(matched, lessonN0Partners);
        break;
      case "n_8":
      case "n_10":
        pairCrossSubject(matched, lessonSamedayPart);
        break;
      case "n_5":
        pairCrossSubject(matched, lessonMustFollowAny);
        break;
      case "n_6": {
        // Ordered must-follow: every lesson of subjects[0] must be followed
        // by a lesson of subjects[1] in the next period of the same day.
        const ids = rel.subjectids || [];
        if (ids.length < 2) break;
        const firstSubj = ids[0], secondSubj = ids[1];
        for (const i of matched) {
          const l = expanded[i];
          if (l.subjectId === firstSubj) {
            // any lesson of secondSubj in the same scope is the partner
            for (const j of matched) {
              if (j === i) continue;
              if (expanded[j].subjectId !== secondSubj) continue;
              (lessonMustFollowBefore[i] = lessonMustFollowBefore[i] || new Set()).add(j);
              (lessonMustFollowAfter[j]  = lessonMustFollowAfter[j]  || new Set()).add(i);
            }
          }
        }
        break;
      }
      case "n_12":
      case "n_13":
        // Same-period requirement across same-subject lessons in different classes
        for (let a = 0; a < matched.length; a++) {
          for (let b = a + 1; b < matched.length; b++) {
            (lessonSimultaneous[matched[a]] = lessonSimultaneous[matched[a]] || new Set()).add(matched[b]);
            (lessonSimultaneous[matched[b]] = lessonSimultaneous[matched[b]] || new Set()).add(matched[a]);
          }
        }
        break;
      case "n_16":
        for (const i of matched) lessonMustFirstLast[i] = 1;
        break;
      case "n_7":
        // Break-cannot-be-between: matched lessons cannot have a break period
        // strictly between two of them on the same day.
        pairCrossSubject(matched, lessonN7Partners);
        break;
      // n_6 (ordered must-follow) and soft typs n_4/n_11/n_14/n_17
      // queued for a follow-up.
    }
  }

  // Soft relations — n_4/n_11/n_14/n_17 add a small per-violation penalty
  // to softScore() so the search prefers configurations that satisfy them.
  // Hard rels reject placements in canPlace; soft rels only bias scoring,
  // so an otherwise-equivalent placement that lights one of these up costs
  // a little more. Indexed by source lesson because the legacy semantics
  // (cards-per-source-lesson distribution / divided-same-day / same-period)
  // operate on the un-expanded view of a lesson.
  const softRels = [];
  for (const rel of rels) {
    if (!rel || rel.disabled) continue;
    const typ = rel.typ;
    if (typ !== "n_4" && typ !== "n_11" && typ !== "n_14" && typ !== "n_17") continue;
    const matched = gatherMatched(rel);
    if (!matched.length) continue;
    // Group expanded-lesson indices by source lesson id so the per-source
    // semantics (n_4/n_11/n_14) can compute days/periods over each source's
    // cards. n_17 ignores the grouping and treats each placement individually.
    const bySrc = new Map();
    for (const i of matched) {
      const sid = expanded[i].srcId;
      let g = bySrc.get(sid);
      if (!g) { g = []; bySrc.set(sid, g); }
      g.push(i);
    }
    const groups = [];
    for (const [, indices] of bySrc) groups.push(Int32Array.from(indices));
    softRels.push({ typ, groups, flatIndices: Int32Array.from(matched) });
  }

  return {
    days, periodsPerDay, totalSlots,
    lessonCount, teacherCount: teacherIds.length, classCount: classIds.length,
    roomCount: roomIds.length, subjectCount: subjectIds.length,
    teacherIds, classIds, roomIds, subjectIds,
    lessons: expanded,
    lessonClassStart, lessonClassCount, lessonClassFlat: Int32Array.from(lessonClassFlat),
    lessonClassGroupMask: Uint32Array.from(lessonClassGroupMask),
    classGroupCount, classFullGroupMask,
    lessonTeacherStart, lessonTeacherCount, lessonTeacherFlat: Int32Array.from(lessonTeacherFlat),
    lessonSubject, lessonLabDouble, lessonFixedSlot,
    lessonCandidateStart, lessonCandidateCount,
    candidateSlot: candidateSlotArr, candidateRoom: candidateRoomArr,
    teacherAvailabilityMask, teacherConditionalMask, teacherMaxPerDay, teacherMaxConsec,
    classMaxPerDay, classMaxConsec,
    subjectDailyLimit,
    classSubjectTarget,
    classTeacherPosMask,
    classHomeroomTeacher,
    lessonAdjacencyDegree,
    slotDay, slotPeriod, periodPref,
    weights,
    teacherLastPeriodCap: new Int32Array(teacherIds.length).fill(-1),
    lessonN1Partners,
    lessonN0Partners,
    lessonSamedayPart,
    lessonMustFollowAny,
    lessonMustFollowBefore,
    lessonMustFollowAfter,
    lessonSimultaneous,
    lessonN7Partners,
    breakPeriods,
    lessonMustFirstLast,
    softRels,
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
  const { days, totalSlots, teacherCount, classCount, roomCount, lessonCount, subjectCount, periodsPerDay } = model;
  return {
    // Bitmask occupancy: one uint32 per (entity, day). Bit p set iff busy.
    teacherOcc: new Uint32Array(teacherCount * days),
    classOcc: new Uint32Array(classCount * days),
    // Per (class, day, period): bitmask of group bits occupied at that slot.
    // Two lessons may co-occupy the same (class, period) iff their group masks
    // don't intersect (e.g. Boys-PE + Girls-Music). Without this every shared
    // class is a conflict, which makes most real-world XML unsolvable.
    classGroupOcc: new Uint32Array(classCount * days * periodsPerDay),
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
    // Inverse occupancy for iterative-repair displacement: which lesson sits
    // at (entity, slot)? -1 = empty. Built lazily by `materializeBestIntoState`
    // and maintained by `applySingle` / `removeSingle` ONLY when present
    // (the backtracking search ignores these to stay on the fast path).
    teacherSlotOccupant: null,
    classSlotOccupant: null,
    roomSlotOccupant: null,
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
    // Group-aware conflict: two lessons sharing a class at the same (day,
    // period) conflict only if their group bitmasks intersect.
    const gMask = model.lessonClassGroupMask[classStart + k];
    const occMask = state.classGroupOcc[(cd) * model.periodsPerDay + p];
    if ((occMask & gMask) !== 0) return FAIL.CLASS_CONFLICT;
    const maxDay = model.classMaxPerDay[c];
    if (maxDay >= 0 && state.classDayLoad[cd] >= maxDay) return FAIL.CLASS_MAX_PER_DAY;
    const subjectKey = ((c * model.subjectCount) + subject) * model.days + d;
    const subjectLimit = model.subjectDailyLimit[subjectKey];
    if (subjectLimit >= 0 && state.classSubjectDayCount[subjectKey] >= subjectLimit) {
      return FAIL.SUBJECT_DAILY_LIMIT;
    }
  }

  if (roomIdx >= 0) {
    const rd = roomIdx * model.days + d;
    if ((state.roomOcc[rd] & bit) !== 0) return FAIL.ROOM_CONFLICT;
  }

  // Card relations — partner-set checks (n_1 cannot-same-day, n_0
  // cannot-follow, n_8/n_10 must-same-day, n_16 must-be-first-or-last).
  const partnersN1 = model.lessonN1Partners && model.lessonN1Partners[lessonIdx];
  if (partnersN1) {
    for (const pIdx of partnersN1) {
      if (state.lessonAssigned && state.lessonAssigned[pIdx]) {
        const ps = state.lessonAssignedSlot[pIdx];
        if (ps >= 0 && model.slotDay[ps] === d) return FAIL.RELATION_SAME_DAY_FORBIDDEN;
      }
    }
  }
  const partnersN0 = model.lessonN0Partners && model.lessonN0Partners[lessonIdx];
  if (partnersN0) {
    for (const pIdx of partnersN0) {
      if (state.lessonAssigned && state.lessonAssigned[pIdx]) {
        const ps = state.lessonAssignedSlot[pIdx];
        if (ps >= 0 && model.slotDay[ps] === d && Math.abs(model.slotPeriod[ps] - p) === 1) {
          return FAIL.RELATION_CANNOT_FOLLOW;
        }
      }
    }
  }
  const partnersSD = model.lessonSamedayPart && model.lessonSamedayPart[lessonIdx];
  if (partnersSD) {
    // Must-same-day: if any partner is already placed on a DIFFERENT day,
    // this placement violates the relation.
    for (const pIdx of partnersSD) {
      if (state.lessonAssigned && state.lessonAssigned[pIdx]) {
        const ps = state.lessonAssignedSlot[pIdx];
        if (ps >= 0 && model.slotDay[ps] !== d) return FAIL.RELATION_MUST_SAME_DAY;
      }
    }
  }
  if (model.lessonMustFirstLast && model.lessonMustFirstLast[lessonIdx]) {
    // n_16: must be first (period index 0) or last (periodsPerDay - 1)
    if (p !== 0 && p !== model.periodsPerDay - 1) {
      return FAIL.RELATION_FIRST_OR_LAST;
    }
  }
  const partnersFollow = model.lessonMustFollowAny && model.lessonMustFollowAny[lessonIdx];
  if (partnersFollow) {
    // n_5: any placed partner must be at the same day, exactly one period away.
    for (const pIdx of partnersFollow) {
      if (state.lessonAssigned && state.lessonAssigned[pIdx]) {
        const ps = state.lessonAssignedSlot[pIdx];
        if (ps < 0) continue;
        const pd = model.slotDay[ps], pp = model.slotPeriod[ps];
        if (pd !== d || Math.abs(pp - p) !== 1) return FAIL.RELATION_MUST_FOLLOW;
      }
    }
  }
  const partnersSim = model.lessonSimultaneous && model.lessonSimultaneous[lessonIdx];
  if (partnersSim) {
    // n_12 / n_13: if a partner is already placed on the same day, periods must match.
    for (const pIdx of partnersSim) {
      if (state.lessonAssigned && state.lessonAssigned[pIdx]) {
        const ps = state.lessonAssignedSlot[pIdx];
        if (ps < 0) continue;
        if (model.slotDay[ps] === d && model.slotPeriod[ps] !== p) {
          return FAIL.RELATION_SIMULTANEOUS;
        }
      }
    }
  }
  // n_7: a break period must not sit strictly between this lesson and any
  // already-placed partner on the same day.
  const partnersN7 = model.lessonN7Partners && model.lessonN7Partners[lessonIdx];
  if (partnersN7 && model.breakPeriods && model.breakPeriods.length) {
    for (const pIdx of partnersN7) {
      if (state.lessonAssigned && state.lessonAssigned[pIdx]) {
        const ps = state.lessonAssignedSlot[pIdx];
        if (ps < 0) continue;
        if (model.slotDay[ps] !== d) continue;
        const pp = model.slotPeriod[ps];
        const lo = Math.min(p, pp), hi = Math.max(p, pp);
        for (const bp of model.breakPeriods) {
          if (bp > lo && bp < hi) return FAIL.RELATION_BREAK_BETWEEN;
        }
      }
    }
  }
  // n_6 ordered must-follow — "before" partners must occupy (d, p+1), "after" must occupy (d, p-1)
  const fBefore = model.lessonMustFollowBefore && model.lessonMustFollowBefore[lessonIdx];
  if (fBefore) {
    for (const pIdx of fBefore) {
      if (state.lessonAssigned && state.lessonAssigned[pIdx]) {
        const ps = state.lessonAssignedSlot[pIdx];
        if (ps < 0) continue;
        if (!(model.slotDay[ps] === d && model.slotPeriod[ps] === p + 1)) {
          return FAIL.RELATION_MUST_FOLLOW;
        }
      }
    }
  }
  const fAfter = model.lessonMustFollowAfter && model.lessonMustFollowAfter[lessonIdx];
  if (fAfter) {
    for (const pIdx of fAfter) {
      if (state.lessonAssigned && state.lessonAssigned[pIdx]) {
        const ps = state.lessonAssignedSlot[pIdx];
        if (ps < 0) continue;
        if (!(model.slotDay[ps] === d && model.slotPeriod[ps] === p - 1)) {
          return FAIL.RELATION_MUST_FOLLOW;
        }
      }
    }
  }

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
    const gMask = model.lessonClassGroupMask[classStart + k];
    const occMask = state.classGroupOcc[(cd) * model.periodsPerDay + p];
    if ((occMask & gMask) !== 0) return FAIL.CLASS_CONFLICT;
  }
  if (roomIdx >= 0) {
    const rd = roomIdx * model.days + d;
    if ((state.roomOcc[rd] & bit) !== 0) return FAIL.ROOM_CONFLICT;
  }

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
    // teacher-room stability — only when a real room is assigned.
    if (roomIdx >= 0) {
      const tr = t * model.roomCount + roomIdx;
      if (state.teacherRoomUsage[tr] === 0) {
        state.teacherDistinctRooms[t] += 1;
      }
      state.teacherRoomUsage[tr] += 1;
      refreshTeacherRoom(model, state, t);
    }
    refreshTeacherDay(model, state, t, d);
    if (state.teacherSlotOccupant) {
      state.teacherSlotOccupant[t * model.totalSlots + slot] = lessonIdx;
    }
  }
  const classStart = model.lessonClassStart[lessonIdx];
  const classCount = model.lessonClassCount[lessonIdx];
  const subject = model.lessonSubject[lessonIdx];
  for (let k = 0; k < classCount; k++) {
    const c = model.lessonClassFlat[classStart + k];
    const cd = c * model.days + d;
    state.classOcc[cd] = (state.classOcc[cd] | bit) >>> 0;
    const gMask = model.lessonClassGroupMask[classStart + k];
    state.classGroupOcc[(cd) * model.periodsPerDay + p] =
      (state.classGroupOcc[(cd) * model.periodsPerDay + p] | gMask) >>> 0;
    state.classDayLoad[cd] += 1;
    const subjectKey = ((c * model.subjectCount) + subject) * model.days + d;
    state.classSubjectDayCount[subjectKey] += 1;
    refreshSubjectCell(model, state, c, subject, d);
    refreshClassDay(model, state, c, d);
    if (state.classSlotOccupant) {
      state.classSlotOccupant[c * model.totalSlots + slot] = lessonIdx;
    }
  }
  if (roomIdx >= 0) {
    const rd = roomIdx * model.days + d;
    state.roomOcc[rd] = (state.roomOcc[rd] | bit) >>> 0;
    if (state.roomSlotOccupant) {
      state.roomSlotOccupant[roomIdx * model.totalSlots + slot] = lessonIdx;
    }
  }
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
    if (roomIdx >= 0) {
      const tr = t * model.roomCount + roomIdx;
      state.teacherRoomUsage[tr] -= 1;
      if (state.teacherRoomUsage[tr] === 0) {
        state.teacherDistinctRooms[t] -= 1;
      }
      refreshTeacherRoom(model, state, t);
    }
    refreshTeacherDay(model, state, t, d);
    if (state.teacherSlotOccupant) {
      state.teacherSlotOccupant[t * model.totalSlots + slot] = -1;
    }
  }
  const classStart = model.lessonClassStart[lessonIdx];
  const classCount = model.lessonClassCount[lessonIdx];
  const subject = model.lessonSubject[lessonIdx];
  for (let k = 0; k < classCount; k++) {
    const c = model.lessonClassFlat[classStart + k];
    const cd = c * model.days + d;
    // Clear this lesson's group bits first; only clear the classOcc bit
    // if no other lesson's groups still occupy the slot.
    const gMask = model.lessonClassGroupMask[classStart + k];
    const slotKey = (cd) * model.periodsPerDay + p;
    state.classGroupOcc[slotKey] = (state.classGroupOcc[slotKey] & ~gMask) >>> 0;
    if (state.classGroupOcc[slotKey] === 0) {
      state.classOcc[cd] = (state.classOcc[cd] & ~bit) >>> 0;
    }
    state.classDayLoad[cd] -= 1;
    const subjectKey = ((c * model.subjectCount) + subject) * model.days + d;
    state.classSubjectDayCount[subjectKey] -= 1;
    refreshSubjectCell(model, state, c, subject, d);
    refreshClassDay(model, state, c, d);
    if (state.classSlotOccupant) {
      state.classSlotOccupant[c * model.totalSlots + slot] = -1;
    }
  }
  if (roomIdx >= 0) {
    const rd = roomIdx * model.days + d;
    state.roomOcc[rd] = (state.roomOcc[rd] & ~bit) >>> 0;
    if (state.roomSlotOccupant) {
      state.roomSlotOccupant[roomIdx * model.totalSlots + slot] = -1;
    }
  }
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
  s += softRelationPenalty(model, state) * w[8];
  s += teacherConsecHeavyDaysPenalty(model, state) * w[9];
  s += siblingSubjectDeficitPenalty(model, state) * w[10];
  s += teacherConditionalPlacementPenalty(model, state) * w[11];
  s += classTeacherPosPenalty(model, state) * w[12];
  return s;
}

// Top 30 #5 — classTeacherPos. For each (class, slot) where the mask is
// set, the class's homeroom teacher should be the one teaching. Anyone
// else gets a soft penalty.
function classTeacherPosPenalty(model, state) {
  const mask = model.classTeacherPosMask;
  const hr   = model.classHomeroomTeacher;
  if (!mask || !hr) return 0;
  const days = model.days;
  const ppd  = model.periodsPerDay;
  let penalty = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const slot = state.lessonAssignedSlot[i];
    const d = model.slotDay[slot];
    const p = model.slotPeriod[slot];
    const cStart = model.lessonClassStart[i];
    const cCount = model.lessonClassCount[i];
    for (let k = 0; k < cCount; k++) {
      const c = model.lessonClassFlat[cStart + k];
      if (mask[(c * days + d) * ppd + p] !== 1) continue;
      const homeroom = hr[c];
      if (homeroom < 0) continue;
      // Does the placement include the homeroom teacher?
      let hasHomeroom = false;
      const tStart = model.lessonTeacherStart[i];
      const tCount = model.lessonTeacherCount[i];
      for (let j = 0; j < tCount; j++) {
        if (model.lessonTeacherFlat[tStart + j] === homeroom) { hasHomeroom = true; break; }
      }
      if (!hasHomeroom) penalty++;
    }
  }
  return penalty;
}

// Top 30 #27 — time-off `?` conditional state. UI saves it as 2D
// timeOff[d][p] = 1 (conditional) but the solver historically treated it
// the same as available. Now: placement IS allowed on conditional slots,
// but each such placement is soft-penalised so the solver prefers
// truly-available slots when both work.
function teacherConditionalPlacementPenalty(model, state) {
  const mask = model.teacherConditionalMask;
  if (!mask) return 0;
  const D = model.days;
  let penalty = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const slot = state.lessonAssignedSlot[i];
    const d = model.slotDay[slot];
    const p = model.slotPeriod[slot];
    const tStart = model.lessonTeacherStart[i];
    const tCount = model.lessonTeacherCount[i];
    for (let k = 0; k < tCount; k++) {
      const t = model.lessonTeacherFlat[tStart + k];
      if (((mask[t * D + d] >>> p) & 1) === 1) penalty++;
    }
  }
  return penalty;
}

// CSIntegerCDNeededCards-style scorer: penalise (class, subject) pairs
// that have fewer placements than their weekly target. The penalty pulls
// the solver toward placing behind-quota subjects (e.g. URDU 7-per-week)
// ahead of already-saturated ones. O(classCount × subjectCount × days)
// — small enough to recompute per softScore call on schools up to
// ~50 classes × ~50 subjects × 6 days.
function siblingSubjectDeficitPenalty(model, state) {
  const target = model.classSubjectTarget;
  if (!target) return 0;
  const C = model.classCount;
  const S = model.subjectCount;
  const D = model.days;
  let penalty = 0;
  for (let c = 0; c < C; c++) {
    for (let s = 0; s < S; s++) {
      const tg = target[c * S + s] | 0;
      if (tg <= 0) continue;
      let placed = 0;
      for (let d = 0; d < D; d++) placed += state.classSubjectDayCount[(c * S + s) * D + d] | 0;
      if (placed < tg) penalty += (tg - placed);
    }
  }
  return penalty;
}

// CKritResty-style scorer (ported from the legacy C/Kotlin solver). For
// each teacher, sum the "excess load" of every pair of consecutive days
// where BOTH days are heavy (load > threshold). Penalty grows with how
// far over the threshold each day is. Threshold defaults to half the
// teacher's per-day cap, or 5 if no cap is set. This is a soft pull
// against burning a teacher out by stacking heavy days back-to-back.
function teacherConsecHeavyDaysPenalty(model, state) {
  const T = model.teacherCount;
  const D = model.days;
  if (D < 2 || T === 0) return 0;
  let penalty = 0;
  for (let t = 0; t < T; t++) {
    // Per-teacher threshold: half their max-per-day if set, else 5.
    const cap = model.teacherMaxPerDay ? (model.teacherMaxPerDay[t] | 0) : 0;
    const threshold = cap > 0 ? Math.max(2, Math.floor(cap / 2)) : 5;
    let prevLoad = state.teacherDayLoad[t * D] | 0;
    for (let d = 1; d < D; d++) {
      const curLoad = state.teacherDayLoad[t * D + d] | 0;
      if (prevLoad > threshold && curLoad > threshold) {
        // Excess of both days beyond threshold.
        penalty += (prevLoad - threshold) + (curLoad - threshold);
      }
      prevLoad = curLoad;
    }
  }
  return penalty;
}

function softRelationPenalty(model, state) {
  const rels = model.softRels;
  if (!rels || !rels.length) return 0;
  const slotDay = model.slotDay;
  const slotPeriod = model.slotPeriod;
  const halfPoint = Math.floor(model.periodsPerDay / 2);
  const assigned = state.lessonAssigned;
  const slot = state.lessonAssignedSlot;
  let penalty = 0;
  for (let r = 0; r < rels.length; r++) {
    const rel = rels[r];
    if (rel.typ === "n_17") {
      const idx = rel.flatIndices;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        if (!assigned[i]) continue;
        if (slotPeriod[slot[i]] < halfPoint) penalty += 1;
      }
      continue;
    }
    // n_4 / n_11 / n_14 operate per source lesson (one group per source).
    const groups = rel.groups;
    for (let g = 0; g < groups.length; g++) {
      const indices = groups[g];
      let cardsPlaced = 0;
      const dayBits = new Set();
      const periodBits = new Set();
      for (let k = 0; k < indices.length; k++) {
        const i = indices[k];
        if (!assigned[i]) continue;
        const sl = slot[i];
        dayBits.add(slotDay[sl]);
        periodBits.add(slotPeriod[sl]);
        cardsPlaced++;
      }
      if (cardsPlaced === 0) continue;
      if (rel.typ === "n_4") {
        const target = Math.max(1, Math.ceil(cardsPlaced / 2));
        if (dayBits.size < target) penalty += (target - dayBits.size);
      } else if (rel.typ === "n_11") {
        if (cardsPlaced > 1 && dayBits.size > 1) penalty += (dayBits.size - 1);
      } else if (rel.typ === "n_14") {
        if (periodBits.size > 1) penalty += (periodBits.size - 1);
      }
    }
  }
  return penalty;
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

function maybeEmitProgress(ctx, state, unassignedCount0, initiallyInfeasibleCount, t0) {
  if (!ctx.onProgress) return;
  const now = performance.now();
  const iterDelta = ctx.nodesVisited - ctx.progressLastIter;
  const timeDelta = now - ctx.progressLastMs;
  if (iterDelta < 500 && timeDelta < 500) return;
  ctx.progressLastIter = ctx.nodesVisited;
  ctx.progressLastMs = now;
  try {
    ctx.onProgress({
      iter: ctx.nodesVisited,
      softScore: state.bestSoftScore === -Number.MAX_SAFE_INTEGER ? 0 : state.bestSoftScore,
      hardConflicts: (state.bestHardCount === Number.MAX_SAFE_INTEGER ? unassignedCount0 : state.bestHardCount) + initiallyInfeasibleCount,
      backtracks: ctx.backtracks,
      durationMs: Math.round(now - t0),
    });
  } catch {}
}

function backtrack(model, state, unassigned, unassignedCount, ctx) {
  if (ctx.timedOut) return;
  if (performance.now() >= ctx.deadlineMs) { ctx.timedOut = true; return; }
  ctx.nodesVisited += 1;
  // Emit progress every 500 iterations or every 500ms (whichever first).
  maybeEmitProgress(ctx, state, ctx.unassignedCount0, ctx.initiallyInfeasibleCount, ctx.t0);

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

  // Pick the next lesson via MRV+degree. If the chosen lesson has 0
  // feasible candidates, REMOVE it from the active unassigned set (treat as
  // unplaceable for this branch) and recurse with the smaller set, instead
  // of bailing the whole branch. Without this, a single dense class wall
  // would terminate BT early, leaving hundreds of placeable lessons untouched.
  const selected = selectByMrvDegree(model, state, unassigned, unassignedCount, ctx.branchSeed, ctx.depth);
  if (selected < 0) return;

  const candidates = ctx.candidateScratch;
  let feasibleCount = fillFeasibleCandidates(model, state, selected, candidates);

  if (feasibleCount === 0) {
    // Record current state as best partial then skip this lesson and
    // continue with the remaining ones. This is the key fix vs the prior
    // bail-out-on-first-zero.
    const score = -softScore(model, state);
    const entries = state.assignedLessonCount;
    if (entries > state.bestAssignedEntries ||
        (entries === state.bestAssignedEntries && score > state.bestSoftScore)) {
      state.bestSoftScore = score;
      state.bestAssignedEntries = entries;
      state.bestHardCount = unassignedCount;
      snapshotBest(state);
    }
    // Drop the 0-domain lesson from the active set, recurse, then restore.
    const reducedCount = removeFromUnassigned(unassigned, unassignedCount, selected);
    backtrack(model, state, unassigned, reducedCount, ctx);
    addToUnassigned(unassigned, reducedCount, selected);
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
// Iterative repair — min-conflicts + displacement chain post-processing.
//
// Why this exists: MRV+degree backtracking finds a CONSISTENT partial
// assignment, but on dense schedules (e.g. GD Goenka 951 lessons / 60 teachers
// / 30 sections / 8 periods × 6 days) it walks itself into corners and the
// 4-branch driver can leave 600+ lessons unplaced.
//
// Min-conflicts + displacement runs AFTER backtracking, on the materialised
// "best" assignment. For each unplaced lesson L:
//   1. Try direct feasible placement (any (slot, room) where canPlace == null).
//   2. If none feasible: pick the candidate with the FEWEST blocking lessons,
//      evict them, place L, and re-place each evicted lesson via the same
//      logic (bounded chain depth). Rolls back if the chain leaves more
//      lessons unplaced than it started with.
// ---------------------------------------------------------------------------

const REPAIR_MAX_CHAIN_DEPTH = 6;     // displacement chain length cap
const REPAIR_MAX_SLOTS_PER_LESSON = 512; // candidate cap per unplaced lesson
const REPAIR_NO_IMPROVE_BUDGET = 4;   // outer passes without progress → stop
const REPAIR_MAX_BLOCKERS = 3;        // skip candidate if >this many blockers

/**
 * Rebuild `state` live occupancy + scoring totals from the bestLessonAssigned*
 * snapshot. After `backtrack` returns to `solve()`, the undo stack has fully
 * unwound and `state.teacherOcc/classOcc/roomOcc` are zero — only the best*
 * arrays carry the placements. This helper re-applies them so iterative
 * repair has a live working state.
 */
function materializeBestIntoState(model, state) {
  // Clear live state — bestLessonAssigned is the new ground truth.
  state.teacherOcc.fill(0);
  state.classOcc.fill(0);
  if (state.classGroupOcc) state.classGroupOcc.fill(0);
  state.roomOcc.fill(0);
  state.teacherDayLoad.fill(0);
  state.classDayLoad.fill(0);
  state.classSubjectDayCount.fill(0);
  state.teacherLastPeriodCount.fill(0);
  state.teacherDistinctRooms.fill(0);
  state.teacherRoomUsage.fill(0);
  state.slotLoad.fill(0);
  state.lessonAssigned.fill(0);
  state.lessonAssignedSlot.fill(-1);
  state.lessonAssignedRoom.fill(-1);
  state.assignedLessonCount = 0;
  // Zero per-cell scoring buckets — applySingle() re-derives them.
  state.totalTeacherGap = 0;
  state.totalClassGap = 0;
  state.totalSubjectDistribution = 0;
  state.totalTeacherRoomStability = 0;
  state.totalTeacherConsecutiveOverload = 0;
  state.totalClassConsecutiveOverload = 0;
  state.totalTeacherLastPeriodOverflow = 0;
  state.totalPeriodLoadBalance = 0;
  state.teacherDayGap.fill(0);
  state.classDayGap.fill(0);
  state.teacherDayOverload.fill(0);
  state.classDayOverload.fill(0);
  state.subjectDayOverflow.fill(0);
  state.teacherRoomPenalty.fill(0);
  state.teacherLastOverflow.fill(0);

  // Allocate inverse-occupancy arrays (used by repair to find blockers).
  const ts = model.teacherCount * model.totalSlots;
  const cs = model.classCount * model.totalSlots;
  const rs = model.roomCount * model.totalSlots;
  state.teacherSlotOccupant = new Int32Array(ts).fill(-1);
  state.classSlotOccupant = new Int32Array(cs).fill(-1);
  state.roomSlotOccupant = new Int32Array(rs).fill(-1);

  // Re-apply each placement from the snapshot.
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.bestLessonAssigned[i]) continue;
    const slot = state.bestLessonAssignedSlot[i];
    const roomIdx = state.bestLessonAssignedRoom[i];
    // Note: roomIdx may legitimately be -1 (no-room sentinel) — only skip on
    // unset slot. applySingle/removeSingle handle -1 correctly.
    if (slot < 0) continue;
    applySingle(model, state, i, slot, roomIdx);
    if (model.lessonLabDouble[i] === 1) {
      applySingle(model, state, i, slot + 1, roomIdx);
    }
    state.lessonAssigned[i] = 1;
    state.lessonAssignedSlot[i] = slot;
    state.lessonAssignedRoom[i] = roomIdx;
    state.assignedLessonCount += 1;
  }
  // Period-load total is computed from slotLoad in one sweep.
  refreshPeriodLoad(model, state);
}

/**
 * Walk lesson `lessonIdx`'s candidate list, counting blockers at each
 * (slot, room). Returns the best candidates first (fewest blockers).
 *
 * Each output entry: { candidateIdx, slot, room, blockers: Set<lessonIdx> }
 *  - blockers is empty → directly placeable (canPlace returns null).
 *  - blockers.size === 1 → single-eviction displacement.
 *  - blockers.size >= 2 → chain candidate (more disruptive).
 *
 * Hard-unsatisfiable candidates (fixed-slot mismatch, teacher-unavailable,
 * required-room-type) are dropped — those reasons cannot be repaired by
 * displacement. Returns up to REPAIR_MAX_SLOTS_PER_LESSON entries.
 */
function rankRepairCandidates(model, state, lessonIdx) {
  const start = model.lessonCandidateStart[lessonIdx];
  const count = model.lessonCandidateCount[lessonIdx];
  const out = [];
  for (let i = start; i < start + count; i++) {
    const slot = model.candidateSlot[i];
    const room = model.candidateRoom[i];
    const blockers = listBlockers(model, state, lessonIdx, slot, room);
    if (blockers === null) continue; // hard-infeasible (unavailable / fixed)
    out.push({ slot, room, blockers });
    if (out.length >= REPAIR_MAX_SLOTS_PER_LESSON * 2) break;
  }
  // Sort by blocker count ascending (0 = direct placement first).
  out.sort((a, b) => a.blockers.length - b.blockers.length);
  if (out.length > REPAIR_MAX_SLOTS_PER_LESSON) out.length = REPAIR_MAX_SLOTS_PER_LESSON;
  return out;
}

/**
 * Return a list of currently-placed lessons that block placing
 * (lessonIdx, slot, room). Returns `null` if the placement is hard-infeasible
 * (teacher unavailable, fixed-slot mismatch, lab-double OOB) — such candidates
 * cannot be repaired by displacement, only by giving up on that slot.
 *
 * Duplicates removed via set semantics (a lesson may block on multiple axes).
 */
function listBlockers(model, state, lessonIdx, slot, room) {
  const d = model.slotDay[slot];
  const p = model.slotPeriod[slot];
  // Fixed-slot mismatch / OOB / unavailable are non-repairable.
  const fixed = model.lessonFixedSlot[lessonIdx];
  if (fixed >= 0 && fixed !== slot) return null;
  if (model.lessonLabDouble[lessonIdx] === 1 && p + 1 >= model.periodsPerDay) return null;

  const blockers = [];
  const seen = new Set();

  const teacherStart = model.lessonTeacherStart[lessonIdx];
  const teacherCount = model.lessonTeacherCount[lessonIdx];
  for (let k = 0; k < teacherCount; k++) {
    const t = model.lessonTeacherFlat[teacherStart + k];
    const td = t * model.days + d;
    if ((model.teacherAvailabilityMask[td] & (1 << p)) === 0) return null;
    const occ = state.teacherSlotOccupant[t * model.totalSlots + slot];
    if (occ >= 0 && occ !== lessonIdx && !seen.has(occ)) {
      seen.add(occ); blockers.push(occ);
    }
  }
  const classStart = model.lessonClassStart[lessonIdx];
  const classCount = model.lessonClassCount[lessonIdx];
  for (let k = 0; k < classCount; k++) {
    const c = model.lessonClassFlat[classStart + k];
    const occ = state.classSlotOccupant[c * model.totalSlots + slot];
    if (occ >= 0 && occ !== lessonIdx && !seen.has(occ)) {
      seen.add(occ); blockers.push(occ);
    }
  }
  if (room >= 0) {
    const ro = state.roomSlotOccupant[room * model.totalSlots + slot];
    if (ro >= 0 && ro !== lessonIdx && !seen.has(ro)) {
      seen.add(ro); blockers.push(ro);
    }
  }

  // Lab-double: also count blockers in slot+1 (same teachers, classes, room).
  if (model.lessonLabDouble[lessonIdx] === 1) {
    const slot2 = slot + 1;
    for (let k = 0; k < teacherCount; k++) {
      const t = model.lessonTeacherFlat[teacherStart + k];
      const td = t * model.days + d;
      if ((model.teacherAvailabilityMask[td] & (1 << (p + 1))) === 0) return null;
      const occ = state.teacherSlotOccupant[t * model.totalSlots + slot2];
      if (occ >= 0 && occ !== lessonIdx && !seen.has(occ)) {
        seen.add(occ); blockers.push(occ);
      }
    }
    for (let k = 0; k < classCount; k++) {
      const c = model.lessonClassFlat[classStart + k];
      const occ = state.classSlotOccupant[c * model.totalSlots + slot2];
      if (occ >= 0 && occ !== lessonIdx && !seen.has(occ)) {
        seen.add(occ); blockers.push(occ);
      }
    }
    if (room >= 0) {
      const ro2 = state.roomSlotOccupant[room * model.totalSlots + slot2];
      if (ro2 >= 0 && ro2 !== lessonIdx && !seen.has(ro2)) {
        seen.add(ro2); blockers.push(ro2);
      }
    }
  }
  return blockers;
}

/**
 * Place lessonIdx via direct placement if possible, otherwise via
 * displacement chain. Returns true on success.
 *
 * Algorithm (per spec):
 *   1. Rank candidate (slot, room) by blocker count.
 *   2. First pass: try blocker-count == 0 (direct). If any works, place + return.
 *   3. Second pass: try blocker-count > 0 (displacement). For each candidate:
 *        - Evict the blockers (track in undo).
 *        - Place lessonIdx.
 *        - Recursively try to place each evicted blocker (chainDepth + 1).
 *        - If all blockers re-placed: commit. If any fail: rollback.
 *   4. If nothing works: return false (leave lessonIdx unplaced).
 *
 * Chain-depth cap prevents infinite cycles when a lesson L1 displaces L2
 * which can only fit by displacing L1 again. Beyond REPAIR_MAX_CHAIN_DEPTH,
 * recursive placement falls back to direct-only.
 */
function tryPlaceViaRepair(model, state, lessonIdx, chainDepth, evictedThisChain, deadlineMs) {
  if (performance.now() >= deadlineMs) return false;
  if (state.lessonAssigned[lessonIdx]) return true;

  const candidates = rankRepairCandidates(model, state, lessonIdx);
  if (candidates.length === 0) return false;

  // First pass: directly placeable candidates.
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c.blockers.length !== 0) break; // sorted: zeros come first
    if (canPlace(model, state, lessonIdx, c.slot, c.room) === null) {
      applyPlacement(model, state, lessonIdx, c.slot, c.room, null);
      return true;
    }
  }

  // At the chain-depth cap, only allow direct placement (which we just
  // exhausted). Bail to avoid runaway recursion.
  if (chainDepth >= REPAIR_MAX_CHAIN_DEPTH) return false;

  // Second pass: displacement.
  for (let i = 0; i < candidates.length; i++) {
    if (performance.now() >= deadlineMs) return false;
    const c = candidates[i];
    if (c.blockers.length === 0) continue; // already tried in pass 1
    // Don't allow displacement of lessons that are part of this chain — that
    // would re-introduce the lesson we just evicted.
    let valid = true;
    for (let k = 0; k < c.blockers.length; k++) {
      if (evictedThisChain.has(c.blockers[k])) { valid = false; break; }
    }
    if (!valid) continue;
    // Multi-blocker displacement is more disruptive; cap to keep recursion bounded.
    if (c.blockers.length > REPAIR_MAX_BLOCKERS) continue;

    // Snapshot evicted lessons' (slot, room) so we can restore on rollback.
    // room may be -1 (no-room sentinel) — that's legitimate; only slot < 0
    // means the lesson isn't actually placed.
    const evicted = [];
    for (let k = 0; k < c.blockers.length; k++) {
      const b = c.blockers[k];
      const bs = state.lessonAssignedSlot[b];
      const br = state.lessonAssignedRoom[b];
      if (bs < 0) continue;
      removeSingle(model, state, b, bs, br);
      if (model.lessonLabDouble[b] === 1) {
        removeSingle(model, state, b, bs + 1, br);
      }
      state.lessonAssignedSlot[b] = -1;
      state.lessonAssignedRoom[b] = -1;
      state.lessonAssigned[b] = 0;
      state.assignedLessonCount -= 1;
      evicted.push({ idx: b, slot: bs, room: br });
      evictedThisChain.add(b);
    }

    // Now place lessonIdx (should fit if blockers were the only obstacle).
    if (canPlace(model, state, lessonIdx, c.slot, c.room) !== null) {
      // Should be rare; rollback.
      for (let k = evicted.length - 1; k >= 0; k--) {
        const e = evicted[k];
        applyPlacement(model, state, e.idx, e.slot, e.room, null);
        evictedThisChain.delete(e.idx);
      }
      continue;
    }
    applyPlacement(model, state, lessonIdx, c.slot, c.room, null);

    // Try to re-place each evicted lesson elsewhere via recursion.
    let allRehomed = true;
    for (let k = 0; k < evicted.length; k++) {
      const e = evicted[k];
      if (!tryPlaceViaRepair(model, state, e.idx, chainDepth + 1, evictedThisChain, deadlineMs)) {
        allRehomed = false;
        break;
      }
    }

    if (allRehomed) {
      // Commit: leave evictedThisChain populated for the caller's bookkeeping.
      for (let k = 0; k < evicted.length; k++) evictedThisChain.delete(evicted[k].idx);
      return true;
    }

    // Rollback: undo lessonIdx, undo any re-homes (handled by recursion's own
    // rollback), restore original positions of all evicted.
    if (state.lessonAssigned[lessonIdx]) {
      const ls = state.lessonAssignedSlot[lessonIdx];
      const lr = state.lessonAssignedRoom[lessonIdx];
      removeSingle(model, state, lessonIdx, ls, lr);
      if (model.lessonLabDouble[lessonIdx] === 1) {
        removeSingle(model, state, lessonIdx, ls + 1, lr);
      }
      state.lessonAssignedSlot[lessonIdx] = -1;
      state.lessonAssignedRoom[lessonIdx] = -1;
      state.lessonAssigned[lessonIdx] = 0;
      state.assignedLessonCount -= 1;
    }
    // Un-place any of the previously-evicted lessons that got re-placed
    // (recursive calls may have rehomed some before bailing).
    for (let k = 0; k < evicted.length; k++) {
      const e = evicted[k];
      if (state.lessonAssigned[e.idx]) {
        const ns = state.lessonAssignedSlot[e.idx];
        const nr = state.lessonAssignedRoom[e.idx];
        removeSingle(model, state, e.idx, ns, nr);
        if (model.lessonLabDouble[e.idx] === 1) {
          removeSingle(model, state, e.idx, ns + 1, nr);
        }
        state.lessonAssignedSlot[e.idx] = -1;
        state.lessonAssignedRoom[e.idx] = -1;
        state.lessonAssigned[e.idx] = 0;
        state.assignedLessonCount -= 1;
      }
    }
    // Restore original positions.
    for (let k = 0; k < evicted.length; k++) {
      const e = evicted[k];
      applyPlacement(model, state, e.idx, e.slot, e.room, null);
      evictedThisChain.delete(e.idx);
    }
  }
  return false;
}

/**
 * Outer iterative-repair driver. Materialises the best snapshot into the
 * live state, then loops over unplaced lessons trying repair-placement.
 * On stagnation, evicts K random placed lessons (CLASSIC `improveByRandomRestart`
 * parity) to escape local minima, then resumes.
 *
 * Stops on:
 *   - all lessons placed
 *   - deadline reached
 *   - REPAIR_NO_IMPROVE_BUDGET stagnant passes AND restart budget exhausted
 *
 * Returns the number of additional lessons placed (≥ 0).
 */
function iterativeRepair(model, state, deadlineMs, ctx) {
  if (performance.now() >= deadlineMs) return 0;
  materializeBestIntoState(model, state);

  const before = state.assignedLessonCount;
  let totalGained = 0;
  let noImproveStreak = 0;
  let restartAttempts = 0;
  const MAX_RESTART_ATTEMPTS = 50;
  let rngState = (ctx.seed | 0) ^ 0x9e3779b9;

  // Best-ever snapshot inside the repair phase (so a restart that regresses
  // is rolled back automatically).
  let bestCount = state.assignedLessonCount;
  let bestAssignedSnap = new Uint8Array(state.lessonAssigned);
  let bestSlotSnap = new Int32Array(state.lessonAssignedSlot);
  let bestRoomSnap = new Int32Array(state.lessonAssignedRoom);

  // We'll loop while there's budget.
  while (performance.now() < deadlineMs) {
    // Snapshot the unplaced list at the start of this pass.
    const unplaced = [];
    for (let i = 0; i < model.lessonCount; i++) {
      if (!state.lessonAssigned[i] && model.lessonCandidateCount[i] > 0) {
        unplaced.push(i);
      }
    }
    if (unplaced.length === 0) break;

    // Order: lessons with fewer candidate slots first (hardest to place).
    unplaced.sort((a, b) => model.lessonCandidateCount[a] - model.lessonCandidateCount[b]);

    let passGained = 0;
    for (let i = 0; i < unplaced.length; i++) {
      if (performance.now() >= deadlineMs) break;
      const L = unplaced[i];
      if (state.lessonAssigned[L]) continue;
      const evictedThisChain = new Set([L]);
      if (tryPlaceViaRepair(model, state, L, 0, evictedThisChain, deadlineMs)) {
        passGained += 1;
        totalGained += 1;
        // Emit a progress event so the UI updates.
        if (ctx && ctx.onProgress) {
          try {
            ctx.onProgress({
              iter: (ctx.nodesVisited | 0) + totalGained,
              softScore: 0,
              hardConflicts: unplaced.length - passGained,
              backtracks: ctx.backtracks | 0,
              durationMs: Math.round(performance.now() - ctx.t0),
              phase: "repair",
            });
          } catch {}
        }
      }
    }

    // Track best-ever and decide whether to restart.
    if (state.assignedLessonCount > bestCount) {
      bestCount = state.assignedLessonCount;
      bestAssignedSnap = new Uint8Array(state.lessonAssigned);
      bestSlotSnap = new Int32Array(state.lessonAssignedSlot);
      bestRoomSnap = new Int32Array(state.lessonAssignedRoom);
    }

    if (passGained === 0) {
      noImproveStreak += 1;
      if (noImproveStreak >= REPAIR_NO_IMPROVE_BUDGET) {
        // Try a random-restart eviction to escape this basin.
        if (restartAttempts >= MAX_RESTART_ATTEMPTS) break;
        restartAttempts += 1;
        noImproveStreak = 0;
        // K scales with unplaced count: evict ~10% of unplaced or 8 cards,
        // whichever is larger, capped at 40.
        const K = Math.min(40, Math.max(8, Math.round(unplaced.length * 0.10)));
        rngState = randomEvictPlaced(model, state, K, rngState);
      }
    } else {
      noImproveStreak = 0;
    }
  }

  // Restore the best-ever assignment we found during repair (in case the
  // last restart left us regressed).
  if (state.assignedLessonCount < bestCount) {
    // Clear and re-materialise from snapshot.
    state.bestLessonAssigned = bestAssignedSnap;
    state.bestLessonAssignedSlot = bestSlotSnap;
    state.bestLessonAssignedRoom = bestRoomSnap;
    materializeBestIntoState(model, state);
  }

  // Re-snapshot bestLessonAssigned* from the (now-larger) live state.
  if (state.assignedLessonCount >= state.bestAssignedEntries) {
    state.bestLessonAssigned.set(state.lessonAssigned);
    state.bestLessonAssignedSlot.set(state.lessonAssignedSlot);
    state.bestLessonAssignedRoom.set(state.lessonAssignedRoom);
    state.bestAssignedEntries = state.assignedLessonCount;
    state.bestSoftScore = -softScore(model, state);
    state.bestHardCount = model.lessonCount - state.assignedLessonCount;
  }
  return state.assignedLessonCount - before;
}

/**
 * Large-Neighborhood Search — runs AFTER iterativeRepair settles, with the
 * goal of escaping the local optimum the warm-start lands in.
 *
 * Algorithm:
 *   1. Snapshot current best state (placement + soft score).
 *   2. Loop until deadline:
 *      a. Pick a destroy strategy (random / class-focused / day-focused /
 *         subject-focused).
 *      b. Evict K cards under that strategy. K scales with school size.
 *      c. Run iterativeRepair on the perturbed state.
 *      d. If the result strictly improves on the snapshot (more placements,
 *         or equal placements with better soft score), commit it as the
 *         new best. Otherwise revert from snapshot and try a different
 *         strategy / K.
 *
 * The key difference vs `iterativeRepair`'s internal randomEvictPlaced:
 *   - LNS uses LARGER K (10-30% of placed cards vs 8-40 cards flat)
 *   - LNS uses STRUCTURED destruction (whole-day / whole-class) not just random
 *   - LNS keeps running until the deadline, not just 50 restart attempts
 *   - LNS accepts on (placed > best) OR (placed == best AND soft > best)
 *
 * Returns count of additional lessons placed (could be 0 or negative — caller
 * checks state to see final result).
 */
function largeNeighborhoodSearch(model, state, deadlineMs, ctx) {
  if (performance.now() >= deadlineMs) return 0;
  materializeBestIntoState(model, state);

  const before = state.assignedLessonCount;
  let rngState = (ctx.seed | 0) ^ 0xA8E5F31D;
  const rand = () => {
    rngState = (rngState + 0x6d2b79f5) | 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Snapshot the best-so-far. We restore from this on any non-improvement.
  let bestCount = state.assignedLessonCount;
  let bestSoft  = -softScore(model, state);
  let bestAssigned = new Uint8Array(state.lessonAssigned);
  let bestSlot     = new Int32Array(state.lessonAssignedSlot);
  let bestRoom     = new Int32Array(state.lessonAssignedRoom);

  // Strategies cycle so we don't get stuck on one perturbation pattern.
  const strategies = ["random", "byClass", "byDay", "bySubject"];
  let strategyIdx = 0;
  let iterations = 0;
  let accepted   = 0;
  // K is the number of cards to destroy per LNS round. Start small (1-2%
  // of placed) and ramp up after several rejections, so the search can both
  // exploit (small K) and explore (larger K).
  const baseK = Math.max(5, Math.min(30, Math.round(bestCount * 0.015)));
  let kMul = 1; // grows on stagnation

  // Inner repair ctx — silent (no progress) so we don't spam onProgress.
  const innerCtx = { onProgress: null, nodesVisited: 0, backtracks: 0, t0: ctx.t0, seed: ctx.seed };

  let rejectStreak = 0;
  while (performance.now() < deadlineMs) {
    iterations += 1;
    const strategy = strategies[strategyIdx % strategies.length];
    strategyIdx += 1;
    let K = Math.max(5, Math.min(60, baseK * kMul));

    // Destroy step.
    if (strategy === "random") {
      rngState = randomEvictPlaced(model, state, K, rngState);
    } else if (strategy === "byClass") {
      rngState = evictByClass(model, state, K, rngState, rand);
    } else if (strategy === "byDay") {
      rngState = evictByDay(model, state, K, rngState, rand);
    } else if (strategy === "bySubject") {
      rngState = evictBySubject(model, state, K, rngState, rand);
    }

    // CRUCIAL: sync the best snapshot to the perturbed live state.
    // iterativeRepair's first action is materializeBestIntoState, which
    // restores from state.bestLessonAssigned*. Without this sync, repair
    // would undo our destruction immediately.
    state.bestLessonAssigned.set(state.lessonAssigned);
    state.bestLessonAssignedSlot.set(state.lessonAssignedSlot);
    state.bestLessonAssignedRoom.set(state.lessonAssignedRoom);
    state.bestAssignedEntries = state.assignedLessonCount;
    state.bestSoftScore = -softScore(model, state);
    state.bestHardCount = model.lessonCount - state.assignedLessonCount;

    // Repair step — give it a slice of the remaining budget.
    const remaining = Math.max(0, deadlineMs - performance.now());
    if (remaining < 100) break;
    const innerDeadline = performance.now() + Math.min(remaining, 1500);
    iterativeRepair(model, state, innerDeadline, innerCtx);

    // Evaluate.
    const newCount = state.assignedLessonCount;
    const newSoft  = -softScore(model, state);
    const improved =
      newCount > bestCount ||
      (newCount === bestCount && newSoft > bestSoft);

    if (improved) {
      accepted += 1;
      rejectStreak = 0;
      kMul = 1;                       // back to exploiting small moves
      bestCount = newCount;
      bestSoft  = newSoft;
      bestAssigned.set(state.lessonAssigned);
      bestSlot.set(state.lessonAssignedSlot);
      bestRoom.set(state.lessonAssignedRoom);
      // Emit a progress event so the UI / harness can see LNS working.
      if (ctx.onProgress) {
        try {
          ctx.onProgress({
            iter: (ctx.nodesVisited | 0) + iterations,
            softScore: bestSoft,
            hardConflicts: model.lessonCount - bestCount,
            backtracks: ctx.backtracks | 0,
            durationMs: Math.round(performance.now() - ctx.t0),
            phase: "lns",
          });
        } catch {}
      }
    } else {
      rejectStreak += 1;
      // Adaptive K: 3 rejects in a row → broaden search; cap at 4×.
      if (rejectStreak >= 3 && kMul < 4) { kMul += 1; rejectStreak = 0; }
      // Revert from snapshot.
      restoreFromSnapshot(model, state, bestAssigned, bestSlot, bestRoom);
    }
  }

  // Final write: ensure state.bestLessonAssigned* reflect the LNS best.
  state.lessonAssigned.set(bestAssigned);
  state.lessonAssignedSlot.set(bestSlot);
  state.lessonAssignedRoom.set(bestRoom);
  state.assignedLessonCount = bestCount;
  state.bestLessonAssigned.set(bestAssigned);
  state.bestLessonAssignedSlot.set(bestSlot);
  state.bestLessonAssignedRoom.set(bestRoom);
  state.bestAssignedEntries = bestCount;
  state.bestSoftScore = bestSoft;
  state.bestHardCount = model.lessonCount - bestCount;
  return bestCount - before;
}

function restoreFromSnapshot(model, state, assignedSnap, slotSnap, roomSnap) {
  // Replay every placement to rebuild the bitmask occupancy + counters.
  // First clear current state by unplacing everything.
  for (let i = 0; i < model.lessonCount; i++) {
    if (state.lessonAssigned[i]) {
      const slot = state.lessonAssignedSlot[i];
      const room = state.lessonAssignedRoom[i];
      if (slot >= 0) {
        removeSingle(model, state, i, slot, room);
        if (model.lessonLabDouble[i] === 1) removeSingle(model, state, i, slot + 1, room);
      }
      state.lessonAssigned[i] = 0;
      state.lessonAssignedSlot[i] = -1;
      state.lessonAssignedRoom[i] = -1;
    }
  }
  state.assignedLessonCount = 0;
  // Re-apply snapshot.
  for (let i = 0; i < model.lessonCount; i++) {
    if (assignedSnap[i]) {
      const slot = slotSnap[i];
      const room = roomSnap[i];
      if (slot >= 0) {
        applySingle(model, state, i, slot, room);
        if (model.lessonLabDouble[i] === 1) applySingle(model, state, i, slot + 1, room);
        state.lessonAssigned[i] = 1;
        state.lessonAssignedSlot[i] = slot;
        state.lessonAssignedRoom[i] = room;
        state.assignedLessonCount += 1;
      }
    }
  }
}

function evictByClass(model, state, K, rngState, rand) {
  // Pick a random class, evict all currently-placed cards belonging to that
  // class. K is the cap so we don't blow out the budget on huge classes.
  const classCount = model.classCount;
  if (classCount === 0) return rngState;
  const targetClass = Math.floor(rand() * classCount);
  let evicted = 0;
  for (let i = 0; i < model.lessonCount && evicted < K; i++) {
    if (!state.lessonAssigned[i]) continue;
    if (model.lessonFixedSlot[i] >= 0) continue;
    const start = model.lessonClassStart[i];
    const count = model.lessonClassCount[i];
    let hit = false;
    for (let k = 0; k < count; k++) {
      if (model.lessonClassFlat[start + k] === targetClass) { hit = true; break; }
    }
    if (!hit) continue;
    const slot = state.lessonAssignedSlot[i];
    const room = state.lessonAssignedRoom[i];
    removeSingle(model, state, i, slot, room);
    if (model.lessonLabDouble[i] === 1) removeSingle(model, state, i, slot + 1, room);
    state.lessonAssigned[i] = 0;
    state.lessonAssignedSlot[i] = -1;
    state.lessonAssignedRoom[i] = -1;
    state.assignedLessonCount -= 1;
    evicted += 1;
  }
  return rngState;
}

function evictByDay(model, state, K, rngState, rand) {
  // Pick a random day, evict all cards on that day up to K cap.
  const days = model.days;
  if (days === 0) return rngState;
  const targetDay = Math.floor(rand() * days);
  const periodsPerDay = model.periodsPerDay;
  let evicted = 0;
  for (let i = 0; i < model.lessonCount && evicted < K; i++) {
    if (!state.lessonAssigned[i]) continue;
    if (model.lessonFixedSlot[i] >= 0) continue;
    const slot = state.lessonAssignedSlot[i];
    if (model.slotDay[slot] !== targetDay) continue;
    const room = state.lessonAssignedRoom[i];
    removeSingle(model, state, i, slot, room);
    if (model.lessonLabDouble[i] === 1) removeSingle(model, state, i, slot + 1, room);
    state.lessonAssigned[i] = 0;
    state.lessonAssignedSlot[i] = -1;
    state.lessonAssignedRoom[i] = -1;
    state.assignedLessonCount -= 1;
    evicted += 1;
  }
  return rngState;
}

function evictBySubject(model, state, K, rngState, rand) {
  const subjectCount = model.subjectCount;
  if (subjectCount === 0) return rngState;
  const targetSubj = Math.floor(rand() * subjectCount);
  let evicted = 0;
  for (let i = 0; i < model.lessonCount && evicted < K; i++) {
    if (!state.lessonAssigned[i]) continue;
    if (model.lessonFixedSlot[i] >= 0) continue;
    if (model.lessonSubject[i] !== targetSubj) continue;
    const slot = state.lessonAssignedSlot[i];
    const room = state.lessonAssignedRoom[i];
    removeSingle(model, state, i, slot, room);
    if (model.lessonLabDouble[i] === 1) removeSingle(model, state, i, slot + 1, room);
    state.lessonAssigned[i] = 0;
    state.lessonAssignedSlot[i] = -1;
    state.lessonAssignedRoom[i] = -1;
    state.assignedLessonCount -= 1;
    evicted += 1;
  }
  return rngState;
}

/**
 * Random-eviction escape: pick K currently-placed lessons at random and
 * evict them. Used by `iterativeRepair` when no-improve streak hits the
 * budget. Returns the new rngState so the caller can persist it.
 *
 * Uses a tiny mulberry32-style PRNG so eviction is deterministic per seed.
 * Lessons that are fixed-slot (Forced placements per the input) are
 * skipped — evicting them only causes them to be re-placed identically.
 */
function randomEvictPlaced(model, state, K, rngState) {
  const placedIdx = [];
  for (let i = 0; i < model.lessonCount; i++) {
    if (state.lessonAssigned[i] && model.lessonFixedSlot[i] < 0) {
      placedIdx.push(i);
    }
  }
  if (placedIdx.length === 0) return rngState;
  // Mulberry32 PRNG.
  function rand() {
    rngState = (rngState + 0x6d2b79f5) | 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const want = Math.min(K, placedIdx.length);
  const seen = new Set();
  let attempts = 0;
  while (seen.size < want && attempts < want * 8) {
    attempts += 1;
    const pick = placedIdx[Math.floor(rand() * placedIdx.length)];
    if (seen.has(pick)) continue;
    seen.add(pick);
    const slot = state.lessonAssignedSlot[pick];
    const room = state.lessonAssignedRoom[pick];
    if (slot < 0) continue; // room may be -1 (no-room) — legitimate.
    removeSingle(model, state, pick, slot, room);
    if (model.lessonLabDouble[pick] === 1) {
      removeSingle(model, state, pick, slot + 1, room);
    }
    state.lessonAssigned[pick] = 0;
    state.lessonAssignedSlot[pick] = -1;
    state.lessonAssignedRoom[pick] = -1;
    state.assignedLessonCount -= 1;
  }
  return rngState;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Solve a SchoolData payload.
 * @param {object} school - SchoolData per DATA_SHAPES.md
 * @param {object} [options] - { timeLimitSec=30, seed=0, onProgress,
 *                               useIterativeRepair=true }
 * @returns {object} SolveResponse per DATA_SHAPES.md
 */
export function solve(school, options = {}) {
  // Top 30 #16 — Improve solver mode. Alias for "warm-start the current
  // schedule + use LNS to search outward for improvements". Locked lessons
  // (fixedDay/fixedPeriod set) stay put through LNS because randomEvictPlaced
  // and the structured eviction strategies all skip lessons with
  // lessonFixedSlot >= 0. Callers can also pass these flags individually.
  if (options.mode === "improve") {
    options = { ...options, warmStart: true, useLNS: true };
  }
  const t0 = performance.now();
  const timeLimitSec = options.timeLimitSec ?? 30;
  const totalDeadlineMs = t0 + timeLimitSec * 1000;
  // Budget split: ~30% backtracking, ~70% repair. The repair phase is what
  // closes the gap from 28% → 80%+ on dense fixtures; backtracking alone is
  // the constructor that gives repair something to work with.
  const useIterativeRepair = options.useIterativeRepair !== false;
  // Scale backtracking budget with school size. Tiny schools converge fast and
  // benefit from repair; large schools (1000+ solver-lessons after expansion)
  // need more initial placement time before repair makes sense, otherwise
  // backtracking ends with most lessons still unassigned and repair can't
  // recover. Empirical: 1338-lesson XML placed only 12% with btShare=0.3.
  let btShare = useIterativeRepair ? 0.30 : 1.0;
  if (useIterativeRepair) {
    // school.lessons.length is the raw count; expanded count comes later.
    const raw = (school.lessons || []).length;
    if (raw >= 400) btShare = 0.60;
    else if (raw >= 200) btShare = 0.45;
  }
  const btDeadlineMs = t0 + timeLimitSec * 1000 * btShare;
  const deadlineMs = btDeadlineMs; // legacy alias used inside the BT branch loop
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

  // Warm-start: when the school has cards already placed (XML import or a
  // previous solver run that the user wants to keep), pre-populate each
  // branch's initial state from those placements. The search then has only
  // to fill gaps and optimise — it doesn't restart from zero, which on
  // dense real-world XML deadlocks at ~92% no matter the seed.
  // Computed once; replayed per-branch.
  const warmStartMoves = [];
  if (options.warmStart && Array.isArray(school.cards) && school.cards.length > 0) {
    const cardsBySrc = Object.create(null);
    for (const c of school.cards) {
      if (!c || !c.lessonId) continue;
      (cardsBySrc[c.lessonId] = cardsBySrc[c.lessonId] || []).push(c);
    }
    for (const sid in cardsBySrc) {
      cardsBySrc[sid].sort((a, b) => (a.day - b.day) || (a.period - b.period));
    }
    const cursor = Object.create(null);
    for (let i = 0; i < model.lessonCount; i++) {
      const l = model.lessons[i];
      const cards = cardsBySrc[l.srcId];
      if (!cards) continue;
      const ci = (cursor[l.srcId] || 0);
      if (ci >= cards.length) continue;
      const card = cards[ci];
      cursor[l.srcId] = ci + 1;
      const day = card.day | 0;
      const period = ((card.period | 0) - 1);
      if (day < 0 || day >= model.days || period < 0 || period >= model.periodsPerDay) continue;
      const slot = day * model.periodsPerDay + period;
      let roomIdx = -1;
      if (card.classroomId) {
        for (let r = 0; r < model.roomIds.length; r++) {
          if (model.roomIds[r] === card.classroomId) { roomIdx = r; break; }
        }
      }
      warmStartMoves.push({ lessonIdx: i, slot, roomIdx });
    }
  }

  // The driver: sequential root-shuffle branches; keep the best.
  // More branches = more diverse initial orderings → better chance of escaping
  // local dead-ends. Scaled with school size; capped by the per-branch
  // time budget downstream (each branch shares the total backtracking budget).
  let branches = 4;
  if (model.lessonCount <= 6) branches = 1;
  else if (model.lessonCount >= 1000) branches = 8;
  else if (model.lessonCount >= 500) branches = 6;
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

    // Replay warm-start moves into this branch's fresh state. Skips moves that
    // violate constraints — those fall through to backtrack as normal.
    let warmStarted = 0;
    if (warmStartMoves.length > 0) {
      for (const m of warmStartMoves) {
        if (state.lessonAssigned[m.lessonIdx]) continue;
        if (canPlace(model, state, m.lessonIdx, m.slot, m.roomIdx) === null) {
          applyPlacement(model, state, m.lessonIdx, m.slot, m.roomIdx, null);
          warmStarted++;
        }
      }
      // Snapshot warm state as initial best so even a 0-iteration branch reports it.
      if (warmStarted > 0) {
        state.bestSoftScore = -softScore(model, state);
        state.bestAssignedEntries = state.assignedLessonCount;
        state.bestHardCount = unassignedCount0 - state.assignedLessonCount;
        snapshotBest(state);
      }
    }

    // Build the unassigned set excluding lessons already warm-started.
    const unassigned = new Int32Array(unassignedCount0);
    let actualUnassigned = 0;
    for (let k = 0; k < unassignedCount0; k++) {
      const lessonIdx = unassigned0[k];
      if (!state.lessonAssigned[lessonIdx]) {
        unassigned[actualUnassigned++] = lessonIdx;
      }
    }
    const ctx = {
      branchSeed: seed + b * 17,
      depth: 0,
      undoStack: [],
      candidateScratch: new Int32Array(maxCandidatesPerLesson(model)),
      nodesVisited: 0,
      backtracks: 0,
      deadlineMs,
      timedOut: false,
      // Progress emission state — inline in the search loop. See backtrack().
      onProgress,
      progressLastIter: 0,
      progressLastMs: performance.now(),
      t0,
      unassignedCount0,
      initiallyInfeasibleCount: initiallyInfeasible.length,
    };

    // Wall-clock safety net: even if the search never reaches a `backtrack`
    // tick within 500ms (huge candidate sets, slow expansions), still emit at
    // ~500ms via setInterval. The inline path is the primary source.
    const tickInterval = setIntervalShim(() => {
      maybeEmitProgress(ctx, state, unassignedCount0, initiallyInfeasible.length, t0);
    }, 500);
    try {
      backtrack(model, state, unassigned, actualUnassigned, ctx);
    } finally {
      clearIntervalShim(tickInterval);
    }
    // Final flush at branch end so callers see the last state.
    if (onProgress) {
      try {
        onProgress({
          iter: ctx.nodesVisited,
          softScore: state.bestSoftScore === -Number.MAX_SAFE_INTEGER ? 0 : state.bestSoftScore,
          hardConflicts: (state.bestHardCount === Number.MAX_SAFE_INTEGER ? unassignedCount0 : state.bestHardCount) + initiallyInfeasible.length,
          backtracks: ctx.backtracks,
          durationMs: Math.round(performance.now() - t0),
        });
      } catch {}
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

  // ────────────────────────────────────────────────────────────────────────
  // Phase 2 — iterative repair (min-conflicts + displacement).
  //
  // After 4 BT branches, the best `state.bestLessonAssigned*` is what we ship.
  // On dense schedules this leaves many lessons unplaced. The repair phase
  // materialises that snapshot, then loops: for each unplaced lesson, try
  // direct placement; failing that, evict 1-2 blockers and try to re-home
  // them. This is what closes the 28% → 80%+ gap on GD Goenka.
  // ────────────────────────────────────────────────────────────────────────
  let repairGained = 0;
  if (useIterativeRepair && performance.now() < totalDeadlineMs) {
    const repairCtx = {
      onProgress,
      nodesVisited: totalNodes,
      backtracks: totalBacktracks,
      t0,
      seed,
    };
    // When LNS is enabled, cap repair at 40% of remaining post-BT so LNS
    // has time. With LNS off (default) give repair the full remainder.
    let repairDeadlineMs = totalDeadlineMs;
    if (options.useLNS === true) {
      const remainingPostBt = Math.max(0, totalDeadlineMs - performance.now());
      repairDeadlineMs = performance.now() + remainingPostBt * 0.4;
    }
    repairGained = iterativeRepair(model, globalBest.state, repairDeadlineMs, repairCtx);
    if (repairGained > 0) {
      globalBest.assignedEntries = globalBest.state.bestAssignedEntries;
      globalBest.softScore = globalBest.state.bestSoftScore === -Number.MAX_SAFE_INTEGER
        ? 0
        : globalBest.state.bestSoftScore;
    }
    // Final flush so the UI sees the repair gain.
    if (onProgress) {
      try {
        onProgress({
          iter: totalNodes + repairGained,
          softScore: globalBest.softScore,
          hardConflicts: model.lessonCount - globalBest.assignedEntries,
          backtracks: totalBacktracks,
          durationMs: Math.round(performance.now() - t0),
          phase: "repair-done",
        });
      } catch {}
    }

    // ──────────────────────────────────────────────────────────────────────
    // Phase 3 — Large-Neighborhood Search (LNS).
    //
    // Repair settles at a local optimum (warm-start on sample-school.xml
    // pins at 916/35/-4950 from t=75ms — `tools/warm_trajectory.mjs`
    // proves it). LNS perturbs with larger, structured destruction
    // (random / by-class / by-day / by-subject) and re-repairs, keeping
    // strictly-improving solutions. This is the path to ACTUALLY beating
    // aSc on this XML — anything else just confirms aSc's placement.
    // ──────────────────────────────────────────────────────────────────────
    if (options.useLNS === true && performance.now() < totalDeadlineMs) {
      const lnsCtx = {
        onProgress, t0, seed,
        nodesVisited: totalNodes + repairGained,
        backtracks: totalBacktracks,
      };
      const lnsGained = largeNeighborhoodSearch(model, globalBest.state, totalDeadlineMs, lnsCtx);
      if (lnsGained !== 0) {
        globalBest.assignedEntries = globalBest.state.bestAssignedEntries;
        globalBest.softScore = globalBest.state.bestSoftScore === -Number.MAX_SAFE_INTEGER
          ? 0
          : globalBest.state.bestSoftScore;
      }
      if (onProgress) {
        try {
          onProgress({
            iter: totalNodes + repairGained + lnsGained,
            softScore: globalBest.softScore,
            hardConflicts: model.lessonCount - globalBest.assignedEntries,
            backtracks: totalBacktracks,
            durationMs: Math.round(performance.now() - t0),
            phase: "lns-done",
          });
        } catch {}
      }
    }
  }
  if (performance.now() >= totalDeadlineMs) anyTimedOut = true;

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
        classroomId: roomIdx >= 0 ? model.roomIds[roomIdx] : null,
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

  // Soft card-relation typs — n_4 (distribution), n_11 (divided-same-day),
  // n_14 (same-period-each-day), n_17 (afternoon). These don't drive
  // placement choice in the solver (that's the soft-scorer's job and
  // requires a deeper refactor), but post-solve we surface every relation
  // that ended up violated so the user can see it in the Verification
  // panel. This satisfies "all 15 typs are at least observed by the
  // solver" and lays the groundwork for a future soft-score hookup.
  if (Array.isArray(school.relations) && school.relations.length) {
    const cardsByLesson = {};
    for (const a of assignment) {
      (cardsByLesson[a.lessonId.replace(/#\d+$/, "")] = cardsByLesson[a.lessonId.replace(/#\d+$/, "")] || [])
        .push({ day: a.day, period: a.period });
    }
    const periodsPerDay = model.periodsPerDay;
    const halfPoint = Math.floor(periodsPerDay / 2);
    for (const rel of school.relations) {
      if (!rel || rel.disabled) continue;
      const subjSet = new Set(rel.subjectids || []);
      const classSet = new Set(rel.classids || []);
      const matched = (school.lessons || []).filter(l =>
        (!subjSet.size || subjSet.has(l.subjectId)) &&
        (!classSet.size || (l.classIds || []).some(cid => classSet.has(cid))));
      if (rel.typ === "n_4") {
        // Distribution: days used should be >= ceil(periodsPerWeek / 2).
        for (const l of matched) {
          const cards = cardsByLesson[l.id] || [];
          if (!cards.length) continue;
          const daysUsed = new Set(cards.map(c => c.day)).size;
          const target = Math.max(1, Math.ceil((l.periodsPerWeek || cards.length) / 2));
          if (daysUsed < target) {
            violations.push({ ruleId: "SOFT_n_4_distribution", description:
              `Lesson ${l.id} concentrated on ${daysUsed} day(s); want at least ${target}.` });
          }
        }
      } else if (rel.typ === "n_11") {
        // Divided-cards-must-be-same-day: all placements for one lesson on one day.
        for (const l of matched) {
          const cards = cardsByLesson[l.id] || [];
          const daysUsed = new Set(cards.map(c => c.day)).size;
          if (cards.length > 1 && daysUsed > 1) {
            violations.push({ ruleId: "SOFT_n_11_divided_same_day", description:
              `Lesson ${l.id} is split across ${daysUsed} days; n_11 wants one day.` });
          }
        }
      } else if (rel.typ === "n_14") {
        // Same-period-each-day for matched lessons.
        for (const l of matched) {
          const cards = cardsByLesson[l.id] || [];
          const periodsUsed = new Set(cards.map(c => c.period));
          if (periodsUsed.size > 1) {
            violations.push({ ruleId: "SOFT_n_14_same_period_each_day", description:
              `Lesson ${l.id} uses ${periodsUsed.size} different periods; n_14 wants one.` });
          }
        }
      } else if (rel.typ === "n_17") {
        // Afternoon: matched lessons should be in bottom half of periods.
        for (const l of matched) {
          const cards = cardsByLesson[l.id] || [];
          for (const c of cards) {
            if (c.period - 1 < halfPoint) {
              violations.push({ ruleId: "SOFT_n_17_afternoon", description:
                `Lesson ${l.id} placed in morning period ${c.period}; n_17 prefers afternoon.` });
              break;
            }
          }
        }
      }
    }
  }

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
