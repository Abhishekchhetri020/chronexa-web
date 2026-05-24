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

  // Per-class bell schedule mask (Top-30 #3). Bit p set iff period index
  // p is a teaching period in the class's bell. Default = school.bell.
  // Classes with bellId pointing at school.bells[] get their bell's
  // period set; classes without a bellId inherit the school default.
  // canPlace() reads classValidPeriodMask[c] and rejects placements
  // outside it (e.g. primary class can't be placed in period 8 if its
  // bell only has 6 periods).
  const _bellsList = Array.isArray(school.bells) ? school.bells : [];
  const _defaultBellPeriods = (school.bell && Array.isArray(school.bell.periods))
    ? school.bell.periods
    : (_bellsList[0] && _bellsList[0].periods) || [];
  function _maskFromPeriods(periods) {
    let m = 0;
    if (!Array.isArray(periods)) return m;
    for (const p of periods) {
      // Period.index is 1-based in the data model; canPlace uses 0-based p.
      const pi = ((p.index | 0) - 1);
      if (pi >= 0 && pi < periodsPerDay) m = (m | (1 << pi)) >>> 0;
    }
    return m;
  }
  const _defaultMask = _maskFromPeriods(_defaultBellPeriods);
  const classValidPeriodMask = new Uint32Array(classIds.length);
  for (let i = 0; i < classIds.length; i++) {
    const cls = school.classes[i];
    let mask = _defaultMask;
    if (cls && cls.bellId) {
      const bell = _bellsList.find(b => b.id === cls.bellId);
      if (bell) mask = _maskFromPeriods(bell.periods);
    }
    // Empty mask would block everything; fall back to default to avoid
    // false-positive infeasibility from misconfigured per-class bell.
    classValidPeriodMask[i] = mask || _defaultMask || ((1 << periodsPerDay) - 1) >>> 0;
  }

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
        // Lesson-level lock (l.fixedDay/fixedPeriod) addresses ONE slot. For a
        // multi-session lesson (reps > 1) we cannot pin every session to that
        // same slot — only one would place; the other reps would be hard-
        // unplaceable. Pin session #0 to honor the anchor; leave the rest
        // free to find feasible slots. Per-session lock data should land via
        // a future cards[].locked path, not by fanning a single lesson lock
        // across every expansion.
        fixedDay:    (i === 0 && l.fixedDay    != null) ? (l.fixedDay    | 0) : null,
        fixedPeriod: (i === 0 && l.fixedPeriod != null) ? (l.fixedPeriod | 0) : null,
        isLabDouble: !!l.isLabDouble,
        tags: Array.isArray(l.tags) ? l.tags.slice() : [],
      });
    }
  }
  const lessonCount = expanded.length;

  // Groups (per-class subdivisions). A real class is partitioned by zero or
  // more DIVISIONS (e.g. gender → Boys/Girls; activity → GroupA/GroupB).
  // Each student belongs to exactly one group per division, so two lessons
  // are compatible at the same slot ONLY if they share a division AND
  // their group bitmasks within that division are disjoint. Cross-division
  // lessons (Boys vs GroupA) share students and MUST conflict.
  //
  // Encoding for lessonClassGroupMask and state.classGroupOcc — packed
  // into one uint32 per (class, slot):
  //   bits  0..15  → divisionTag (0 = default/unspecified division;
  //                  0xFFFF = whole-class sentinel)
  //   bits 16..31  → bit-set of groups WITHIN that division (≤16 bits)
  //
  // canPlace flags a conflict when:
  //   either side is whole-class (divIdx === 0xFFFF), OR
  //   divisions differ (cross-division share students), OR
  //   masks intersect within the same division.
  //
  // 0xFFFF is reserved; real schools use small divisionTag integers.
  const WHOLE_CLASS_DIV = 0xFFFF;
  // For each class, build a per-division ordered list of groups so each
  // group gets a bit index local to its division (not flat across the
  // class). Cap at 16 groups per division (mask fits in 16 bits).
  const classDivisions = []; // classDivisions[c] = Map<divIdx, [{id, isEntire}]>
  for (let c = 0; c < classIds.length; c++) classDivisions.push(new Map());
  const groupBitByGroupId = Object.create(null); // groupId → { classIdx, divIdx, bit, isEntire }
  if (Array.isArray(school.groups)) {
    for (const g of school.groups) {
      const c = classIdx.get(g.classId);
      if (c == null) continue;
      const divIdx = (g.divisionTag | 0); // parser defaults to 0 when missing
      const divs = classDivisions[c];
      let bucket = divs.get(divIdx);
      if (!bucket) { bucket = []; divs.set(divIdx, bucket); }
      if (bucket.length >= 16) continue; // mask uses 16 bits per division
      const bit = bucket.length;
      bucket.push({ id: g.id, isEntire: !!g.entireClass });
      groupBitByGroupId[g.id] = {
        classIdx: c, divIdx, bit, isEntire: !!g.entireClass,
      };
    }
  }
  // Per-division "full mask" — used when a lesson references "entire class"
  // within that division. classDivisionFullMask[c].get(divIdx) → mask.
  const classDivisionFullMask = [];
  const classGroupCount = new Int32Array(classIds.length);
  for (let c = 0; c < classIds.length; c++) {
    const m = new Map();
    let total = 0;
    for (const [divIdx, bucket] of classDivisions[c].entries()) {
      const n = bucket.length;
      total += n;
      m.set(divIdx, n >= 16 ? 0xffff : ((1 << n) - 1) >>> 0);
    }
    classDivisionFullMask.push(m);
    classGroupCount[c] = total;
  }
  // Back-compat sentinel for code outside buildModel that reads
  // classFullGroupMask — keep the array but it's no longer used by the
  // packed pipeline. classGroupCount above still serves the old purpose.
  const classFullGroupMask = new Uint32Array(classIds.length); // unused, kept for export shape

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
      // Build a packed (divIdx << 16 | mask) value per (lesson, class) entry.
      // - All matching groupIds for this class should share one divisionTag
      //   (a class can be split by multiple divisions, but a single lesson
      //   addresses ONE of them). The first matching group wins on the
      //   division choice; same-class groups in other divisions are skipped.
      // - If any group is "entireClass" OR no group matches → whole-class
      //   sentinel (divIdx = 0xFFFF), which conflicts with anything.
      let chosenDiv = -1;
      let mask = 0;
      let sawEntire = false;
      const lgIds = l.groupIds || [];
      for (const gid of lgIds) {
        const bb = groupBitByGroupId[gid];
        if (!bb || bb.classIdx !== ix) continue;
        if (bb.isEntire) { sawEntire = true; break; }
        if (chosenDiv === -1) chosenDiv = bb.divIdx;
        else if (bb.divIdx !== chosenDiv) continue; // ignore cross-division
        mask = (mask | (1 << bb.bit)) >>> 0;
      }
      let packed;
      if (sawEntire || chosenDiv === -1 || mask === 0) {
        // Whole-class — use sentinel divIdx + bit 0 so the packed value is
        // non-zero (state.classGroupOcc tests "occ !== 0" to detect a hit).
        packed = (WHOLE_CLASS_DIV | (1 << 16)) >>> 0;
      } else {
        packed = ((chosenDiv & 0xFFFF) | ((mask & 0xFFFF) << 16)) >>> 0;
      }
      lessonClassGroupMask.push(packed);
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
  const teacherMaxPerDay      = new Int32Array(teacherIds.length).fill(-1);
  const teacherMaxConsec      = new Int32Array(teacherIds.length).fill(-1);
  const teacherMaxLastPeriod  = new Int32Array(teacherIds.length).fill(-1);
  const teacherMaxGapsPerDay  = new Int32Array(teacherIds.length).fill(-1);
  for (let t = 0; t < school.teachers.length; t++) {
    const tt = school.teachers[t];
    teacherMaxPerDay[t]     = gFallback(tt.maxPerDay,             "teacherMaxPerDay");
    teacherMaxConsec[t]     = gFallback(tt.maxConsecutivePeriods, "teacherMaxConsecutive");
    teacherMaxLastPeriod[t] = gFallback(tt.maxLastPeriodOverflow, "teacherMaxLastPeriod");
    teacherMaxGapsPerDay[t] = gFallback(tt.maxGapsPerDay,         "teacherMaxGapsPerDay");
  }

  // Class day caps default to periodsPerDay (effectively unlimited).
  const classMaxPerDay     = new Int32Array(classIds.length).fill(-1);
  const classMaxConsec     = new Int32Array(classIds.length).fill(-1);
  const classMaxGapsPerDay = new Int32Array(classIds.length).fill(-1);
  // Lunch-window bitmask per class — audit §3.8. Bit p set iff period p
  // (0-based) is INSIDE the configured [lunch_periodfrom, lunch_periodto]
  // range. The soft scorer below penalises class teaching during this
  // window so the schedule naturally leaves the lunch break free. "d"
  // (the dialog's default token) → no lunch window enforced.
  const classLunchMask = new Uint32Array(classIds.length);
  // Teaching-window mask per class — audit §3.5 (m_nMaxVyucOd/m_nMaxVyucDo).
  // Bit p set iff period p is INSIDE the allowed teaching window. The
  // soft scorer below penalises class teaching OUTSIDE this window.
  // "*" / null = no window restriction.
  const classTeachingMask = new Uint32Array(classIds.length);
  // Block-window mask per class — audit §3.7 (m_nMinBlokOd/m_nMinBlokDo).
  // Bit p set iff p is INSIDE the configured "must-have-a-block" window.
  // Soft scorer rewards classes that have at least one teaching period
  // INSIDE this window (i.e. the class has a continuous block somewhere
  // in the required range). Empty/* = no constraint.
  const classBlockMask = new Uint32Array(classIds.length);
  // Per-class behavioural toggles — audit §3.6.
  const classDruheHodiny  = new Uint8Array(classIds.length); // m_bDruheHodiny
  const classKoncitNaraz  = new Uint8Array(classIds.length); // m_bKoncitNaraz
  const classManualnyBlok = new Int8Array(classIds.length);  // m_nManualnyBlok 0/1/2
  function parseWindow(lo, hi) {
    if (lo == null || hi == null || lo === "*" || hi === "*") return 0;
    const from = (parseInt(lo, 10) | 0) - 1;
    const to   = (parseInt(hi, 10) | 0) - 1;
    if (Number.isNaN(from) || Number.isNaN(to)) return 0;
    let m = 0;
    const a = Math.max(0, Math.min(from, to));
    const b = Math.min(periodsPerDay - 1, Math.max(from, to));
    for (let p = a; p <= b; p++) m = (m | (1 << p)) >>> 0;
    return m;
  }
  for (let c = 0; c < (school.classes || []).length; c++) {
    const cc = school.classes[c];
    classMaxPerDay[c]     = gFallback(cc.maxPerDay,             "classMaxPerDay");
    classMaxConsec[c]     = gFallback(cc.maxConsecutivePeriods, "classMaxConsecutive");
    classMaxGapsPerDay[c] = gFallback(cc.maxGapsPerDay,         "classMaxGapsPerDay");
    const cons = (school.classes[c] && school.classes[c].constraints) || {};
    classLunchMask[c]    = parseWindow(cons.lunch_periodfrom, cons.lunch_periodto);
    classTeachingMask[c] = parseWindow(cons.m_nMaxVyucOd,     cons.m_nMaxVyucDo);
    classBlockMask[c]    = parseWindow(cons.m_nMinBlokOd,     cons.m_nMinBlokDo);
    classDruheHodiny[c]  = cons.m_bDruheHodiny ? 1 : 0;
    classKoncitNaraz[c]  = cons.m_bKoncitNaraz ? 1 : 0;
    classManualnyBlok[c] = parseInt(cons.m_nManualnyBlok, 10) || 0;
  }


  // FET-port — classroom → building index map for the teacherBuilding-
  // ChangesPenalty soft scorer. school.buildings[] is a list of named
  // buildings; classrooms reference one via classroom.buildingId.
  // Rooms without a building map to -1 (treated as same-as-previous,
  // never a "change").
  const buildings = Array.isArray(school.buildings) ? school.buildings : [];
  const buildingIdxById = Object.create(null);
  for (let b = 0; b < buildings.length; b++) buildingIdxById[buildings[b].id] = b;
  const classroomBuilding = new Int8Array(roomIds.length).fill(-1);
  for (let r = 0; r < roomIds.length; r++) {
    const rm = school.classrooms[r];
    const bid = rm && (rm.buildingId || rm.buildingid);
    if (bid && buildingIdxById[bid] != null) classroomBuilding[r] = buildingIdxById[bid];
  }
  const buildingCount = buildings.length;
  const sset = (school.settings && typeof school.settings.maxBuildingChangesPerDay === "number")
    ? school.settings.maxBuildingChangesPerDay : -1;
  const maxBuildingChangesPerDay = sset | 0;
  // FET-port — "Min gaps between building changes": when a teacher
  // changes buildings mid-day, require at least N free periods between
  // them to walk over. Soft scorer below penalises adjacent changes.
  const minGapsBetweenBuildingChanges =
    ((school.settings && school.settings.minGapsBetweenBuildingChanges) | 0) || 0;
  // FET-port — "Min resting hours for a teacher" (measured in periods).
  const minRestingPeriods =
    ((school.settings && school.settings.minRestingPeriods) | 0) || 0;
  // Tier-B FET — per-classroom allowedTags list. Lessons whose tags
  // don't overlap with the assigned room's allowedTags get a soft penalty.
  const classroomAllowedTags = new Array(roomIds.length);
  for (let r = 0; r < roomIds.length; r++) {
    const rm = school.classrooms[r];
    classroomAllowedTags[r] = Array.isArray(rm && rm.allowedTags) ? rm.allowedTags.slice() : [];
  }
  // Tier-B FET — school mode ("morning-afternoon" or "block-planning")
  // and the afternoon cutoff period.
  const schoolMode = (school.settings && school.settings.mode) || "";
  const afternoonStartsAt = (school.settings && school.settings.afternoonStartsAt != null)
    ? (school.settings.afternoonStartsAt | 0)
    : Math.ceil(periodsPerDay / 2);
  // Tier-B FET — per-teacher "working in hourly interval max days per
  // week". Each entry: { fromPeriod, toPeriod, maxDays }.
  const teacherIntervalMaxDays = new Array(teacherIds.length);
  for (let t = 0; t < teacherIds.length; t++) {
    const tch = school.teachers[t];
    teacherIntervalMaxDays[t] = (tch && tch.intervalMaxDays
      && tch.intervalMaxDays.fromPeriod != null
      && tch.intervalMaxDays.toPeriod != null
      && tch.intervalMaxDays.maxDays != null)
      ? { fromPeriod: tch.intervalMaxDays.fromPeriod | 0,
          toPeriod: tch.intervalMaxDays.toPeriod | 0,
          maxDays: tch.intervalMaxDays.maxDays | 0 }
      : null;
  }
  // Item 7 — supervision criteria (read once for the soft scorer).
  const supervisionCriteria = (school.settings && school.settings.supervisionCriteria) || null;
  // Item 8 — student-elective lesson grouping for solver-side scoring.
  // For each elective subject, build the set of students enrolled in it
  // via school.studentSubjects[], then tag every lesson with that subject
  // as belonging to those students. The softscorer detects per-student
  // double-bookings using these tags.
  const studentList = Array.isArray(school.students) ? school.students : [];
  const studentIdx = Object.create(null);
  for (let si = 0; si < studentList.length; si++) studentIdx[studentList[si].id] = si;
  const studentElectiveSets = studentList.map(() => true); // length only
  const enrollBySubject = Object.create(null);
  for (const e of (school.studentSubjects || [])) {
    if (!e.subjectId || !e.studentId) continue;
    const sidx = studentIdx[e.studentId];
    if (sidx == null) continue;
    (enrollBySubject[e.subjectId] = enrollBySubject[e.subjectId] || []).push(sidx);
  }
  const lessonStudentSets = new Array(lessonCount);
  for (let i = 0; i < lessonCount; i++) {
    const subjId = expanded[i].subjectId;
    const enrolled = enrollBySubject[subjId];
    lessonStudentSets[i] = enrolled && enrolled.length ? enrolled.slice() : null;
  }

  // FET-port — lesson activity tags + per-tag daily caps. Each lesson
  // can carry lesson.tags = ["PE", "LAB", ...]; the school carries
  // school.settings.tagDailyCaps = [{ tag, scope, max }]. Soft penalty
  // when a teacher or class exceeds the cap on any given day.
  const lessonTags = new Array(lessonCount);
  for (let i = 0; i < lessonCount; i++) lessonTags[i] = expanded[i].tags || [];
  const tagDailyCaps = Array.isArray(school.settings && school.settings.tagDailyCaps)
    ? school.settings.tagDailyCaps.slice() : [];

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
      // If the school has NO rooms of the required type, the lesson is
      // hard-infeasible — do NOT fall back to [-1] (no-room), which
      // silently bypasses the room-type constraint and lets e.g. a lab
      // lesson place anywhere. Empty roomCands → no feasible candidates
      // → surfaces as HARD_required_room_type via initiallyInfeasible.
      roomCands = bucket;
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
  // Default to 2 so the generator cannot stack a whole week's subject load
  // into one day. Imported schools can still override this globally, and
  // "*" / "i" preserve the legacy unlimited behaviour for special cases.
  const subjectDailyLimit = new Int32Array(classIds.length * subjectIds.length * days).fill(-1);
  // globals.constraints.subjectDailyLimit acts as the school-wide default
  // for any (class, subject, day) not overridden by a per-class-subject value.
  const globalSDL = g.subjectDailyLimit == null ? 2 : gFallback(undefined, "subjectDailyLimit");
  if (globalSDL > 0) {
    for (let i = 0; i < subjectDailyLimit.length; i++) {
      if (subjectDailyLimit[i] < 0) subjectDailyLimit[i] = globalSDL;
    }
  }

  // Soft weights — start from defaults, then apply per-school overrides
  // from school.settings.solverParams (Tier-A port: the Parameters
  // dialog's sliders now actually reach the solver). Sliders are 0..100;
  // 50 = baseline (no change), 0 = effectively off, 100 = double weight.
  const w = Object.assign({}, DEFAULT_SOFT_WEIGHTS);
  const sp = (school.settings && school.settings.solverParams) || {};
  function scale(slider) { return slider == null ? 1 : (slider / 50); }
  w.teacher_gaps = Math.round((w.teacher_gaps || 1) * scale(sp.teacherGapWeight));
  w.class_gaps   = Math.round((w.class_gaps   || 1) * scale(sp.classGapWeight));
  w.subject_distribution      = Math.round((w.subject_distribution      || 1) * scale(sp.distributionWeight));
  w.teacher_room_stability    = Math.round((w.teacher_room_stability    || 1) * scale(sp.roomStabilityWeight));
  w.teacher_consecutive_overload = Math.round((w.teacher_consecutive_overload || 1) * scale(sp.consecutiveOverloadWeight));
  w.teacher_last_period_overflow = Math.round((w.teacher_last_period_overflow || 1) * scale(sp.lastPeriodOverflowWeight));
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
    // Two-subject relations (e.g. n_5 must-follow, n_8 must-same-day,
    // n_1 cannot-same-day) store the B-side subjects in `subject2ids`.
    // Without this union, B-side subjects were invisible to the solver
    // even when the UI saved them — relations silently became one-sided.
    const subjSet = new Set([
      ...(rel.subjectids  || []),
      ...(rel.subject2ids || []),
    ]);
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
        // Ordered must-follow: every lesson of subjectA must be followed
        // by a lesson of subjectB in the next period of the same day.
        // The UI stores A-side in rel.subjectids and B-side in
        // rel.subject2ids (NEEDS_SUBJECT2 set in relations.js:74). Older
        // saved relations may have both subjects in rel.subjectids[0..1]
        // — accept either shape.
        const firstSubj  = (rel.subjectids  || [])[0];
        const secondSubj = (rel.subject2ids || [])[0] || (rel.subjectids || [])[1];
        if (!firstSubj || !secondSubj) break;
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
    classValidPeriodMask,
    classLunchMask,
    classTeachingMask,
    classBlockMask,
    classDruheHodiny,
    classKoncitNaraz,
    classManualnyBlok,
    classroomBuilding, buildingCount,
    maxBuildingChangesPerDay,
    minGapsBetweenBuildingChanges,
    minRestingPeriods,
    lessonTags, tagDailyCaps,
    classroomAllowedTags,
    schoolMode, afternoonStartsAt,
    teacherIntervalMaxDays,
    supervisionCriteria,
    studentElectiveSets, lessonStudentSets,
    subjectDailyLimit,
    classSubjectTarget,
    classTeacherPosMask,
    classHomeroomTeacher,
    lessonAdjacencyDegree,
    slotDay, slotPeriod, periodPref,
    weights,
    teacherLastPeriodCap: teacherMaxLastPeriod,
    teacherMaxGapsPerDay,
    classMaxGapsPerDay,
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
  // Return the largest 1-based bell index (capped at 32 for the bitmask),
  // not the count of teaching periods. Counting compresses the grid: a
  // school with periods [1, 2, BREAK(3), 4, 5] (4 teaching periods) used
  // to return 4, but card.period for the last slot is 5 — `card.period -
  // 1 = 4` would fall outside the compressed 0..3 grid and get silently
  // dropped (or land on a break slot). Returning maxIndex (5) keeps the
  // grid aligned with bell.period.index; break periods are still gated
  // out via classValidPeriodMask, so the solver won't place lessons in
  // them.
  const periods = school.bell?.periods || [];
  let max = 0;
  for (const p of periods) {
    const i = (p && p.index | 0) || 0;
    if (i > max) max = i;
  }
  if (max <= 0) return 8;
  return Math.min(32, max);
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
  // WASM cutover was never finished — the dispatched _wx.canPlace ran
  // against NULL-pointer arrays and its return value was discarded. Cost
  // when WASM was loaded: one dead call per canPlace, on the hot path.
  // Removed; re-introduce with a real bindArrays() + result-as-truth path.
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
    // Per-class bell schedule (Top-30 #3). Reject placements at periods
    // outside this class's bell — e.g. a primary class whose bell only
    // defines 6 periods can't take a card at period 8. Mask is built in
    // buildModel; classes without a per-class bellId inherit the school
    // default so legacy data keeps working.
    if (model.classValidPeriodMask &&
        (model.classValidPeriodMask[c] & bit) === 0) {
      return FAIL.CLASS_BELL_PERIOD_INVALID;
    }
    // Group-aware conflict using packed (divIdx | mask<<16). Two lessons
    // sharing a class+slot conflict when either is whole-class, divisions
    // differ (cross-division share students), or masks intersect within
    // the same division.
    const lessonPacked = model.lessonClassGroupMask[classStart + k];
    const occPacked = state.classGroupOcc[(cd) * model.periodsPerDay + p];
    if (occPacked !== 0) {
      const lessonDiv = lessonPacked & 0xFFFF;
      const occDiv = occPacked & 0xFFFF;
      if (lessonDiv === 0xFFFF || occDiv === 0xFFFF || lessonDiv !== occDiv) {
        return FAIL.CLASS_CONFLICT;
      }
      if (((lessonPacked >>> 16) & (occPacked >>> 16)) !== 0) return FAIL.CLASS_CONFLICT;
    }
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
    const maxDay = model.teacherMaxPerDay[t];
    if (maxDay >= 0 && state.teacherDayLoad[td] + 1 >= maxDay) return FAIL.TEACHER_MAX_PER_DAY;
  }
  const classStart = model.lessonClassStart[lessonIdx];
  const classCount = model.lessonClassCount[lessonIdx];
  const subject = model.lessonSubject[lessonIdx];
  for (let k = 0; k < classCount; k++) {
    const c = model.lessonClassFlat[classStart + k];
    const cd = c * model.days + d;
    if (model.classValidPeriodMask &&
        (model.classValidPeriodMask[c] & bit) === 0) {
      return FAIL.CLASS_BELL_PERIOD_INVALID;
    }
    const lessonPacked = model.lessonClassGroupMask[classStart + k];
    const occPacked = state.classGroupOcc[(cd) * model.periodsPerDay + p];
    if (occPacked !== 0) {
      const lessonDiv = lessonPacked & 0xFFFF;
      const occDiv = occPacked & 0xFFFF;
      if (lessonDiv === 0xFFFF || occDiv === 0xFFFF || lessonDiv !== occDiv) return FAIL.CLASS_CONFLICT;
      if (((lessonPacked >>> 16) & (occPacked >>> 16)) !== 0) return FAIL.CLASS_CONFLICT;
    }
    const maxDay = model.classMaxPerDay[c];
    if (maxDay >= 0 && state.classDayLoad[cd] + 1 >= maxDay) return FAIL.CLASS_MAX_PER_DAY;
    const subjectKey = ((c * model.subjectCount) + subject) * model.days + d;
    const subjectLimit = model.subjectDailyLimit[subjectKey];
    if (subjectLimit >= 0 && state.classSubjectDayCount[subjectKey] + 1 >= subjectLimit) {
      return FAIL.SUBJECT_DAILY_LIMIT;
    }
  }
  if (roomIdx >= 0) {
    const rd = roomIdx * model.days + d;
    if ((state.roomOcc[rd] & bit) !== 0) return FAIL.ROOM_CONFLICT;
  }

  // n_0: cannot-follow — check adjacency of the SECOND slot (p) against placed
  // partners. canPlace checks this for the first slot (p-1); partners at p+1
  // (= first-slot p + 2) are only adjacent to the second slot and are missed.
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
  const limit = model.subjectDailyLimit[key];
  const v = c > limit ? c - limit : 0;
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
    // Merge into packed (divIdx | mask<<16). canPlace guarantees same
    // division (or empty); we OR the mask bits in the high half. Any
    // other case (whole-class sentinel already in slot, or divisions
    // disagree) should be unreachable in canPlace-gated flows; we
    // defensively keep classGroupOcc unchanged rather than corrupt the
    // encoding by merging across divisions.
    const lessonPacked = model.lessonClassGroupMask[classStart + k];
    const slotKey = (cd) * model.periodsPerDay + p;
    const occPacked = state.classGroupOcc[slotKey];
    if (occPacked === 0) {
      state.classGroupOcc[slotKey] = lessonPacked;
    } else {
      const occDiv = occPacked & 0xFFFF;
      const lessonDiv = lessonPacked & 0xFFFF;
      if (lessonDiv === occDiv && occDiv !== 0xFFFF && lessonDiv !== 0xFFFF) {
        state.classGroupOcc[slotKey] = (occPacked | (lessonPacked & 0xFFFF0000)) >>> 0;
      }
      // else: division mismatch or whole-class — leave occupancy as-is.
    }
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
  // TEMP-REVERT: incremental totalPeriodLoadBalance update suspended to
  // isolate whether claim-#1 fix is responsible for cold-mode placement
  // regression. Add back once perf-baseline confirmed.
  // state.totalPeriodLoadBalance += model.periodPref[p];
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
    // Clear this lesson's group bits within the packed value. The
    // earlier permissive condition (`|| occDiv === 0xFFFF || lessonDiv
    // === 0xFFFF`) let removeSingle enter the mask-clear branch when
    // divisions DIDN'T match — clearing unrelated bits and sometimes
    // wiping the entire slot, which let the solver re-place lessons on
    // top of existing ones (Gemini analysis_results.md, 2026-05-23).
    // Strict match: only mutate when occupancy and lesson are on the
    // same division. Bug-path callers (rollback / materialize that
    // bypass canPlace) silently no-op rather than corrupt state.
    const lessonPacked = model.lessonClassGroupMask[classStart + k];
    const slotKey = (cd) * model.periodsPerDay + p;
    const occPacked = state.classGroupOcc[slotKey];
    const lessonDiv = lessonPacked & 0xFFFF;
    const occDiv = occPacked & 0xFFFF;
    if (occPacked !== 0 && occDiv === lessonDiv) {
      const lessonMask = lessonPacked >>> 16;
      const occMask = occPacked >>> 16;
      const newMask = occMask & ~lessonMask;
      if (newMask === 0) {
        state.classGroupOcc[slotKey] = 0;
        state.classOcc[cd] = (state.classOcc[cd] & ~bit) >>> 0;
      } else {
        state.classGroupOcc[slotKey] = ((occPacked & 0xFFFF) | (newMask << 16)) >>> 0;
      }
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
  // TEMP-REVERT: see applySingle comment.
  // state.totalPeriodLoadBalance -= model.periodPref[p];
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
  s += classLunchWindowPenalty(model, state) * (w[1] || 1);
  s += classTeachingWindowPenalty(model, state) * (w[1] || 1);
  s += classBlockPreferencePenalty(model, state) * (w[1] || 1);
  s += teacherBuildingChangesPenalty(model, state) * (w[3] || 1);
  s += lessonTagDailyCapPenalty(model, state) * (w[2] || 1);
  s += teacherMinRestingHoursPenalty(model, state) * (w[0] || 1);
  s += subjectTagRoomMismatchPenalty(model, state) * (w[3] || 1);
  s += modeAfternoonHeavyPenalty(model, state) * (w[1] || 1);
  s += modeBlockPairingPenalty(model, state) * (w[1] || 1);
  s += teacherIntervalMaxDaysPenalty(model, state) * (w[0] || 1);
  s += supervisionCriteriaSoftPenalty(model, state) * (w[0] || 1);
  s += studentSubjectsConflictPenalty(model, state) * (w[1] || 1);
  return s;
}

// Item 7 — supervision criteria solver preference scoring. Reads
// model.supervisionCriteria.{avoidLastPeriod, avoidFirstPeriod} and
// soft-penalises ANY assigned teacher placement at those periods (proxy
// for the supervision-slot scheduling cost: the more teaching at avoided
// periods, the worse the supervision-fit). Lightweight — operates on
// existing teacher placements rather than touching the supervision
// scheduling pipeline, but biases the timetable toward leaving the
// teacher's avoided periods free.
function supervisionCriteriaSoftPenalty(model, state) {
  const crit = model.supervisionCriteria;
  if (!crit) return 0;
  const ppd = model.periodsPerDay;
  const last = ppd - 1, first = 0;
  let penalty = 0;
  if (!crit.avoidLastPeriod && !crit.avoidFirstPeriod) return 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const slot = state.lessonAssignedSlot[i];
    const p = model.slotPeriod[slot];
    if (crit.avoidLastPeriod && p === last) penalty += 1;
    if (crit.avoidFirstPeriod && p === first) penalty += 1;
  }
  return penalty;
}

// Item 8 — studentsubjects solver awareness. Walks each enrolled
// student's class lessons + elective subject lessons, counts per-slot
// double-bookings, +1 penalty per conflicting (student, day, period).
// Equivalent to the post-placement studentScheduleConflicts() check but
// embedded in softScore so the solver actively prefers conflict-free
// elective placements during search.
function studentSubjectsConflictPenalty(model, state) {
  const ses = model.studentElectiveSets;
  if (!ses || !ses.length) return 0;
  let penalty = 0;
  // Build occupancy per (studentIdx, day, period) bitmask
  const days = model.days, ppd = model.periodsPerDay;
  const occ = new Uint8Array(ses.length * days * ppd);
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const tags = model.lessonStudentSets ? model.lessonStudentSets[i] : null;
    if (!tags || !tags.length) continue;
    const slot = state.lessonAssignedSlot[i];
    const d = model.slotDay[slot], p = model.slotPeriod[slot];
    for (const sidx of tags) {
      const k = (sidx * days + d) * ppd + p;
      if (occ[k]) penalty += 1;
      else occ[k] = 1;
    }
  }
  return penalty;
}

// Tier-B FET port — Subject + tag → preferred room. When a lesson has
// tags and the assigned classroom's allowedTags don't overlap, soft
// penalty. Lets a school say "LAB-tagged lessons should be in Lab Rooms".
function subjectTagRoomMismatchPenalty(model, state) {
  const allowed = model.classroomAllowedTags;
  const tags = model.lessonTags;
  if (!allowed || !tags) return 0;
  let penalty = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const t = tags[i];
    if (!t || !t.length) continue;
    const r = state.lessonAssignedRoom[i];
    if (r < 0) continue;
    const ra = allowed[r];
    if (!ra || !ra.length) continue;
    const hit = t.some(tag => ra.includes(tag));
    if (!hit) penalty += 1;
  }
  return penalty;
}

// Tier-B FET "Mornings-Afternoons" mode — soft-penalty for heavy
// subjects (tagged HEAVY) placed in the afternoon block. Afternoon =
// period index >= model.afternoonStartsAt (configurable; default
// periodsPerDay/2 round up). Only active when school.settings.mode ===
// "morning-afternoon".
function modeAfternoonHeavyPenalty(model, state) {
  if (model.schoolMode !== "morning-afternoon") return 0;
  const tags = model.lessonTags;
  if (!tags) return 0;
  const cutoff = model.afternoonStartsAt | 0;
  let penalty = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const t = tags[i];
    if (!t || !t.includes("HEAVY")) continue;
    const slot = state.lessonAssignedSlot[i];
    if (model.slotPeriod[slot] >= cutoff) penalty += 2;
  }
  return penalty;
}

// Tier-B FET "Block planning" mode — soft penalty when a lesson's
// period is odd (mid-block) for classes whose periods should come in
// pairs (periods 1+2, 3+4, …). Only active when school.settings.mode
// === "block-planning". Lab-double lessons already span 2 periods so
// they get rewarded by being aligned to even-odd starts.
function modeBlockPairingPenalty(model, state) {
  if (model.schoolMode !== "block-planning") return 0;
  let penalty = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const slot = state.lessonAssignedSlot[i];
    const p = model.slotPeriod[slot];
    // Reward even-period starts (p % 2 === 0); penalty otherwise.
    if (model.lessonLabDouble[i] === 1) {
      if (p % 2 !== 0) penalty += 2;
    } else {
      if (p % 2 !== 0) penalty += 1;
    }
  }
  return penalty;
}

// Tier-B FET — Working in hourly interval max days per week. Each
// teacher carries teacher.intervalMaxDays = { fromPeriod, toPeriod,
// maxDays }. Soft penalty per day the teacher has any teaching slot
// inside [fromPeriod, toPeriod] beyond maxDays.
function teacherIntervalMaxDaysPenalty(model, state) {
  const intervals = model.teacherIntervalMaxDays;
  if (!intervals) return 0;
  const tc = model.teacherCount, days = model.days, ppd = model.periodsPerDay;
  // Track per-teacher-per-day: did this teacher work inside the interval?
  const worked = new Uint8Array(tc * days);
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const slot = state.lessonAssignedSlot[i];
    const d = model.slotDay[slot], p = model.slotPeriod[slot];
    const tStart = model.lessonTeacherStart[i];
    const tCount = model.lessonTeacherCount[i];
    for (let k = 0; k < tCount; k++) {
      const t = model.lessonTeacherFlat[tStart + k];
      const iv = intervals[t];
      if (!iv) continue;
      if (p >= iv.fromPeriod && p <= iv.toPeriod) worked[t * days + d] = 1;
    }
  }
  let penalty = 0;
  for (let t = 0; t < tc; t++) {
    const iv = intervals[t];
    if (!iv) continue;
    let count = 0;
    for (let d = 0; d < days; d++) {
      if (worked[t * days + d]) count++;
    }
    if (count > iv.maxDays) penalty += (count - iv.maxDays) * 3;
  }
  return penalty;
}

// FET port — "Min resting hours for a teacher". Penalises teachers
// whose gap between last-period today and first-period tomorrow falls
// below model.minRestingPeriods (configured via
// school.settings.minRestingPeriods, default 0 = off). Uses period
// indices as a proxy when bell-clock times aren't set:
//   rest_gap = (periodsPerDay - lastPeriodToday) + firstPeriodTomorrow
// Reuses the teacher-gap soft weight (w[0]).
function teacherMinRestingHoursPenalty(model, state) {
  const minRest = model.minRestingPeriods | 0;
  if (minRest <= 0) return 0;
  const tc = model.teacherCount, days = model.days, ppd = model.periodsPerDay;
  let penalty = 0;
  // Track per-teacher-per-day occupancy bitmask
  const occ = new Uint32Array(tc * days);
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const slot = state.lessonAssignedSlot[i];
    const d = model.slotDay[slot], p = model.slotPeriod[slot];
    const tStart = model.lessonTeacherStart[i];
    const tCount = model.lessonTeacherCount[i];
    for (let k = 0; k < tCount; k++) {
      const t = model.lessonTeacherFlat[tStart + k];
      occ[t * days + d] |= (1 << p) >>> 0;
    }
  }
  for (let t = 0; t < tc; t++) {
    for (let d = 0; d < days - 1; d++) {
      const today = occ[t * days + d];
      const next  = occ[t * days + d + 1];
      if (!today || !next) continue;
      // Find last bit of today, first bit of next.
      let last = -1;
      for (let p = ppd - 1; p >= 0; p--) {
        if ((today & ((1 << p) >>> 0)) !== 0) { last = p; break; }
      }
      let first = -1;
      for (let p = 0; p < ppd; p++) {
        if ((next & ((1 << p) >>> 0)) !== 0) { first = p; break; }
      }
      if (last < 0 || first < 0) continue;
      const gap = (ppd - 1 - last) + first;
      if (gap < minRest) penalty += (minRest - gap);
    }
  }
  return penalty;
}

// FET port — "Max building changes per day for a teacher" + "Min gaps
// between building changes for a teacher". Penalty grows linearly with
// the number of building transitions a teacher makes per day. A teacher
// with 5 lessons in building A and 1 in building B has 1 change (still
// painful if A and B are far). school.settings.maxBuildingChangesPerDay
// caps the soft tolerance — changes beyond the cap are penalised heavier.
// Reuses the teacher-room-stability soft weight (w[3]).
function teacherBuildingChangesPenalty(model, state) {
  const roomBuilding = model.classroomBuilding;
  if (!roomBuilding) return 0;
  const cap = model.maxBuildingChangesPerDay; // -1 = unlimited
  let penalty = 0;
  const tc = model.teacherCount, days = model.days, ppd = model.periodsPerDay;
  // Single-pass bucketing — O(L·avgTeachersPerLesson) total to build the
  // teacher × day × period → building table, then O(T·D·P) to count
  // transitions. Previously this function was O(T·D·P·L) (a nested scan
  // over all lessons per cell), which dominated softScore() on the hot
  // backtrack loop for real-sized schools.
  const tdp = tc * days * ppd;
  const grid = new Int8Array(tdp); // 0 = unset, store (bld + 2) so 0 stays sentinel
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const roomIdx = state.lessonAssignedRoom[i];
    if (roomIdx < 0) continue;
    const bld = roomBuilding[roomIdx];
    if (bld < 0 || bld > 124) continue; // Int8 stores (bld+2); cap to keep within range
    const slot = state.lessonAssignedSlot[i];
    const d = model.slotDay[slot];
    const p = model.slotPeriod[slot];
    const tStart = model.lessonTeacherStart[i];
    const tCount = model.lessonTeacherCount[i];
    const enc = bld + 2;
    for (let k = 0; k < tCount; k++) {
      const t = model.lessonTeacherFlat[tStart + k];
      const idx = (t * days + d) * ppd + p;
      // First-write wins — matches the prior `break` after finding any
      // assigned lesson at this teacher/slot.
      if (grid[idx] === 0) grid[idx] = enc;
    }
  }
  const minGaps = model.minGapsBetweenBuildingChanges | 0;
  for (let t = 0; t < tc; t++) {
    for (let d = 0; d < days; d++) {
      let changes = 0, prev = -1, lastChangeAt = -1;
      const base = (t * days + d) * ppd;
      for (let p = 0; p < ppd; p++) {
        const enc = grid[base + p];
        if (enc === 0) continue;
        const b = enc - 2;
        if (prev >= 0 && b !== prev) {
          changes++;
          if (lastChangeAt >= 0 && minGaps > 0) {
            const gap = p - lastChangeAt;
            if (gap < minGaps) penalty += (minGaps - gap) * 2;
          }
          lastChangeAt = p;
        }
        prev = b;
      }
      if (changes > 0) {
        penalty += changes;
        if (cap >= 0 && changes > cap) penalty += (changes - cap) * 3;
      }
    }
  }
  return penalty;
}

// FET port — "An activity tag has max periods per day". Adds support for
// lesson.tags[] (string list) + school.settings.tagDailyCaps[{tag,
// scope: "teacher"|"class", max: N}]. Soft-penalises any teacher (or
// class) that has more than max lessons with that tag in a single day.
// Lets schools express "max 2 PE lessons per class per day" or "max 1
// LAB session per teacher per day" without enumerating every lesson.
function lessonTagDailyCapPenalty(model, state) {
  const caps = model.tagDailyCaps;
  if (!caps || !caps.length) return 0;
  const tags = model.lessonTags;
  if (!tags) return 0;
  let penalty = 0;
  const days = model.days;
  for (const cap of caps) {
    const counts = {}; // "scope_entityIdx_day" → count
    for (let i = 0; i < model.lessonCount; i++) {
      if (!state.lessonAssigned[i]) continue;
      const lt = tags[i];
      if (!lt || !lt.includes(cap.tag)) continue;
      const slot = state.lessonAssignedSlot[i];
      const d = model.slotDay[slot];
      if (cap.scope === "teacher") {
        const tStart = model.lessonTeacherStart[i];
        const tCount = model.lessonTeacherCount[i];
        for (let k = 0; k < tCount; k++) {
          const t = model.lessonTeacherFlat[tStart + k];
          const key = "t_" + t + "_" + d;
          counts[key] = (counts[key] || 0) + 1;
        }
      } else {
        const cStart = model.lessonClassStart[i];
        const cCount = model.lessonClassCount[i];
        for (let k = 0; k < cCount; k++) {
          const c = model.lessonClassFlat[cStart + k];
          const key = "c_" + c + "_" + d;
          counts[key] = (counts[key] || 0) + 1;
        }
      }
    }
    for (const k of Object.keys(counts)) {
      const over = counts[k] - cap.max;
      if (over > 0) penalty += over * (cap.scope === "teacher" ? 2 : 1);
    }
  }
  return penalty;
}

// Audit §3.6 + §3.7 — combined class-block preferences scorer covering
// m_nMinBlokOd/Do (block window), m_bDruheHodiny (prefer second hours),
// m_bKoncitNaraz (end together), m_nManualnyBlok (manual block mode).
// Interpretations:
//   block window (§3.7): if mask !== 0, require the class to have at
//     least one teaching slot inside the window per day — small penalty
//     per day without a block in window.
//   second hours (§3.6): when true, penalise class periods at p===0
//     (period 1) — prefer starting at period 2+.
//   end together (§3.6): when true, count distinct last-period values
//     per day across classes — penalty grows with variance.
//   manual block (§3.4): mode 2 = strict — escalate block-window penalty;
//     mode 1 = preferred; mode 0 = off.
function classBlockPreferencePenalty(model, state) {
  const block  = model.classBlockMask;
  const druhe  = model.classDruheHodiny;
  const koncit = model.classKoncitNaraz;
  const manual = model.classManualnyBlok;
  if (!block && !druhe && !koncit && !manual) return 0;
  let penalty = 0;
  const days = model.days;
  const ppd  = model.periodsPerDay;

  // Track per-class-per-day occupancy bitmask
  const lessons = model.lessonCount;
  const occByCD = new Uint32Array((model.classCount || 0) * days);
  for (let i = 0; i < lessons; i++) {
    if (!state.lessonAssigned[i]) continue;
    const slot = state.lessonAssignedSlot[i];
    const d = model.slotDay[slot];
    const p = model.slotPeriod[slot];
    const cStart = model.lessonClassStart[i];
    const cCount = model.lessonClassCount[i];
    for (let k = 0; k < cCount; k++) {
      const c = model.lessonClassFlat[cStart + k];
      occByCD[c * days + d] |= (1 << p) >>> 0;
      if (druhe && druhe[c] && p === 0) penalty += 1;
    }
  }

  if (block || manual) {
    for (let c = 0; c < model.classCount; c++) {
      const w = block ? block[c] : 0;
      if (!w) continue;
      const escalate = manual && manual[c] === 2 ? 4 : (manual && manual[c] === 1 ? 2 : 1);
      for (let d = 0; d < days; d++) {
        if ((occByCD[c * days + d] & w) === 0) penalty += escalate;
      }
    }
  }
  if (koncit) {
    for (let c = 0; c < model.classCount; c++) {
      if (!koncit[c]) continue;
      const lasts = new Set();
      for (let d = 0; d < days; d++) {
        const m = occByCD[c * days + d];
        if (!m) continue;
        let last = -1;
        for (let p = ppd - 1; p >= 0; p--) {
          if ((m & ((1 << p) >>> 0)) !== 0) { last = p; break; }
        }
        if (last >= 0) lasts.add(last);
      }
      if (lasts.size > 1) penalty += (lasts.size - 1) * 2;
    }
  }
  return penalty;
}

// Audit §3.8 — lunch_periodfrom/to. Soft-penalise placements that fall
// inside the class's lunch window so the schedule prefers leaving those
// periods free for lunch. Reuses the class-gap soft weight (w[1]).
function classLunchWindowPenalty(model, state) {
  const lunch = model.classLunchMask;
  if (!lunch) return 0;
  let penalty = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const slot = state.lessonAssignedSlot[i];
    const p = model.slotPeriod[slot];
    const bit = (1 << p) >>> 0;
    const cStart = model.lessonClassStart[i];
    const cCount = model.lessonClassCount[i];
    for (let k = 0; k < cCount; k++) {
      const c = model.lessonClassFlat[cStart + k];
      if ((lunch[c] & bit) !== 0) penalty += 1;
    }
  }
  return penalty;
}

// Audit §3.5 — m_nMaxVyucOd / m_nMaxVyucDo (max teaching window). Soft-
// penalise placements OUTSIDE the configured window so the schedule
// concentrates teaching in the allowed range. Classes without a window
// set (mask === 0) are skipped — no restriction.
function classTeachingWindowPenalty(model, state) {
  const teach = model.classTeachingMask;
  if (!teach) return 0;
  let penalty = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (!state.lessonAssigned[i]) continue;
    const slot = state.lessonAssignedSlot[i];
    const p = model.slotPeriod[slot];
    const bit = (1 << p) >>> 0;
    const cStart = model.lessonClassStart[i];
    const cCount = model.lessonClassCount[i];
    for (let k = 0; k < cCount; k++) {
      const c = model.lessonClassFlat[cStart + k];
      const mask = teach[c];
      if (mask !== 0 && (mask & bit) === 0) penalty += 1;
    }
  }
  return penalty;
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

  // Per-fault sample for the live Test/Generate dialog (Top-30 #4). Scan
  // state.lessonAssigned[] and pull up to 5 currently-unassigned lesson
  // labels. Rotating window starts from progressEmitCount so the user
  // sees different stuck lessons across ticks even when the count is
  // larger than 5.
  let latestViolations = null;
  const labels = ctx.lessonLabels;
  if (labels && state.lessonAssigned && labels.length) {
    const out = [];
    const start = ctx.progressEmitCount * 5;
    const n = labels.length;
    for (let off = 0; off < n && out.length < 5; off++) {
      const i = (start + off) % n;
      if (!state.lessonAssigned[i]) {
        out.push({
          ruleId: "unassigned",
          severity: "hard",
          description: labels[i] + " — not yet placed",
        });
      }
    }
    if (out.length) latestViolations = out;
    ctx.progressEmitCount = (ctx.progressEmitCount + 1) | 0;
  }

  try {
    const payload = {
      iter: ctx.nodesVisited,
      softScore: state.bestSoftScore === -Number.MAX_SAFE_INTEGER ? 0 : state.bestSoftScore,
      hardConflicts: (state.bestHardCount === Number.MAX_SAFE_INTEGER ? unassignedCount0 : state.bestHardCount) + initiallyInfeasibleCount,
      backtracks: ctx.backtracks,
      durationMs: Math.round(now - t0),
    };
    if (latestViolations) payload.latestViolations = latestViolations;
    ctx.onProgress(payload);
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
    if ((model.teacherAvailabilityMask[td] & ((1 << p) >>> 0)) === 0) return null;
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
      if ((model.teacherAvailabilityMask[td] & ((1 << (p + 1)) >>> 0)) === 0) return null;
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
      // Should be rare; rollback. Guard with canPlace to avoid placing on
      // top of a lesson that was placed by an earlier chain step.
      for (let k = evicted.length - 1; k >= 0; k--) {
        const e = evicted[k];
        if (canPlace(model, state, e.idx, e.slot, e.room) === null) {
          applyPlacement(model, state, e.idx, e.slot, e.room, null);
        }
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
    // Restore original positions. canPlace re-check is required: during
    // recursion (line 2597) the chain may have placed OTHER lessons at
    // these original slots, and applyPlacement without a guard would
    // commit a conflicting overlay. Before this guard the post-solve
    // scrubber dropped ~30 placements per real-school cold solve — the
    // source of the "1198/1240 stuck around 97%" symptom on
    // asctt2012 (4).xml. If a slot is no longer free, leave the lesson
    // unplaced; backtrack will retry via its normal candidate list.
    for (let k = 0; k < evicted.length; k++) {
      const e = evicted[k];
      if (canPlace(model, state, e.idx, e.slot, e.room) === null) {
        applyPlacement(model, state, e.idx, e.slot, e.room, null);
      }
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
  // "twoPeriods" is the Kempe-chain-inspired pair-swap perturbation
  // ported from the CSP-timetabling literature.
  const strategies = ["random", "byClass", "byDay", "bySubject", "twoPeriods"];
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
  // Late Acceptance Hill-Climbing (Timefold port) — opt-in via
  // ctx.useLAHC. Maintains a sliding history of the last L scores; a
  // move is accepted if it beats either the current score OR the score
  // from L steps ago. Single tunable parameter (L), no temperature
  // schedule. Climbs through plateaus where strict-improvement LNS
  // would reject and revert.
  const useLAHC = !!(ctx && ctx.useLAHC);
  const lahcLen = Math.max(20, Math.min(500, (ctx && ctx.lahcLen) || 100));
  const lahcHist = useLAHC ? new Float64Array(lahcLen).fill(bestSoft) : null;
  let lahcIdx = 0;
  // Tier-C — Great Deluge (single water-level threshold). Accept if
  // candidate score >= waterLevel. Water level decays slowly toward
  // bestSoft as the search progresses (we're MAXIMIZING the soft score,
  // so "water level rises" in the maximisation sense).
  const useGreatDeluge = !!(ctx && ctx.useGreatDeluge);
  const gdRiseRate = Math.max(0.0001, Math.min(0.1, (ctx && ctx.gdRiseRate) || 0.005));
  let waterLevel = useGreatDeluge ? (bestSoft * 1.5) : 0;
  // Tier-C — Tabu list. Track last K destroy "fingerprints" (which
  // lessons got evicted) and refuse to re-apply them for tabuTenure
  // iterations. Light implementation: hash of evicted lesson IDs.
  const useTabu = !!(ctx && ctx.useTabu);
  const tabuTenure = Math.max(5, Math.min(100, (ctx && ctx.tabuTenure) || 20));
  const tabuList = useTabu ? [] : null;
  function tabuHash() {
    let h = 0;
    for (let i = 0; i < model.lessonCount; i++) {
      if (!state.lessonAssigned[i]) h = (h * 31 + i) | 0;
    }
    return h >>> 0;
  }

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
    } else if (strategy === "twoPeriods") {
      rngState = evictByTwoPeriods(model, state, K, rngState, rand);
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

    // LAHC acceptance: accept if candidate beats either current best OR
    // the score recorded L iterations ago. Cycles through history slot
    // even on rejections so the rolling window remains current.
    let accept = improved;
    if (!accept && useLAHC) {
      const old = lahcHist[lahcIdx];
      if (newCount >= bestCount && newSoft > old) accept = true;
    }
    if (useLAHC) {
      lahcHist[lahcIdx] = newSoft;
      lahcIdx = (lahcIdx + 1) % lahcLen;
    }
    // Great Deluge acceptance: accept if candidate score >= waterLevel.
    if (!accept && useGreatDeluge && newCount >= bestCount && newSoft >= waterLevel) {
      accept = true;
    }
    if (useGreatDeluge) {
      // Move waterLevel toward bestSoft (so the search becomes stricter).
      waterLevel = waterLevel - (waterLevel - bestSoft) * gdRiseRate;
    }
    // Tabu check — if the destroy fingerprint was used recently, force reject.
    if (useTabu) {
      const h = tabuHash();
      if (tabuList.includes(h)) { accept = false; }
      tabuList.push(h);
      if (tabuList.length > tabuTenure) tabuList.shift();
    }

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
    } else if (accept) {
      // LAHC late-accept — keep the current state to descend through a
      // plateau, but do NOT promote it as the global best. The best
      // snapshot stays unchanged so a future improvement can still
      // measure against it; only the live state advances.
      rejectStreak = 0;
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

// Kempe-chain-inspired eviction (CSP-literature port). Pick TWO random
// periods within the same day and evict every card assigned to either
// of them. The subsequent repair phase then re-packs the freed slots
// with whatever order/room combination scores best — equivalent in spirit
// to a Kempe-chain pair swap but works inside the existing
// destroy-then-repair LNS scaffold without needing a separate graph
// builder. Strong at escaping local optima where single-day or
// single-class evictions don't break a tight overlap pattern.
function evictByTwoPeriods(model, state, K, rngState, rand) {
  const days = model.days, ppd = model.periodsPerDay;
  if (days === 0 || ppd < 2) return rngState;
  const d  = Math.floor(rand() * days);
  let p1 = Math.floor(rand() * ppd);
  let p2 = Math.floor(rand() * ppd);
  if (p1 === p2) p2 = (p1 + 1) % ppd;
  let evicted = 0;
  for (let i = 0; i < model.lessonCount && evicted < K; i++) {
    if (!state.lessonAssigned[i]) continue;
    if (model.lessonFixedSlot[i] >= 0) continue;
    const slot = state.lessonAssignedSlot[i];
    if (model.slotDay[slot] !== d) continue;
    const p = model.slotPeriod[slot];
    if (p !== p1 && p !== p2) continue;
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
  // Tier-A wiring — merge school.settings.solverParams into options so
  // the user's Parameters dialog choices (LAHC, Great Deluge, Tabu, etc.)
  // actually reach the solver. Explicit options still win.
  const sp = (school && school.settings && school.settings.solverParams) || null;
  if (sp) {
    const merged = { ...sp, ...options };
    options = merged;
  }
  // WASM hot-path warm-up — fire-and-forget load of the AssemblyScript
  // canPlace module. When the Promise resolves, globalThis.__chronexaWasmExports
  // is populated and the canPlace() hot loop starts dispatching to WASM
  // alongside the JS path. Doesn't block solve(); the JS solver runs
  // synchronously and authoritatively until the cutover binds real
  // flat-buffer pointers (next session).
  if (typeof globalThis.__chronexaWasmExports === "undefined" &&
      typeof globalThis.__chronexaWasmLoading === "undefined") {
    globalThis.__chronexaWasmLoading = true;
    import("./wasm/csp_wasm.js").then(async (m) => {
      try {
        const exports = await m.wasmExports();
        if (exports) globalThis.__chronexaWasmExports = exports;
      } catch (_e) { /* WASM not available — JS solver continues */ }
    }).catch(() => { /* import failed — ignore */ });
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

  // Per-lesson human label cache used by maybeEmitProgress() to stream a
  // sample of currently-unassigned lessons to the UI. Built once after
  // buildModel so the cost (subject/class/teacher name lookups) doesn't
  // re-pay on every progress tick. Each entry is "<Subject> <Classes>".
  const _subjById  = Object.fromEntries((school.subjects  || []).map(s => [s.id, s]));
  const _classById = Object.fromEntries((school.classes   || []).map(c => [c.id, c]));
  const _teachById = Object.fromEntries((school.teachers  || []).map(t => [t.id, t]));
  const lessonLabels = new Array(model.lessonCount);
  for (let i = 0; i < model.lessonCount; i++) {
    const l = model.lessons[i];
    const subj = _subjById[l.subjectId];
    const subjShort = subj ? (subj.abbr || subj.name) : l.subjectId;
    const cls = (l.classIds || []).map(cid => {
      const c = _classById[cid];
      return c ? (c.short || c.name) : cid;
    }).filter(Boolean).join("/");
    const tch = (l.teacherIds || []).map(tid => {
      const t = _teachById[tid];
      return t ? (t.abbr || t.name) : tid;
    }).filter(Boolean).join("/");
    lessonLabels[i] = subjShort + (cls ? " " + cls : "") + (tch ? " · " + tch : "");
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
      // Per-fault streaming (Top-30 #4) — labels for the human-readable
      // unassigned sample, the model so maybeEmitProgress can scan
      // state.lessonAssigned[], and an event-counter to keep the sample
      // visibly rotating during long runs.
      lessonLabels,
      model,
      progressEmitCount: 0,
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
        // Timefold port — opt-in Late Acceptance Hill-Climbing inside
        // the LNS accept rule. Single tunable: lahcLen window size.
        useLAHC: !!options.useLAHC,
        lahcLen: options.lahcLen,
        // Tier-C — Great Deluge + Tabu list opt-ins.
        useGreatDeluge: !!options.useGreatDeluge,
        gdRiseRate: options.gdRiseRate,
        useTabu: !!options.useTabu,
        tabuTenure: options.tabuTenure,
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

  // Post-solve conflict scrub. The repair + LNS phases can occasionally
  // leave `bestLessonAssigned` with two lessons that share a (class,
  // day, period) with overlapping group masks, OR share a teacher or
  // room at the same slot — bugs observed on real schools but not yet
  // root-caused in iterativeRepair / LNS. Until that lands, scrub: walk
  // placements once in lessonIdx order, drop any lesson whose placement
  // collides with one already kept. The dropped lessons surface as
  // HARD_unplaced_lesson in the violation list. Count is exposed via
  // `stats.scrubbedConflicts` for the UI.
  let scrubbedConflicts = 0;
  {
    const ppd = model.periodsPerDay;
    const days = model.days;
    const classMask    = new Uint32Array(model.classCount   * days * ppd);
    const teacherTaken = new Uint8Array (model.teacherCount * model.totalSlots);
    const roomTaken    = new Uint8Array (model.roomCount    * model.totalSlots);
    for (let i = 0; i < model.lessonCount; i++) {
      if (!globalBest.state.bestLessonAssigned[i]) continue;
      const slot = globalBest.state.bestLessonAssignedSlot[i];
      if (slot < 0) continue;
      const roomIdx = globalBest.state.bestLessonAssignedRoom[i];
      const d = model.slotDay[slot];
      const p = model.slotPeriod[slot];
      const classStart = model.lessonClassStart[i];
      const classCount = model.lessonClassCount[i];
      const teacherStart = model.lessonTeacherStart[i];
      const teacherCount = model.lessonTeacherCount[i];

      // Detect collision with already-kept placements (any axis). Class
      // axis uses the packed (divIdx | mask<<16) comparison — mirrors
      // canPlace exactly, so the scrubber respects multi-division
      // student-sharing (Boys vs GroupA from different divisions both
      // share students → must conflict).
      let conflict = false;
      for (let k = 0; k < classCount && !conflict; k++) {
        const c = model.lessonClassFlat[classStart + k];
        const lessonPacked = model.lessonClassGroupMask[classStart + k];
        const idx = (c * days + d) * ppd + p;
        const occPacked = classMask[idx];
        if (occPacked !== 0) {
          const lessonDiv = lessonPacked & 0xFFFF;
          const occDiv = occPacked & 0xFFFF;
          if (lessonDiv === 0xFFFF || occDiv === 0xFFFF || lessonDiv !== occDiv) conflict = true;
          else if (((lessonPacked >>> 16) & (occPacked >>> 16)) !== 0) conflict = true;
        }
      }
      for (let k = 0; k < teacherCount && !conflict; k++) {
        const t = model.lessonTeacherFlat[teacherStart + k];
        if (teacherTaken[t * model.totalSlots + slot]) conflict = true;
      }
      if (!conflict && roomIdx >= 0 && roomTaken[roomIdx * model.totalSlots + slot]) {
        conflict = true;
      }

      if (conflict) {
        globalBest.state.bestLessonAssigned[i] = 0;
        globalBest.state.bestLessonAssignedSlot[i] = -1;
        globalBest.state.bestLessonAssignedRoom[i] = -1;
        scrubbedConflicts += 1;
        continue;
      }

      // Record this lesson's occupancy across all axes (packed format).
      for (let k = 0; k < classCount; k++) {
        const c = model.lessonClassFlat[classStart + k];
        const lessonPacked = model.lessonClassGroupMask[classStart + k];
        const idx = (c * days + d) * ppd + p;
        const occPacked = classMask[idx];
        if (occPacked === 0) {
          classMask[idx] = lessonPacked;
        } else if ((occPacked & 0xFFFF) !== 0xFFFF) {
          classMask[idx] = (occPacked | (lessonPacked & 0xFFFF0000)) >>> 0;
        }
      }
      for (let k = 0; k < teacherCount; k++) {
        const t = model.lessonTeacherFlat[teacherStart + k];
        teacherTaken[t * model.totalSlots + slot] = 1;
      }
      if (roomIdx >= 0) {
        roomTaken[roomIdx * model.totalSlots + slot] = 1;
      }
    }
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

  // Audit §6.2 — Generator final result enriched with chyby[] (Slovak for
  // "errors"). Group violations by ruleId so the UI can render
  // "12 × teacher_conflict · 4 × class_max_per_day" instead of a flat list
  // that the user has to bucket manually. Each chyba entry carries
  // { code, count, examples[] } where examples are up to 3 description
  // strings for the user to drill into.
  const chybyMap = Object.create(null);
  for (const v of violations) {
    const code = (v && v.ruleId) || "unknown";
    if (!chybyMap[code]) chybyMap[code] = { code, count: 0, examples: [] };
    chybyMap[code].count++;
    if (chybyMap[code].examples.length < 3 && v && v.description) {
      chybyMap[code].examples.push(v.description);
    }
  }
  const chyby = Object.values(chybyMap).sort((a, b) => b.count - a.count);

  return {
    status,
    assignment,
    stats: {
      placed,
      unplaced,
      hardConflicts,
      softScore: globalBest.softScore,
      durationMs: Math.round(performance.now() - t0),
      scrubbedConflicts,
    },
    violations,
    chyby,
  };
}

function maxCandidatesPerLesson(model) {
  let m = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (model.lessonCandidateCount[i] > m) m = model.lessonCandidateCount[i];
  }
  return Math.max(1, m);
}

// Internals exposed for direct unit testing — never imported by
// production code. Keeps `tools/test_*.mjs` from having to vm-load the
// whole module to reach private functions.
export const __test_internals = {
  buildModel, makeState, applySingle, removeSingle, canPlace,
};

// In Web Worker context, setInterval is global; in unusual hosts it might not
// be. Provide a no-op shim so tests in headless environments don't crash.
function setIntervalShim(fn, ms) {
  if (typeof setInterval === "function") return setInterval(fn, ms);
  return null;
}
function clearIntervalShim(id) {
  if (id != null && typeof clearInterval === "function") clearInterval(id);
}
