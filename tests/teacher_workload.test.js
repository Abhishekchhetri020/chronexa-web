// Teacher workload & contract — the report that finally reads
// teacherContractLength. computeWorkload() is pure, so the numbers are asserted
// directly instead of scraping a rendered page.
import { describe, it, expect } from "vitest";
import { computeTeacherWorkload } from "../js/ui/print_preview/templates/teacher_workload.js";

const school = {
  schoolName: "Workload fixture",
  daysPerWeek: 6,
  periodsPerDay: 8,
  buildings: [{ id: "b1", name: "Main" }],
  classrooms: [
    { id: "r1", name: "R1", buildingId: "b1" },
    { id: "r2", name: "R2", buildingId: "b1" },
    { id: "r3", name: "R3" },
  ],
  teachers: [
    { id: "t1", name: "Busy", teacherContractLength: 4 },
    { id: "t2", name: "Quiet", constraints: { teacherContractLength: 6 } },
    { id: "t3", name: "Free" },
  ],
  classroomsupervisions: [{ id: "s1", teacherId: "t1" }, { id: "s2", teacherId: "t1" }],
  _idx: {
    cardsByTeacher: {
      // Busy: Mon P1,P3 (one isolated gap), Tue P8 (last period), Wed P2 + P3
      t1: [
        { day: 0, period: 1, classroomId: "r1" },
        { day: 0, period: 3, classroomId: "r2" },
        { day: 1, period: 8, classroomId: "r1" },
        { day: 2, period: 2, classroomId: "r3" },
        { day: 2, period: 3, classroomId: "r1" },
      ],
      t2: [{ day: 0, period: 1, classroomId: "r1" }],
      t3: [],
    },
  },
};

describe("computeTeacherWorkload", () => {
  const rows = computeTeacherWorkload(school);
  const by = (name) => rows.find((r) => r.name === name);

  it("counts periods, days and days off", () => {
    expect(by("Busy").periods).toBe(5);
    expect(by("Busy").days).toBe(3);
    expect(by("Busy").daysOff).toBe(3);        // 6-day week, 3 used
    expect(by("Free").periods).toBe(0);
    expect(by("Free").daysOff).toBe(6);
  });

  it("separates total gaps from isolated ones", () => {
    // Mon P1,P3 -> one gap, isolated; Tue P8 none; Wed P2,P3 none.
    expect(by("Busy").dayGaps).toBe(1);
    expect(by("Busy").isolatedGaps).toBe(1);
  });

  it("finds the longest run and last-period duty", () => {
    expect(by("Busy").longestRun).toBe(2);     // Wed P2+P3
    expect(by("Busy").lastPeriods).toBe(1);    // Tue P8
  });

  it("counts rooms and buildings", () => {
    expect(by("Busy").rooms).toBe(3);
    expect(by("Busy").buildings).toBe(1);      // r3 has no building
  });

  it("counts supervision duties", () => {
    expect(by("Busy").duties).toBe(2);
    expect(by("Quiet").duties).toBe(0);
  });

  it("reads the contract from either spelling and reports the delta", () => {
    expect(by("Busy").contract).toBe(4);
    expect(by("Busy").delta).toBe(1);          // 5 placed vs 4 contract
    expect(by("Quiet").contract).toBe(6);      // from constraints
    expect(by("Quiet").delta).toBe(-5);
    expect(by("Free").contract).toBeNull();
    expect(by("Free").delta).toBeNull();
  });

  it("falls back to school.cards when there is no index", () => {
    const bare = {
      ...school,
      _idx: {},
      lessons: [{ id: "L1", teacherIds: ["t1"] }],
      cards: [{ lessonId: "L1", day: 0, period: 1 }, { lessonId: "L1", day: 0, period: 2 }],
    };
    const r = computeTeacherWorkload(bare).find((x) => x.name === "Busy");
    expect(r.periods).toBe(2);
    expect(r.longestRun).toBe(2);
  });
});
