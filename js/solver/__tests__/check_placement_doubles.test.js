import { describe, it, expect } from "vitest";
import { checkPlacement } from "../constraints.js";

const BELL = { periods: [1, 2, 3, 4].map((i) => ({ index: i, label: "P" + i, isTeaching: true })) };
const school = (cards) => ({
  bell: BELL, bells: [],
  subjects: [{ id: "s", name: "Activity" }, { id: "m", name: "Maths" }],
  teachers: [{ id: "t1", name: "T1" }, { id: "t2", name: "T2" }],
  classes: [{ id: "c1", name: "III A" }],
  classrooms: [],
  lessons: [
    { id: "D", subjectId: "s", classIds: ["c1"], teacherIds: ["t1"], periodsPerCard: 2, lessonLength: 2 },
    { id: "M", subjectId: "m", classIds: ["c1"], teacherIds: ["t2"], periodsPerCard: 1, lessonLength: 1 },
  ],
  cards,
});

describe("checkPlacement with doubles stored one card per period", () => {
  it("the second half of a double in the last period is not 'no period 5'", () => {
    const s = school([{ lessonId: "D", day: 0, period: 3 }, { lessonId: "D", day: 0, period: 4 }]);
    expect(checkPlacement(s, "D", 0, 4).hard).toEqual([]);
    expect(checkPlacement(s, "D", 0, 3).hard).toEqual([]);
  });

  it("a real clash with one half is still reported", () => {
    const s = school([{ lessonId: "D", day: 0, period: 1 }, { lessonId: "D", day: 0, period: 2 }, { lessonId: "M", day: 0, period: 2 }]);
    expect(checkPlacement(s, "M", 0, 2).hard.join()).toMatch(/already has|III A/);
    expect(checkPlacement(s, "D", 0, 1).hard).toEqual([]);
  });

  it("dropping a double still checks both periods", () => {
    const s = school([{ lessonId: "M", day: 0, period: 2 }]);
    expect(checkPlacement(s, "D", 0, 1).hard.length).toBeGreaterThan(0);
    expect(checkPlacement(s, "D", 0, 4).hard.join()).toMatch(/no period 5/);
  });

  it("a legacy single-card double still covers its second period", () => {
    const s = school([{ lessonId: "D", day: 0, period: 1 }]);
    expect(checkPlacement(s, "M", 0, 2).hard.length).toBeGreaterThan(0);
  });
});
