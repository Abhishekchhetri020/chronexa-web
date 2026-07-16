// Regression tests for the verified-real subset of the opencode bug report
// dated 2026-07-16 (22 findings; ~9 confirmed against source, rest were
// misdiagnosed or already fixed). Each block is fail-before / pass-after.
//
//   R1  improve_mode.js       locally-improving swaps that raise the GLOBAL
//                             score are now rolled back (never net-worse).
//   R3  relation_enforcer.js  sameDay (n_1/n_8/n_10/n_11) no longer matches
//                             the candidate's own cards; binary typs match
//                             the other side of the relation.
//   R4  relation_enforcer.js  consecutiveOrdered (n_6) enforces the positive
//                             "B must be at period+1" direction, both sides.
//   R5  relation_enforcer.js  simultaneous (n_12/n_13) only compares
//                             same-day siblings (multi-occurrence lessons).
//   R6  constraints.js        CKritSluzba marks every period of a multi-
//                             period card, not just the start.
//   R10 constraints.js        validateSupervisionCriteria: day==null rows
//                             no longer aggregate into a "?" pseudo-day.
//   R13 relation_enforcer.js  distribution (n_4) hint is scoped to the
//                             candidate's day.
//   R14 relation_enforcer.js  position/afternoon (n_16/n_17) use 1-based
//                             bell period indexes, not array positions.
//   R15 relation_enforcer.js  betweenBreaks (n_7) selects the between
//                             periods by index value, not array slice.
//   R22 constraints.js        CKritTriedny counts a double ending at the
//                             last period as occupying it.

import { describe, it, expect, beforeEach } from "vitest";
import { check } from "../relation_enforcer.js";
import {
  CKritSluzba, CKritTriedny, validateSupervisionCriteria,
} from "../constraints.js";
import "../improve_mode.js";

const BELL8 = {
  periods: [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({
    index: i, label: "P" + i, isTeaching: true,
  })),
};

function mkSchool({ lessons, cards, relations, bell = BELL8, settings }) {
  return { lessons, cards, relations, bell, settings };
}

describe("R3 sameDay excludes the candidate's own cards", () => {
  const lessons = [
    { id: "L1", subjectId: "S1", classIds: ["C1"] },
    { id: "L2", subjectId: "S1", classIds: ["C2"] },
  ];
  const rel = { typ: "n_1", subjectids: ["S1"] };

  it("re-checking a placed card at its own slot is clean", () => {
    const school = mkSchool({
      lessons, relations: [rel],
      cards: [{ lessonId: "L1", day: 0, period: 1 }],
    });
    const r = check(school, "L1", 0, 1);
    expect(r.hard).toEqual([]);
  });

  it("a DIFFERENT matched lesson on the same day still violates n_1", () => {
    const school = mkSchool({
      lessons, relations: [rel],
      cards: [{ lessonId: "L2", day: 0, period: 3 }],
    });
    const r = check(school, "L1", 0, 1);
    expect(r.hard.length).toBe(1);
  });

  it("binary n_8 (must be same day) is no longer masked", () => {
    // Placing the SECONDARY subject on a different day than the placed
    // primary must flag. Old matcher compared B against other B cards only.
    const school = mkSchool({
      lessons: [
        { id: "LA", subjectId: "SA", classIds: ["C1"] },
        { id: "LB", subjectId: "SB", classIds: ["C1"] },
      ],
      relations: [{ typ: "n_8", subjectids: ["SA"], subject2ids: ["SB"] }],
      cards: [{ lessonId: "LA", day: 0, period: 1 }],
    });
    expect(check(school, "LB", 1, 1).hard.length).toBe(1);
    expect(check(school, "LB", 0, 2).hard).toEqual([]);
  });
});

describe("R4 consecutiveOrdered enforces the positive direction", () => {
  const lessons = [
    { id: "LA", subjectId: "SA", classIds: ["C1"] },
    { id: "LB", subjectId: "SB", classIds: ["C1"] },
  ];
  const rel = { typ: "n_6", subjectids: ["SA"], subject2ids: ["SB"] };

  it("placing A with B elsewhere on the day (not period+1) violates", () => {
    const school = mkSchool({
      lessons, relations: [rel],
      cards: [{ lessonId: "LB", day: 0, period: 3 }],
    });
    expect(check(school, "LA", 0, 5).hard.length).toBe(1); // B not at P6
    expect(check(school, "LA", 0, 2).hard).toEqual([]);    // B at P3 = period+1
  });

  it("placing B checks that A sits in the previous period", () => {
    const school = mkSchool({
      lessons, relations: [rel],
      cards: [{ lessonId: "LA", day: 0, period: 1 }],
    });
    expect(check(school, "LB", 0, 2).hard).toEqual([]);    // A at P1 = period-1
    expect(check(school, "LB", 0, 4).hard.length).toBe(1); // A not at P3
  });
});

describe("R5 simultaneous compares same-day siblings only", () => {
  const lessons = [
    { id: "L1", subjectId: "S1", classIds: ["C1"] },
    { id: "L2", subjectId: "S1", classIds: ["C2"] },
  ];
  const rel = { typ: "n_12", subjectids: ["S1"] };

  it("cross-day occurrence at another period is NOT a conflict", () => {
    const school = mkSchool({
      lessons, relations: [rel],
      cards: [{ lessonId: "L1", day: 0, period: 2 }],
    });
    expect(check(school, "L2", 1, 4).hard).toEqual([]);
  });

  it("same-day different period IS a conflict", () => {
    const school = mkSchool({
      lessons, relations: [rel],
      cards: [{ lessonId: "L1", day: 0, period: 2 }],
    });
    expect(check(school, "L2", 0, 4).hard.length).toBe(1);
  });
});

describe("R13 distribution hint is scoped to the candidate's day", () => {
  const lessons = [
    { id: "L1", subjectId: "S1", classIds: ["C1"] },
    { id: "L2", subjectId: "S1", classIds: ["C1"] },
    { id: "L3", subjectId: "S1", classIds: ["C1"] },
  ];
  const rel = { typ: "n_4", subjectids: ["S1"] };
  const cards = [
    { lessonId: "L1", day: 0, period: 1 },
    { lessonId: "L2", day: 0, period: 3 },
  ];

  it("placing on a light day is clean even when another day is heavy", () => {
    const school = mkSchool({ lessons, relations: [rel], cards });
    expect(check(school, "L3", 1, 1).soft).toEqual([]);
  });

  it("placing on the heavy day gets the hint", () => {
    const school = mkSchool({ lessons, relations: [rel], cards });
    expect(check(school, "L3", 0, 5).soft.length).toBe(1);
  });
});

describe("R14 position/afternoon use 1-based bell indexes", () => {
  const lessons = [{ id: "L1", subjectId: "S1", classIds: ["C1"] }];

  it("n_16 first accepts period 1 and rejects period 2", () => {
    const school = mkSchool({
      lessons, cards: [],
      relations: [{ typ: "n_16", subjectids: ["S1"], positions: "first" }],
    });
    expect(check(school, "L1", 0, 1).hard).toEqual([]);
    expect(check(school, "L1", 0, 2).hard.length).toBe(1);
  });

  it("n_16 last accepts period 8 and rejects period 7", () => {
    const school = mkSchool({
      lessons, cards: [],
      relations: [{ typ: "n_16", subjectids: ["S1"], positions: "last" }],
    });
    expect(check(school, "L1", 0, 8).hard).toEqual([]);
    expect(check(school, "L1", 0, 7).hard.length).toBe(1);
  });

  it("n_17 afternoon respects settings.afternoonStartsAt", () => {
    const school = mkSchool({
      lessons, cards: [],
      relations: [{ typ: "n_17", subjectids: ["S1"] }],
      settings: { afternoonStartsAt: 5 },
    });
    expect(check(school, "L1", 0, 4).soft.length).toBe(1);
    expect(check(school, "L1", 0, 5).soft).toEqual([]);
  });
});

describe("R15 betweenBreaks selects periods by index value", () => {
  const bell = {
    periods: [1, 2, 3, 4, 5].map(i => ({
      index: i, label: "P" + i, isTeaching: i !== 4,
    })),
  };
  const lessons = [
    { id: "L1", subjectId: "S1", classIds: ["C1"] },
    { id: "L2", subjectId: "S1", classIds: ["C1"] },
  ];
  const rel = { typ: "n_7", subjectids: ["S1"] };

  it("break period 4 between P3 and P5 siblings violates", () => {
    const school = mkSchool({
      lessons, bell, relations: [rel],
      cards: [{ lessonId: "L1", day: 0, period: 3 }],
    });
    expect(check(school, "L2", 0, 5).hard.length).toBe(1);
  });

  it("adjacent P2/P3 siblings are clean", () => {
    const school = mkSchool({
      lessons, bell, relations: [rel],
      cards: [{ lessonId: "L1", day: 0, period: 3 }],
    });
    expect(check(school, "L2", 0, 2).hard).toEqual([]);
  });
});

describe("R6/R22 multi-period cards occupy every period", () => {
  const lessons = new Map([
    ["L1", { id: "L1", subjectId: "S1", teacherIds: ["T1"],
             classIds: ["C1"], isLabDouble: true }],
  ]);

  it("CKritSluzba catches a supervision on the double's second half", () => {
    const r = CKritSluzba(
      [{ lessonId: "L1", day: 0, period: 3, teacherId: "T1", classIds: ["C1"] }],
      lessons,
      { classroomsupervisions: [{ teacherid: "T1", day: 0, period: 4 }] },
    );
    expect(r.violations).toBe(1);
  });

  it("CKritTriedny credits a double ENDING at the last period", () => {
    const schoolData = {
      classes: [{ id: "C1", name: "C1", classTeacherId: "T1" }],
      bell: BELL8,
    };
    // Double at P7 occupies P7+P8; class-teacher IS in the last period.
    const ok = CKritTriedny(
      [{ lessonId: "L1", day: 0, period: 7, teacherId: "T1", classIds: ["C1"] }],
      lessons, schoolData,
    );
    expect(ok.violations).toBe(0);
  });
});

describe("R10 supervision rows without a day skip the per-day limit", () => {
  it("three draft rows don't fake a daily-limit violation but count weekly", () => {
    const school = {
      teachers: [{ id: "T1", name: "T1" }],
      settings: { supervisionCriteria: { maxPerTeacherPerDay: 2, maxPerTeacherPerWeek: 2 } },
      classroomsupervisions: [
        { id: "s1", teacherid: "T1", day: null, period: 3 },
        { id: "s2", teacherid: "T1", day: null, period: 4 },
        { id: "s3", teacherid: "T1", day: null, period: 5 },
      ],
      bell: BELL8,
    };
    const out = validateSupervisionCriteria(school);
    expect(out.some(v => v.description.includes("on day"))).toBe(false);
    expect(out.some(v => v.description.includes("/ week"))).toBe(true);
  });
});

describe("R1 ImproveMode never returns a net-worse timetable", () => {
  let school;
  beforeEach(() => {
    // Rigged scorer: swapping A and B lowers THEIR combined penalty to 0
    // but pushes card C's penalty to 100 (global regression). Every other
    // swap keeps C at 100, so the run must roll back to the start state.
    const lessons = [
      { id: "A", subjectId: "S1", classIds: ["C1"], teacherIds: [] },
      { id: "B", subjectId: "S2", classIds: ["C1"], teacherIds: [] },
      { id: "C", subjectId: "S3", classIds: ["C1"], teacherIds: [] },
    ];
    school = {
      lessons, relations: [],
      cards: [
        { lessonId: "A", day: 0, period: 1 },
        { lessonId: "B", day: 1, period: 1 },
        { lessonId: "C", day: 2, period: 1 },
      ],
    };
    window.SolverConstraints = {
      checkPlacement(s, lessonId, day) {
        const soft = [];
        if (lessonId === "A" && day === 0) soft.push("a0", "a0b"); // 10
        if (lessonId === "B" && day === 1) soft.push("b1", "b1b"); // 10
        const hard = [];
        if (lessonId === "C") {
          const a = s.cards.find(c => c.lessonId === "A");
          if (a && a.day !== 0) hard.push("c-broken"); // 100 once A moves
        }
        return { hard, soft };
      },
    };
  });

  it("rolls back locally-improving swaps that raise the global score", () => {
    const res = window.ImproveMode.run(school, { timeLimitSec: 5 });
    expect(res.after).toBeLessThanOrEqual(res.before);
    expect(res.status).toBe("NO_IMPROVEMENT");
    const a = school.cards.find(c => c.lessonId === "A");
    const b = school.cards.find(c => c.lessonId === "B");
    expect([a.day, a.period]).toEqual([0, 1]);
    expect([b.day, b.period]).toEqual([1, 1]);
  });
});
