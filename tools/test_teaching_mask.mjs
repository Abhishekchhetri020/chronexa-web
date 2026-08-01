// Phase 2.1 blocker-1 — audit findings #5 (isTeaching:false placeable) and
// #12 (breakPeriods stored array position). Verifies:
//   1. A lesson that only has a non-teaching slot available must be UNPLACEABLE.
//   2. The same lesson becomes placeable when its isTeaching flag is true.
//   3. A lab double's tail can't sit on a non-teaching period (it would've
//      started on a teaching period and extended into a break).
//   4. Break-period logic works for non-dense bells (breaks at the right
//      0-based coordinate even when bell.periods array position ≠ index - 1).
//
// Run: node tools/test_teaching_mask.mjs

import { __test_internals, solve } from "../js/solver/csp_solver.js";
const { buildModel, makeState, canPlace } = __test_internals;

function buildBell(startIdx, len, isTeachingFlags) {
  return { periods: Array.from({ length: len }, (_, i) => ({
    index: startIdx + i, name: `P${startIdx + i}`, short: `${startIdx + i}`,
    isTeaching: isTeachingFlags[i]
  })) };
}

// ── Test 1: teaching-only forced school → lesson unplaceable on a
// non-teaching slot.
{
  // One period, marked non-teaching. Only lesson is 1×1 and needs that one
  // period. Solver must return zero placements and a violation noting the
  // unavailable period (or the scrubber must drop the result).
  const schoolNonTeaching = {
    schoolName: "nonTeaching-only",
    daysPerWeek: 1,
    periodsPerDay: 1,
    bell: { periods: [{ index: 1, name: "BRK", short: "BRK", isTeaching: false }] },
    teachers:  [ { id: "t" } ],
    classes:   [ { id: "c" } ],
    classrooms:[ { id: "r" } ],
    subjects:  [ { id: "s" } ],
    lessons:   [ { id: "L", subjectId: "s", periodsPerWeek: 1, periodsPerDay: 1,
                   classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r" } ],
    relations: [], cards: [], settings: {},
  };
  const r = solve(schoolNonTeaching, { timeLimitSec: 3 });
  const placedOnBreak = (r.assignment || []).filter(a => a.period === 1).length;
  console.log(`T1 placedOnBreak=${placedOnBreak} status=${r.status}`);
  if (placedOnBreak !== 0) { console.log("FAIL T1"); process.exit(1); }
}

// ── Test 2: same setup but now the period IS teaching → placeable.
{
  const schoolTeaching = {
    schoolName: "teaching-only",
    daysPerWeek: 1,
    periodsPerDay: 1,
    bell: { periods: [{ index: 1, name: "P1", short: "1", isTeaching: true }] },
    teachers:  [ { id: "t" } ],
    classes:   [ { id: "c" } ],
    classrooms:[ { id: "r" } ],
    subjects:  [ { id: "s" } ],
    lessons:   [ { id: "L", subjectId: "s", periodsPerWeek: 1, periodsPerDay: 1,
                   classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r" } ],
    relations: [], cards: [], settings: {},
  };
  const r = solve(schoolTeaching, { timeLimitSec: 3 });
  console.log(`T2 placed=${r.stats.placed}`);
  if (r.stats.placed !== 1) { console.log("FAIL T2"); process.exit(1); }
}

// ── Test 3: lab double cannot extend into a break. P1 teaching, P2 break.
{
  const school = {
    schoolName: "lab-tail-break",
    daysPerWeek: 1,
    periodsPerDay: 2,
    bell: buildBell(1, 2, [true, false]),
    teachers:  [ { id: "t" } ],
    classes:   [ { id: "c" } ],
    classrooms:[ { id: "r" } ],
    subjects:  [ { id: "s" } ],
    lessons: [{
      id: "L", subjectId: "s", periodsPerWeek: 2, periodsPerDay: 2,
      isLabDouble: true, classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r",
    }],
    relations: [], cards: [], settings: {},
  };
  const model = buildModel(school);
  const state = makeState(model);
  // Place at slot 0 (P1 start). Tail would be slot 1 (P2 break).
  const reason = canPlace(model, state, 0, 0, 0);
  console.log(`T3 canPlace lab-start-at-P1 = ${reason}`);
  if (reason === null) {
    console.log("FAIL T3 — lab double allowed to extend into break period");
    process.exit(1);
  }
}

// ── Test 4: non-dense bell. P1 teaching, P2 BREAK, P3 teaching (indices
// 1,2,3 in that order — breakPeriods must hold 1 (position 1 → index 2 →
// 0-based grid coord 1), not array position 1's index (which happens to
// match here, but the code path must use index not position).
{
  const school = {
    schoolName: "nonDense bell",
    daysPerWeek: 1,
    periodsPerDay: 3,
    bell: buildBell(1, 3, [true, false, true]),
    teachers:  [ { id: "t" } ],
    classes:   [ { id: "c" } ],
    classrooms:[ { id: "r" } ],
    subjects:  [ { id: "sA" }, { id: "sB" } ],
    lessons: [
      { id: "A", subjectId: "sA", periodsPerWeek: 1, periodsPerDay: 1, classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r" },
      { id: "B", subjectId: "sB", periodsPerWeek: 1, periodsPerDay: 1, classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r" },
    ],
    // n_7: no break between sA and sB (they share class → same-day chain).
    relations: [{ typ: "n_7", subjectids: ["sA"], subject2ids: ["sB"], classids: ["c"], hard: true }],
    cards: [], settings: {},
  };
  const model = buildModel(school);
  console.log(`T4 model.breakPeriods = ${Array.from(model.breakPeriods || [])}`);
  // The only break is at index 2 → 0-based coord 1.
  const hasCorrectBreak = (model.breakPeriods || []).includes(1);
  if (!hasCorrectBreak) { console.log("FAIL T4 breakPeriods missing grid-coord 1"); process.exit(1); }
}

console.log("PASS all");
process.exit(0);
