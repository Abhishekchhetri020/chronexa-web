// Regression test: when a subject has N periods/week in D days where N ≤ D,
// the solver should spread it 1 per day (no day gets 2 unless N > D).
//
// Scenario: EVS with 6 periods/week in a 6-day school → exactly 1 per day.
//           If 7 periods/week → one day gets 2, rest get 1.
//
// Usage:  node tools/test_subject_day_spread.mjs
// Exit:   0 on green, 1 on red.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");

const solverUrl = pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href;
const { solve } = await import(solverUrl);

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

// Test 1: 6 periods in 6 days → exactly 1 per day
{
  const school = {
    schoolName: "Subject Day Spread Test",
    daysPerWeek: 6,
    bell: {
      periods: Array.from({length: 7}, (_, i) => ({
        index: i + 1, label: `P${i+1}`, isTeaching: true,
      })),
    },
    teachers: [{ id: "T1", name: "EVS Teacher", abbr: "ET", timeOff: {} }],
    subjects: [
      { id: "EVS", name: "EVS", abbr: "EVS" },
      { id: "HIN", name: "Hindi", abbr: "Hi" },
    ],
    classes: [{ id: "C1", name: "VII A", short: "VII A" }],
    classrooms: [],
    groups: [],
    lessons: [
      {
        id: "L_EVS",
        classIds: ["C1"],
        teacherIds: ["T1"],
        subjectId: "EVS",
        groupIds: [],
        periodsPerWeek: 6,
      },
      // Filler to make the timetable non-trivial
      {
        id: "L_HIN",
        classIds: ["C1"],
        teacherIds: ["T1"],
        subjectId: "HIN",
        groupIds: [],
        periodsPerWeek: 6,
      },
    ],
    cards: [],
  };

  const res = solve(school, { warmStart: false, timeLimitSec: 5, seed: 42 });
  console.log(`6-in-6: status=${res.status} placed=${res.stats.placed} unplaced=${res.stats.unplaced}`);

  // Count EVS per day
  const evsPerDay = new Map();
  for (const a of res.assignment) {
    if (a.lessonId === "L_EVS") {
      evsPerDay.set(a.day, (evsPerDay.get(a.day) || 0) + 1);
    }
  }
  const maxEvsPerDay = Math.max(0, ...evsPerDay.values());
  const minEvsPerDay = Math.min(Infinity, ...evsPerDay.values());

  check(
    "6 EVS in 6 days: max per day is 1 (evenly spread)",
    maxEvsPerDay === 1,
    `maxPerDay=${maxEvsPerDay}, distribution=${JSON.stringify([...evsPerDay.entries()])}`
  );
  check(
    "6 EVS in 6 days: min per day is 1 (no empty days)",
    minEvsPerDay === 1,
    `minPerDay=${minEvsPerDay}, distribution=${JSON.stringify([...evsPerDay.entries()])}`
  );
  check(
    "all 12 cards placed",
    res.stats.placed === 12 && res.stats.unplaced === 0,
    `placed=${res.stats.placed} unplaced=${res.stats.unplaced}`
  );
}

// Test 2: 7 periods in 6 days → max 2 on one day, rest 1
{
  const school = {
    schoolName: "Subject Day Spread 7-in-6",
    daysPerWeek: 6,
    bell: {
      periods: Array.from({length: 7}, (_, i) => ({
        index: i + 1, label: `P${i+1}`, isTeaching: true,
      })),
    },
    teachers: [{ id: "T1", name: "EVS Teacher", abbr: "ET", timeOff: {} }],
    subjects: [{ id: "EVS", name: "EVS", abbr: "EVS" }],
    classes: [{ id: "C1", name: "VII A", short: "VII A" }],
    classrooms: [],
    groups: [],
    lessons: [{
      id: "L_EVS7",
      classIds: ["C1"],
      teacherIds: ["T1"],
      subjectId: "EVS",
      groupIds: [],
      periodsPerWeek: 7,
    }],
    cards: [],
  };

  const res = solve(school, { warmStart: false, timeLimitSec: 5, seed: 42 });
  console.log(`7-in-6: status=${res.status} placed=${res.stats.placed} unplaced=${res.stats.unplaced}`);

  const evsPerDay = new Map();
  for (const a of res.assignment) {
    if (a.lessonId === "L_EVS7") {
      evsPerDay.set(a.day, (evsPerDay.get(a.day) || 0) + 1);
    }
  }
  const maxPerDay = Math.max(0, ...evsPerDay.values());

  check(
    "7 EVS in 6 days: all 7 placed",
    res.stats.placed === 7 && res.stats.unplaced === 0,
    `placed=${res.stats.placed} unplaced=${res.stats.unplaced}`
  );
  check(
    "7 EVS in 6 days: max per day is 2 (ceil(7/6)=2 allowed)",
    maxPerDay <= 2,
    `maxPerDay=${maxPerDay}, distribution=${JSON.stringify([...evsPerDay.entries()])}`
  );
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
