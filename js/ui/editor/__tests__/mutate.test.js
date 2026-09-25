import { beforeEach, describe, expect, it } from "vitest";
import "../../../ui/state.js";
import { loadSampleSchool } from "../../../solver/__tests__/helpers/load_school.js";

describe("APP.mutate transaction history", () => {
  beforeEach(() => {
    window.APP.school = {
      schoolName: "Demo",
      cards: [{ lessonId: "L1", day: 0, period: 1 }],
    };
    window.APP.audit?.clear?.();
  });

  it("records a school mutation that can be undone and redone", () => {
    expect(typeof window.APP.mutate).toBe("function");

    const changed = [];
    const onChanged = (event) => changed.push(event.detail);
    document.addEventListener("app:school-changed", onChanged);
    try {
      window.APP.mutate("Move card", (school) => {
        school.cards[0].period = 2;
      });

      expect(window.APP.school.cards[0].period).toBe(2);
      expect(window.APP.history.canUndo).toBe(true);
      expect(window.APP.history.canRedo).toBe(false);

      window.APP.undo();
      expect(window.APP.school.cards[0].period).toBe(1);
      expect(window.APP.history.canUndo).toBe(false);
      expect(window.APP.history.canRedo).toBe(true);

      window.APP.redo();
      expect(window.APP.school.cards[0].period).toBe(2);
      expect(changed.map((detail) => [detail.label, detail.source])).toEqual([
        ["Move card", "mutate"],
        ["Move card", "undo"],
        ["Move card", "redo"],
      ]);
    } finally {
      document.removeEventListener("app:school-changed", onChanged);
    }
  });

  it("folds nested mutations into one step", () => {
    window.APP.mutate("Outer edit", (school) => {
      school.cards[0].day = 1;
      window.APP.mutate("Inner edit", (nestedSchool) => {
        nestedSchool.cards[0].period = 4;
      });
    });

    expect(window.APP.history._state.undo).toHaveLength(1);
    window.APP.undo();
    expect(window.APP.school.cards[0]).toEqual({ lessonId: "L1", day: 0, period: 1 });
    window.APP.redo();
    expect(window.APP.school.cards[0]).toEqual({ lessonId: "L1", day: 1, period: 4 });
  });

  it("coalesces consecutive edits with the same key", () => {
    window.APP.mutate("Rename", (school) => { school.schoolName = "D"; }, { coalesceKey: "school-name" });
    window.APP.mutate("Rename", (school) => { school.schoolName = "De"; }, { coalesceKey: "school-name" });
    window.APP.mutate("Rename", (school) => { school.schoolName = "Demo!"; }, { coalesceKey: "school-name" });

    expect(window.APP.history._state.undo).toHaveLength(1);
    expect(window.APP.history.peek().patches).toHaveLength(1);
    window.APP.undo();
    expect(window.APP.school.schoolName).toBe("Demo");
  });

  it("round-trips a deterministic sequence of edits on the demo school", () => {
    const original = window.APP["__chronexaMutateCore"].cloneValue(loadSampleSchool());
    window.APP.school = window.APP["__chronexaMutateCore"].cloneValue(original);
    window.APP.history.clear();

    for (let i = 0; i < 40; i++) {
      const cardIndex = (i * 37) % window.APP.school.cards.length;
      window.APP.mutate("Move card", (school) => {
        school.cards[cardIndex].day = i % 6;
        school.cards[cardIndex].period = (i % 7) + 1;
      });
    }
    const edited = window.APP["__chronexaMutateCore"].cloneValue(window.APP.school);
    while (window.APP.history.canUndo) window.APP.undo();
    expect(window.APP.school).toEqual(original);
    while (window.APP.history.canRedo) window.APP.redo();
    expect(window.APP.school).toEqual(edited);
  });

  it("records bounded patches for 100 card moves and round-trips them", () => {
    window.APP.school = window.APP["__chronexaMutateCore"].cloneValue(loadSampleSchool());
    window.APP.history.clear();
    const original = window.APP["__chronexaMutateCore"].cloneValue(window.APP.school);
    const start = performance.now();
    const patchCounts = [];
    const patchBytes = [];
    for (let i = 0; i < 100; i++) {
      const cardIndex = i % window.APP.school.cards.length;
      const currentPeriod = window.APP.school.cards[cardIndex].period;
      const nextPeriod = (Number(currentPeriod) % 8) + 1;
      window.APP.mutate("Move card", (school) => {
        school.cards[cardIndex].period = nextPeriod;
      });
      const patches = window.APP.history.peek().patches;
      patchCounts.push(patches.length);
      patchBytes.push(JSON.stringify(patches).length);
      expect(patches).toHaveLength(1);
      expect(patches[0].path).toEqual(["cards", cardIndex, "period"]);
      expect(patches[0].oldValue).toBe(currentPeriod);
      expect(patches[0].newValue).toBe(nextPeriod);
    }
    const edited = window.APP["__chronexaMutateCore"].cloneValue(window.APP.school);
    // A one-cell edit must stay one small path patch. This catches accidental
    // full-school snapshots without making the result depend on CPU load.
    expect(Math.max(...patchCounts)).toBe(1);
    expect(Math.max(...patchBytes)).toBeLessThan(2048);
    expect(patchBytes.reduce((sum, bytes) => sum + bytes, 0)).toBeLessThan(100 * 2048);
    while (window.APP.history.canUndo) window.APP.undo();
    expect(window.APP.school).toEqual(original);
    while (window.APP.history.canRedo) window.APP.redo();
    expect(window.APP.school).toEqual(edited);
    // Smoke-check that the recorder is not catastrophically slow. The patch
    // shape assertions above are the actual performance invariant.
    expect(performance.now() - start).toBeLessThan(15000);
  });
});
