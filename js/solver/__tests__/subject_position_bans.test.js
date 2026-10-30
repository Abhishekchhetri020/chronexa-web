// aSc conditions a_32 / a_33 at subject level — "must not start (or end) in
// these periods". Hard rules, enforced in canPlace AND canPlaceSecond (the
// R3 divergence lesson) and in the WASM CP-SAT candidate filter.
import { describe, it, expect } from "vitest";
import { __test_internals } from "../csp_solver.js";
import { FAIL } from "../constraints.js";

const { buildModel, makeState, canPlace } = __test_internals;

const BELL = {
  id: "b8", name: "8-period day",
  periods: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ index: i, label: "P" + i, isTeaching: true })),
};

function school(subject = {}, lessonExtra = {}) {
  return {
    schoolName: "Position bans",
    daysPerWeek: 5, periodsPerDay: 8, bell: BELL, bells: [BELL],
    subjects: [{ id: "games", name: "Games", ...subject }],
    teachers: [{ id: "t1", name: "T1", subjects: ["games"], timeOff: {} }],
    classes: [{ id: "c1", name: "IX A", bellId: "b8" }],
    classrooms: [{ id: "r1", name: "Ground", tags: [] }],
    lessons: [{ id: "l1", subjectId: "games", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 4, ...lessonExtra }],
    relations: [],
    cards: [],
  };
}

/** slot index for (day, period) in this model */
const slotOf = (m, day, period) => day * m.periodsPerDay + period;

describe("subject cannot start in a period (a_32)", () => {
  it("builds a 0-based ban mask from 1-based dialog values", () => {
    const m = buildModel(school({ noStartPeriods: [1, 2] }));
    expect(m.subjectStartBan[0]).toBe(0b00000011); // periods 1 and 2 -> bits 0,1
    expect(m.subjectEndBan[0]).toBe(0);
  });

  it("rejects a placement starting on a banned period, allows the next one", () => {
    const m = buildModel(school({ noStartPeriods: [1] }));
    const st = makeState(m);
    expect(canPlace(m, st, 0, slotOf(m, 0, 0), 0)).toBe(FAIL.POSITION_BANNED);
    expect(canPlace(m, st, 0, slotOf(m, 0, 1), 0)).toBe(null);
  });

  it("also accepts a comma string, the way older files stored it", () => {
    const m = buildModel(school({ noStartPeriods: "1, 2" }));
    expect(m.subjectStartBan[0]).toBe(0b00000011);
  });

  it("stays out of the way when nothing is banned", () => {
    const m = buildModel(school({}));
    expect(m.subjectStartBan[0]).toBe(0);
    const st = makeState(m);
    expect(canPlace(m, st, 0, slotOf(m, 0, 0), 0)).toBe(null);
  });
});

describe("subject cannot end in a period (a_33)", () => {
  it("rejects a single lesson ending on a banned period", () => {
    const m = buildModel(school({ noEndPeriods: [8] }));
    const st = makeState(m);
    expect(canPlace(m, st, 0, slotOf(m, 0, 7), 0)).toBe(FAIL.POSITION_BANNED);
    expect(canPlace(m, st, 0, slotOf(m, 0, 6), 0)).toBe(null);
  });

  it("accounts for the double-lesson span: banning period 8 also bans a double starting at 7", () => {
    const m = buildModel(school({ noEndPeriods: [8] }, { isLabDouble: true, periodsPerWeek: 2 }));
    const st = makeState(m);
    expect(canPlace(m, st, 0, slotOf(m, 0, 6), 0)).toBe(FAIL.POSITION_BANNED); // double at 7-8
    expect(canPlace(m, st, 0, slotOf(m, 0, 5), 0)).toBe(null);                // double at 6-7
  });

  it("combines both bans independently", () => {
    const m = buildModel(school({ noStartPeriods: [1], noEndPeriods: [8] }));
    const st = makeState(m);
    expect(canPlace(m, st, 0, slotOf(m, 0, 0), 0)).toBe(FAIL.POSITION_BANNED);
    expect(canPlace(m, st, 0, slotOf(m, 0, 7), 0)).toBe(FAIL.POSITION_BANNED);
    expect(canPlace(m, st, 0, slotOf(m, 0, 3), 0)).toBe(null);
  });

  it("uses subject.constraints as a fallback, like the other subject limits", () => {
    const m = buildModel(school({ constraints: { noStartPeriods: [1] } }));
    expect(m.subjectStartBan[0]).toBe(1);
  });
});
