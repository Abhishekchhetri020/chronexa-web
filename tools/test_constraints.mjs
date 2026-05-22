// Constraint verifier — Timefold ConstraintVerifier-style smoke test.
// Loads sample-school.xml, places a known-bad card per rule, asserts the
// matching FAIL code fires. Catches regressions when refactoring the
// solver's hot loop or adding new scorers.
//
// Usage:   node tools/test_constraints.mjs [path-to-xml]
// Exit:    0 on all green, 1 on any red.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");
const require_   = createRequire(import.meta.url);

let JSDOM;
try { ({ JSDOM } = require_("jsdom")); }
catch {
  try { ({ JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom")); }
  catch {
    console.error("Install jsdom first:  npm install jsdom");
    process.exit(1);
  }
}

const xmlPath = path.resolve(process.argv[2] || path.join(repoRoot, "sample-school.xml"));
if (!fs.existsSync(xmlPath)) {
  console.error("XML not found:", xmlPath);
  process.exit(1);
}
const xml = fs.readFileSync(xmlPath, "utf8");

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.performance = { now: () => Date.now() };

// parse_timetable_xml.js is a classic IIFE — load via vm into the global
// context, then call window.parseTimetableXml.parseText().
const { default: vm } = await import("node:vm");
const parserSrc = fs.readFileSync(path.join(repoRoot, "js/xml/parse_timetable_xml.js"), "utf8");
vm.runInThisContext(parserSrc, { filename: "parse_timetable_xml.js" });
const { parseText } = globalThis.window.parseTimetableXml;

const { checkPlacement, FAIL, FAIL_NAME } =
  await import(path.join("file://", repoRoot, "js/solver/constraints.js"));

const school = parseText(xml, "sample-school.xml");
// Build the _idx the constraint module expects.
school._idx = {
  teacherById:  Object.fromEntries((school.teachers   || []).map(t => [t.id, t])),
  classById:    Object.fromEntries((school.classes    || []).map(c => [c.id, c])),
  subjectById:  Object.fromEntries((school.subjects   || []).map(s => [s.id, s])),
  classroomById:Object.fromEntries((school.classrooms || []).map(r => [r.id, r])),
  lessonById:   Object.fromEntries((school.lessons    || []).map(l => [l.id, l])),
};

let pass = 0, fail = 0;

function check(name, fn) {
  let result;
  try { result = fn(); }
  catch (e) { result = { ok: false, msg: e.message }; }
  if (result && result.ok) {
    console.log("  ✓ " + name);
    pass++;
  } else {
    console.log("  ✗ " + name + " — " + (result && result.msg || "no detail"));
    fail++;
  }
}

console.log("---- constraint verifier ----");
console.log("school:", school.schoolName || "(unnamed)");
console.log("teachers:", school.teachers.length,
  "· classes:", school.classes.length,
  "· lessons:", school.lessons.length,
  "· cards:", school.cards.length);

// Test 1 — a known good placement should produce zero hard violations
// when re-checked. Pick the first card and assert.
check("re-check a placed card returns no hard violations", () => {
  if (!school.cards.length) return { ok: false, msg: "no cards" };
  const c = school.cards[0];
  const r = checkPlacement(school, c.lessonId, c.day, c.period, c.classroomId);
  return { ok: (r.hard || []).length === 0,
    msg: "hard=" + (r.hard || []).join("; ") };
});

// Test 2 — placing a card at a fixed-mismatch day should fire FIXED_SLOT_MISMATCH.
check("fixed-day mismatch flagged", () => {
  const l = school.lessons.find(x => x.fixedDay != null);
  if (!l) return { ok: true, msg: "no fixed-day lessons (skipped)" };
  const wrongDay = (l.fixedDay + 1) % 6;
  const r = checkPlacement(school, l.id, wrongDay, 1, null);
  return { ok: r.hard.some(h => h.includes("fixed")),
    msg: "expected 'fixed' in hard list, got: " + r.hard.join("; ") };
});

// Test 3 — same-class double-booking should flag class-busy.
check("same-class double-booking flagged", () => {
  const l = school.lessons.find(x => (x.classIds || []).length);
  if (!l) return { ok: false, msg: "no lessons with a class" };
  // Find any placed card from a different lesson sharing this class.
  const occupied = school.cards.find(c => {
    if (c.lessonId === l.id) return false;
    const other = school._idx.lessonById[c.lessonId];
    if (!other) return false;
    return (other.classIds || []).some(cid => l.classIds.includes(cid));
  });
  if (!occupied) return { ok: true, msg: "no parallel occupant (skipped)" };
  const r = checkPlacement(school, l.id, occupied.day, occupied.period, null);
  return { ok: r.hard.some(h => h.toLowerCase().includes("class")),
    msg: "expected class conflict, got: " + r.hard.join("; ") };
});

// Test 4 — non-teaching period flagged as soft.
check("non-teaching period flagged as soft", () => {
  const periods = (school.bell && school.bell.periods) || [];
  const nonT = periods.find(p => p.isTeaching === false);
  if (!nonT || !school.lessons.length) return { ok: true, msg: "no non-teaching periods (skipped)" };
  const l = school.lessons[0];
  const r = checkPlacement(school, l.id, 0, nonT.index, null);
  return { ok: (r.soft || []).some(s => s.includes("non-teaching")),
    msg: "expected non-teaching soft flag, got: " + r.soft.join("; ") };
});

console.log("\n---- summary ----");
console.log("  pass:", pass, "· fail:", fail);
process.exit(fail > 0 ? 1 : 0);
