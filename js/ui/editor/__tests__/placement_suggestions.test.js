/**
 * Lane D unit tests — pure ranking core of placement_suggestions.js.
 *
 * No DOM, no APP, no validator: fixtures feed rankCandidates / teacherCost /
 * balanceCost directly. Run with:
 *   npx vitest run --config /tmp/vitest.lane-d.config.js
 * (repo vitest.config.js only includes js/solver/__tests__; widening that
 * include is a later integration step, like the CSS import.)
 */
import { describe, it, expect } from "vitest";
import "../../editor/placement_suggestions.js";

const S = () => window.PlacementSuggestions;

function cand(o) {
  return Object.assign(
    { rowKey: "c1", day: 0, period: 1, validity: "green", amber: 0, gaps: 0, run: 1, load: 1 },
    o
  );
}

describe("rankCandidates", () => {
  it("prefers hard-valid green over amber, then fewer reasons", () => {
    const ranked = S().rankCandidates([
      cand({ day: 0, period: 1, validity: "amber", amber: 1 }),
      cand({ day: 3, period: 5 }),
    ]);
    expect(ranked[0].day).toBe(3);
    const ranked2 = S().rankCandidates([
      cand({ day: 0, validity: "amber", amber: 2 }),
      cand({ day: 1, validity: "amber", amber: 1 }),
    ]);
    expect(ranked2[0].day).toBe(1);
  });

  it("prefers fewer gaps, then shorter consecutive runs, then lighter load", () => {
    const ranked = S().rankCandidates([
      cand({ day: 0, gaps: 2 }),
      cand({ day: 1, gaps: 0, run: 3 }),
      cand({ day: 2, gaps: 0, run: 2, load: 5 }),
      cand({ day: 3, gaps: 0, run: 2, load: 2 }),
    ]);
    expect(ranked.map((c) => c.day)).toEqual([3, 2, 1, 0]);
  });

  it("breaks full ties deterministically by day, period, rowKey", () => {
    const ranked = S().rankCandidates([
      cand({ rowKey: "b", day: 1, period: 2 }),
      cand({ rowKey: "a", day: 1, period: 2 }),
      cand({ rowKey: "a", day: 1, period: 1 }),
      cand({ rowKey: "a", day: 0, period: 8 }),
    ]);
    expect(ranked.map((c) => [c.day, c.period, c.rowKey])).toEqual([
      [0, 8, "a"],
      [1, 1, "a"],
      [1, 2, "a"],
      [1, 2, "b"],
    ]);
  });

  it("pickBest returns the head and null for empty", () => {
    expect(S().pickBest([])).toBeNull();
    expect(S().pickBest(null)).toBeNull();
    const ranked = S().rankCandidates([cand({ day: 2 }), cand({ day: 0 })]);
    expect(S().pickBest(ranked).day).toBe(0);
  });
});

describe("teacherDayPeriods / teacherCost", () => {
  const lessonsById = {
    L1: { teacherIds: ["t1"] },
    L2: { teacherIds: ["t1", "t2"] },
    L9: { teacherIds: ["t9"] },
  };
  const cards = [
    { lessonId: "L1", day: 0, period: 1 },
    { lessonId: "L1", day: 0, period: 2 },
    { lessonId: "L2", day: 0, period: 4 },
    { lessonId: "L1", day: 1, period: 1 },
  ];

  it("collects only the teacher's periods on the given day", () => {
    expect(Array.from(S().teacherDayPeriods(cards, lessonsById, "t1", 0)).sort()).toEqual([1, 2, 4]);
    expect(Array.from(S().teacherDayPeriods(cards, lessonsById, "t1", 1))).toEqual([1]);
    expect(Array.from(S().teacherDayPeriods(cards, lessonsById, "t2", 0))).toEqual([4]);
    expect(Array.from(S().teacherDayPeriods(cards, lessonsById, "t9", 0))).toEqual([]);
  });

  it("counts gaps inside the span and longest consecutive run", () => {
    // t1 Mon has {1,2,4}; placing P3 closes the gap, run becomes 1-4.
    const c = S().teacherCost(new Set([1, 2, 4]), 0, 3, 1, null);
    expect(c).toEqual({ gaps: 0, run: 4, load: 4 });
    // Placing P6 extends the span with a gap at P5.
    const c2 = S().teacherCost(new Set([1, 2, 4]), 0, 6, 1, null);
    expect(c2).toEqual({ gaps: 2, run: 2, load: 4 });
    // Empty day: single placement, no gap, run 1.
    expect(S().teacherCost(new Set(), 2, 5, 1, null)).toEqual({ gaps: 0, run: 1, load: 1 });
  });

  it("respects the teaching-period axis (non-teaching breaks spans, not gaps)", () => {
    const teaching = new Set([1, 2, 3, 4, 5]);
    const c = S().teacherCost(new Set([1]), 0, 5, 1, teaching);
    expect(c.gaps).toBe(3); // P2,P3,P4 empty inside 1..5
    expect(c.run).toBe(1);
  });

  it("balanceCost aggregates the bottleneck teacher", () => {
    const bal = S().balanceCost(cards, lessonsById, ["t1", "t9"], 0, 3, 1, null);
    // t1: {1,2,4}+3 → gaps 0; t9: {}+3 → gaps 0. Worst wins either way.
    expect(bal.gaps).toBe(0);
    const bal2 = S().balanceCost(cards, lessonsById, ["t1"], 0, 6, 1, null);
    expect(bal2).toEqual({ gaps: 2, run: 2, load: 4 });
  });
});
