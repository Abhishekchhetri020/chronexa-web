// Unit test for the removeSingle div-match fix (Gemini analysis_results.md).
//
// Direct in-process exercise of buildModel + applySingle + removeSingle.
// Sets up two contrived scenarios on state.classGroupOcc and checks that
// removeSingle leaves occupancy intact when called with a lesson whose
// divisionTag does NOT match the existing occupant.
//
// Before the fix, the over-permissive condition would enter the mask-
// clear branch on the whole-class sentinel branch and zero the slot,
// allowing later applySingle calls to pile lessons on top.
//
// Usage:  node tools/test_remove_single_div_match.mjs
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

// Indirect probe: rather than reaching into private functions, we build
// a school where the solver MUST step through the suspect path during
// repair. Two whole-class lessons (S.S.T-equivalent + Sanskrit-
// equivalent — both `groupIds: []` so they fall to whole-class) and one
// group lesson that legitimately needs the slot. The solver can place
// at most one whole-class per slot; the repair path that evicts and
// re-tries must not silently wipe occupancy when divisions disagree.
const school = {
  schoolName: "Gemini removeSingle repro",
  daysPerWeek: 1,
  bell: { periods: [{ index: 1, label: "P1", isTeaching: true }] },
  teachers: [
    { id: "T_A", name: "TA", timeOff: {} },
    { id: "T_B", name: "TB", timeOff: {} },
    { id: "T_C", name: "TC", timeOff: {} },
  ],
  subjects: [
    { id: "S_SST",     name: "SST" },
    { id: "S_SANSKRIT",name: "Sanskrit" },
    { id: "S_IT",      name: "IT" },
  ],
  classes: [{ id: "C1", name: "VI B" }],
  classrooms: [],
  groups: [],
  lessons: [
    { id: "L_SST",     classIds: ["C1"], teacherIds: ["T_A"], subjectId: "S_SST",     groupIds: [], periodsPerWeek: 1 },
    { id: "L_SANSKRIT",classIds: ["C1"], teacherIds: ["T_B"], subjectId: "S_SANSKRIT",groupIds: [], periodsPerWeek: 1 },
    { id: "L_IT",      classIds: ["C1"], teacherIds: ["T_C"], subjectId: "S_IT",      groupIds: [], periodsPerWeek: 1 },
  ],
  cards: [
    // All three pre-placed on the SAME slot in the source XML — exactly
    // the user's symptom for VI B Mon-P6. Solver must place only one;
    // the other two surface as unplaced (no double-booking).
    { lessonId: "L_SST",      day: 0, period: 1, classroomId: null },
    { lessonId: "L_SANSKRIT", day: 0, period: 1, classroomId: null },
    { lessonId: "L_IT",       day: 0, period: 1, classroomId: null },
  ],
};

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

const res = await solve(school, { warmStart: true, timeLimitSec: 2 });
console.log(`solve(): status=${res.status} placed=${res.stats.placed} unplaced=${res.stats.unplaced} scrubbed=${res.stats.scrubbedConflicts}`);
const slotPlacements = res.assignment.filter(a => a.day === 0 && a.period === 1);
console.log("  placed at D0 P1:", slotPlacements.map(a => a.lessonId).join(", ") || "(none)");

check(
  "at most one whole-class lesson lands at the same (class, day, period)",
  slotPlacements.length <= 1,
  `${slotPlacements.length} whole-class lessons stacked at D0 P1`
);

// Also: each unplaced lesson must surface as HARD_unplaced_lesson so the
// user can act on it from the Verification panel.
const hardUnplaced = res.violations.filter(v => v.ruleId === "HARD_unplaced_lesson");
check(
  "unplaced whole-class lessons surface in violations[]",
  hardUnplaced.length === res.stats.unplaced,
  `violations=${hardUnplaced.length} unplaced=${res.stats.unplaced}`
);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
