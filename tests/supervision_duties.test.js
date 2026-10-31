// Supervision duty printing (aSc ttreports.printsubstduty). One page: periods
// down, days across, each cell listing the rooms on duty with their teacher.
import { describe, it, expect } from "vitest";
import { computeSupervisionGrid } from "../js/ui/print_preview/templates/supervision_duties.js";

const bell = { periods: [1, 2, 3].map((i) => ({ index: i, isTeaching: true })) };

describe("computeSupervisionGrid", () => {
  it("reads classroomsupervisions into day/period cells", () => {
    const school = {
      bell,
      days: [{ short: "Mo" }, { short: "Tu" }],
      classrooms: [{ id: "r1", name: "Gate" }, { id: "r2", name: "Hall" }],
      teachers: [{ id: "t1", name: "Ms. Rao" }, { id: "t2", name: "Mr. Das" }],
      classroomsupervisions: [
        { id: "s1", day: 0, period: 1, classroomid: "r2", teacherid: "t2" },
        { id: "s2", day: 0, period: 1, classroomid: "r1", teacherid: "t1" },
        { id: "s3", day: 1, period: 3, classroomid: "r1", teacherid: "t1" },
      ],
    };
    const { days, periods, grid } = computeSupervisionGrid(school);
    expect(days).toEqual(["Mo", "Tu"]);
    expect(periods).toEqual([1, 2, 3]);
    // two duties share the Monday first period, sorted by room
    expect(grid["0_1"]).toEqual([
      { room: "Gate", teacher: "Ms. Rao" },
      { room: "Hall", teacher: "Mr. Das" },
    ]);
    expect(grid["1_3"]).toEqual([{ room: "Gate", teacher: "Ms. Rao" }]);
    expect(grid["0_2"]).toBeUndefined();
  });

  it("falls back to duty lessons on floor pseudo-classes", () => {
    const school = {
      bell,
      days: [{ short: "Mo" }],
      classrooms: [{ id: "r1", name: "Corridor" }],
      teachers: [{ id: "t1", name: "Ms. Rao" }],
      classes: [{ id: "c1", name: "1st Floor" }, { id: "c2", name: "IX A" }],
      lessons: [
        { id: "L1", classIds: ["c1"], teacherIds: ["t1"] },
        { id: "L2", classIds: ["c2"], teacherIds: ["t1"] },
      ],
      cards: [
        { lessonId: "L1", day: 0, period: 2, classroomId: "r1" },
        { lessonId: "L2", day: 0, period: 3 },
      ],
    };
    const { grid } = computeSupervisionGrid(school);
    expect(grid["0_2"]).toEqual([{ room: "Corridor", teacher: "Ms. Rao" }]);
    expect(grid["0_3"]).toBeUndefined();     // a normal class lesson is not a duty
  });

  it("returns empty structures rather than throwing on a bare file", () => {
    const out = computeSupervisionGrid({});
    expect(out.periods.length).toBe(8);
    expect(out.days.length).toBe(6);
    expect(Object.keys(out.grid)).toHaveLength(0);
  });
});
