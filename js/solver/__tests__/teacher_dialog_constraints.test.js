import { describe, it, expect } from "vitest";
import { __test_internals } from "../csp_solver.js";

const { buildModel, makeState, softScore } = __test_internals;

const BELL7 = {
  id: "b7",
  name: "7-period day",
  periods: [1, 2, 3, 4, 5, 6, 7].map((i) => ({ index: i, label: "P" + i, isTeaching: true })),
};

function school(teacherConstraints, teacherTop = {}) {
  return {
    schoolName: "Dialog keys",
    daysPerWeek: 6,
    periodsPerDay: 7,
    bell: BELL7,
    bells: [BELL7],
    subjects: [{ id: "s1", name: "English" }],
    teachers: [{ id: "t1", name: "T1", subjects: ["s1"], timeOff: {}, constraints: teacherConstraints, ...teacherTop }],
    classes: [{ id: "c1", name: "C1", bellId: "b7" }],
    classrooms: [{ id: "r1", name: "R1", tags: [] }],
    lessons: [{ id: "l1", subjectId: "s1", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 4, isLabDouble: false }],
    relations: [],
    cards: [],
  };
}

describe("teacher Constraints dialog keys reach the solver model", () => {
  it("maps teachers_maxgapsday / maxconsecutive / lessonsPerDayMax / maxgapsweek", () => {
    const m = buildModel(school({
      teachers_maxgapsday: 1,
      teachers_maxconsecutiveperiods: 3,
      lessonsPerDayMax: 5,
      teachers_maxgapsweek: 4,
    }));
    expect(m.teacherMaxGapsPerDay[0]).toBe(1);
    expect(m.teacherMaxConsec[0]).toBe(3);
    expect(m.teacherMaxPerDay[0]).toBe(5);
    expect(m.teacherMaxGapsPerWeek[0]).toBe(4);
  });

  it("top-level edit-sheet fields still win over dialog keys", () => {
    const m = buildModel(school({ teachers_maxgapsday: 1 }, { maxGapsPerDay: 2 }));
    expect(m.teacherMaxGapsPerDay[0]).toBe(2);
  });

  it("'*' (unlimited) and missing keys stay unlimited", () => {
    const m = buildModel(school({ teachers_maxgapsday: "*" }));
    expect(m.teacherMaxGapsPerDay[0]).toBe(-1);
    expect(m.teacherMaxGapsPerWeek[0]).toBe(-1);
    expect(m.teacherIntervalMaxDays[0]).toBe(null);
  });

  it("maxDaysPerWeek becomes a whole-day interval limit", () => {
    const m = buildModel(school({ maxDaysPerWeek: 4 }));
    expect(m.teacherIntervalMaxDays[0]).toEqual({ fromPeriod: 0, toPeriod: 6, maxDays: 4 });
  });

  it("a gap above the per-day cap raises the soft score", () => {
    const base = school({});
    const capped = school({ teachers_maxgapsday: 0 });
    const score = (sch) => {
      const m = buildModel(sch);
      const st = makeState(m);
      st.teacherDayGap[0] = 2; // two free periods inside day 0
      st._scoreDirty = true;
      return softScore(m, st);
    };
    expect(score(capped)).toBeGreaterThan(score(base));
  });
});
