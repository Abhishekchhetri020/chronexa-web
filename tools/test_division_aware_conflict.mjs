// Reproduces Gemini's "Flat Groups" claim: when a class has groups
// belonging to two different divisions (e.g. Gender split: Boys/Girls
// AND Activity split: GroupA/GroupB), the solver currently treats
// cross-division groups (Boys vs GroupA) as non-conflicting because
// their flat bitmasks AND to zero. They SHARE STUDENTS, so they MUST
// conflict.
//
// Usage:  node tools/test_division_aware_conflict.mjs
// Exit:   0 when the cross-division conflict is correctly flagged, 1 when
//         the solver still lets it through (current pre-fix state).

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

// Class C1 with FOUR groups spanning two divisions:
//   Division 1 (Gender): Boys, Girls
//   Division 2 (Activity): GroupA, GroupB
// A lesson for "Boys" and a lesson for "GroupA" must NOT be schedulable at
// the same slot because the same students belong to both sets.
const school = {
  schoolName: "Two-Division Test",
  daysPerWeek: 1,
  bell: { periods: [{ index: 1, label: "P1", isTeaching: true }] },
  teachers: [
    { id: "T_PE",    name: "PE",    abbr: "PE",  timeOff: {} },
    { id: "T_ART",   name: "Art",   abbr: "ART", timeOff: {} },
  ],
  subjects: [{ id: "S_PE", name: "PE" }, { id: "S_ART", name: "Art" }],
  classes:  [{ id: "C1", name: "VII" }],
  classrooms: [],
  groups: [
    { id: "G_BOYS",   classId: "C1", name: "Boys",    entireClass: false, divisionTag: 1 },
    { id: "G_GIRLS",  classId: "C1", name: "Girls",   entireClass: false, divisionTag: 1 },
    { id: "G_GROUP_A",classId: "C1", name: "Group A", entireClass: false, divisionTag: 2 },
    { id: "G_GROUP_B",classId: "C1", name: "Group B", entireClass: false, divisionTag: 2 },
  ],
  lessons: [
    { id: "L_BOYS_PE",  classIds: ["C1"], teacherIds: ["T_PE"],  subjectId: "S_PE",  groupIds: ["G_BOYS"],   periodsPerWeek: 1 },
    { id: "L_GROUPA_ART",classIds:["C1"], teacherIds: ["T_ART"], subjectId: "S_ART", groupIds: ["G_GROUP_A"], periodsPerWeek: 1 },
  ],
  cards: [
    // Both pre-placed at P1 — solver should detect the cross-division
    // conflict and drop one. (Without the division-aware fix, the solver
    // and the scrubber both treat Boys=bit0 and GroupA=bit2 as disjoint
    // and let both stand → double-booking on the same students.)
    { lessonId: "L_BOYS_PE",  day: 0, period: 1, classroomId: null },
    { lessonId: "L_GROUPA_ART", day: 0, period: 1, classroomId: null },
  ],
};

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

const res = await solve(school, { warmStart: true, timeLimitSec: 1 });
console.log(`solve(): status=${res.status} placed=${res.stats.placed} unplaced=${res.stats.unplaced} scrubbed=${res.stats.scrubbedConflicts}`);

// Find placements at day=0 period=1
const at = res.assignment.filter(a => a.day === 0 && a.period === 1);
console.log("  placed at D0 P1:", at.map(a => a.lessonId).join(", ") || "(none)");

check(
  "Boys-PE and GroupA-Art must NOT both be placed at the same slot",
  at.length <= 1,
  `${at.length} lessons placed at the same (class, slot) sharing students`
);

// Round-trip sanity: a same-division pair (Boys + Girls) — both have
// divisionTag=1, disjoint group bits — MUST be allowed at the same slot.
// This is the canonical "legitimate split" case and proves the packing
// distinguishes "same division, disjoint bits" (OK) from "different
// divisions" (conflict).
const splitSchool = {
  schoolName: "Same-Division Split",
  daysPerWeek: 1,
  bell: { periods: [{ index: 1, label: "P1", isTeaching: true }] },
  teachers: [
    { id: "T_PE",    name: "PE",    timeOff: {} },
    { id: "T_MUS",   name: "Mus",   timeOff: {} },
  ],
  subjects: [{ id: "S_PE", name: "PE" }, { id: "S_MUS", name: "Music" }],
  classes:  [{ id: "C1", name: "VII" }],
  classrooms: [],
  groups: [
    { id: "G_BOYS",  classId: "C1", name: "Boys",  entireClass: false, divisionTag: 1 },
    { id: "G_GIRLS", classId: "C1", name: "Girls", entireClass: false, divisionTag: 1 },
  ],
  lessons: [
    { id: "L_BOYS_PE",     classIds: ["C1"], teacherIds: ["T_PE"],  subjectId: "S_PE",  groupIds: ["G_BOYS"],  periodsPerWeek: 1 },
    { id: "L_GIRLS_MUSIC", classIds: ["C1"], teacherIds: ["T_MUS"], subjectId: "S_MUS", groupIds: ["G_GIRLS"], periodsPerWeek: 1 },
  ],
  cards: [
    { lessonId: "L_BOYS_PE",     day: 0, period: 1, classroomId: null },
    { lessonId: "L_GIRLS_MUSIC", day: 0, period: 1, classroomId: null },
  ],
};
const resSplit = await solve(splitSchool, { warmStart: true, timeLimitSec: 1 });
const splitAt = resSplit.assignment.filter(a => a.day === 0 && a.period === 1);
check(
  "same-division disjoint groups (Boys + Girls) SHARE the same slot legally",
  splitAt.length === 2,
  `${splitAt.length} placed at D0 P1 (expected 2)`
);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
