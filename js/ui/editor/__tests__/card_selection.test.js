import { beforeEach, describe, expect, it } from "vitest";
import "../grid_canvas.js";

describe("editor card selection", () => {
  beforeEach(() => {
    window.APP = window.APP || {};
    window.APP.editor = { selectedCardIds: [] };
  });

  it("exposes a pure selection model for toggles and same-row ranges", () => {
    expect(window.CardSelection).toBeDefined();
    expect(window.CardSelection.toggle([], "card-a")).toEqual(["card-a"]);
    expect(window.CardSelection.toggle(["card-a"], "card-a")).toEqual([]);
    expect(window.CardSelection.range([
      { id: "card-a", rowKey: "class-a", day: 0, period: 1 },
      { id: "card-b", rowKey: "class-a", day: 0, period: 2 },
      { id: "card-c", rowKey: "class-a", day: 0, period: 3 },
      { id: "card-d", rowKey: "class-b", day: 0, period: 2 },
    ], "card-a", "card-c")).toEqual(["card-a", "card-b", "card-c"]);
  });

  it("guards paste by each lesson's remaining weekly count", () => {
    expect(window.CardSelection.planPaste).toBeDefined();
    const plan = window.CardSelection.planPaste({
      lessons: [
        { id: "math", periodsPerWeek: 3 },
        { id: "science", periodsPerWeek: 2 },
      ],
      cards: [
        { lessonId: "math", day: 0, period: 1 },
        { lessonId: "math", day: 1, period: 1 },
        { lessonId: "science", day: 0, period: 2 },
      ],
    }, [
      { lessonId: "math", dayOffset: 0, periodOffset: 0 },
      { lessonId: "math", dayOffset: 0, periodOffset: 1 },
      { lessonId: "science", dayOffset: 1, periodOffset: 0 },
    ], { day: 2, period: 1 }, new Set());

    expect(plan.cards.map(card => [card.lessonId, card.day, card.period])).toEqual([
      ["math", 2, 1],
      ["science", 3, 1],
    ]);
    expect(plan.skipped).toEqual([
      expect.objectContaining({ lessonId: "math", reason: "weekly-count" }),
    ]);
  });

  it("treats a lab block as one weekly session and respects occupied target slots", () => {
    const school = {
      daysPerWeek: 5,
      lessons: [{ id: "lab", periodsPerWeek: 4, lessonLength: 2 }],
      cards: [
        { lessonId: "lab", day: 0, period: 1 },
        { lessonId: "lab", day: 0, period: 2 },
        { lessonId: "other", day: 2, period: 3 },
      ],
      bell: { periods: [{ index: 1 }, { index: 2 }, { index: 3 }, { index: 4 }] },
    };
    const clipboard = [{ lessonId: "lab", dayOffset: 0, periodOffset: 0, blockLength: 2 }];
    const plan = window.CardSelection.planPaste(
      school, clipboard, { day: 2, period: 3 },
      new Set([window.CardSelection.slotKey(2, 3)]),
    );

    expect(plan.cards).toEqual([]);
    expect(plan.skipped).toEqual([
      expect.objectContaining({ lessonId: "lab", reason: "occupied" }),
    ]);
  });
});
