import { describe, it, expect } from "vitest";
import { solve, __test_internals } from "../csp_solver.js";
import { FAIL } from "../constraints.js";

const BELL7 = {
  id: "b7",
  name: "7-period day",
  periods: [1, 2, 3, 4, 5, 6, 7].map((i) => ({
    index: i,
    label: "P" + i,
    isTeaching: true,
  })),
};

function create6DaySchool(extra = {}) {
  return {
    schoolName: "Balance & Locks Test School",
    daysPerWeek: 6,
    periodsPerDay: 7,
    bell: BELL7,
    bells: [BELL7],
    subjects: [
      { id: "s_eng", name: "English" },
      { id: "s_math", name: "Math" },
    ],
    teachers: [
      { id: "t1", name: "Mr. Smith", subjects: ["s_eng"], timeOff: {} },
      { id: "t2", name: "Ms. Davis", subjects: ["s_math"], timeOff: {} },
    ],
    classes: [
      { id: "c1", name: "Grade 5", bellId: "b7" },
    ],
    classrooms: [
      { id: "r1", name: "Room 101", tags: [] },
    ],
    lessons: [
      {
        id: "l_eng",
        subjectId: "s_eng",
        teacherIds: ["t1"],
        classIds: ["c1"],
        periodsPerWeek: 8,
        isLabDouble: false,
      },
      {
        id: "l_math",
        subjectId: "s_math",
        teacherIds: ["t2"],
        classIds: ["c1"],
        periodsPerWeek: 6,
        isLabDouble: false,
      },
    ],
    relations: [],
    cards: [],
    ...extra,
  };
}

describe("Timetable Balance & Spread Across Days", () => {
  it("spreads 8 English periods across a 6-day week with at least 1 on every day (1+1+1+1+2+2)", () => {
    const school = create6DaySchool();
    const result = solve(school, { timeLimitSec: 2, seed: 42 });

    expect(result.stats.placed).toBe(14);
    const assignment = result.assignment || [];

    const engCards = assignment.filter((a) => a.lessonId === "l_eng" || a.lessonId?.startsWith("l_eng#"));
    expect(engCards.length).toBe(8);

    const dayCounts = [0, 0, 0, 0, 0, 0];
    for (const c of engCards) {
      dayCounts[c.day]++;
    }

    // Every single day (0 to 5) must have at least 1 English period!
    for (let d = 0; d < 6; d++) {
      expect(dayCounts[d]).toBeGreaterThanOrEqual(1);
      expect(dayCounts[d]).toBeLessThanOrEqual(2);
    }

    // Exactly 2 days have 2 periods, and 4 days have 1 period
    const countsSorted = [...dayCounts].sort();
    expect(countsSorted).toEqual([1, 1, 1, 1, 2, 2]);
  });
});

describe("Locked Cards Preservation", () => {
  it("keeps locked cards at their assigned day and period during generate", () => {
    const school = create6DaySchool({
      cards: [
        {
          lessonId: "l_eng",
          day: 2,
          period: 4,
          locked: true,
        },
        {
          lessonId: "l_eng",
          day: 4,
          period: 1,
          locked: true,
        },
      ],
    });

    const result = solve(school, { timeLimitSec: 2, seed: 123 });
    expect(result.stats.placed).toBe(14);

    const engCards = result.assignment.filter((a) => a.lessonId === "l_eng" || a.lessonId?.startsWith("l_eng#"));
    expect(engCards.length).toBe(8);

    // Verify the locked positions are occupied by English cards
    const cardAt2_4 = engCards.find((c) => c.day === 2 && c.period === 4);
    expect(cardAt2_4).toBeDefined();

    const cardAt4_1 = engCards.find((c) => c.day === 4 && c.period === 1);
    expect(cardAt4_1).toBeDefined();
  });
});

describe("Locked / Blocked Days Exclusion", () => {
  it("forbids card placement on locked/blocked days", () => {
    // School with Day 5 (e.g. Saturday) locked
    const school = create6DaySchool({
      lockedDays: [5],
      lessons: [
        {
          id: "l_eng",
          subjectId: "s_eng",
          teacherIds: ["t1"],
          classIds: ["c1"],
          periodsPerWeek: 5,
          isLabDouble: false,
        },
      ],
    });

    const result = solve(school, { timeLimitSec: 2, seed: 42 });
    expect(result.stats.placed).toBe(5);

    // No card should be placed on day 5
    for (const card of result.assignment) {
      expect(card.day).not.toBe(5);
    }
  });

  it("returns DAY_LOCKED constraint failure if attempting to place on locked day", () => {
    const school = create6DaySchool({
      lockedDays: [3],
    });

    const model = __test_internals.buildModel(school);
    const state = __test_internals.makeState(model);

    // Find a slot on day 3
    let slotOnDay3 = -1;
    for (let s = 0; s < model.slotDay.length; s++) {
      if (model.slotDay[s] === 3) {
        slotOnDay3 = s;
        break;
      }
    }
    expect(slotOnDay3).toBeGreaterThanOrEqual(0);

    // Check placement on day 3 for an unlocked lesson
    const canPlaceResult = __test_internals.canPlace(model, state, 0, slotOnDay3, -1);
    expect(canPlaceResult).toBe(FAIL.DAY_LOCKED);
  });
});
