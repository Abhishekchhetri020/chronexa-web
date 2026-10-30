// aSc condition a_16 ("Min cards on one period") and the Class Constraints
// dialog's per-day floor/ceiling, wired rather than decorative
// (Round 4 backlog: class minperiodsday/maxperiodsday were no-ops).
import { describe, it, expect } from "vitest";
import { __test_internals } from "../csp_solver.js";

const { buildModel, makeState, subjectParallelPenalty, classMinPerDayPenalty } = __test_internals;

const BELL = {
  id: "b6", name: "6-period day",
  periods: [1, 2, 3, 4, 5, 6].map((i) => ({ index: i, label: "P" + i, isTeaching: true })),
};

function twoClassSchool(subjectExtra = {}, classExtra = {}) {
  return {
    schoolName: "Period limits",
    daysPerWeek: 5, periodsPerDay: 6, bell: BELL, bells: [BELL],
    subjects: [
      { id: "games", name: "Games", ...subjectExtra },
      { id: "math", name: "Maths" },
    ],
    teachers: [
      { id: "t1", name: "T1", subjects: ["games"], timeOff: {} },
      { id: "t2", name: "T2", subjects: ["games"], timeOff: {} },
      { id: "t3", name: "T3", subjects: ["math"], timeOff: {} },
    ],
    classes: [
      { id: "cA", name: "IX A", bellId: "b6", constraints: classExtra },
      { id: "cB", name: "IX B", bellId: "b6" },
    ],
    classrooms: [{ id: "r1", name: "Ground", tags: [] }],
    lessons: [
      { id: "lA", subjectId: "games", teacherIds: ["t1"], classIds: ["cA"], periodsPerWeek: 2 },
      { id: "lB", subjectId: "games", teacherIds: ["t2"], classIds: ["cB"], periodsPerWeek: 2 },
      { id: "lC", subjectId: "math", teacherIds: ["t3"], classIds: ["cA"], periodsPerWeek: 4 },
    ],
    relations: [],
    cards: [],
  };
}

/** Mark lesson i as placed at (day, period) so the scorers see a placement. */
function place(model, state, lessonIdx, day, period) {
  const slot = day * model.periodsPerDay + period;
  state.lessonAssigned[lessonIdx] = 1;
  state.lessonAssignedSlot[lessonIdx] = slot;
  return slot;
}

describe("subject min/max cards on one period", () => {
  it("builds both limit arrays from the subject", () => {
    const m = buildModel(twoClassSchool({ maxParallel: 2, minParallel: 2 }));
    expect(m.subjectMaxParallel[0]).toBe(2);
    expect(m.subjectMinParallel[0]).toBe(2);
    const plain = buildModel(twoClassSchool({}));
    expect(plain.subjectMaxParallel[0]).toBe(-1);
    expect(plain.subjectMinParallel[0]).toBe(-1);
  });

  it("reads the limits from subject.constraints too", () => {
    const m = buildModel(twoClassSchool({ constraints: { maxParallel: 3, minParallel: 2 } }));
    expect(m.subjectMaxParallel[0]).toBe(3);
    expect(m.subjectMinParallel[0]).toBe(2);
  });

  it("penalises a slot that exceeds maxParallel", () => {
    const m = buildModel(twoClassSchool({ maxParallel: 1 }));
    const st = makeState(m);
    // Both Games lessons of week 1 sit on Monday period 1.
    place(m, st, 0, 0, 0);
    place(m, st, 1, 0, 0);
    expect(subjectParallelPenalty(m, st)).toBeGreaterThan(0);
  });

  it("penalises a week where the subject never lines up to minParallel", () => {
    const m = buildModel(twoClassSchool({ minParallel: 2 }));
    const st = makeState(m);
    // Two Games cards, in different periods every day: never 2 in one slot.
    place(m, st, 0, 0, 0);
    place(m, st, 1, 1, 1);
    const apart = subjectParallelPenalty(m, st);

    const st2 = makeState(m);
    place(m, st2, 0, 0, 0);
    place(m, st2, 1, 0, 0); // same period same day -> the batch lines up
    const together = subjectParallelPenalty(m, st2);

    expect(apart).toBeGreaterThan(0);
    expect(together).toBe(0);
  });

  it("does not penalise subjects without limits", () => {
    const m = buildModel(twoClassSchool({}));
    const st = makeState(m);
    place(m, st, 0, 0, 0);
    place(m, st, 1, 0, 0);
    expect(subjectParallelPenalty(m, st)).toBe(0);
  });
});

describe("class per-day floor and ceiling from the Constraints dialog", () => {
  it("maps maxperiodsday to the class day cap", () => {
    const m = buildModel(twoClassSchool({}, { maxperiodsday: 5 }));
    expect(m.classMaxPerDay[0]).toBe(5);
  });

  it("maps minperiodsday to the class day floor", () => {
    const m = buildModel(twoClassSchool({}, { minperiodsday: 3 }));
    expect(m.classMinPerDay[0]).toBe(3);
    expect(m.classMinPerDay[1]).toBe(-1); // other class untouched
  });

  it("top-level class fields win and '*' stays unlimited", () => {
    const m = buildModel({
      ...twoClassSchool({}, { maxperiodsday: 5, minperiodsday: 3 }),
      classes: [
        { id: "cA", name: "IX A", bellId: "b6", maxPerDay: 4, minPerDay: 2, constraints: { maxperiodsday: 5, minperiodsday: 3 } },
        { id: "cB", name: "IX B", bellId: "b6", constraints: { minperiodsday: "*" } },
      ],
    });
    expect(m.classMaxPerDay[0]).toBe(4);
    expect(m.classMinPerDay[0]).toBe(2);
    expect(m.classMinPerDay[1]).toBe(-1);
  });

  it("penalises a busy-but-thin day and ignores an empty one", () => {
    const m = buildModel(twoClassSchool({}, { minperiodsday: 3 }));
    const st = makeState(m);
    // Class A gets one lesson on Monday -> below the floor of 3.
    place(m, st, 0, 0, 0);
    expect(classMinPerDayPenalty(m, st)).toBeGreaterThan(0);

    // Nothing placed at all: an empty day is not a violation.
    const empty = makeState(m);
    expect(classMinPerDayPenalty(m, empty)).toBe(0);
  });

  it("is quiet when no class sets a floor", () => {
    const m = buildModel(twoClassSchool({}, {}));
    const st = makeState(m);
    place(m, st, 0, 0, 0);
    expect(classMinPerDayPenalty(m, st)).toBe(0);
  });
});
