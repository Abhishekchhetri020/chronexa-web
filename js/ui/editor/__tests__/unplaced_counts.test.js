import { describe, it, expect } from "vitest";
import {
  computeUnplacedCountsByClass,
  getUnplacedCountForClass,
  formatClassUnplacedCount
} from "../unplaced_counts.js";

describe("unplaced_counts", () => {
  it("returns empty object for empty or missing school", () => {
    expect(computeUnplacedCountsByClass(null)).toEqual({});
    expect(computeUnplacedCountsByClass(undefined)).toEqual({});
    expect(computeUnplacedCountsByClass({})).toEqual({});
    expect(computeUnplacedCountsByClass({ lessons: [] })).toEqual({});
  });

  it("calculates unplaced lessons for single-class lessons", () => {
    const school = {
      lessons: [
        { id: "L1", classIds: ["class_1"], periodsPerWeek: 3, lessonLength: 1 },
        { id: "L2", classIds: ["class_1"], periodsPerWeek: 2, lessonLength: 1 },
        { id: "L3", classIds: ["class_2"], periodsPerWeek: 4, lessonLength: 1 }
      ],
      cards: [
        { id: "c1", lessonId: "L1" },
        { id: "c2", lessonId: "L1" }, // L1 has 2 placed, 1 missing
        { id: "c3", lessonId: "L2" },
        { id: "c4", lessonId: "L2" }, // L2 has 2 placed, 0 missing
        { id: "c5", lessonId: "L3" }  // L3 has 1 placed, 3 missing
      ]
    };

    const counts = computeUnplacedCountsByClass(school);
    expect(counts["class_1"]).toBe(1);
    expect(counts["class_2"]).toBe(3);
    expect(getUnplacedCountForClass(counts, "class_1")).toBe(1);
    expect(getUnplacedCountForClass(counts, "class_2")).toBe(3);
    expect(getUnplacedCountForClass(counts, "class_nonexistent")).toBe(0);
  });

  it("handles joint lessons by counting once for each participating class", () => {
    const school = {
      lessons: [
        // Joint lesson shared between class_A and class_B
        { id: "joint_1", classIds: ["class_A", "class_B"], periodsPerWeek: 2, lessonLength: 1 },
        // Dedicated lesson for class_A
        { id: "solo_A", classIds: ["class_A"], periodsPerWeek: 3, lessonLength: 1 }
      ],
      cards: [
        // 1 of 2 placed for joint_1 -> 1 missing
        { id: "c1", lessonId: "joint_1" },
        // 2 of 3 placed for solo_A -> 1 missing
        { id: "c2", lessonId: "solo_A" },
        { id: "c3", lessonId: "solo_A" }
      ]
    };

    const counts = computeUnplacedCountsByClass(school);
    expect(counts["class_A"]).toBe(2);
    expect(counts["class_B"]).toBe(1);
  });

  it("handles double-period lessons with lessonLength / isLabDouble", () => {
    const school = {
      lessons: [
        { id: "lab_1", classIds: ["class_sci"], periodsPerWeek: 4, lessonLength: 2 },
        { id: "lab_2", classIds: ["class_sci"], periodsPerWeek: 2, isLabDouble: true }
      ],
      cards: [
        // lab_1 needed = 4/2 = 2. 1 placed -> 1 missing
        { id: "c1", lessonId: "lab_1" }
        // lab_2 needed = 2/2 = 1. 0 placed -> 1 missing
      ]
    };

    const counts = computeUnplacedCountsByClass(school);
    expect(counts["class_sci"]).toBe(2);
  });

  it("supports fallback classId field on lessons", () => {
    const school = {
      lessons: [
        { id: "L1", classId: "class_single", periodsPerWeek: 2, lessonLength: 1 }
      ],
      cards: []
    };

    const counts = computeUnplacedCountsByClass(school);
    expect(counts["class_single"]).toBe(2);
  });

  it("formats counts: no badge / empty string for zero, plain numeric string for >0", () => {
    expect(formatClassUnplacedCount(0)).toBe("");
    expect(formatClassUnplacedCount(-1)).toBe("");
    expect(formatClassUnplacedCount(null)).toBe("");
    expect(formatClassUnplacedCount(undefined)).toBe("");
    expect(formatClassUnplacedCount(1)).toBe("1");
    expect(formatClassUnplacedCount(4)).toBe("4");
    expect(formatClassUnplacedCount(12)).toBe("12");
  });
});
