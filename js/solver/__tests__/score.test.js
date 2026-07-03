import { describe, it, expect } from "vitest";
import { solve, __test_internals } from "../csp_solver.js";
import { loadSampleSchool } from "./helpers/load_school.js";

const { buildModel } = __test_internals;

describe("model build (score inputs)", () => {
  it("builds weights and scorer masks from the sample school", () => {
    const school = loadSampleSchool();
    const m = buildModel(school);
    expect(m.lessonCount).toBeGreaterThan(900);       // 946 expanded sessions
    expect(m.weights.length).toBeGreaterThanOrEqual(13);
    for (const w of m.weights) expect(w).toBeGreaterThanOrEqual(0);
    expect(m.periodPref.length).toBe(m.periodsPerDay);
    expect(m.classSubjectTarget.length).toBe(m.classCount * m.subjectCount);
  });
});

describe("solve() score calculation — warm start regression gate", () => {
  // Mirrors tools/warm_trajectory.mjs: the canonical 946/946 benchmark.
  it("places all 946 cards with zero conflicts and a negative soft score", () => {
    const school = loadSampleSchool();
    const r = solve(school, { warmStart: true, timeLimitSec: 10, seed: 11, useIterativeRepair: true });
    expect(r.stats.placed).toBe(946);
    expect(r.stats.hardConflicts).toBe(0);
    expect(["FEASIBLE", "OPTIMAL"]).toContain(r.status);
    // Soft score must be a real computed number (22+ scoring terms), not 0.
    expect(typeof r.stats.softScore).toBe("number");
    expect(r.stats.softScore).toBeLessThan(0);
  }, 60000);

  it("is deterministic for a fixed seed", () => {
    const school = loadSampleSchool();
    const a = solve(school, { warmStart: true, timeLimitSec: 5, seed: 7 });
    const b = solve(school, { warmStart: true, timeLimitSec: 5, seed: 7 });
    expect(a.stats.placed).toBe(b.stats.placed);
    expect(a.stats.softScore).toBe(b.stats.softScore);
  }, 60000);
});
