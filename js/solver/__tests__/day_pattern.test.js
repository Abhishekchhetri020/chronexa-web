// aSc daysdefid — a lesson's DAY PATTERN restricts which weekdays it may use.
//
// The lesson dialog has carried "Day pattern" since Wave 1, and the value was
// saved (l.daysDefId), exported to XML (daysdefid=…) and printed in the Lessons
// table — but neither solver read it, so a "Monday only" lesson was timetabled
// on any day and nobody noticed until the field was actually exercised (B2).
//
// Semantics: aSc packs the pattern as one bit per weekday; comma-separated
// groups ("100000,010000" — "Any day") are combined, so the union of the bits is
// the allowed set. An absent/unknown pattern, or one with no bits, means "no
// restriction" — fail open, never refuse to place work nobody restricted.
import { describe, it, expect } from "vitest";
import { solve, __test_internals } from "../csp_solver.js";
import { FAIL } from "../constraints.js";

const { buildModel, makeState, canPlace } = __test_internals;

const BELL = {
  id: "b8",
  name: "8-period day",
  periods: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ index: i, label: "P" + i, isTeaching: true })),
};

const DAYS = {
  mo: { id: "d-mo", name: "Monday", short: "Mo", bits: "100000" },
  tu: { id: "d-tu", name: "Tuesday", short: "Tu", bits: "010000" },
  any: { id: "d-any", name: "Any day", short: "X", bits: "100000,010000,001000,000100,000010" },
  every: { id: "d-every", name: "Every day", short: "E", bits: "111111" },
  empty: { id: "d-empty", name: "Broken", short: "?", bits: "" },
};

function school({ daysDefs = Object.values(DAYS), lesson = {}, cards = [] } = {}) {
  return {
    schoolName: "Day pattern",
    daysPerWeek: 5,
    periodsPerDay: 8,
    bell: BELL,
    bells: [BELL],
    daysDefs,
    subjects: [{ id: "s1", name: "Maths", abbr: "MAT" }],
    teachers: [{ id: "t1", name: "T1", abbr: "T1", subjects: ["s1"], timeOff: {} }],
    classes: [{ id: "c1", name: "IX A", bellId: "b8" }],
    classrooms: [{ id: "r1", name: "R1", tags: [] }],
    lessons: [
      {
        id: "l1",
        subjectId: "s1",
        teacherIds: ["t1"],
        classIds: ["c1"],
        periodsPerWeek: 4,
        ...lesson,
      },
    ],
    relations: [],
    cards,
  };
}

const slotOf = (m, day, period) => day * m.periodsPerDay + period;
/** Weekdays the solver actually used, from the returned assignment. */
const placedDays = (result) =>
  (result.assignment || []).map((a) => a.day).filter((d) => Number.isFinite(d));

describe("day pattern builds a weekday mask", () => {
  it("reads aSc bit strings, including combined day groups", () => {
    const m = buildModel(school({ lesson: { daysDefId: "d-mo" } }));
    expect(m.lessonAllowedDays[0]).toBe(0b000001);

    const any = buildModel(school({ lesson: { daysDefId: "d-any" } }));
    expect(any.lessonAllowedDays[0]).toBe(0b011111); // Mon–Fri

    const every = buildModel(school({ lesson: { daysDefId: "d-every" } }));
    expect(every.lessonAllowedDays[0]).toBe(0b111111);
  });

  it("fails open: no pattern, an unknown id, or empty bits means any day", () => {
    for (const daysDefId of [undefined, "does-not-exist", "d-empty"]) {
      const m = buildModel(school({ lesson: { daysDefId } }));
      expect(m.lessonAllowedDays[0]).toBe(0);
    }
  });

  it("leaves unrelated lessons unrestricted", () => {
    const s = school({ lesson: { daysDefId: "d-mo", periodsPerWeek: 4 } });
    s.lessons.push({
      id: "l2",
      subjectId: "s1",
      teacherIds: ["t1"],
      classIds: ["c1"],
      periodsPerWeek: 1,
    });
    const m = buildModel(s);
    // One model row per SESSION: l1 expands to 4 rows (l1#1..#4), then l2.
    m.lessons.forEach((row, i) => {
      const srcId = String(row.srcId || row.id).replace(/#\d+$/, "");
      expect([srcId, m.lessonAllowedDays[i]]).toEqual([srcId, srcId === "l1" ? 0b000001 : 0]);
    });
  });
});

describe("canPlace honours the day pattern (hard)", () => {
  it("refuses a day outside the pattern and allows one inside it", () => {
    const m = buildModel(school({ lesson: { daysDefId: "d-mo" } }));
    const st = makeState(m);
    expect(canPlace(m, st, 0, slotOf(m, 1, 0), 0)).toBe(FAIL.DAY_PATTERN_BANNED); // Tuesday
    expect(canPlace(m, st, 0, slotOf(m, 3, 0), 0)).toBe(FAIL.DAY_PATTERN_BANNED); // Thursday
    expect(canPlace(m, st, 0, slotOf(m, 0, 0), 0)).toBe(null);                    // Monday
  });

  it("does not restrict a lesson without a pattern", () => {
    const m = buildModel(school());
    const st = makeState(m);
    for (let d = 0; d < 5; d++) expect(canPlace(m, st, 0, slotOf(m, d, 0), 0)).toBe(null);
  });

  it("the FAIL code has a human-readable name", () => {
    expect(FAIL.DAY_PATTERN_BANNED).toBe(36);
  });
});

describe("a full solve obeys the pattern", () => {
  it("places every period of a Monday-only lesson on Monday", () => {
    const s = school({ lesson: { daysDefId: "d-mo", periodsPerWeek: 4 } });
    const res = solve(s, { timeLimitSec: 3, seed: 7 });
    const days = placedDays(res);
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) expect(d).toBe(0);
  });

  it("still places EVERY period when the pattern leaves one usable day", () => {
    // A day pattern must not manufacture a capacity failure: 6 sessions on a
    // Monday-only pattern all belong on Monday, and the spread cap has to
    // follow the usable week (the cloud CP-SAT needed the same fix).
    const s = school({ lesson: { daysDefId: "d-mo", periodsPerWeek: 6 } });
    const res = solve(s, { timeLimitSec: 3, seed: 11 });
    expect(res.assignment.length).toBe(6);
    for (const d of placedDays(res)) expect(d).toBe(0);
  });

  it("places a two-day pattern inside those two days only", () => {
    const s = school({ lesson: { daysDefId: "d-any", periodsPerWeek: 4 } });
    const res = solve(s, { timeLimitSec: 3, seed: 7 });
    const days = placedDays(res);
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) expect(d).toBeLessThanOrEqual(4);
  });
});
