// Direct unit probe for the removeSingle div-match fix
// (Gemini analysis_results.md).
//
// Sets up state.classGroupOcc manually and calls removeSingle with a
// LESSON whose divisionTag does NOT match the slot's occupant. Before
// the fix, the over-permissive condition would enter the mask-subtract
// branch when either side was 0xFFFF and wipe occupancy. After the fix,
// removeSingle must leave the slot untouched on division mismatch.
//
// Usage:  node tools/test_remove_single_probe.mjs
// Exit:   0 on green, 1 on red.

import fs from "node:fs";
import path from "node:path";
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
const mod = await import(solverUrl);
const { buildModel, makeState, applySingle, removeSingle } = mod.__test_internals;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

// Build a tiny school: class C1 split by division 1 (G_BOYS, G_GIRLS),
// plus a whole-class lesson L_WHOLE and a group lesson L_BOYS.
const school = {
  schoolName: "removeSingle probe",
  daysPerWeek: 1,
  bell: { periods: [{ index: 1, label: "P1", isTeaching: true }] },
  teachers: [
    { id: "T_PE", name: "PE", timeOff: {} },
    { id: "T_W",  name: "W",  timeOff: {} },
  ],
  subjects: [{ id: "S_PE", name: "PE" }, { id: "S_W", name: "W" }],
  classes:  [{ id: "C1", name: "VII" }],
  classrooms: [],
  groups: [
    { id: "G_BOYS",  classId: "C1", name: "Boys",  entireClass: false, divisionTag: 1 },
    { id: "G_GIRLS", classId: "C1", name: "Girls", entireClass: false, divisionTag: 1 },
  ],
  lessons: [
    { id: "L_BOYS",  classIds: ["C1"], teacherIds: ["T_PE"], subjectId: "S_PE", groupIds: ["G_BOYS"], periodsPerWeek: 1 },
    { id: "L_WHOLE", classIds: ["C1"], teacherIds: ["T_W"],  subjectId: "S_W",  groupIds: [],         periodsPerWeek: 1 },
  ],
  cards: [],
};

const model = buildModel(school);
const state = makeState(model);

// Helpers: lesson idx for each.
const lessonIdxBoys  = model.lessons.findIndex(l => l.srcId === "L_BOYS");
const lessonIdxWhole = model.lessons.findIndex(l => l.srcId === "L_WHOLE");

// Apply L_BOYS at slot 0 — gives state.classGroupOcc[0] a div=1 occupancy.
applySingle(model, state, lessonIdxBoys, 0, -1);
const occ0_after_apply = state.classGroupOcc[0];
check(
  "applySingle(L_BOYS) sets classGroupOcc to div=1, mask=bit0",
  (occ0_after_apply & 0xFFFF) === 1 && ((occ0_after_apply >>> 16) & 1) === 1,
  `got 0x${occ0_after_apply.toString(16)}`
);

// CALL removeSingle with the WHOLE-CLASS lesson (divIdx = 0xFFFF). This
// is the exact bug-path scenario Gemini described: a caller bypasses
// canPlace and asks removeSingle to evict L_WHOLE from a slot it never
// actually held (slot is held by L_BOYS, div=1). Before the fix, the
// permissive condition (`lessonDiv === 0xFFFF`) would enter the mask
// branch and wipe the slot. After the fix, strict `occDiv ===
// lessonDiv` makes this a no-op.
removeSingle(model, state, lessonIdxWhole, 0, -1);
const occ0_after_buggy_remove = state.classGroupOcc[0];
check(
  "removeSingle(L_WHOLE) on a div=1 slot is a no-op (does NOT wipe occupancy)",
  occ0_after_buggy_remove === occ0_after_apply,
  `slot changed: 0x${occ0_after_apply.toString(16)} → 0x${occ0_after_buggy_remove.toString(16)}`
);

// Now remove L_BOYS normally — divisions match, slot should clear.
removeSingle(model, state, lessonIdxBoys, 0, -1);
const occ0_after_clean_remove = state.classGroupOcc[0];
check(
  "removeSingle(L_BOYS) on the slot it actually occupies clears it cleanly",
  occ0_after_clean_remove === 0,
  `got 0x${occ0_after_clean_remove.toString(16)}`
);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
