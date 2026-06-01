// Regression tests for the 2026-06-01 solver audit (verified-real subset).
// Node-runnable (no browser): `node js/solver/__tests__/audit_regression.test.js`.
// Each case is fail-before / pass-after for one fixed bug.
//
//   C1  csp_solver.js   n_2 (same-period-forbidden) was nested inside the n_1
//                       loop, so it was bypassed when a lesson had no n_1 partner.
//   C5  constraints.js  CKritSluzba missed supervision conflicts for co-teachers
//                       (only the assignment's singular teacherId was checked).
//   C6  constraints.js  CKritTriedny last-write-wins on the last-period teacher;
//                       a second lesson at the same last period hid the first.
//   C7  constraints.js  CKritCourseGroup counted subject OCCURRENCES, not distinct
//                       subjects, so a duplicated subject masked a missing sibling.
//   C8  constraints.js  studentScheduleConflicts pushed the same elective card
//                       twice for duplicate enrollments => phantom conflict.
//   H13 csp_solver.js   diagnostics used the expanded id ("X#1") instead of the
//                       source id ("X"); now aggregated one-row-per-source-lesson.

const assert = require("node:assert");
const path = require("path");
const { solve } = require(path.join(__dirname, "..", "csp_solver.js"));
const {
  CKritSluzba,
  CKritTriedny,
  CKritCourseGroup,
  studentScheduleConflicts,
} = require(path.join(__dirname, "..", "constraints.js"));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
    passed++;
  } catch (e) {
    console.log("  FAIL  " + name + "\n          " + e.message);
    failed++;
  }
}

// --- C1 ---------------------------------------------------------------------
test("C1: n_2 is enforced even when the lesson has no n_1 partner", () => {
  // One day, one teaching period => exactly one (day,period) slot. Two lessons
  // (different subjects/classes/teachers, separate rooms) both fit that slot.
  const base = {
    schoolName: "C1",
    daysPerWeek: 1,
    bell: { id: "b", name: "b", periods: [{ index: 1, label: "1", duration: 1 }] },
    bells: [{ id: "b", name: "b", periods: [{ index: 1, label: "1", duration: 1 }] }],
    subjects: [{ id: "sA", name: "A" }, { id: "sB", name: "B" }],
    teachers: [
      { id: "tA", name: "TA", subjects: ["sA"], timeOff: {} },
      { id: "tB", name: "TB", subjects: ["sB"], timeOff: {} },
    ],
    classes: [
      { id: "cA", name: "CA", bellId: "b" },
      { id: "cB", name: "CB", bellId: "b" },
    ],
    classrooms: [
      { id: "r1", name: "R1", tags: [] },
      { id: "r2", name: "R2", tags: [] },
    ],
    lessons: [
      { id: "lA", subjectId: "sA", periodsPerWeek: 1, classIds: ["cA"], teacherIds: ["tA"] },
      { id: "lB", subjectId: "sB", periodsPerWeek: 1, classIds: ["cB"], teacherIds: ["tB"] },
    ],
  };

  // Control: with no relation the single slot holds both lessons.
  const control = solve({ ...base, relations: [] }, { seed: 1, timeLimitSec: 5 });
  assert.strictEqual(control.stats.placed, 2,
    `control should place both lessons in the one slot, got ${control.stats.placed}`);

  // With an n_2 relation (and NO n_1), the two lessons may not share the slot,
  // so exactly one is placeable. Pre-fix the n_2 check never ran => placed 2.
  const withN2 = solve({ ...base, relations: [{ typ: "n_2", subjectids: ["sA", "sB"] }] },
    { seed: 1, timeLimitSec: 5 });
  assert.strictEqual(withN2.stats.placed, 1,
    `n_2 should forbid sharing the only slot (expect 1 placed), got ${withN2.stats.placed}`);
});

// --- C5 ---------------------------------------------------------------------
test("C5: supervision conflict is detected for a co-teacher, not just teacher[0]", () => {
  const assignment = [
    { lessonId: "L1", day: 0, period: 1, teacherId: "T1", classIds: ["c1"] },
  ];
  const lessonsById = { L1: { id: "L1", subjectId: "s1", teacherIds: ["T1", "T2"] } };
  const school = { classroomsupervisions: [{ teacherid: "T2", day: 0, period: 1 }] };
  // T2 co-teaches L1 at (0,1) and also has hall-duty there => 1 real conflict.
  const r = CKritSluzba(assignment, lessonsById, school);
  assert.strictEqual(r.violations, 1, `expected 1 supervision conflict, got ${r.violations}`);
});

// --- C6 ---------------------------------------------------------------------
test("C6: class-teacher teaching the last period counts despite a co-occurring lesson", () => {
  const assignment = [
    { lessonId: "L1", day: 0, period: 2, teacherId: "CT", classIds: ["c1"] },
    { lessonId: "L2", day: 0, period: 2, teacherId: "X", classIds: ["c1"] },
  ];
  const school = {
    classes: [{ id: "c1", classTeacherId: "CT" }],
    bell: { periods: [{ index: 1, isTeaching: true }, { index: 2, isTeaching: true }] },
  };
  // The class-teacher CT does teach the last period (via L1) => 0 violations.
  // Pre-fix, last-write-wins kept only L2's teacher "X" => false violation.
  const r = CKritTriedny(assignment, {}, school);
  assert.strictEqual(r.violations, 0, `expected 0 violations, got ${r.violations}`);
});

// --- C7 ---------------------------------------------------------------------
test("C7: course-group counts distinct subjects per slot (a duplicate can't mask a gap)", () => {
  const assignment = [
    { lessonId: "L1", day: 0, period: 1, classIds: ["c1"] },
    { lessonId: "L2", day: 0, period: 1, classIds: ["c2"] },
  ];
  const lessonsById = {
    L1: { id: "L1", subjectId: "sA" },
    L2: { id: "L2", subjectId: "sA" },
  };
  const school = { coursegroups: [{ subjectids: ["sA", "sB"] }] };
  // Group {sA,sB}: at slot (0,1) only sA runs (twice), sB is absent => 1 gap.
  // Pre-fix double-counted sA (count 2 == group size) and reported 0.
  const r = CKritCourseGroup(assignment, lessonsById, school);
  assert.strictEqual(r.violations, 1, `expected 1 course-group violation, got ${r.violations}`);
});

// --- C8 ---------------------------------------------------------------------
test("C8: duplicate enrollments for one elective card do not create a phantom conflict", () => {
  const school = {
    students: [{ id: "st1", classId: "c1", firstName: "A", lastName: "B" }],
    studentSubjects: [
      { studentId: "st1", subjectId: "sE" },
      { studentId: "st1", subjectId: "sE" },
    ],
    cards: [{ lessonId: "lE", day: 0, period: 1 }],
    lessons: [{ id: "lE", subjectId: "sE", classIds: [] }],
  };
  // One student, one elective card at (0,1). The two identical enrollments must
  // not be read as a double-booking. Pre-fix pushed the card twice => 1 phantom.
  const out = studentScheduleConflicts(school);
  assert.strictEqual(out.length, 0, `expected 0 conflicts, got ${out.length}: ${JSON.stringify(out)}`);
});

// --- H13 --------------------------------------------------------------------
test("H13: diagnostics aggregate by source lesson id (no expanded '#' ids)", () => {
  // A fixed lesson Z hogs the only slot; the 2-period lesson X then has
  // candidates but cannot place either session => both land in diagnostics.
  const school = {
    schoolName: "H13",
    daysPerWeek: 1,
    bell: { id: "b", name: "b", periods: [{ index: 1, label: "1", duration: 1 }] },
    bells: [{ id: "b", name: "b", periods: [{ index: 1, label: "1", duration: 1 }] }],
    subjects: [{ id: "sX", name: "X" }, { id: "sZ", name: "Z" }],
    teachers: [
      { id: "tX", name: "TX", subjects: ["sX"], timeOff: {} },
      { id: "tZ", name: "TZ", subjects: ["sZ"], timeOff: {} },
    ],
    classes: [{ id: "c1", name: "C1", bellId: "b" }],
    classrooms: [{ id: "r1", name: "R1", tags: [] }],
    lessons: [
      { id: "Z", subjectId: "sZ", periodsPerWeek: 1, classIds: ["c1"], teacherIds: ["tZ"], fixedDay: 0, fixedPeriod: 1 },
      { id: "X", subjectId: "sX", periodsPerWeek: 2, classIds: ["c1"], teacherIds: ["tX"] },
    ],
  };
  const res = solve(school, { seed: 1, timeLimitSec: 5 });
  const diag = res.diagnostics || [];
  // Core invariant: every diagnostic id is a source id, never an expanded "X#1".
  const expanded = diag.filter(d => String(d.lessonId).includes("#"));
  assert.strictEqual(expanded.length, 0,
    `diagnostics must use srcId, found expanded ids: ${JSON.stringify(diag.map(d => d.lessonId))}`);
  // And the multi-session lesson X surfaces as exactly one aggregated row.
  const xRows = diag.filter(d => d.lessonId === "X");
  assert.strictEqual(xRows.length, 1,
    `expected one aggregated row for X, got ${xRows.length} (all: ${JSON.stringify(diag.map(d => d.lessonId))})`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
