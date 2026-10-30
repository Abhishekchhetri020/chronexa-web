// aSc advanced conditions a_4/a_5/a_6/a_22/a_26/a_27 (gap shape) and
// a_1/a_82/a_83 (A/B ordering), scored per (class, day) from the relation row:
//   subjectids = A set, subject2ids = B set, classids = scope, param1 = limit.
import { describe, it, expect } from "vitest";
import { __test_internals, ADV_REL_TYPS } from "../csp_solver.js";

const { buildModel, makeState, softScore } = __test_internals;

const BELL = {
  id: "b8", name: "8-period day",
  periods: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ index: i, label: "P" + i, isTeaching: true })),
};

/** One class, one lesson per subject, placed by hand. */
function school(relations, lessons) {
  return {
    schoolName: "Advanced relations",
    daysPerWeek: 5, periodsPerDay: 8, bell: BELL, bells: [BELL],
    subjects: [
      { id: "bio", name: "Bio" }, { id: "phy", name: "Phy" }, { id: "chem", name: "Chem" },
    ],
    teachers: [
      { id: "t1", name: "T1", subjects: ["bio", "phy", "chem"], timeOff: {} },
    ],
    classes: [{ id: "c1", name: "IX A", bellId: "b8" }],
    classrooms: [{ id: "r1", name: "R1", tags: [] }],
    lessons,
    relations,
    cards: [],
  };
}

const L = (id, subjectId, n = 1) =>
  ({ id, subjectId, teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: n });

function place(model, state, lessonIdx, day, period) {
  state.lessonAssigned[lessonIdx] = 1;
  state.lessonAssignedSlot[lessonIdx] = day * model.periodsPerDay + period;
  state._scoreDirty = true;
}

/** softScore with only the advanced-relation term isolated is impractical, so
 *  compare two placements of the same school. */
function score(sch, placements) {
  const m = buildModel(sch);
  const st = makeState(m);
  for (const [i, d, p] of placements) place(m, st, i, d, p);
  return softScore(m, st);
}

describe("registry of advanced types", () => {
  it("covers the gap and ordering families", () => {
    for (const t of ["a_4", "a_5", "a_6", "a_26", "a_27", "a_1", "a_22", "a_82", "a_83"]) {
      expect(ADV_REL_TYPS.has(t), t).toBe(true);
    }
  });
});

describe("a_4 / a_5 / a_6 — gap caps", () => {
  const rel = (typ, p1) => [{ typ, subjectids: ["bio"], param1: p1 }];
  const twoCards = [L("l1", "bio", 2)];

  it("a_4 penalises more gaps in a day than the cap", () => {
    // 3 cards: P1, P3, P5 -> two internal gaps inside a 5-period span.
    const sch = school(rel("a_4", 0), [L("l1", "bio", 3)]);
    const wide = score(sch, [[0, 0, 0], [1, 0, 2], [2, 0, 4]]);   // 2 gaps
    const tight = score(sch, [[0, 0, 0], [1, 0, 1], [2, 0, 2]]);  // 0 gaps
    expect(wide).toBeGreaterThan(tight);
  });

  it("a_4 with a generous cap costs nothing", () => {
    const sch = school(rel("a_4", 5), [L("l1", "bio", 3)]);
    const wide = score(sch, [[0, 0, 0], [1, 0, 2], [2, 0, 4]]);
    const tight = score(sch, [[0, 0, 0], [1, 0, 1], [2, 0, 2]]);
    expect(wide).toBe(tight);
  });

  it("a_5 counts gaps across the whole week", () => {
    const sch = school(rel("a_5", 1), [L("l1", "bio", 4)]);
    // Monday: P1,P3 (1 gap) and Tuesday: P1,P3 (1 gap) -> 2 > cap 1
    const spread = score(sch, [[0, 0, 0], [1, 0, 2], [2, 1, 0], [3, 1, 2]]);
    const compact = score(sch, [[0, 0, 0], [1, 0, 1], [2, 1, 0], [3, 1, 1]]);
    expect(spread).toBeGreaterThan(compact);
  });

  it("a_6 penalises a run longer than the cap", () => {
    const sch = school(rel("a_6", 2), [L("l1", "bio", 3)]);
    const run3 = score(sch, [[0, 0, 0], [1, 0, 1], [2, 0, 2]]);
    const run2 = score(sch, [[0, 0, 0], [1, 0, 1], [2, 0, 3]]);
    expect(run3).toBeGreaterThan(run2);
  });
});

describe("a_26 / a_27 — gap length bounds", () => {
  const sch = (typ, p1) => school([{ typ, subjectids: ["bio"], param1: p1 }], [L("l1", "bio", 2)]);

  it("a_26 penalises a gap shorter than the minimum", () => {
    const s = sch("a_26", 3);
    // a_26 only judges gaps that EXIST: adjacent cards have none, so the
    // comparison is a 1-period gap against a 3-period gap.
    const short = score(s, [[0, 0, 0], [1, 0, 2]]);   // internal gap of 1
    const ok = score(s, [[0, 0, 0], [1, 0, 4]]);      // internal gap of 3
    expect(short).toBeGreaterThan(ok);
  });

  it("a_27 penalises a gap longer than the maximum", () => {
    const s = sch("a_27", 2);
    const long = score(s, [[0, 0, 0], [1, 0, 5]]);    // gap 4
    const ok = score(s, [[0, 0, 0], [1, 0, 3]]);      // gap 2
    expect(long).toBeGreaterThan(ok);
  });
});

describe("a_1 / a_22 / a_82 / a_83 — A/B ordering", () => {
  const pairLessons = () => [L("lb", "bio"), L("lp", "phy"), L("lc", "chem")];
  const rel = (typ, p1, extra = []) => [{
    typ, subjectids: ["bio"], subject2ids: ["phy"], param1: p1, ...extra,
  }];

  it("a_1 allows N same-day exceptions before it bites", () => {
    const strict = school(rel("a_1", 0), pairLessons());
    const lenient = school(rel("a_1", 3), pairLessons());
    // Bio and Phy on the same day: violates a 0-exception rule, fine at 3.
    const sameDay = (sch) => score(sch, [[0, 0, 0], [1, 0, 3]]);
    expect(sameDay(strict)).toBeGreaterThan(sameDay(lenient));
  });

  it("a_22 penalises A followed by B closer than the required gap", () => {
    const sch = school(rel("a_22", 1), pairLessons());
    const adjacent = score(sch, [[0, 0, 2], [1, 0, 3]]);  // gap 1 -> not > 1
    const spaced = score(sch, [[0, 0, 2], [1, 0, 5]]);    // gap 3 -> fine
    expect(adjacent).toBeGreaterThan(spaced);
  });

  it("a_82 wants at least one A before a B in the day", () => {
    const sch = school(rel("a_82", 0), pairLessons());
    // lesson 0 = Bio (A), lesson 1 = Phy (B)
    const bFirst = score(sch, [[0, 0, 3], [1, 0, 0]]);   // Bio P4, Phy P1 -> no A before B
    const aFirst = score(sch, [[0, 0, 0], [1, 0, 3]]);   // Bio P1, Phy P4 -> satisfied
    expect(bFirst).toBeGreaterThan(aFirst);
  });

  it("a_83 wants at least one B after an A in the day", () => {
    const sch = school(rel("a_83", 0), pairLessons());
    const none = score(sch, [[0, 0, 3], [1, 0, 1]]);
    const good = score(sch, [[0, 0, 1], [1, 0, 4]]);
    expect(none).toBeGreaterThan(good);
  });

  it("a relation without param1 is inert, like aSc", () => {
    const sch = school([{ typ: "a_4", subjectids: ["bio"] }], [L("l1", "bio", 3)]);
    const m = buildModel(sch);
    expect((m.advRels || []).length).toBe(0);
  });

  it("disabling a relation removes its effect", () => {
    const sch = school([{ typ: "a_4", subjectids: ["bio"], param1: 0, disabled: true }],
      [L("l1", "bio", 3)]);
    expect((buildModel(sch).advRels || []).length).toBe(0);
  });
});
