// Phase 2.1 regression — audit finding #4 (n_0/n_5 role swap) + n_9 one-sided.
// Uses RelationEnforcer.check() (the semantic verification path) against
// hand-crafted same-school states. Baseline n_5 → scope "consecutive"
// (forbids adjacency), which REJECTS the valid adjacent placement and
// ACCEPTS far-apart invalid ones. Fix: n_5 must REQUIRE adjacency; n_9
// must fire regardless of which side of the pair is being placed.
//
// Run: node tools/test_relation_enforcer_semantics.mjs

import { check } from "../js/solver/relation_enforcer.js";

let failed = 0;
function expectHard(desc, result, wantViolation) {
  const has = result.hard.length > 0;
  const ok = has === wantViolation;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${desc}  (want violation=${wantViolation}, got=${has})`);
}

const schoolCards = [
  // Existing day-1 placements
  { id: "a1", lessonId: "LA", day: 1, period: 3 },
  { id: "b1", lessonId: "LB", day: 1, period: 4 },   // adjacent to A
];

const schoolN5 = {
  lessons: [
    { id: "LA", subjectId: "SA", classIds: ["c1"], teacherIds: ["t1"] },
    { id: "LB", subjectId: "SB", classIds: ["c1"], teacherIds: ["t2"] },
  ],
  cards:  schoolCards,
  relations: [
    { typ: "n_5", subjectids: ["SA"], subject2ids: ["SB"], classids: ["c1"], hard: true },
  ],
};

// n_5: candidate adjacent (period 4 sits next to A at 3). Because B is ALSO
// already on the card stream (card b1 = LB@day1/p4 sits adjacent to A), the
// adjacency requirement is satisfiable; and the candidate itself adds no new
// clash if we place A adjacent to B. Baseline inverts this to a hard veto.
expectHard("n_5 adjacent placement is legal",
  check({
    lessons: [
      { id: "LA", subjectId: "SA", classIds: ["c1"], teacherIds: ["t1"] },
      { id: "LB", subjectId: "SB", classIds: ["c1"], teacherIds: ["t2"] },
    ],
    cards:  [ { id: "b1", lessonId: "LB", day: 1, period: 4 } ],
    relations: [{ typ: "n_5", subjectids: ["SA"], subject2ids: ["SB"], classids: ["c1"], hard: true }],
  }, "LA", 1, 3), false);

// n_5: candidate far from partner (period 8) while a partner IS on the day —
// adjacency requirement cannot be met by the candidate at this slot.
expectHard("n_5 distant placement is violation",
  check({
    lessons: [
      { id: "LA", subjectId: "SA", classIds: ["c1"], teacherIds: ["t1"] },
      { id: "LB", subjectId: "SB", classIds: ["c1"], teacherIds: ["t2"] },
    ],
    cards:  [ { id: "b1", lessonId: "LB", day: 1, period: 3 } ],
    relations: [{ typ: "n_5", subjectids: ["SA"], subject2ids: ["SB"], classids: ["c1"], hard: true }],
  }, "LA", 1, 8), true);

// n_5: candidate alone on a fresh day (no partner present) — not yet a violation.
expectHard("n_5 no-partner-day is legal",
  check({
    lessons: [
      { id: "LA", subjectId: "SA", classIds: ["c1"], teacherIds: ["t1"] },
      { id: "LB", subjectId: "SB", classIds: ["c1"], teacherIds: ["t2"] },
    ],
    cards: [],
    relations: [{ typ: "n_5", subjectids: ["SA"], subject2ids: ["SB"], classids: ["c1"], hard: true }],
  }, "LA", 2, 3), false);

// n_0 should still forbid adjacency. n_0 is non-binary; both lessons must
// appear on the relation's subjectids so placedMatching sees them.
expectHard("n_0 adjacent placement is violation",
  check({
    lessons: [
      { id: "LA", subjectId: "SA", classIds: ["c1"], teacherIds: ["t1"] },
      { id: "LB", subjectId: "SB", classIds: ["c1"], teacherIds: ["t2"] },
    ],
    cards:  [ { id: "b1", lessonId: "LB", day: 1, period: 5 } ],
    relations: [{ typ: "n_0", subjectids: ["SA", "SB"], classids: ["c1"], hard: true }],
  }, "LA", 1, 4), true);

// n_9 — both directions matter.
const schoolN9_aba = {
  lessons: schoolN5.lessons,
  cards: [
    { id: "a1", lessonId: "LA", day: 1, period: 5 },
    { id: "b1", lessonId: "LB", day: 1, period: 2 },   // B placed EARLIER than A → violates order
  ],
  relations: [{ typ: "n_9", subjectids: ["SA"], subject2ids: ["SB"], classids: ["c1"], hard: true }],
};
// We placed A at period 5; B is at period 2: A should be strictly before B.
expectHard("n_9 leader-after-follower is violation",
  check(schoolN9_aba, "LA", 1, 5), true);

// Same state, but now place B and check the reverse: A is at 5, B at 2.
// leader not before follower → violation must fire even when placing follower.
expectHard("n_9 check fires when placing follower too",
  check(schoolN9_aba, "LB", 1, 2), true);

// OK placement to confirm no over-firing: A at 2, B at 5.
const schoolN9_ok = {
  lessons: schoolN5.lessons,
  cards: [
    { id: "a1", lessonId: "LA", day: 1, period: 2 },
    { id: "b1", lessonId: "LB", day: 1, period: 5 },
  ],
  relations: [{ typ: "n_9", subjectids: ["SA"], subject2ids: ["SB"], classids: ["c1"], hard: true }],
};
expectHard("n_9 correct order is legal (placing A)",
  check(schoolN9_ok, "LA", 1, 2), false);
expectHard("n_9 correct order is legal (placing B)",
  check(schoolN9_ok, "LB", 1, 5), false);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
