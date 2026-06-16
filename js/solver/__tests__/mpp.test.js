const assert = require("node:assert");
const path = require("path");
const test = require("node:test");
const { solve } = require(path.join(__dirname, "..", "csp_solver.js"));

function bell(n) {
  const periods = [];
  for (let i = 1; i <= n; i++) periods.push({ index: i, label: String(i), duration: 1 });
  return { id: "b", name: "b", periods };
}

function baseSchool() {
  return {
    schoolName: "mpp",
    daysPerWeek: 1,
    bell: bell(4),
    bells: [bell(4)],
    subjects: [
      { id: "sA", name: "A" },
      { id: "sB", name: "B" },
      { id: "sC", name: "C" },
    ],
    teachers: [
      { id: "tA", name: "TA", subjects: ["sA"], timeOff: {} },
      { id: "tB", name: "TB", subjects: ["sB"], timeOff: {} },
      { id: "tC", name: "TC", subjects: ["sC"], timeOff: {} },
    ],
    classes: [{ id: "cA", name: "CA", bellId: "b" }],
    classrooms: [{ id: "r1", name: "R1", tags: [] }],
    lessons: [
      { id: "lA", subjectId: "sA", periodsPerWeek: 1, classIds: ["cA"], teacherIds: ["tA"], preferredRoomId: "r1" },
      { id: "lB", subjectId: "sB", periodsPerWeek: 1, classIds: ["cA"], teacherIds: ["tB"], preferredRoomId: "r1" },
      { id: "lC", subjectId: "sC", periodsPerWeek: 1, classIds: ["cA"], teacherIds: ["tC"], preferredRoomId: "r1" },
    ],
    relations: [],
  };
}

function cardFromAssignment(a) {
  return {
    lessonId: a.lessonId,
    day: a.day,
    period: a.period,
    classroomId: a.classroomId || null,
  };
}

function placementMap(cards) {
  return new Map(cards.map(c => [c.lessonId, {
    day: c.day,
    period: c.period,
    classroomId: c.classroomId || null,
  }]));
}

test("MPP: only the disrupted lesson moves and perturbation is counted", () => {
  const school = baseSchool();
  const first = solve(school, { seed: 7, timeLimitSec: 5, disableLearning: true });
  assert.strictEqual(first.status, "FEASIBLE");
  assert.strictEqual(first.stats.placed, 3);

  const baseCards = first.assignment.map(cardFromAssignment);
  const disruptedLessonId = "lA";
  const disruptedBase = baseCards.find(c => c.lessonId === disruptedLessonId);
  assert.ok(disruptedBase, "base solve must place the disrupted lesson");

  school.cards = baseCards;
  school.teachers.find(t => t.id === "tA").timeOff = {
    [`${disruptedBase.day}_${disruptedBase.period}`]: "unavailable",
  };

  const mpp = solve(school, {
    mode: "mpp",
    disruptedLessonIds: [disruptedLessonId],
    seed: 7,
    timeLimitSec: 5,
    disableLearning: true,
  });

  assert.strictEqual(mpp.status, "FEASIBLE");
  const before = placementMap(baseCards);
  const after = placementMap(mpp.assignment);

  for (const [lessonId, expected] of before.entries()) {
    if (lessonId === disruptedLessonId) continue;
    assert.deepStrictEqual(after.get(lessonId), expected, `${lessonId} must stay exactly pinned`);
  }

  const disruptedAfter = after.get(disruptedLessonId);
  assert.ok(disruptedAfter, "disrupted lesson must be placed");
  assert.notDeepStrictEqual(disruptedAfter, before.get(disruptedLessonId),
    "test setup must force the disrupted lesson to a new placement");
  assert.strictEqual(mpp.stats.perturbation, 1);
});
