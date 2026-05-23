// Regression test for the multi-session lock collapse (lock-system audit
// bug C). When `lesson.fixedDay/fixedPeriod` is set on a lesson with
// periodsPerWeek > 1, the solver expands it to N sessions. Before the fix,
// ALL N sessions inherited the same fixed slot — only 1 could place, the
// other N-1 were hard-unplaceable. After the fix, only session #0 inherits
// the lock; the rest are free to be placed wherever feasible.
//
// Usage:  node tools/test_multisession_lesson_lock.mjs
// Exit:   0 on green, 1 on red.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");
const require_   = createRequire(import.meta.url);

const { JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window    = dom.window;
globalThis.document  = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;

const solverUrl = pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href;
const { solve } = await import(solverUrl);

// Build a minimal school: ONE class (V-A), one teacher, one subject, ONE
// lesson with periodsPerWeek = 5, lesson.fixedDay=0, fixedPeriod=1 (pin the
// "first card" the user locked at Mon-P1). With the bug, all 5 expanded
// sessions are pinned to Mon-P1 — only 1 places, 4 are hard-unplaceable.
// After the fix, session #0 stays pinned and the other 4 get any free slot.
const school = {
  schoolName: "Multi-session Lock Test",
  daysPerWeek: 5,
  bell: { periods: Array.from({length: 8}, (_, i) => ({ index: i + 1, label: `P${i+1}`, isTeaching: true })) },
  teachers: [{ id: "T1", name: "Maths Teacher", abbr: "M", timeOff: {} }],
  subjects: [{ id: "S1", name: "Maths", abbr: "M" }],
  classes:  [{ id: "C1", name: "V-A", short: "V-A" }],
  classrooms: [{ id: "R1", name: "Room 1", short: "R1" }],
  groups: [],
  lessons: [{
    id: "L_MATHS",
    classIds: ["C1"],
    teacherIds: ["T1"],
    subjectId: "S1",
    groupIds: [],
    periodsPerWeek: 5,
    preferredRoomId: "R1",
    fixedDay: 0,
    fixedPeriod: 1,
  }],
  cards: [],
};

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

const res = await solve(school, { warmStart: false, timeBudgetMs: 5000 });
console.log(`solve(): status=${res.status} placed=${res.stats.placed} unplaced=${res.stats.unplaced} hardConflicts=${res.stats.hardConflicts}`);

// Goal: all 5 expanded sessions place. Before the fix this would be 1/5.
check(
  "all 5 sessions of a multi-period locked lesson are placeable",
  res.stats.placed === 5 && res.stats.unplaced === 0,
  `placed=${res.stats.placed} unplaced=${res.stats.unplaced} (expected 5 + 0)`
);

// Session #0 must honor the lock: at least one placed card sits at Mon-P1.
const monP1 = res.assignment.filter(a => a.day === 0 && a.period === 1);
check(
  "session #0 still anchored at the locked slot (Mon-P1)",
  monP1.length === 1,
  `cards at Mon-P1 = ${monP1.length} (expected 1)`
);

// And the other 4 must be elsewhere (not all at Mon-P1).
const elsewhere = res.assignment.filter(a => !(a.day === 0 && a.period === 1));
check(
  "remaining 4 sessions placed at distinct slots away from Mon-P1",
  elsewhere.length === 4,
  `cards not at Mon-P1 = ${elsewhere.length} (expected 4)`
);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
