// Regression test: the solver must not stack a class's same subject beyond
// the daily cap. A 2-day school with 5 weekly periods can place at most 4
// cards when the default subjectDailyLimit is 2.
//
// Usage:  node tools/test_subject_daily_limit.mjs
// Exit:   0 on green, 1 on red.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");

const solverUrl = pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href;
const { solve } = await import(solverUrl);

const school = {
  schoolName: "Subject Daily Limit Test",
  daysPerWeek: 2,
  bell: { periods: Array.from({length: 4}, (_, i) => ({ index: i + 1, label: `P${i+1}`, isTeaching: true })) },
  teachers: [{ id: "T1", name: "Hindi Teacher", abbr: "HT", timeOff: {} }],
  subjects: [{ id: "HIN", name: "Hindi", abbr: "Hi" }],
  classes: [{ id: "C1", name: "I B", short: "I B" }],
  classrooms: [],
  groups: [],
  lessons: [{
    id: "L_HINDI",
    classIds: ["C1"],
    teacherIds: ["T1"],
    subjectId: "HIN",
    groupIds: [],
    periodsPerWeek: 5,
  }],
  cards: [],
};

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

const res = await solve(school, { warmStart: false, timeBudgetMs: 4000, seed: 7 });
console.log(`solve(): status=${res.status} placed=${res.stats.placed} unplaced=${res.stats.unplaced}`);

const perDay = new Map();
for (const a of res.assignment) {
  perDay.set(a.day, (perDay.get(a.day) || 0) + 1);
}
const maxPerDay = Math.max(0, ...perDay.values());

check(
  "default cap prevents more than 2 same-subject periods per class per day",
  maxPerDay <= 2,
  `maxPerDay=${maxPerDay}`
);
check(
  "impossible fifth same-subject card is left unplaced",
  res.stats.placed === 4 && res.stats.unplaced === 1,
  `placed=${res.stats.placed} unplaced=${res.stats.unplaced}`
);

school.globals = { constraints: { subjectDailyLimit: "*" } };
const unlimited = await solve(school, { warmStart: false, timeBudgetMs: 4000, seed: 7 });
console.log(`unlimited solve(): status=${unlimited.status} placed=${unlimited.stats.placed} unplaced=${unlimited.stats.unplaced}`);

check(
  "explicit unlimited subjectDailyLimit keeps legacy opt-out behavior",
  unlimited.stats.placed === 5 && unlimited.stats.unplaced === 0,
  `placed=${unlimited.stats.placed} unplaced=${unlimited.stats.unplaced}`
);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
