import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

async function runSolverInBrowser(page, algorithm, timeLimitSec = 6) {
  return page.evaluate(async ({ algo, limit }) => {
    const S = window.APP.school;
    const src = window.SolverUI.run({
      school: S,
      options: { timeLimitSec: limit, verbose: false },
      algorithm: algo,
    });
    const res = await new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      if (src && typeof src.subscribe === "function") {
        src.subscribe((ev) => {
          if (ev && ev.type === "error") finish({ status: "ERROR", error: ev.message || ev.error });
          if (ev && ev.type === "done") finish(ev.result || ev.data || ev);
        });
      }
      if (src && typeof src.onResult === "function") src.onResult = finish;
      setTimeout(() => finish(null), Math.max(30_000, (limit + 25) * 1000));
    });
    return {
      status: res?.status || null,
      stats: res?.stats || null,
      error: res?.error || null,
      assignment: (res && res.assignment) || [],
    };
  }, { algo: algorithm, limit: timeLimitSec });
}

test("Block C/C2a: both browser JS and WASM CP-SAT co-place Week A and Week B on the same slot", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await loadDemoSchool(page);

  await page.evaluate(() => {
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
  });

  for (const algo of ["browser", "wasm"]) {
    const res = await runSolverInBrowser(page, algo, 5);
    expect(res.assignment, `${algo} stats=${JSON.stringify(res.stats)}`).toHaveLength(2);
    expect(res.assignment.find((c) => c.lessonId === "L_A")).toMatchObject({ day: 0, period: 1, classroomId: "R1", weeks: "10" });
    expect(res.assignment.find((c) => c.lessonId === "L_B")).toMatchObject({ day: 0, period: 1, classroomId: "R1", weeks: "01" });
  }
  expect(pageErrors).toEqual([]);
});

test("C2a: real-size demo school (half Week A, half Week B) survives both wasm and default auto/Best pipeline", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await loadDemoSchool(page);

  const meta = await page.evaluate(() => {
    const S = window.APP.school;
    S.weeks = [{ id: "0", name: "Week A", short: "A" }, { id: "1", name: "Week B", short: "B" }];
    S.weeksDefs = [
      { id: "WA", name: "Week A", short: "A", bits: "10" },
      { id: "WB", name: "Week B", short: "B", bits: "01" },
      { id: "WALL", name: "All weeks", short: "All", bits: "11" },
    ];
    S.lessons.forEach((l, i) => {
      l.weeksDefId = (i % 2 === 0) ? "WA" : "WB";
    });
    S.cards = [];
    if (window.CreateNew?.refreshIndex) window.CreateNew.refreshIndex();
    const totalCards = S.lessons.reduce((sum, l) => {
      const len = Number(l.periodsPerCard) || (l.isLabDouble ? 2 : 1) || 1;
      const ppw = Number(l.periodsPerWeek) || 0;
      return sum + (ppw > 0 ? Math.max(1, Math.round(ppw / len)) : 0);
    }, 0);
    return { totalCards, lessonCount: S.lessons.length };
  });

  for (const algo of ["wasm", "auto"]) {
    const res = await runSolverInBrowser(page, algo, 25);
    expect(res.assignment.length, `${algo} placed count on real-size A/B demo`).toBeGreaterThan(meta.totalCards - 20);
    const weekA = res.assignment.filter((c) => c.weeks === "10");
    const weekB = res.assignment.filter((c) => c.weeks === "01");
    expect(weekA.length, `${algo} must preserve Week A bitstrings`).toBeGreaterThan(300);
    expect(weekB.length, `${algo} must preserve Week B bitstrings`).toBeGreaterThan(300);

    // Verify zero same-week teacher conflicts across the solved A/B timetable
    const sameWeekConflicts = await page.evaluate((assignment) => {
      const lessonById = new Map(window.APP.school.lessons.map((l) => [l.id, l]));
      const seen = new Set();
      let clashes = 0;
      for (const c of assignment) {
        const l = lessonById.get(c.lessonId);
        if (!l) continue;
        const wk = c.weeks || "11";
        for (const tid of (l.teacherIds || [])) {
          const key = `${tid}|${c.day}|${c.period}|${wk}`;
          if (seen.has(key)) clashes++;
          else seen.add(key);
        }
      }
      return clashes;
    }, res.assignment);
    expect(sameWeekConflicts, `${algo} must have 0 same-week teacher conflicts`).toBe(0);
  }
  expect(pageErrors).toEqual([]);
});
