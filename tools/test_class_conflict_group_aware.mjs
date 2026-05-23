// Regression test: Verification's class-conflict check must respect group
// bitmasks. Two lessons sharing a class at the same slot should NOT be a
// hard violation if their group bitmasks are disjoint (e.g. Group-Boys-PE +
// Group-Girls-Music for the same class at the same period — legitimate
// group-split, allowed by the solver).
//
// Usage:  node tools/test_class_conflict_group_aware.mjs
// Exit:   0 on green, 1 on red.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
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

const { checkPlacement } = await import(path.join("file://", repoRoot, "js/solver/constraints.js"));

// Build a minimal school with one class, two groups (Boys/Girls), two lessons
// each using one of those groups. Place lesson A at Mon-P1. Now ask whether
// placing lesson B at the same slot is a hard violation.
const school = {
  schoolName: "Group-Split Test",
  teachers: [
    { id: "T_PE",    name: "PE Teacher",    abbr: "PE",  timeOff: {} },
    { id: "T_MUSIC", name: "Music Teacher", abbr: "MUS", timeOff: {} },
  ],
  subjects: [
    { id: "S_PE",    name: "PE",    abbr: "PE"  },
    { id: "S_MUSIC", name: "Music", abbr: "MUS" },
  ],
  classes: [
    { id: "C_VII",   name: "VII",   short: "VII" },
  ],
  classrooms: [
    { id: "R_GYM",     name: "Gym",     short: "GYM" },
    { id: "R_MUS",     name: "Music Rm", short: "MUS" },
  ],
  groups: [
    { id: "G_BOYS",  classId: "C_VII", name: "Boys",  entireClass: false },
    { id: "G_GIRLS", classId: "C_VII", name: "Girls", entireClass: false },
  ],
  lessons: [
    { id: "L_PE_BOYS",    classIds: ["C_VII"], teacherIds: ["T_PE"],    subjectId: "S_PE",    groupIds: ["G_BOYS"] },
    { id: "L_MUSIC_GIRLS", classIds: ["C_VII"], teacherIds: ["T_MUSIC"], subjectId: "S_MUSIC", groupIds: ["G_GIRLS"] },
    { id: "L_WHOLE",       classIds: ["C_VII"], teacherIds: ["T_MUSIC"], subjectId: "S_MUSIC", groupIds: [] }, // whole-class
  ],
  cards: [
    // Lesson A already placed at Mon (day=0), P1 (period=1).
    { lessonId: "L_PE_BOYS", day: 0, period: 1, classroomId: "R_GYM" },
  ],
  bell: { periods: [{ index: 1, label: "P1", isTeaching: true }, { index: 2, label: "P2", isTeaching: true }] },
};
school._idx = {
  teacherById:   Object.fromEntries(school.teachers.map(t => [t.id, t])),
  classById:     Object.fromEntries(school.classes.map(c => [c.id, c])),
  subjectById:   Object.fromEntries(school.subjects.map(s => [s.id, s])),
  classroomById: Object.fromEntries(school.classrooms.map(r => [r.id, r])),
  lessonById:    Object.fromEntries(school.lessons.map(l => [l.id, l])),
};

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

// Case 1: disjoint groups — must NOT flag class-conflict.
const r1 = checkPlacement(school, "L_MUSIC_GIRLS", 0, 1, "R_MUS");
const hard1 = r1.hard.filter(h => /already has/i.test(h));
check(
  "disjoint groups (Boys-PE + Girls-Music) do NOT trigger class-conflict",
  hard1.length === 0,
  "got hard=" + JSON.stringify(r1.hard)
);

// Case 2: whole-class lesson against a group lesson — MUST flag class-conflict.
const r2 = checkPlacement(school, "L_WHOLE", 0, 1, "R_MUS");
const hard2 = r2.hard.filter(h => /already has/i.test(h));
check(
  "whole-class lesson DOES trigger class-conflict against group lesson",
  hard2.length >= 1,
  "got hard=" + JSON.stringify(r2.hard)
);

// Case 3: same group placement — MUST flag class-conflict (PE-Boys vs PE-Boys).
const schoolDup = { ...school, lessons: [
  ...school.lessons,
  { id: "L_PE_BOYS_2", classIds: ["C_VII"], teacherIds: ["T_PE"], subjectId: "S_PE", groupIds: ["G_BOYS"] },
]};
schoolDup._idx = { ...school._idx, lessonById: { ...school._idx.lessonById,
  L_PE_BOYS_2: schoolDup.lessons[schoolDup.lessons.length - 1] } };
const r3 = checkPlacement(schoolDup, "L_PE_BOYS_2", 0, 1, "R_GYM");
const hard3 = r3.hard.filter(h => /already has/i.test(h));
check(
  "same-group placement DOES trigger class-conflict",
  hard3.length >= 1,
  "got hard=" + JSON.stringify(r3.hard)
);

// Case 4: OR-accumulation — lesson listing BOTH groups (effectively whole
// class) intersects a single-group lesson. Mask 0b11 ∩ 0b01 ≠ 0 → conflict.
const schoolBoth = { ...school, lessons: [
  ...school.lessons,
  { id: "L_DOUBLE_GROUP", classIds: ["C_VII"], teacherIds: ["T_PE"],
    subjectId: "S_PE", groupIds: ["G_BOYS", "G_GIRLS"] },
]};
schoolBoth._idx = { ...school._idx, lessonById: { ...school._idx.lessonById,
  L_DOUBLE_GROUP: schoolBoth.lessons[schoolBoth.lessons.length - 1] } };
const r4 = checkPlacement(schoolBoth, "L_DOUBLE_GROUP", 0, 1, "R_GYM");
const hard4 = r4.hard.filter(h => /already has/i.test(h));
check(
  "two-group lesson (Boys+Girls) DOES intersect single-group placement",
  hard4.length >= 1,
  "got hard=" + JSON.stringify(r4.hard)
);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
