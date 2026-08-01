// Phase 2.2 regression — audit finding #6 (n_2 not enforced on lab-double second slot).
// Places a lab double (1 lesson occupying 2 consecutive periods) and asserts
// a partner lesson CANNOT be placed at the tail slot.
//
// Run: node tools/test_n2_lab_tail.mjs

import { __test_internals } from "../js/solver/csp_solver.js";

const { buildModel, makeState, canPlace, applySingle } = __test_internals;

// d=0, periods 1..3. Lab A at P1-P2; partner single B tries to sit at P2 (the tail).
const school = {
  schoolName: "n2-lab-tail",
  daysPerWeek: 1,
  periodsPerDay: 3,
  bell: { periods: [1,2,3].map(i => ({ index: i, name: `P${i}`, short: `${i}`, isTeaching: true })) },
  bells: [],
  teachers:  [ { id: "tA" }, { id: "tB" } ],
  classes:   [ { id: "cA" }, { id: "cB" } ],
  classrooms:[ { id: "r1" }, { id: "r2" } ],
  subjects:  [ { id: "sA" }, { id: "sB" } ],
  lessons: [
    { id: "A", subjectId: "sA", periodsPerWeek: 2, periodsPerDay: 2, isLabDouble: true,
      classIds: ["cA"], teacherIds: ["tA"], preferredRoomId: "r1" },
    { id: "B", subjectId: "sB", periodsPerWeek: 1, periodsPerDay: 1,
      classIds: ["cB"], teacherIds: ["tB"], preferredRoomId: "r2" },
  ],
  relations: [
    // n_2 must not be at same period — explicitly binds A and B.
    { typ: "n_2", subjectids: ["sA"], subject2ids: ["sB"], classids: ["cA","cB"], hard: true },
  ],
  cards: [], settings: {},
};

const model = buildModel(school);
const state = makeState(model);

// Place A at P1 (slot 0) — tail at P2 (slot 1).
applySingle(model, state, 0, 0, 0);
applySingle(model, state, 0, 1, 0);
state.lessonAssignedSlot[0] = 0;
state.lessonAssignedRoom[0] = 0;
state.lessonAssigned[0] = 1;
state.assignedLessonCount += 1;

// Try B at P2 (slot 1) — must be FORBIDDEN by n_2 once lab-tail is span-aware.
const reason = canPlace(model, state, 1, 1, 1);
console.log(`B @ d0/p2: canPlace=${reason === null ? "null(OK)" : reason}`);

// Also try B at P3 (slot 2) — should be LEGAL (after A's tail).
const reasonEnd = canPlace(model, state, 1, 2, 1);
console.log(`B @ d0/p3: canPlace=${reasonEnd === null ? "null(OK)" : reasonEnd}`);

// And A at P1 alone at P0-start should still be legal — sanity.
const reasonSelf = canPlace(model, state, 1, 0, 1);
console.log(`B @ d0/p1 alongside A start: canPlace=${reasonSelf === null ? "null(OK)" : reasonSelf}`);

if (reason !== null && reasonEnd === null && reasonSelf !== null) {
  console.log(`PASS: n_2 tail forbidden (${reason}), next-period legal, overlapping start still forbidden (${reasonSelf}).`);
  process.exit(0);
}
console.log(`FAIL: tail=${reason}  next=${reasonEnd}  overlap=${reasonSelf}`);
process.exit(1);
