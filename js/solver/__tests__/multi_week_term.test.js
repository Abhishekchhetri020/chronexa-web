import { describe, it, expect } from "vitest";
import { solve, __test_internals } from "../csp_solver.js";
const { buildModel, makeState: createState, advancedRelationPenalty } = __test_internals;

function makeBaseSchool({ days = 1, periods = 1, weeks = [], weeksDefs = [], terms = [], termsDefs = [], lessons = [], relations = [] }) {
  return {
    name: "Multi-Week Test School",
    days: Array.from({ length: days }, (_, i) => ({ id: String(i), name: `Day ${i + 1}`, short: `D${i + 1}` })),
    bell: {
      periods: Array.from({ length: periods }, (_, i) => ({
        index: i + 1, label: String(i + 1), start: `0${8 + i}:00`, end: `0${8 + i}:45`, isTeaching: true,
      })),
    },
    weeks,
    weeksDefs,
    terms,
    termsDefs,
    teachers: [{ id: "T1", name: "Alice", short: "AL" }],
    classes: [{ id: "C1", name: "10A", short: "10A" }],
    subjects: [
      { id: "S1", name: "Physics", short: "PHY" },
      { id: "S2", name: "Chemistry", short: "CHM" },
    ],
    classrooms: [{ id: "R1", name: "Lab 1", short: "L1" }],
    lessons,
    cards: [],
    relations,
  };
}

describe("Block C — Multi-week & multi-term solver engine", () => {
  it("co-places Week A (10) and Week B (01) lessons for the same teacher, class, and room in one slot", () => {
    const school = makeBaseSchool({
      days: 1,
      periods: 1,
      weeks: [{ id: "0", name: "Week A", short: "A" }, { id: "1", name: "Week B", short: "B" }],
      weeksDefs: [
        { id: "WA", name: "Week A", short: "A", bits: "10" },
        { id: "WB", name: "Week B", short: "B", bits: "01" },
        { id: "WALL", name: "All weeks", short: "All", bits: "11" },
      ],
      lessons: [
        { id: "L_A", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], preferredRoomId: "R1", periodsPerWeek: 1, weeksDefId: "WA" },
        { id: "L_B", subjectId: "S2", teacherIds: ["T1"], classIds: ["C1"], preferredRoomId: "R1", periodsPerWeek: 1, weeksDefId: "WB" },
      ],
    });

    const res = solve(school, { timeLimitSec: 2, seed: 42 });
    expect(res.assignment).toHaveLength(2);
    const a = res.assignment.find((x) => x.lessonId === "L_A");
    const b = res.assignment.find((x) => x.lessonId === "L_B");
    expect(a).toMatchObject({ day: 0, period: 1, classroomId: "R1", weeks: "10" });
    expect(b).toMatchObject({ day: 0, period: 1, classroomId: "R1", weeks: "01" });
  });

  it("co-places Term 1 (10) and Term 2 (01) lessons for the same teacher, class, and room in one slot", () => {
    const school = makeBaseSchool({
      days: 1,
      periods: 1,
      terms: [{ id: "0", name: "Term 1", short: "T1" }, { id: "1", name: "Term 2", short: "T2" }],
      termsDefs: [
        { id: "T1D", name: "Term 1", short: "T1", bits: "10" },
        { id: "T2D", name: "Term 2", short: "T2", bits: "01" },
        { id: "TYR", name: "Whole year", short: "YR", bits: "11" },
      ],
      lessons: [
        { id: "L_T1", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], preferredRoomId: "R1", periodsPerWeek: 1, termsDefId: "T1D" },
        { id: "L_T2", subjectId: "S2", teacherIds: ["T1"], classIds: ["C1"], preferredRoomId: "R1", periodsPerWeek: 1, termsDefId: "T2D" },
      ],
    });

    const res = solve(school, { timeLimitSec: 2, seed: 42 });
    expect(res.assignment).toHaveLength(2);
    expect(res.assignment.find((x) => x.lessonId === "L_T1")).toMatchObject({ day: 0, period: 1, terms: "10" });
    expect(res.assignment.find((x) => x.lessonId === "L_T2")).toMatchObject({ day: 0, period: 1, terms: "01" });
  });

  it("forbids an All-weeks (11) lesson from sharing a slot with a Week A (10) lesson", () => {
    const school = makeBaseSchool({
      days: 1,
      periods: 2,
      weeks: [{ id: "0", name: "Week A", short: "A" }, { id: "1", name: "Week B", short: "B" }],
      weeksDefs: [
        { id: "WA", name: "Week A", short: "A", bits: "10" },
        { id: "WALL", name: "All weeks", short: "All", bits: "11" },
      ],
      lessons: [
        { id: "L_ALL", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], periodsPerWeek: 1, weeksDefId: "WALL" },
        { id: "L_A", subjectId: "S2", teacherIds: ["T1"], classIds: ["C1"], periodsPerWeek: 1, weeksDefId: "WA" },
      ],
    });

    const res = solve(school, { timeLimitSec: 2, seed: 42 });
    expect(res.assignment).toHaveLength(2);
    const a = res.assignment.find((x) => x.lessonId === "L_ALL");
    const b = res.assignment.find((x) => x.lessonId === "L_A");
    expect(a.period).not.toBe(b.period);
    expect(a.weeks).toBe("11");
    expect(b.weeks).toBe("10");
  });

  it("a_48 (Max free weeks between cards per year) penalizes gaps exceeding param1", () => {
    const weeks = [0, 1, 2, 3].map((i) => ({ id: String(i), name: `W${i + 1}`, short: `W${i + 1}` }));
    const weeksDefs = [
      { id: "W1", bits: "1000" },
      { id: "W2", bits: "0100" },
      { id: "W4", bits: "0001" },
    ];
    const mk = (secondWeekId) => {
      const school = makeBaseSchool({
        days: 1, periods: 2, weeks, weeksDefs,
        lessons: [
          { id: "L1", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], periodsPerWeek: 1, weeksDefId: "W1" },
          { id: "L2", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], periodsPerWeek: 1, weeksDefId: secondWeekId },
        ],
        relations: [{ id: "R48", typ: "a_48", param1: 1, subjectids: ["S1"], classids: ["C1"] }],
      });
      const model = buildModel(school);
      const state = createState(model);
      state.lessonAssigned[0] = 1; state.lessonAssignedSlot[0] = 0;
      state.lessonAssigned[1] = 1; state.lessonAssignedSlot[1] = 0;
      return advancedRelationPenalty(model, state);
    };

    expect(mk("W2")).toBe(0);                // W1 + W2: 0 empty weeks <= 1
    expect(mk("W4")).toBeGreaterThan(0);     // W1 + W4: 2 empty weeks (W2, W3) > 1
  });

  it("a_57 (Max weeks/terms on one period) penalizes stacking > param1 weeks on the same period", () => {
    const school = makeBaseSchool({
      days: 1,
      periods: 2,
      weeks: [{ id: "0", name: "Week A", short: "A" }, { id: "1", name: "Week B", short: "B" }],
      weeksDefs: [
        { id: "WA", bits: "10" },
        { id: "WB", bits: "01" },
      ],
      lessons: [
        { id: "L_A", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], periodsPerWeek: 1, weeksDefId: "WA" },
        { id: "L_B", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], periodsPerWeek: 1, weeksDefId: "WB" },
      ],
      relations: [{ id: "R57", typ: "a_57", param1: 1, subjectids: ["S1"], classids: ["C1"] }],
    });

    const model = buildModel(school);
    const sameSlotState = createState(model);
    sameSlotState.lessonAssigned[0] = 1; sameSlotState.lessonAssignedSlot[0] = 0;
    sameSlotState.lessonAssigned[1] = 1; sameSlotState.lessonAssignedSlot[1] = 0;

    const diffSlotState = createState(model);
    diffSlotState.lessonAssigned[0] = 1; diffSlotState.lessonAssignedSlot[0] = 0;
    diffSlotState.lessonAssigned[1] = 1; diffSlotState.lessonAssignedSlot[1] = 1;

    expect(advancedRelationPenalty(model, sameSlotState)).toBeGreaterThan(0);
    expect(advancedRelationPenalty(model, diffSlotState)).toBe(0);
  });

  it("a_73 (Max free days between cards per all weeks) penalizes cross-week day gaps exceeding param1", () => {
    const school = makeBaseSchool({
      days: 5,
      periods: 1,
      weeks: [{ id: "0", name: "Week A", short: "A" }, { id: "1", name: "Week B", short: "B" }],
      weeksDefs: [
        { id: "WA", bits: "10" },
        { id: "WB", bits: "01" },
      ],
      lessons: [
        { id: "L_A", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], periodsPerWeek: 1, weeksDefId: "WA" },
        { id: "L_B", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], periodsPerWeek: 1, weeksDefId: "WB" },
      ],
      relations: [{ id: "R73", typ: "a_73", param1: 3, subjectids: ["S1"], classids: ["C1"] }],
    });

    const model = buildModel(school);
    // Week A Friday (d=4 -> t=4) and Week B Monday (d=0 -> t=5): 0 free days <= 3
    const closeState = createState(model);
    closeState.lessonAssigned[0] = 1; closeState.lessonAssignedSlot[0] = 4;
    closeState.lessonAssigned[1] = 1; closeState.lessonAssignedSlot[1] = 0;
    expect(advancedRelationPenalty(model, closeState)).toBe(0);

    // Week A Monday (d=0 -> t=0) and Week B Friday (d=4 -> t=9): 8 free days > 3
    const farState = createState(model);
    farState.lessonAssigned[0] = 1; farState.lessonAssignedSlot[0] = 0;
    farState.lessonAssigned[1] = 1; farState.lessonAssignedSlot[1] = 4;
    expect(advancedRelationPenalty(model, farState)).toBeGreaterThan(0);
  });
});
