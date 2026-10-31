// aSc advanced conditions a_4/a_5/a_6/a_22/a_26/a_27 (gap shape) and
// a_1/a_82/a_83 (A/B ordering), scored per (class, day) from the relation row:
//   subjectids = A set, subject2ids = B set, classids = scope, param1 = limit.
import { describe, it, expect } from "vitest";
import { __test_internals, ADV_REL_TYPS } from "../csp_solver.js";
import { FAIL } from "../constraints.js";

const { buildModel, makeState, softScore, canPlace, advancedRelationPenalty } = __test_internals;

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
    for (const t of ["a_4", "a_5", "a_6", "a_26", "a_27", "a_1", "a_22", "a_82", "a_83",
      "a_0", "a_3", "a_9", "a_10", "a_12", "a_13", "a_54", "a_74",
      "a_17", "a_18", "a_19", "a_21", "a_67", "a_68", "a_69", "a_70",
      "a_11", "a_20", "a_23", "a_37", "a_40", "a_41", "a_42",
      "a_7", "a_8", "a_30", "a_34", "a_60",
      "a_24", "a_25", "a_39", "a_43", "a_58", "a_50", "a_51",
      "a_29", "a_31", "a_38", "a_36", "a_49", "a_56", "a_76", "a_85",
      "a_14", "a_55", "a_59", "a_75", "a_77", "a_78", "a_79", "a_80", "a_81", "a_84"]) {
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

describe("frequency caps — a_0 / a_9 / a_3 / a_10 / a_12 / a_13 / a_54 / a_74", () => {
  const bio = (n) => [L("l1", "bio", n)];
  const rel = (typ, p1) => [{ typ, subjectids: ["bio"], param1: p1 }];
  const day = (d, ps) => ps.map((p) => [0, d, p]);

  it("a_0 penalises using more days than allowed", () => {
    const sch = school(rel("a_0", 2), bio(3));
    const threeDays = score(sch, [[0, 0, 0], [1, 1, 0], [2, 2, 0]]);
    const twoDays = score(sch, [[0, 0, 0], [1, 0, 1], [2, 1, 0]]);
    expect(threeDays).toBeGreaterThan(twoDays);
  });

  it("a_9 penalises using fewer days than required", () => {
    const sch = school(rel("a_9", 3), bio(3));
    const oneDay = score(sch, [[0, 0, 0], [1, 0, 1], [2, 0, 2]]);
    const threeDays = score(sch, [[0, 0, 0], [1, 1, 0], [2, 2, 0]]);
    expect(oneDay).toBeGreaterThan(threeDays);
  });

  it("a_3 needs a minimum per day but exempts empty days", () => {
    const sch = school(rel("a_3", 2), bio(3));
    const thin = score(sch, [[0, 0, 0], [1, 1, 0], [2, 2, 0]]);   // 1 per day
    const thick = score(sch, [[0, 0, 0], [1, 0, 1], [2, 1, 0]]);  // 2 on day 0
    expect(thin).toBeGreaterThan(thick);
  });

  it("a_10 caps periods per day", () => {
    const sch = school(rel("a_10", 2), bio(4));
    const heavy = score(sch, [[0, 0, 0], [1, 0, 1], [2, 0, 2], [3, 0, 3]]);
    const split = score(sch, [[0, 0, 0], [1, 0, 1], [2, 1, 0], [3, 1, 1]]);
    expect(heavy).toBeGreaterThan(split);
  });

  it("a_12 demands a minimum weekly total, a_13 caps it", () => {
    // A weekly total depends on how many cards exist, not on where they sit, so
    // the comparison is the same placement against different limits.
    const placement = [[0, 0, 0], [1, 0, 1]];   // 2 cards
    expect(score(school(rel("a_12", 4), bio(2)), placement))
      .toBeGreaterThan(score(school(rel("a_12", 1), bio(2)), placement));
    expect(score(school(rel("a_13", 1), bio(2)), placement))
      .toBeGreaterThan(score(school(rel("a_13", 5), bio(2)), placement));
  });

  it("a_54 counts different subjects in a day", () => {
    const lessons = [L("lb", "bio", 2), L("lp", "phy", 2)];
    const sch = school([{ typ: "a_54", subjectids: ["bio", "phy"], param1: 1 }], lessons);
    const mixed = score(sch, [[0, 0, 0], [1, 0, 1], [2, 0, 2], [3, 0, 3]]);      // both subjects, day 0
    const separated = score(sch, [[0, 0, 0], [1, 0, 1], [2, 1, 0], [3, 1, 1]]);   // day 0 bio, day 1 phy
    expect(mixed).toBeGreaterThan(separated);
  });

  it("a_74 behaves like a_0 on a single-week timetable", () => {
    const sch = school(rel("a_74", 1), bio(2));
    expect(score(sch, [[0, 0, 0], [1, 1, 0]])).toBeGreaterThan(score(sch, [[0, 0, 0], [1, 0, 1]]));
  });
});

describe("span, start/end gap counting and same-period bans", () => {
  const bio4 = [L("l1", "bio", 4)];
  const rel = (typ, p1) => [{ typ, subjectids: ["bio"], param1: p1 }];
  const score4 = (typ, p1, placements) => score(school(rel(typ, p1), bio4), placements);
  // Late start (P3..P4) vs early start (P1..P2) on one day.
  const LATE = [[0, 0, 2], [1, 0, 3]];
  const EARLY = [[0, 0, 0], [1, 0, 1]];

  it("a_69 charges a late start as gaps, a_4 does not", () => {
    expect(score4("a_69", 0, LATE)).toBeGreaterThan(score4("a_69", 0, EARLY));
    // The plain per-day gap cap sees 0 internal gaps in both.
    expect(score4("a_4", 0, LATE)).toBe(score4("a_4", 0, EARLY));
  });

  it("a_70 charges an early finish as gaps", () => {
    const early = [[0, 0, 0], [1, 0, 1]];      // ends P2 of 8
    const late = [[0, 0, 6], [1, 0, 7]];       // ends P8
    expect(score4("a_70", 0, early)).toBeGreaterThan(score4("a_70", 0, late));
  });

  it("a_67 / a_68 apply the same counting over the week", () => {
    expect(score4("a_67", 0, LATE)).toBeGreaterThan(score4("a_67", 0, EARLY));
    expect(score4("a_68", 0, EARLY)).toBeGreaterThan(score4("a_68", 0, [[0, 0, 6], [1, 0, 7]]));
  });

  it("a_18 / a_19 bound the span of a day", () => {
    const wide = [[0, 0, 0], [1, 0, 6]];   // span 7
    const tight = [[0, 0, 0], [1, 0, 1]];  // span 2
    expect(score4("a_18", 5, tight)).toBeGreaterThan(score4("a_18", 5, wide));
    expect(score4("a_19", 3, wide)).toBeGreaterThan(score4("a_19", 3, tight));
  });

  it("a_17 caps how many different period slots a subject may use", () => {
    const manySlots = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3]];   // 4 slots
    const fewSlots = [[0, 0, 0], [1, 1, 0], [2, 2, 0], [3, 3, 0]];    // 1 slot
    expect(score4("a_17", 2, manySlots)).toBeGreaterThan(score4("a_17", 2, fewSlots));
  });

  it("a_21 forbids A and B sharing a period on the same day", () => {
    const lessons = [L("lb", "bio"), L("lp", "phy")];
    const sch = [{ typ: "a_21", subjectids: ["bio"], subject2ids: ["phy"], param1: 0 }];
    const same = score(school(sch, lessons), [[0, 0, 2], [1, 0, 2]]);
    const apart = score(school(sch, lessons), [[0, 0, 2], [1, 0, 4]]);
    expect(same).toBeGreaterThan(apart);
  });
});

describe("day sequencing — a_11 / a_20 / a_23 / a_37 / a_40 / a_41 / a_42", () => {
  const pair = [L("lb", "bio"), L("lp", "phy")];
  const pairRel = (typ, p1) => [{ typ, subjectids: ["bio"], subject2ids: ["phy"], param1: p1 }];
  const pairScore = (typ, p1, pl) => score(school(pairRel(typ, p1), pair), pl);

  it("a_11 forbids A one day and B the next", () => {
    const nextDay = pairScore("a_11", 0, [[0, 0, 6], [1, 1, 0]]);  // Bio day0, Phy day1
    const sameDay = pairScore("a_11", 0, [[0, 0, 0], [1, 0, 3]]);
    expect(nextDay).toBeGreaterThan(sameDay);
  });

  it("a_20 limits free days between cards", () => {
    const sch = school([{ typ: "a_20", subjectids: ["bio"], param1: 0 }], [L("l1", "bio", 2)]);
    const spread = score(sch, [[0, 0, 0], [1, 4, 0]]);   // three free days between
    const adjacent = score(sch, [[0, 0, 0], [1, 1, 0]]); // none
    expect(spread).toBeGreaterThan(adjacent);
  });

  it("a_23 caps consecutive days", () => {
    const sch = school([{ typ: "a_23", subjectids: ["bio"], param1: 2 }], [L("l1", "bio", 3)]);
    const run3 = score(sch, [[0, 0, 0], [1, 1, 0], [2, 2, 0]]);
    const breakRun = score(sch, [[0, 0, 0], [1, 1, 0], [2, 3, 0]]);
    expect(run3).toBeGreaterThan(breakRun);
  });

  it("a_37 caps the combined A+B run in a day", () => {
    const sch = school(pairRel("a_37", 2), [L("lb", "bio", 2), L("lp", "phy", 2)]);
    const block = score(sch, [[0, 0, 0], [1, 0, 1], [2, 0, 2], [3, 0, 3]]);  // 4 in a row
    const split = score(sch, [[0, 0, 0], [1, 0, 1], [2, 0, 4], [3, 0, 5]]);
    expect(block).toBeGreaterThan(split);
  });

  it("a_40 wants every A before the first B in a day", () => {
    const after = pairScore("a_40", 0, [[0, 0, 4], [1, 0, 2]]);   // Bio after Phy
    const before = pairScore("a_40", 0, [[0, 0, 2], [1, 0, 4]]);
    expect(after).toBeGreaterThan(before);
  });

  it("a_41 wants A before B across the week", () => {
    const later = pairScore("a_41", 0, [[0, 2, 0], [1, 0, 0]]);   // Bio on day2, Phy day0
    const earlier = pairScore("a_41", 0, [[0, 0, 0], [1, 2, 0]]);
    expect(later).toBeGreaterThan(earlier);
  });

  it("a_42 wants A days before B days", () => {
    const later = pairScore("a_42", 0, [[0, 2, 0], [1, 0, 0]]);
    const earlier = pairScore("a_42", 0, [[0, 0, 0], [1, 2, 0]]);
    expect(later).toBeGreaterThan(earlier);
  });
});

describe("position family — a_7 / a_8 / a_30 / a_34 / a_60", () => {
  it("a_7 caps how many days may use the same period", () => {
    const sch = school([{ typ: "a_7", subjectids: ["bio"], param1: 2 }], [L("l1", "bio", 3)]);
    const everyDay = score(sch, [[0, 0, 0], [1, 1, 0], [2, 2, 0]]);   // period 0 on 3 days
    const varied = score(sch, [[0, 0, 0], [1, 1, 1], [2, 2, 2]]);
    expect(everyDay).toBeGreaterThan(varied);
  });

  it("a_8 behaves like a_7 on a single-week timetable", () => {
    const sch = school([{ typ: "a_8", subjectids: ["bio"], param1: 1 }], [L("l1", "bio", 2)]);
    expect(score(sch, [[0, 0, 0], [1, 1, 0]])).toBeGreaterThan(score(sch, [[0, 0, 0], [1, 1, 1]]));
  });

  it("a_30 runs A only where B runs, and before it", () => {
    const lessons = [L("lb", "bio", 2), L("lp", "phy")];
    const sch = [{ typ: "a_30", subjectids: ["bio"], subject2ids: ["phy"] }];
    // Bio twice: on day 0 before Phy (fine) and on day 1 with no Phy (violation).
    const orphan = score(school(sch, lessons), [[0, 0, 2], [1, 0, 4], [2, 1, 2]]);
    // Both Bio cards on day 0, before Phy: satisfied.
    const paired = score(school(sch, lessons), [[0, 0, 0], [1, 0, 2], [2, 0, 4]]);
    expect(orphan).toBeGreaterThan(paired);
  });

  it("a_34 forbids interleaving A and B inside a day", () => {
    const lessons = [L("lb", "bio", 2), L("lp", "phy", 2)];
    const sch = [{ typ: "a_34", subjectids: ["bio"], subject2ids: ["phy"] }];
    const mixed = score(school(sch, lessons),
      [[0, 0, 0], [1, 0, 2], [2, 0, 1], [3, 0, 3]]);        // Bio, Phy, Bio, Phy
    const blocked = score(school(sch, lessons),
      [[0, 0, 0], [1, 0, 1], [2, 0, 2], [3, 0, 3]]);        // all Bio then all Phy
    expect(mixed).toBeGreaterThan(blocked);
  });

  it("a_60 is hard: the card may only start inside the window", () => {
    const lessons = [L("l1", "bio", 2)];
    const sch = school([{ typ: "a_60", subjectids: ["bio"], positions: { from: 3, to: 5 } }], lessons);
    const m = buildModel(sch);
    const st = makeState(m);
    const slot = (d, p) => d * m.periodsPerDay + p;
    expect(canPlace(m, st, 0, slot(0, 1), 0)).toBe(FAIL.POSITION_BANNED); // period 2, outside
    expect(canPlace(m, st, 0, slot(0, 2), 0)).toBe(null);                 // period 3, inside
    expect(canPlace(m, st, 0, slot(0, 4), 0)).toBe(null);                 // period 5, inside
    expect(canPlace(m, st, 0, slot(0, 5), 0)).toBe(FAIL.POSITION_BANNED); // period 6, outside
  });

  it("a_60 without positions is inert", () => {
    const m = buildModel(school([{ typ: "a_60", subjectids: ["bio"] }], [L("l1", "bio", 2)]));
    expect(m.lessonAllowedStart[0]).toBe(0);
  });
});

describe("room and building family — a_24 / a_25 / a_39 / a_43 / a_58", () => {
  function roomSchool(typ, p1, extraRooms = true) {
    return {
      schoolName: "Rooms",
      daysPerWeek: 5, periodsPerDay: 6, bell: BELL, bells: [BELL],
      buildings: [{ id: "b1", name: "Main" }, { id: "b2", name: "Annex" }],
      subjects: [{ id: "bio", name: "Bio" }],
      teachers: [{ id: "t1", name: "T1", subjects: ["bio"], timeOff: {} },
                 { id: "t2", name: "T2", subjects: ["bio"], timeOff: {} }],
      classes: [{ id: "c1", name: "IX A", bellId: "b8" }],
      classrooms: [
        { id: "r1", name: "R1", buildingId: "b1", tags: [] },
        { id: "r2", name: "R2", buildingId: "b1", tags: [] },
        { id: "r3", name: "R3", buildingId: "b2", tags: [] },
      ],
      lessons: [
        { id: "l1", subjectId: "bio", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 2 },
        { id: "l2", subjectId: "bio", teacherIds: ["t2"], classIds: ["c1"], periodsPerWeek: 2 },
      ],
      relations: [{ typ, subjectids: ["bio"], param1: p1 }],
      cards: [],
    };
  }

  function placeRooms(model, state, rows) {
    for (const [i, d, p, roomIdx] of rows) {
      state.lessonAssigned[i] = 1;
      state.lessonAssignedSlot[i] = d * model.periodsPerDay + p;
      if (state.lessonAssignedRoom) state.lessonAssignedRoom[i] = roomIdx;
    }
    state._scoreDirty = true;
  }

  const scoreRooms = (sch, rows) => {
    const m = buildModel(sch);
    const st = makeState(m);
    placeRooms(m, st, rows.map(([i, d, p, r]) => [i, d, p, m.roomIds.indexOf(r)]));
    return softScore(m, st);
  };

  it("a_24 caps different rooms per day", () => {
    const sch = roomSchool("a_24", 1);
    const many = scoreRooms(sch, [[0, 0, 0, "r1"], [1, 0, 1, "r2"]]);
    const one = scoreRooms(sch, [[0, 0, 0, "r1"], [1, 0, 1, "r1"]]);
    expect(many).toBeGreaterThan(one);
  });

  it("a_25 caps different rooms per week", () => {
    const sch = roomSchool("a_25", 1);
    const spread = scoreRooms(sch, [[0, 0, 0, "r1"], [1, 1, 0, "r2"]]);
    const same = scoreRooms(sch, [[0, 0, 0, "r1"], [1, 1, 0, "r1"]]);
    expect(spread).toBeGreaterThan(same);
  });

  it("a_58 caps buildings per day", () => {
    const sch = roomSchool("a_58", 1);
    const twoBuildings = scoreRooms(sch, [[0, 0, 2, "r1"], [1, 0, 4, "r3"]]);
    const oneBuilding = scoreRooms(sch, [[0, 0, 2, "r1"], [1, 0, 4, "r2"]]);
    expect(twoBuildings).toBeGreaterThan(oneBuilding);
  });

  it("a_39 caps simultaneous rooms in a period", () => {
    const sch = roomSchool("a_39", 1);
    const atOnce = scoreRooms(sch, [[0, 0, 2, "r1"], [1, 0, 2, "r2"]]);
    const apart = scoreRooms(sch, [[0, 0, 2, "r1"], [1, 0, 3, "r2"]]);
    expect(atOnce).toBeGreaterThan(apart);
  });

  it("a_43 caps simultaneous teachers in a period", () => {
    const sch = roomSchool("a_43", 1);
    const together = scoreRooms(sch, [[0, 0, 2, "r1"], [1, 0, 2, "r2"]]);
    const separate = scoreRooms(sch, [[0, 0, 2, "r1"], [1, 0, 4, "r2"]]);
    expect(together).toBeGreaterThan(separate);
  });
});

describe("selected-classroom budgets — a_50 / a_51", () => {
  function sch(typ, p1, roomIds) {
    return {
      schoolName: "Selected rooms",
      daysPerWeek: 5, periodsPerDay: 6, bell: BELL, bells: [BELL],
      subjects: [{ id: "bio", name: "Bio" }],
      teachers: [{ id: "t1", name: "T1", subjects: ["bio"], timeOff: {} },
                 { id: "t2", name: "T2", subjects: ["bio"], timeOff: {} }],
      classes: [{ id: "c1", name: "IX A", bellId: "b8" }],
      classrooms: [{ id: "r1", name: "Lab", tags: [] }, { id: "r2", name: "Room", tags: [] }],
      lessons: [
        { id: "l1", subjectId: "bio", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 2 },
        { id: "l2", subjectId: "bio", teacherIds: ["t2"], classIds: ["c1"], periodsPerWeek: 2 },
      ],
      relations: [{ typ, subjectids: ["bio"], classroomids: roomIds || ["r1"], param1: p1 }],
      cards: [],
    };
  }
  const scoreRooms2 = (s, rows) => {
    const m = buildModel(s);
    const st = makeState(m);
    for (const [i, d, p, r] of rows) {
      st.lessonAssigned[i] = 1;
      st.lessonAssignedSlot[i] = d * m.periodsPerDay + p;
      if (st.lessonAssignedRoom) st.lessonAssignedRoom[i] = m.roomIds.indexOf(r);
    }
    st._scoreDirty = true;
    return softScore(m, st);
  };

  it("a_50 penalises too many periods in the selected room", () => {
    const s = sch("a_50", 1);
    const tooMany = scoreRooms2(s, [[0, 0, 0, "r1"], [1, 1, 0, "r1"]]);
    const within = scoreRooms2(s, [[0, 0, 0, "r1"], [1, 1, 0, "r2"]]);
    expect(tooMany).toBeGreaterThan(within);
  });

  it("a_51 penalises too few periods in the selected room", () => {
    const s = sch("a_51", 2);
    const tooFew = scoreRooms2(s, [[0, 0, 0, "r1"], [1, 1, 0, "r2"]]);
    const enough = scoreRooms2(s, [[0, 0, 0, "r1"], [1, 1, 0, "r1"]]);
    expect(tooFew).toBeGreaterThan(enough);
  });

  it("ignores a relation with no classrooms selected", () => {
    const s = sch("a_50", 0, []);
    const m = buildModel(s);
    const st = makeState(m);
    st.lessonAssigned[0] = 1;
    st.lessonAssignedSlot[0] = 0;
    if (st.lessonAssignedRoom) st.lessonAssignedRoom[0] = m.roomIds.indexOf("r1");
    st._scoreDirty = true;
    expect(softScore(m, st)).toBe(softScore(m, makeState(m)));
  });
});

describe("remaining counted family — a_29 / a_31 / a_38 / a_36 / a_49 / a_56 / a_76", () => {
  const bio = (n) => [L("l1", "bio", n)];
  const rel = (typ, p1) => [{ typ, subjectids: ["bio"], param1: p1 }];

  it("a_29 charges every short day, including empty ones", () => {
    const sch = school(rel("a_29", 2), bio(3));
    const penaltyOf = (rows) => {
      const m = buildModel(sch);
      const st = makeState(m);
      for (const [i, d, p] of rows) { st.lessonAssigned[i] = 1; st.lessonAssignedSlot[i] = d * m.periodsPerDay + p; }
      return advancedRelationPenalty(m, st);
    };
    // 5 days x (2 - per-day count); a day with 2 lessons is free.
    expect(penaltyOf([[0, 0, 0], [1, 0, 1], [2, 1, 0]])).toBe(1 + 2 + 2 + 2);
    // everything crammed on one day: 4 empty days at 2 each, that day is over cap
    expect(penaltyOf([[0, 0, 0], [1, 0, 1], [2, 0, 2]])).toBe(4 * 2);
  });

  it("a_31 caps the cycle total, a_38 floors it", () => {
    const placement = [[0, 0, 0], [1, 0, 1]];
    expect(score(school(rel("a_31", 1), bio(2)), placement))
      .toBeGreaterThan(score(school(rel("a_31", 5), bio(2)), placement));
    expect(score(school(rel("a_38", 4), bio(2)), placement))
      .toBeGreaterThan(score(school(rel("a_38", 1), bio(2)), placement));
  });

  it("a_36 wants a batch of cards in one period", () => {
    const lessons = [L("lb", "bio", 2), L("lp", "phy", 2)];
    const sch = [{ typ: "a_36", subjectids: ["bio", "phy"], param1: 2 }];
    const together = score(school(sch, lessons), [[0, 0, 0], [1, 0, 0], [2, 1, 2], [3, 1, 4]]);
    const apart = score(school(sch, lessons), [[0, 0, 0], [1, 1, 0], [2, 2, 0], [3, 3, 0]]);
    expect(apart).toBeGreaterThan(together);
  });

  it("a_49 fills A's holes with B", () => {
    // lesson 0,1 = Bio (2 cards); lesson 2 = Phy
    const lessons = [L("lb", "bio", 2), L("lp", "phy", 1)];
    const sch = [{ typ: "a_49", subjectids: ["bio"], subject2ids: ["phy"] }];
    const penaltyOf = (rows) => {
      const m = buildModel(school(sch, lessons));
      const st = makeState(m);
      for (const [i, d, p] of rows) { st.lessonAssigned[i] = 1; st.lessonAssignedSlot[i] = d * m.periodsPerDay + p; }
      return advancedRelationPenalty(m, st);
    };
    // Bio at P1 and P3 leaves exactly one hole (P2).
    const filled = penaltyOf([[0, 0, 0], [1, 0, 2], [2, 0, 1]]);  // Phy in the hole
    expect(filled).toBe(0);
    const hole = penaltyOf([[0, 0, 0], [1, 0, 2], [2, 0, 5]]);    // Phy elsewhere
    expect(hole).toBe(1);
    // A wider hole needs more B cards: two holes, one B -> one still open.
    expect(penaltyOf([[0, 0, 0], [1, 0, 4], [2, 0, 2]])).toBe(2);
  });

  it("a_56 caps a run of different subjects", () => {
    const lessons = [L("lb", "bio", 1), L("lp", "phy", 1), L("lc", "chem", 1)];
    const sch = [{ typ: "a_56", subjectids: ["bio", "phy", "chem"], param1: 2 }];
    const run3 = score(school(sch, lessons), [[0, 0, 0], [1, 0, 1], [2, 0, 2]]);
    const run2 = score(school(sch, lessons), [[0, 0, 0], [1, 0, 1], [2, 0, 3]]);
    expect(run3).toBeGreaterThan(run2);
  });

  it("a_76 forbids adjacency in either order", () => {
    const lessons = [L("lb", "bio"), L("lp", "phy")];
    const sch = [{ typ: "a_76", subjectids: ["bio"], subject2ids: ["phy"] }];
    const penaltyOf = (rows) => {
      const m = buildModel(school(sch, lessons));
      const st = makeState(m);
      for (const [i, d, p] of rows) { st.lessonAssigned[i] = 1; st.lessonAssignedSlot[i] = d * m.periodsPerDay + p; }
      return advancedRelationPenalty(m, st);
    };
    expect(penaltyOf([[0, 0, 3], [1, 0, 2]])).toBe(1);  // Phy immediately before Bio
    expect(penaltyOf([[0, 0, 2], [1, 0, 3]])).toBe(1);  // Bio immediately before Phy
    expect(penaltyOf([[0, 0, 3], [1, 0, 0]])).toBe(0);  // apart
  });
});

describe("a_85 — classroom changes per day", () => {
  it("charges a building change between consecutive periods", () => {
    const sch = {
      schoolName: "changes", daysPerWeek: 5, periodsPerDay: 6, bell: BELL, bells: [BELL],
      buildings: [{ id: "b1", name: "Main" }, { id: "b2", name: "Annex" }],
      subjects: [{ id: "bio", name: "Bio" }],
      teachers: [{ id: "t1", name: "T1", subjects: ["bio"], timeOff: {} }],
      classes: [{ id: "c1", name: "IX A", bellId: "b8" }],
      classrooms: [{ id: "r1", name: "R1", buildingId: "b1", tags: [] },
                   { id: "r3", name: "R3", buildingId: "b2", tags: [] }],
      lessons: [
        { id: "l1", subjectId: "bio", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 2 },
        { id: "l2", subjectId: "bio", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 2 },
      ],
      relations: [{ typ: "a_85", subjectids: ["bio"], param1: 0 }],
      cards: [],
    };
    const run = (r0, r1) => {
      const m = buildModel(sch);
      const st = makeState(m);
      st.lessonAssigned[0] = 1; st.lessonAssignedSlot[0] = 0;
      st.lessonAssigned[1] = 1; st.lessonAssignedSlot[1] = 1;
      if (st.lessonAssignedRoom) {
        st.lessonAssignedRoom[0] = m.roomIds.indexOf(r0);
        st.lessonAssignedRoom[1] = m.roomIds.indexOf(r1);
      }
      st._scoreDirty = true;
      return softScore(m, st);
    };
    expect(run("r1", "r3")).toBeGreaterThan(run("r1", "r1"));
  });
});

describe("final buildable group — a_14 / a_55 / a_59 / a_75 / a_77 / a_84", () => {
  const penaltyOf = (sch, rows) => {
    const m = buildModel(sch);
    const st = makeState(m);
    for (const [i, d, p] of rows) { st.lessonAssigned[i] = 1; st.lessonAssignedSlot[i] = d * m.periodsPerDay + p; }
    return advancedRelationPenalty(m, st);
  };
  const rel = (typ, p1, extra = {}) => [{ typ, subjectids: ["bio"], param1: p1, ...extra }];

  it("a_14 wants A and B on identical positions", () => {
    const lessons = [L("lb", "bio"), L("lp", "phy")];
    const sch = school(rel("a_14", 0, { subject2ids: ["phy"] }), lessons);
    expect(penaltyOf(sch, [[0, 0, 2], [1, 0, 2]])).toBe(0);   // same period
    expect(penaltyOf(sch, [[0, 0, 2], [1, 0, 4]])).toBe(1);   // different
    // one exception a week swallows the single mismatch
    const lenient = school(rel("a_14", 1, { subject2ids: ["phy"] }), lessons);
    expect(penaltyOf(lenient, [[0, 0, 2], [1, 0, 4]])).toBe(0);
  });

  it("a_55 allows 4 only as two doubles", () => {
    const sch = school([{ typ: "a_55", subjectids: ["bio"] }], [L("l1", "bio", 4)]);
    // four singles back to back -> charged 1
    expect(penaltyOf(sch, [[0, 0, 0], [1, 0, 1], [2, 0, 2], [3, 0, 3]])).toBe(1);
    // three in a row is inside the cap
    expect(penaltyOf(sch, [[0, 0, 0], [1, 0, 1], [2, 0, 2], [3, 0, 5]])).toBe(0);
  });

  it("a_59 wants the scoped classes together often enough", () => {
    const lessons = [L("la", "bio"), L("lb", "bio")];
    const sch = {
      ...school([{ typ: "a_59", subjectids: ["bio"], classids: ["c1"], param1: 2 }], lessons),
      classes: [{ id: "c1", name: "IX A", bellId: "b8" }, { id: "c2", name: "IX B", bellId: "b8" }],
      lessons: [
        { id: "la", subjectId: "bio", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 1 },
        { id: "lb", subjectId: "bio", teacherIds: ["t1"], classIds: ["c2"], periodsPerWeek: 1 },
      ],
    };
    expect(penaltyOf(sch, [[0, 0, 2], [1, 0, 3]])).toBeGreaterThan(0);   // never together
    expect(penaltyOf(sch, [[0, 0, 2], [1, 0, 2]])).toBeLessThan(3 * 2);   // together once
  });

  it("a_75 wants lessons spaced apart in a day", () => {
    const sch = school(rel("a_75", 3), [L("l1", "bio", 2)]);
    expect(penaltyOf(sch, [[0, 0, 0], [1, 0, 1]])).toBe(1);   // 1 apart < 3
    expect(penaltyOf(sch, [[0, 0, 0], [1, 0, 3]])).toBe(0);   // 3 apart
  });

  it("a_77 wants free days between used days", () => {
    const sch = school(rel("a_77", 2), [L("l1", "bio", 2)]);
    expect(penaltyOf(sch, [[0, 0, 0], [1, 1, 0]])).toBe(2);   // consecutive days, 0 free
    expect(penaltyOf(sch, [[0, 0, 0], [1, 3, 0]])).toBe(0);   // two free days between
  });

  it("a_84 respects the day-size threshold in param2", () => {
    const lessons = [L("l1", "bio", 4)];
    const plain = school([{ typ: "a_84", subjectids: ["bio"], param1: 2 }], lessons);
    expect(penaltyOf(plain, [[0, 0, 0], [1, 0, 1], [2, 0, 2], [3, 0, 3]])).toBe(2);
    // param2 = 5: this day carries 4 periods, so the rule does not apply
    const gated = school([{ typ: "a_84", subjectids: ["bio"], param1: 2, param2: 5 }], lessons);
    expect(penaltyOf(gated, [[0, 0, 0], [1, 0, 1], [2, 0, 2], [3, 0, 3]])).toBe(0);
  });
});

describe("cycle aliases stay consistent", () => {
  const penaltyOf = (sch, rows) => {
    const m = buildModel(sch);
    const st = makeState(m);
    for (const [i, d, p] of rows) { st.lessonAssigned[i] = 1; st.lessonAssignedSlot[i] = d * m.periodsPerDay + p; }
    return advancedRelationPenalty(m, st);
  };
  const lessons = [L("l1", "bio", 3)];
  const rows = [[0, 0, 0], [1, 1, 0], [2, 2, 0]];

  it("a_78 == a_0 on a single week", () => {
    expect(penaltyOf(school([{ typ: "a_78", subjectids: ["bio"], param1: 2 }], lessons), rows))
      .toBe(penaltyOf(school([{ typ: "a_0", subjectids: ["bio"], param1: 2 }], lessons), rows));
  });

  it("a_80 == a_25 on a single week", () => {
    const mk = (typ) => ({
      schoolName: "alias", daysPerWeek: 5, periodsPerDay: 6, bell: BELL, bells: [BELL],
      subjects: [{ id: "bio", name: "Bio" }],
      teachers: [{ id: "t1", name: "T1", subjects: ["bio"], timeOff: {} }],
      classes: [{ id: "c1", name: "IX A", bellId: "b8" }],
      classrooms: [{ id: "r1", name: "R1", tags: [] }, { id: "r2", name: "R2", tags: [] }],
      lessons: [{ id: "l1", subjectId: "bio", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 2 }],
      relations: [{ typ, subjectids: ["bio"], param1: 1 }],
      cards: [],
    });
    const withRooms = (typ) => {
      const m = buildModel(mk(typ));
      const st = makeState(m);
      st.lessonAssigned[0] = 1; st.lessonAssignedSlot[0] = 0;
      st.lessonAssigned[1] = 1; st.lessonAssignedSlot[1] = 6;
      if (st.lessonAssignedRoom) { st.lessonAssignedRoom[0] = 0; st.lessonAssignedRoom[1] = 1; }
      return advancedRelationPenalty(m, st);
    };
    expect(withRooms("a_80")).toBe(withRooms("a_25"));
    expect(withRooms("a_80")).toBeGreaterThan(0);
  });
});

describe("question-marked (conditional) cards", () => {
  const { buildModel, makeState, softScore } = __test_internals;
  const mk = (lessons, tcons) => ({
    schoolName: "conditional", daysPerWeek: 5, periodsPerDay: 6, bell: BELL, bells: [BELL],
    subjects: [{ id: "bio", name: "Bio" }],
    teachers: [{ id: "t1", name: "T1", subjects: ["bio"], timeOff: {}, constraints: tcons }],
    classes: [{ id: "c1", name: "IX A", bellId: "b8" }],
    classrooms: [{ id: "r1", name: "R1", tags: [] }],
    lessons, relations: [], cards: [],
  });
  const conditionalLessons = [
    { id: "l1", subjectId: "bio", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 1, conditional: true },
    { id: "l2", subjectId: "bio", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 1, conditional: true },
    { id: "l3", subjectId: "bio", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 1 },
  ];

  it("carries the flag into the model", () => {
    const m = buildModel(mk(conditionalLessons, {}));
    expect(Array.from(m.lessonConditional)).toEqual([1, 1, 0]);
  });

  it("reads the per-teacher cap from the Constraints dialog key", () => {
    expect(buildModel(mk(conditionalLessons, { maxOnConditional: 1 })).teacherMaxOnConditional[0]).toBe(1);
    expect(buildModel(mk(conditionalLessons, { maxOnConditional: "*" })).teacherMaxOnConditional[0]).toBe(-1);
  });

  it("penalises placing more optional lessons than the cap allows", () => {
    const scoreWith = (cap, placedCount) => {
      const m = buildModel(mk(conditionalLessons, cap == null ? {} : { maxOnConditional: cap }));
      const st = makeState(m);
      for (let i = 0; i < placedCount; i++) {
        st.lessonAssigned[i] = 1;
        st.lessonAssignedSlot[i] = i;
      }
      st._scoreDirty = true;
      return softScore(m, st);
    };
    // cap 1: placing both optional cards costs, placing one does not.
    expect(scoreWith(1, 2)).toBeGreaterThan(scoreWith(1, 1));
    // no cap: identical
    expect(scoreWith(null, 2)).toBe(scoreWith(null, 1));
  });
});
