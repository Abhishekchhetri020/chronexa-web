import { describe, it, expect } from "vitest";
import {
  Weight, FAIL, FAIL_NAME, HARD_CONSTRAINTS, DEFAULT_SOFT_WEIGHTS,
  checkPlacement, CKritResty,
} from "../constraints.js";
import { loadSampleSchool } from "./helpers/load_school.js";

describe("constraint catalog invariants", () => {
  it("every FAIL code has a FAIL_NAME", () => {
    for (const [key, code] of Object.entries(FAIL)) {
      expect(FAIL_NAME[code], `FAIL.${key} (${code}) missing from FAIL_NAME`).toBeTruthy();
    }
  });

  it("weight tiers are strictly ordered", () => {
    expect(Weight.HARD).toBeGreaterThan(Weight.NEAR_HARD);
    expect(Weight.NEAR_HARD).toBeGreaterThan(Weight.HIGH_SOFT);
    expect(Weight.HIGH_SOFT).toBeGreaterThan(Weight.MED_SOFT);
    expect(Weight.MED_SOFT).toBeGreaterThan(Weight.LOW_SOFT);
    expect(Weight.LOW_SOFT).toBeGreaterThan(Weight.HINT);
  });

  it("soft weights are positive and hard catalog is non-empty", () => {
    expect(HARD_CONSTRAINTS.length).toBeGreaterThan(5);
    for (const [k, w] of Object.entries(DEFAULT_SOFT_WEIGHTS)) {
      expect(w, `weight ${k}`).toBeGreaterThan(0);
    }
  });
});

describe("checkPlacement on the sample school", () => {
  it("flags a teacher conflict when double-booking an occupied slot", () => {
    const school = loadSampleSchool();
    // Find two different lessons sharing a teacher, one already placed.
    const placedCard = school.cards.find((c) => {
      const l = school._idx.lessonById[c.lessonId];
      return l && (l.teacherIds || []).length === 1;
    });
    expect(placedCard).toBeTruthy();
    const teacher = school._idx.lessonById[placedCard.lessonId].teacherIds[0];
    const other = school.lessons.find(
      (l) => l.id !== placedCard.lessonId && (l.teacherIds || []).includes(teacher)
    );
    expect(other, "sample school should have a second lesson for this teacher").toBeTruthy();

    const res = checkPlacement(school, other.id, placedCard.day, placedCard.period, null);
    expect(res.hard.length).toBeGreaterThan(0);
    // Messages are human-phrased, e.g. "Mr. X already teaches VIII C → CHEM…".
    expect(res.hard.join(" ")).toMatch(/already teaches|already has|teacher|busy/i);
  });

  it("returns a shaped result for an unknown lesson", () => {
    const school = loadSampleSchool();
    const res = checkPlacement(school, "no-such-lesson", 0, 1, null);
    expect(res.hard).toContain("Unknown lesson");
    expect(res.soft).toEqual([]);
  });
});

describe("CKritResty (rest between heavy days)", () => {
  it("returns the {violations, weight} contract on real data", () => {
    const school = loadSampleSchool();
    const lessonsById = new Map(school.lessons.map((l) => [l.id, l]));
    const r = CKritResty(school.cards, lessonsById, school);
    expect(r).toHaveProperty("violations");
    expect(r).toHaveProperty("weight");
    expect(r.violations).toBeGreaterThanOrEqual(0);
    expect(r.weight).toBeGreaterThan(0);
  });
});
