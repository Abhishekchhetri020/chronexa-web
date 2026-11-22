import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test("Block C: Generate co-places Week A and Week B lessons on the same slot with week bitstrings", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await loadDemoSchool(page);

  // Configure a minimal 1-day x 1-period, 2-week (Week A / Week B) school where
  // 1 teacher teaches 2 lessons to 1 class in the same room — only solvable when
  // the browser solver honours multi-week slice occupancy.
  const assignment = await page.evaluate(async () => {
    const S = window.APP.school;
    S.days = [{ id: "0", name: "Monday", short: "Mo" }];
    S.bell = { periods: [{ index: 1, label: "1", start: "08:00", end: "08:45", isTeaching: true }] };
    S.weeks = [{ id: "0", name: "Week A", short: "A" }, { id: "1", name: "Week B", short: "B" }];
    S.weeksDefs = [
      { id: "WA", name: "Week A", short: "A", bits: "10" },
      { id: "WB", name: "Week B", short: "B", bits: "01" },
      { id: "WALL", name: "All weeks", short: "All", bits: "11" },
    ];
    S.teachers = [{ id: "T1", name: "Alice", short: "AL" }];
    S.classes = [{ id: "C1", name: "10A", short: "10A" }];
    S.subjects = [
      { id: "S1", name: "Physics", short: "PHY" },
      { id: "S2", name: "Chemistry", short: "CHM" },
    ];
    S.classrooms = [{ id: "R1", name: "Lab 1", short: "L1" }];
    S.lessons = [
      { id: "L_A", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], preferredRoomId: "R1", periodsPerWeek: 1, weeksDefId: "WA" },
      { id: "L_B", subjectId: "S2", teacherIds: ["T1"], classIds: ["C1"], preferredRoomId: "R1", periodsPerWeek: 1, weeksDefId: "WB" },
    ];
    S.cards = [];
    if (window.CreateNew?.refreshIndex) window.CreateNew.refreshIndex();

    const src = window.SolverUI.run({
      school: S,
      options: { timeLimitSec: 3, verbose: false },
      algorithm: "browser",
    });
    const res = await new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      if (src && typeof src.subscribe === "function") {
        src.subscribe((ev) => { if (ev && ev.type === "done") finish(ev.result || ev.data || ev); });
      }
      if (src && typeof src.onResult === "function") src.onResult = finish;
      setTimeout(() => finish(null), 20_000);
    });
    return (res && res.assignment) || [];
  });

  expect(assignment).toHaveLength(2);
  expect(assignment.find((c) => c.lessonId === "L_A")).toMatchObject({ day: 0, period: 1, classroomId: "R1", weeks: "10" });
  expect(assignment.find((c) => c.lessonId === "L_B")).toMatchObject({ day: 0, period: 1, classroomId: "R1", weeks: "01" });
  expect(errors).toEqual([]);
});
