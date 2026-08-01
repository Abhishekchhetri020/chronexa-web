// Phase 1.2 blocker-2 strengthen — actually exercise the span-aware scrubber.
// Hand-craft a placement where a lab double occupies slots (0, 1) and a
// single shares teacher+room+class at slot 1. Run the module-true scrubber
// logic (replicated from csp_solver.js solve() tail) directly on this state
// for both baseline (start-slot only) and fixed (span-aware) code.
//
// Baseline must scrub NOTHING (collision survives, scrubbedConflicts=0).
// Fixed must drop the second lesson (scrubbedConflicts=1).
//
// Run: node tools/test_scrubber_lab_tail.mjs

import { __test_internals } from "../js/solver/csp_solver.js";
const { buildModel, makeState, applySingle } = __test_internals;

const school = {
  schoolName: "scrubber-lab-tail",
  daysPerWeek: 1,
  periodsPerDay: 3,
  bell: { periods: [1,2,3].map(i => ({ index: i, name: `P${i}`, short: `${i}`, isTeaching: true })) },
  teachers:  [ { id: "t" } ],
  classes:   [ { id: "c" } ],
  classrooms:[ { id: "r" } ],
  subjects:  [ { id: "sA" }, { id: "sB" }, { id: "sC" } ],
  lessons: [
    { id: "A", subjectId: "sA", periodsPerWeek: 2, periodsPerDay: 2, isLabDouble: true,
      classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r" },
    { id: "B", subjectId: "sB", periodsPerWeek: 1, periodsPerDay: 1,
      classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r" },
    { id: "C", subjectId: "sC", periodsPerWeek: 1, periodsPerDay: 1,
      classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r" },
  ],
  relations: [], cards: [], settings: {},
};

function buildStage() {
  const model = buildModel(school);
  const state = makeState(model);
  // Lab double at slot 0 → occupies slots 0+1 in state.
  applySingle(model, state, /* lesson */ 0, /* slot */ 0, /* room */ 0);
  applySingle(model, state, 0, 1, 0);
  state.lessonAssignedSlot[0] = 0;
  state.lessonAssignedRoom[0] = 0;
  state.lessonAssigned[0] = 1;
  // Single at slot 1 (the LAB TAIL), same class/teacher/room.
  applySingle(model, state, 1, 1, 0);
  state.lessonAssignedSlot[1] = 1;
  state.lessonAssignedRoom[1] = 0;
  state.lessonAssigned[1] = 1;
  // Innocent at slot 2, no overlap.
  applySingle(model, state, 2, 2, 0);
  state.lessonAssignedSlot[2] = 2;
  state.lessonAssignedRoom[2] = 0;
  state.lessonAssigned[2] = 1;
  return {
    model,
    bestLessonAssigned:       Uint8Array.from(state.lessonAssigned),
    bestLessonAssignedSlot:   Int32Array.from(state.lessonAssignedSlot),
    bestLessonAssignedRoom:   Int32Array.from(state.lessonAssignedRoom),
  };
}

// Baseline scrubber (start-slot only). Mirrors pre-fix csp_solver.js.
function scrubBaseline(st) {
  const { model, bestLessonAssigned, bestLessonAssignedSlot, bestLessonAssignedRoom } = st;
  const ppd = model.periodsPerDay, days = model.days;
  const classMask    = new Uint32Array(model.classCount   * days * ppd);
  const teacherTaken = new Uint8Array (model.teacherCount * model.totalSlots);
  const roomTaken    = new Uint8Array (model.roomCount    * model.totalSlots);
  let dropped = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (!bestLessonAssigned[i]) continue;
    const slot = bestLessonAssignedSlot[i];
    if (slot < 0) continue;
    const roomIdx = bestLessonAssignedRoom[i];
    const d = model.slotDay[slot];
    const p = model.slotPeriod[slot];
    const classStart = model.lessonClassStart[i];
    const classCount = model.lessonClassCount[i];
    const teacherStart = model.lessonTeacherStart[i];
    const teacherCount = model.lessonTeacherCount[i];
    let conflict = false;
    for (let k = 0; k < classCount && !conflict; k++) {
      const c = model.lessonClassFlat[classStart + k];
      const lessonPacked = model.lessonClassGroupMask[classStart + k];
      const occPacked = classMask[(c * days + d) * ppd + p];
      if (occPacked !== 0) {
        const lessonDiv = lessonPacked & 0xFFFF, occDiv = occPacked & 0xFFFF;
        if (lessonDiv === 0xFFFF || occDiv === 0xFFFF || lessonDiv !== occDiv) conflict = true;
        else if (((lessonPacked >>> 16) & (occPacked >>> 16)) !== 0) conflict = true;
      }
    }
    for (let k = 0; k < teacherCount && !conflict; k++) {
      const t = model.lessonTeacherFlat[teacherStart + k];
      if (teacherTaken[t * model.totalSlots + slot]) conflict = true;
    }
    if (!conflict && roomIdx >= 0 && roomTaken[roomIdx * model.totalSlots + slot]) conflict = true;
    if (conflict) { bestLessonAssigned[i] = 0; dropped++; continue; }
    for (let k = 0; k < classCount; k++) {
      const c = model.lessonClassFlat[classStart + k];
      const lessonPacked = model.lessonClassGroupMask[classStart + k];
      const idx = (c * days + d) * ppd + p;
      const occ = classMask[idx];
      if (occ === 0) classMask[idx] = lessonPacked;
      else if ((occ & 0xFFFF) !== 0xFFFF) classMask[idx] = (occ | (lessonPacked & 0xFFFF0000)) >>> 0;
    }
    for (let k = 0; k < teacherCount; k++) {
      teacherTaken[model.lessonTeacherFlat[teacherStart + k] * model.totalSlots + slot] = 1;
    }
    if (roomIdx >= 0) roomTaken[roomIdx * model.totalSlots + slot] = 1;
  }
  return dropped;
}

// Span-aware scrubber (fixed). Mirrors post-fix csp_solver.js.
function scrubSpanAware(st) {
  const { model, bestLessonAssigned, bestLessonAssignedSlot, bestLessonAssignedRoom } = st;
  const ppd = model.periodsPerDay, days = model.days;
  const classMask    = new Uint32Array(model.classCount   * days * ppd);
  const teacherTaken = new Uint8Array (model.teacherCount * model.totalSlots);
  const roomTaken    = new Uint8Array (model.roomCount    * model.totalSlots);
  let dropped = 0;
  for (let i = 0; i < model.lessonCount; i++) {
    if (!bestLessonAssigned[i]) continue;
    const slot = bestLessonAssignedSlot[i];
    if (slot < 0) continue;
    const roomIdx = bestLessonAssignedRoom[i];
    const classStart = model.lessonClassStart[i];
    const classCount = model.lessonClassCount[i];
    const teacherStart = model.lessonTeacherStart[i];
    const teacherCount = model.lessonTeacherCount[i];
    const span = model.lessonLabDouble[i] === 1 ? 2 : 1;
    const p0 = model.slotPeriod[slot];
    if (p0 + span > ppd) {
      bestLessonAssigned[i] = 0;
      bestLessonAssignedSlot[i] = -1;
      bestLessonAssignedRoom[i] = -1;
      dropped++; continue;
    }
    let conflict = false;
    for (let s = 0; s < span && !conflict; s++) {
      const cur = slot + s;
      const d = model.slotDay[cur];
      const p = model.slotPeriod[cur];
      for (let k = 0; k < classCount && !conflict; k++) {
        const c = model.lessonClassFlat[classStart + k];
        const lessonPacked = model.lessonClassGroupMask[classStart + k];
        const occPacked = classMask[(c * days + d) * ppd + p];
        if (occPacked !== 0) {
          const lessonDiv = lessonPacked & 0xFFFF, occDiv = occPacked & 0xFFFF;
          if (lessonDiv === 0xFFFF || occDiv === 0xFFFF || lessonDiv !== occDiv) conflict = true;
          else if (((lessonPacked >>> 16) & (occPacked >>> 16)) !== 0) conflict = true;
        }
      }
      for (let k = 0; k < teacherCount && !conflict; k++) {
        const t = model.lessonTeacherFlat[teacherStart + k];
        if (teacherTaken[t * model.totalSlots + cur]) conflict = true;
      }
      if (!conflict && roomIdx >= 0 && roomTaken[roomIdx * model.totalSlots + cur]) conflict = true;
    }
    if (conflict) {
      bestLessonAssigned[i] = 0;
      bestLessonAssignedSlot[i] = -1;
      bestLessonAssignedRoom[i] = -1;
      dropped++; continue;
    }
    for (let s = 0; s < span; s++) {
      const cur = slot + s;
      const d = model.slotDay[cur];
      const p = model.slotPeriod[cur];
      for (let k = 0; k < classCount; k++) {
        const c = model.lessonClassFlat[classStart + k];
        const lessonPacked = model.lessonClassGroupMask[classStart + k];
        const idx = (c * days + d) * ppd + p;
        const occ = classMask[idx];
        if (occ === 0) classMask[idx] = lessonPacked;
        else if ((occ & 0xFFFF) !== 0xFFFF) classMask[idx] = (occ | (lessonPacked & 0xFFFF0000)) >>> 0;
      }
      for (let k = 0; k < teacherCount; k++) {
        teacherTaken[model.lessonTeacherFlat[teacherStart + k] * model.totalSlots + cur] = 1;
      }
      if (roomIdx >= 0) roomTaken[roomIdx * model.totalSlots + cur] = 1;
    }
  }
  return dropped;
}

// ── Baseline expectation: scrubbed = 0 (start-slot-only cannot see the tail)
const droppedB = scrubBaseline(buildStage());
console.log(`baseline start-slot-only scrubbed = ${droppedB}`);

// ── Fixed expectation: scrubbed = 1 (the lab-tail single drops)
const droppedF = scrubSpanAware(buildStage());
console.log(`fixed span-aware scrubbed = ${droppedF}`);

if (droppedB === 0 && droppedF === 1) {
  console.log("PASS: span-aware scrubber catches lab-tail collision that baseline misses.");
  process.exit(0);
}
console.log(`FAIL: baseline=${droppedB} want 0; fixed=${droppedF} want 1`);
process.exit(1);
