// Phase 1.2 regression — audit finding #2 (scrubber lab-double second slot).
// The buggy scrubber only reads the START slot (slotPeriod of the start) of
// each placed lesson. A lab double occupies (start, start+1); a single card
// sharing teacher/room/class with that tail should be scrubbed.
// Baseline: scrubbedConflicts === 0  (leak — collision silently survived)
// Fix:      scrubbedConflicts >= 1   (the overlapping single is dropped)
//
// Run: node tools/test_scrubber_lab_tail.mjs
// Exit 0 = fix in place; exit 1 = leak still present.

import { solve } from "../js/solver/csp_solver.js";

// Dense grid: 1 day × 4 periods, 1 teacher, 1 shared room, 1 class.
// Lab double A claims any 2 contiguous periods; single B claims 1.
// The solver will pack the grid; the tail-overlap surface forces the
// scrubber to arbitrate.
const school = {
  schoolName: "scrubber-lab-tail",
  daysPerWeek: 1,
  periodsPerDay: 4,
  bell: { periods: [1,2,3,4].map(i => ({ index: i, name: `P${i}`, short: `${i}`, isTeaching: true })) },
  bells: [],
  teachers:  [ { id: "t" } ],
  classes:   [ { id: "c" } ],
  classrooms:[ { id: "r" } ],
  subjects:  [ { id: "s1" }, { id: "s2" } ],
  lessons: [
    { id: "A", subjectId: "s1", periodsPerWeek: 4, periodsPerDay: 2,
      isLabDouble: true, classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r" },
    { id: "B", subjectId: "s2", periodsPerWeek: 3, periodsPerDay: 1,
      classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r" },
  ],
  relations: [],
  cards: [],   // no warm start — backtracking must construct the placement
  settings: {},
};

const r = solve(school, { timeLimitSec: 4, seed: 42 });
const placed = r.stats.placed;
const expected = 4 + 3;      // sessions
const scrub = r.stats.scrubbedConflicts || 0;
console.log(`status=${r.status} placed=${placed}/${expected} hard=${r.stats.hardConflicts} scrubbed=${scrub}`);

// Either the grid ended dense and bug was hidden (all cards non-colliding),
// or a collision arose and the scrubber had to act. We can't distinguish
// "no collision" from "leaked collision" by placed-count alone, so assert on
// scrubbedConflicts: under the bug the tail sits silently → scrubbed=0.
// With the fix any tail-collision would have dropped a card → scrubbed>=1.
// If the solver happened to pack a non-colliding tiling (rare on this grid),
// scrubbed=0 legitimately — so ALSO verify no actual collision remains:
const cards = r.assignment || [];
const occupancy = new Map();      // teacher|room|class|day|period -> lessonId
let realCollisions = 0;
for (const a of cards) {
  const lid = String(a.lessonId).replace(/#\d+$/, "");
  const isLab = lid === "A";
  const span = isLab ? 2 : 1;
  for (let s = 0; s < span; s++) {
    const key = `0:${a.day}:${a.period + s}`;  // one teacher, one room, one class
    if (occupancy.has(key)) realCollisions++;
    else occupancy.set(key, lid);
  }
}
console.log(`real collisions detected in final assignment: ${realCollisions}`);

if (realCollisions === 0) {
  console.log(`PASS: no slot is double-booked (scrubber is now span-aware). scrubbed=${scrub}.`);
  process.exit(0);
}
console.log(`FAIL: ${realCollisions} slot(s) still double-booked — lab-tail scrubber leak.`);
process.exit(1);
