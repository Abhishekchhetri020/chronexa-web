// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import "../../ui/substitution/candidate_ranker.js";

const card = (tid, period, extra = {}) => ({ lessonId: "L" + tid + period, day: 0, period, classIds: ["c1"], subjectId: "s1", teacherIds: [tid], ...extra });

function school({ timeOff, history = [] } = {}) {
  const teachers = [
    { id: "abs", name: "Absent" },
    { id: "a", name: "A", timeOff },
    { id: "b", name: "B" },
  ];
  const cardsByTeacher = {
    abs: [card("abs", 2)],
    a: [card("a", 5, { classIds: ["c9"], subjectId: "s9" })],
    b: [card("b", 6, { classIds: ["c8"], subjectId: "s8" })],
  };
  return {
    teachers,
    classes: [{ id: "c1", _teacherId: "b" }],
    substitutions: history,
    _idx: { cardsByTeacher, teacherById: Object.fromEntries(teachers.map((t) => [t.id, t])) },
  };
}

const rank = (s) => window.SubstitutionRanker.rankAll(s, ["abs"], 0, "2026-10-27")[0];

describe("substitute ranking (aSc criteria)", () => {
  it("class teacher wins a tie", () => {
    const r = rank(school());
    expect(r.chosen.teacherId).toBe("b");
    expect(r.chosen.reasons).toContain("class teacher");
  });

  it("a teacher on time-off in that period is never offered", () => {
    const r = rank(school({ timeOff: { "0_2": "unavailable" } }));
    expect(r.allCandidates.map((c) => c.teacherId)).not.toContain("a");
  });

  it("recent substitutions in the last 30 days lower the score (equable)", () => {
    const history = Array.from({ length: 5 }, (_, i) => ({ date: `2026-10-${10 + i}`, substituteTeacherId: "b" }))
      .concat([{ date: "2026-08-01", substituteTeacherId: "a" }]); // outside the window
    const r = rank(school({ history }));
    expect(r.chosen.teacherId).toBe("a");
    expect(r.allCandidates.find((c) => c.teacherId === "b").reasons).toContain("5 subs in last 30 days");
  });
});
