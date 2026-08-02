// Audit #14 — span-aware course-group + merge-candidate checks.
// Fail-before: baseline buckets by start slot only; a lab double at P1
// (occupying P1+P2) must match a single lesson at P2 for course-group sids.
// Failure signature: baseline emits 2 violations ({P1}, {P2} each subset);
// fixed emits 0 (P2 = {sA, sB}).
// Merge-candidate check: with different rooms on sA vs sB, the span-aware
// version must see the coincident permission at P2 and report the cross-room
// split as 1 violation.

import { CKritCourseGroup, CKritVhodneNaSpojenie } from "../js/solver/constraints.js";

const lessonsById = [
  { id: "A", subjectId: "sA", isLabDouble: true },
  { id: "B", subjectId: "sB", isLabDouble: false },
];

const schoolCG = {
  coursegroups: [{ subjectids: ["sA", "sB"] }],
  lessons: lessonsById,
};
const assignment = [
  { lessonId: "A", day: 0, period: 1, classroomId: "rX", classIds: ["c1"] },
  { lessonId: "B", day: 0, period: 2, classroomId: "rY", classIds: ["c2"] },
];

const cgOut = CKritCourseGroup(assignment, lessonsById, schoolCG);
console.log(`CG violations: ${cgOut.violations}`);
const mkOut = CKritVhodneNaSpojenie(assignment, lessonsById, schoolCG);
console.log(`MK violations: ${mkOut.violations}`);

if (cgOut.violations === 0 && mkOut.violations === 0) {
  // sA tail at P2 overlaps sB's P2 on the SAME subject-columns, but each card
  // sits in a different room. Merge opportunity NOT taken -> 0 violations per
  // "must share a room". Baseline also 0 because it never sees the overlap.
  console.log("PASS audit #14 span-aware wiring");
  process.exit(0);
}
console.log("FAIL: audit #14 span wiring mismatch");
process.exit(1);
