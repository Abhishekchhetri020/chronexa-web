// Phase 2.2 (n_16 span semantics) — audit plan: a double satisfies
// "first or last" when its occupied SPAN begins at the first teaching
// period OR ends at the last teaching period.
//
// Run: node tools/test_n16_span.mjs

import { __test_internals } from "../js/solver/csp_solver.js";
const { buildModel, makeState, canPlace } = __test_internals;

// 1 day × 5 periods, all teaching. Lab double wants an edge span.
// n_16 forces: span must start at P1 (=1) OR end at P5 (=5).
const school = {
  schoolName: "n16-span",
  daysPerWeek: 1,
  periodsPerDay: 5,
  bell: { periods: [1,2,3,4,5].map(i => ({ index: i, name: `P${i}`, short: `${i}`, isTeaching: true })) },
  bells: [],
  teachers:  [ { id: "t" } ],
  classes:   [ { id: "c" } ],
  classrooms:[ { id: "r" } ],
  subjects:  [ { id: "s" } ],
  lessons: [{
    id: "L", subjectId: "s", periodsPerWeek: 2, periodsPerDay: 2, isLabDouble: true,
    classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r",
  }],
  relations: [{ typ: "n_16", subjectids: ["s"], classids: ["c"], hard: true }],
  cards: [], settings: {},
};

const model = buildModel(school);
const state = makeState(model);

const cases = [
  // [label, slot, expectReject]
  ["start at P1 (0)",   0, false],  // allowed — span starts at first
  ["start at P2 (1)",   1, true ],  // forbidden — middle
  ["start at P3 (2)",   2, true ],  // forbidden — middle
  ["start at P4 (3)",   3, false],  // allowed — span ends at P5 (last)
  // start at P5 would OOB for a lab double (no slot 6) → caught earlier.
];

let fails = 0;
for (const [label, slot, expectReject] of cases) {
  const reason = canPlace(model, state, 0, slot, 0);
  const isRejected = reason !== null;
  const ok = isRejected === expectReject;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: canPlace = ${reason === null ? "null(OK)" : reason} (want ${expectReject ? "reject" : "allow"})`);
}
process.exit(fails === 0 ? 0 : 1);
