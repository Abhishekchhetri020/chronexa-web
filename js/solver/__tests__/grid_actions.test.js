import { describe, it, expect } from "vitest";
import { rowMatcher, removeUnlockedCards, clearClassrooms, mergeSinglesToDouble } from "../../ui/editor/grid_actions.js";

const mk = () => ({
  lessons: [
    { id: "L1", classIds: ["c1"], teacherIds: ["t1"], subjectId: "s1", periodsPerWeek: 4, periodsPerCard: 1 },
    { id: "L2", classIds: ["c2"], teacherIds: ["t1"], subjectId: "s2", periodsPerWeek: 2, periodsPerCard: 1 },
  ],
  cards: [
    { lessonId: "L1", day: 0, period: 1, classroomId: "r1" },
    { lessonId: "L1", day: 0, period: 2, classroomId: "r1" },
    { lessonId: "L1", day: 1, period: 0, classroomId: "r2", locked: true },
    { lessonId: "L2", day: 2, period: 3, classroomId: "r1" },
    { lessonId: "L2", day: 2, period: 4, classroomId: "r1" },
  ],
});

describe("grid actions", () => {
  it("removes only unlocked cards of the row", () => {
    const s = mk();
    expect(removeUnlockedCards(s, rowMatcher(s, "class", "c1"))).toBe(2);
    expect(s.cards.map((c) => c.lessonId)).toEqual(["L1", "L2", "L2"]);
  });

  it("empties a classroom except locked cards", () => {
    const s = mk();
    expect(clearClassrooms(s, rowMatcher(s, "room", "r1"))).toBe(4);
    expect(s.cards.filter((c) => c.classroomId).map((c) => c.classroomId)).toEqual(["r2"]);
  });

  it("whole-timetable matcher selects everything", () => {
    const s = mk();
    expect(removeUnlockedCards(s, rowMatcher(s, null, null))).toBe(4);
  });

  it("merges two singles into a split-off double lesson", () => {
    const s = mk();
    const r = mergeSinglesToDouble(s, "L1", 0, 1);
    expect(r.ok).toBe(true);
    expect(r.lessonId).toMatch(/^[0-9A-F]{16}$/);
    const l1 = s.lessons.find((l) => l.id === "L1");
    const dbl = s.lessons.find((l) => l.id === r.lessonId);
    expect(l1.periodsPerWeek).toBe(2);
    expect(dbl).toMatchObject({ periodsPerWeek: 2, periodsPerCard: 2, classIds: ["c1"] });
    expect(s.cards.filter((c) => c.lessonId === r.lessonId)).toEqual([{ lessonId: r.lessonId, day: 0, period: 1, classroomId: "r1" }]);
    expect(s.cards.filter((c) => c.lessonId === "L1")).toHaveLength(1);
  });

  it("a 2-period lesson just becomes a double", () => {
    const s = mk();
    const r = mergeSinglesToDouble(s, "L2", 2, 3);
    expect(r).toEqual({ ok: true, lessonId: "L2" });
    expect(s.lessons[1].periodsPerCard).toBe(2);
    expect(s.cards.filter((c) => c.lessonId === "L2")).toHaveLength(1);
  });

  it("refuses when the next period is not the same lesson or a card is locked", () => {
    const s = mk();
    expect(mergeSinglesToDouble(s, "L1", 0, 2).ok).toBe(false);
    s.cards[1].locked = true;
    expect(mergeSinglesToDouble(s, "L1", 0, 1).reason).toMatch(/Unlock/);
  });
});

import { assignClassrooms } from "../../ui/editor/grid_actions.js";

describe("assign classrooms without moving lessons", () => {
  const sch = () => ({
    lessons: [
      { id: "A", periodsPerCard: 1, _lessonRoomIds: ["lab"] },
      { id: "B", periodsPerCard: 1, _lessonRoomIds: ["lab", "r2"], preferredRoomId: "lab" },
      { id: "C", periodsPerCard: 2, _lessonRoomIds: ["r2"] },
      { id: "N", periodsPerCard: 1 },
    ],
    cards: [
      { lessonId: "A", day: 0, period: 0 },
      { lessonId: "B", day: 0, period: 0 },
      { lessonId: "C", day: 1, period: 0, classroomId: "r2", locked: true },
      { lessonId: "B", day: 1, period: 1 },
      { lessonId: "N", day: 2, period: 0 },
    ],
  });

  it("add: one-room lessons first, no double booking, roomless lessons untouched", () => {
    const s = sch();
    const r = assignClassrooms(s, { mode: "add" });
    expect(s.cards.map((c) => c.classroomId || null)).toEqual(["lab", "r2", "r2", "lab", null]);
    expect(r).toMatchObject({ assigned: 3, failed: [] });
  });

  it("a locked double keeps its room and blocks both periods", () => {
    const s = sch();
    s.cards[3] = { lessonId: "B", day: 1, period: 1 };
    s.lessons[1]._lessonRoomIds = ["r2"]; s.lessons[1].preferredRoomId = undefined;
    const r = assignClassrooms(s, { mode: "add" });
    expect(s.cards[3].classroomId).toBe(null);
    expect(r.failed).toEqual([s.cards[3]]);
  });

  it("optimize re-picks unlocked rooms but never a locked card", () => {
    const s = sch();
    s.cards[0].classroomId = "x"; // not allowed — gets fixed
    const r = assignClassrooms(s, { mode: "optimize" });
    expect(s.cards[0].classroomId).toBe("lab");
    expect(s.cards[2].classroomId).toBe("r2");
    expect(r.changed).toBeGreaterThan(0);
  });
});
