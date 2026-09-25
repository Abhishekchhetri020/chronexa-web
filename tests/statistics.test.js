import { describe, it, expect } from "vitest";
import "../js/ui/components/statistics_panel.js";

describe("Statistics - Gap windows and Exhaustion table", () => {
  it("accurately counts teacher gap windows per day and per week on a hand-built timetable", () => {
    // 5-day week, 7 periods per day
    const school = {
      schoolName: "Window Test School",
      daysPerWeek: 5,
      bell: {
        periods: [
          { index: 1 }, { index: 2 }, { index: 3 },
          { index: 4 }, { index: 5 }, { index: 6 }, { index: 7 },
        ],
      },
      teachers: [
        { id: "t1", name: "Prof. Gaps" },
        { id: "t2", name: "Prof. Solid" },
      ],
      classes: [{ id: "c1", name: "Class 1" }],
      subjects: [{ id: "s1", name: "Subject 1" }],
      lessons: [
        { id: "l1", teacherIds: ["t1"], classIds: ["c1"], subjectId: "s1", periodsPerWeek: 8 },
        { id: "l2", teacherIds: ["t2"], classIds: ["c1"], subjectId: "s1", periodsPerWeek: 4 },
      ],
      cards: [
        // Teacher t1:
        // Day 0: periods 0 and 2 -> 1 idle period (period 1)
        { lessonId: "l1", day: 0, period: 0 },
        { lessonId: "l1", day: 0, period: 2 },

        // Day 1: periods 1, 2, 5 -> 2 idle periods (periods 3 and 4)
        { lessonId: "l1", day: 1, period: 1 },
        { lessonId: "l1", day: 1, period: 2 },
        { lessonId: "l1", day: 1, period: 5 },

        // Day 2: periods 0, 1, 2 -> consecutive, 0 idle periods
        { lessonId: "l1", day: 2, period: 0 },
        { lessonId: "l1", day: 2, period: 1 },
        { lessonId: "l1", day: 2, period: 2 },

        // Day 3: single lesson at period 4 -> 0 windows
        { lessonId: "l1", day: 3, period: 4 },

        // Day 4: no lessons -> 0 windows

        // Teacher t2:
        // Day 0: periods 0, 1, 2, 3 -> consecutive, 0 windows
        { lessonId: "l2", day: 0, period: 0 },
        { lessonId: "l2", day: 0, period: 1 },
        { lessonId: "l2", day: 0, period: 2 },
        { lessonId: "l2", day: 0, period: 3 },
      ],
    };

    const stats = window.StatisticsPanel.compute(school);
    expect(stats).toBeDefined();

    const t1 = stats.teachers.find(t => t.id === "t1");
    expect(t1).toBeDefined();
    // Daily windows: Day 0 has 1 window, Day 1 has 2 windows, others 0
    expect(t1.windowsPerDay[0]).toBe(1);
    expect(t1.windowsPerDay[1]).toBe(2);
    expect(t1.windowsPerDay[2]).toBe(0);
    expect(t1.windowsPerDay[3]).toBe(0);
    expect(t1.windowsPerDay[4]).toBe(0);

    // Total weekly windows: 1 + 2 = 3
    expect(t1.windows).toBe(3);
    expect(t1.maxDailyWindow).toBe(2);

    const t2 = stats.teachers.find(t => t.id === "t2");
    expect(t2).toBeDefined();
    expect(t2.windows).toBe(0);
    expect(t2.maxDailyWindow).toBe(0);
  });

  it("builds a sortable exhaustion table with used / available periods and percentage for teachers and classes", () => {
    // 5-day week, 6 periods per day = 30 total periods
    const school = {
      schoolName: "Exhaustion School",
      daysPerWeek: 5,
      bell: {
        periods: [
          { index: 1 }, { index: 2 }, { index: 3 },
          { index: 4 }, { index: 5 }, { index: 6 },
        ],
      },
      teachers: [
        {
          id: "t1",
          name: "Teacher High",
          // 5 slots blocked out of 30 -> 25 available
          timeOff: [
            [2, 0, 0, 0, 0, 0],
            [2, 0, 0, 0, 0, 0],
            [2, 0, 0, 0, 0, 0],
            [2, 0, 0, 0, 0, 0],
            [2, 0, 0, 0, 0, 0],
          ],
        },
        { id: "t2", name: "Teacher Low", timeOff: [] }, // 30 available
      ],
      classes: [
        { id: "c1", name: "Class Alpha" }, // 30 available
      ],
      subjects: [{ id: "s1", name: "Math" }],
      lessons: [
        { id: "l1", teacherIds: ["t1"], classIds: ["c1"], subjectId: "s1", periodsPerWeek: 20 },
        { id: "l2", teacherIds: ["t2"], classIds: ["c1"], subjectId: "s1", periodsPerWeek: 5 },
      ],
      cards: [
        // 20 cards for l1 (Teacher t1, Class c1)
        ...Array.from({ length: 20 }, (_, i) => ({
          lessonId: "l1",
          day: Math.floor(i / 4),
          period: (i % 4) + 1,
        })),
        // 5 cards for l2 (Teacher t2, Class c1)
        ...Array.from({ length: 5 }, (_, i) => ({
          lessonId: "l2",
          day: i,
          period: 5,
        })),
      ],
    };

    const stats = window.StatisticsPanel.compute(school);
    expect(stats.exhaustionTable).toBeDefined();
    expect(Array.isArray(stats.exhaustionTable)).toBe(true);

    // Should include both teachers and class
    const t1Entry = stats.exhaustionTable.find(e => e.id === "t1" && e.type === "Teacher");
    expect(t1Entry).toBeDefined();
    expect(t1Entry.used).toBe(20);
    expect(t1Entry.available).toBe(25);
    expect(t1Entry.percentage).toBe(80); // 20 / 25 = 80%

    const t2Entry = stats.exhaustionTable.find(e => e.id === "t2" && e.type === "Teacher");
    expect(t2Entry).toBeDefined();
    expect(t2Entry.used).toBe(5);
    expect(t2Entry.available).toBe(30);
    expect(t2Entry.percentage).toBe(17); // 5 / 30 = 17%

    const c1Entry = stats.exhaustionTable.find(e => e.id === "c1" && e.type === "Class");
    expect(c1Entry).toBeDefined();
    expect(c1Entry.used).toBe(25); // 20 + 5 = 25
    expect(c1Entry.available).toBe(30);
    expect(c1Entry.percentage).toBe(83); // 25 / 30 = 83%

    // Sorting helper check
    const sortedDesc = window.StatisticsPanel.sortExhaustion(stats.exhaustionTable, "percentage", "desc");
    expect(sortedDesc[0].id).toBe("c1"); // 83%
    expect(sortedDesc[1].id).toBe("t1"); // 80%
    expect(sortedDesc[2].id).toBe("t2"); // 17%

    const sortedAsc = window.StatisticsPanel.sortExhaustion(stats.exhaustionTable, "percentage", "asc");
    expect(sortedAsc[0].id).toBe("t2");
    expect(sortedAsc[2].id).toBe("c1");
  });
});
