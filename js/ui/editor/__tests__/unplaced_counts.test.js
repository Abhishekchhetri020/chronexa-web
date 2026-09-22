import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeUnplacedCountsByClass,
  getUnplacedCountForClass,
  formatClassUnplacedCount
} from "../unplaced_counts.js";

describe("unplaced_counts", () => {
  it("returns empty object for empty or missing school", () => {
    assert.deepStrictEqual(computeUnplacedCountsByClass(null), {});
    assert.deepStrictEqual(computeUnplacedCountsByClass(undefined), {});
    assert.deepStrictEqual(computeUnplacedCountsByClass({}), {});
    assert.deepStrictEqual(computeUnplacedCountsByClass({ lessons: [] }), {});
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
    assert.strictEqual(counts["class_1"], 1);
    assert.strictEqual(counts["class_2"], 3);
    assert.strictEqual(getUnplacedCountForClass(counts, "class_1"), 1);
    assert.strictEqual(getUnplacedCountForClass(counts, "class_2"), 3);
    assert.strictEqual(getUnplacedCountForClass(counts, "class_nonexistent"), 0);
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
    // class_A has 1 (solo) + 1 (joint) = 2
    assert.strictEqual(counts["class_A"], 2);
    // class_B has 1 (joint) = 1
    assert.strictEqual(counts["class_B"], 1);
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
    assert.strictEqual(counts["class_sci"], 2);
  });

  it("supports fallback classId field on lessons", () => {
    const school = {
      lessons: [
        { id: "L1", classId: "class_single", periodsPerWeek: 2, lessonLength: 1 }
      ],
      cards: []
    };

    const counts = computeUnplacedCountsByClass(school);
    assert.strictEqual(counts["class_single"], 2);
  });

  it("formats counts: no badge / empty string for zero, plain numeric string for >0", () => {
    assert.strictEqual(formatClassUnplacedCount(0), "");
    assert.strictEqual(formatClassUnplacedCount(-1), "");
    assert.strictEqual(formatClassUnplacedCount(null), "");
    assert.strictEqual(formatClassUnplacedCount(undefined), "");
    assert.strictEqual(formatClassUnplacedCount(1), "1");
    assert.strictEqual(formatClassUnplacedCount(4), "4");
    assert.strictEqual(formatClassUnplacedCount(12), "12");
  });
});
