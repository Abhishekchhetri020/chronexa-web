// Regression test: solve() output must never contain class/teacher/room
// double-booking, even when the source XML has duplicate cards or other
// adversarial data. The post-solve scrub in csp_solver.js drops the
// conflicting placement into unplaced rather than emitting it in
// `assignment[]`.
//
// Repros the user-reported scenario from sample-school (3)-export (1).xml
// where VI B Mon-P7, X A Thu-P2, etc. showed double/triple booking in the
// rendered timetable.
//
// Usage:  node tools/test_no_double_booking.mjs
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

const parserSrc = fs.readFileSync(path.join(repoRoot, "js/xml/parse_timetable_xml.js"), "utf8");
vm.runInThisContext(parserSrc, { filename: "parse_timetable_xml.js" });
const parseTimetableXml = globalThis.window.parseTimetableXml;

const solverUrl = pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href;
const { solve } = await import(solverUrl);

// Build a minimal-but-adversarial school: one whole-class lesson with
// duplicate source cards at the same slot, plus another whole-class lesson
// with cards that overlap the first. Without the scrub, solver output
// shows two cards at one (class, slot).
const school = {
  schoolName: "Adversarial",
  daysPerWeek: 5,
  bell: { periods: Array.from({length: 6}, (_, i) => ({ index: i + 1, label: `P${i+1}`, isTeaching: true })) },
  teachers: [
    { id: "T1", name: "Teacher 1", abbr: "T1", timeOff: {} },
    { id: "T2", name: "Teacher 2", abbr: "T2", timeOff: {} },
  ],
  subjects: [{ id: "S1", name: "Math" }, { id: "S2", name: "English" }],
  classes: [{ id: "C1", name: "I" }],
  classrooms: [],
  groups: [],
  lessons: [
    { id: "L1", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S1", groupIds: [], periodsPerWeek: 4 },
    { id: "L2", classIds: ["C1"], teacherIds: ["T2"], subjectId: "S2", groupIds: [], periodsPerWeek: 4 },
  ],
  cards: [
    // L1 has TWO duplicate cards at (Mon, P1) and (Tue, P2) — simulates the
    // user's XML where AA4E... appeared twice at (D2, P5).
    { lessonId: "L1", day: 0, period: 1, classroomId: null },
    { lessonId: "L1", day: 0, period: 1, classroomId: null },
    { lessonId: "L1", day: 1, period: 2, classroomId: null },
    { lessonId: "L1", day: 1, period: 2, classroomId: null },
    // L2 has cards that overlap L1's slots.
    { lessonId: "L2", day: 0, period: 1, classroomId: null },
    { lessonId: "L2", day: 2, period: 1, classroomId: null },
    { lessonId: "L2", day: 3, period: 1, classroomId: null },
    { lessonId: "L2", day: 4, period: 1, classroomId: null },
  ],
};

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

const res = await solve(school, { warmStart: true, timeBudgetMs: 5000 });
console.log(`solve(): status=${res.status} placed=${res.stats.placed} unplaced=${res.stats.unplaced} scrubbed=${res.stats.scrubbedConflicts ?? 0}`);

// Walk assignment for any (class, day, period) with multiple lessons.
const cellMap = new Map();
let cellConflicts = 0;
let teacherConflicts = 0;
const teacherSlot = new Map();
for (const a of res.assignment) {
  const lesson = school.lessons.find(l => l.id === a.lessonId);
  if (!lesson) continue;
  for (const cid of (lesson.classIds || [])) {
    const key = `${cid}|${a.day}|${a.period}`;
    const n = (cellMap.get(key) || 0) + 1;
    cellMap.set(key, n);
    if (n > 1) cellConflicts++;
  }
  for (const tid of (lesson.teacherIds || [])) {
    const key = `${tid}|${a.day}|${a.period}`;
    const n = (teacherSlot.get(key) || 0) + 1;
    teacherSlot.set(key, n);
    if (n > 1) teacherConflicts++;
  }
}

check(
  "no (class, day, period) cell hosts two whole-class lessons",
  cellConflicts === 0,
  `${cellConflicts} class double-booking(s) found`
);
check(
  "no (teacher, day, period) cell hosts two lessons",
  teacherConflicts === 0,
  `${teacherConflicts} teacher double-booking(s) found`
);
check(
  "stats.scrubbedConflicts is reported (>= 0)",
  typeof res.stats.scrubbedConflicts === "number" && res.stats.scrubbedConflicts >= 0,
  `got ${res.stats.scrubbedConflicts}`
);
// L1 has periodsPerWeek=4 but only 2 distinct source slots; expect at most 4
// L1 placements (solver can fill the rest via backtrack).
const l1Placements = res.assignment.filter(a => a.lessonId === "L1").length;
check("L1 placed at most periodsPerWeek=4 times", l1Placements <= 4, `got ${l1Placements}`);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
