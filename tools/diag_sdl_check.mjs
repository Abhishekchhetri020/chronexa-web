#!/usr/bin/env node
// Diagnostic: verify that the solver's auto-tighten subjectDailyLimit
// is correctly preventing subject stacking.
//
// Usage: node tools/diag_sdl_check.mjs <xml-file>

import { readFileSync } from "fs";
import { DOMParser } from "xmldom";

// Load the solver module
const solverPath = new URL("../js/solver/csp_solver.js", import.meta.url).pathname;
const solverCode = readFileSync(solverPath, "utf-8");

// Patch: the solver is a module that does `export function solve(...)`.
// We need to extract it.
const mod = await import(new URL("../js/solver/csp_solver.js", import.meta.url));
const solve = mod.solve;

// Parse XML
const xmlFile = process.argv[2];
if (!xmlFile) { console.error("Usage: node diag_sdl_check.mjs <xml>"); process.exit(1); }
const xmlText = readFileSync(xmlFile, "utf-8");

// We need to convert XML to the school JSON. Let's use the parser from the app.
// For simplicity, let's use a mini-parser for the most important fields.
const parseXml = await import(new URL("../js/data/xml_parser.js", import.meta.url));
const domParser = { parseFromString: (s) => new DOMParser().parseFromString(s) };

// Parse using the app's own parser
let school;
try {
  school = parseXml.parseAscXml(xmlText, domParser);
} catch(e) {
  // Try alternate
  school = parseXml.default?.(xmlText) || parseXml.parse?.(xmlText);
}

if (!school || !school.lessons) {
  console.error("Failed to parse school data");
  process.exit(1);
}

console.log(`Parsed: ${school.teachers?.length} teachers, ${school.classes?.length} classes, ${school.subjects?.length} subjects, ${school.lessons?.length} lessons`);
console.log(`Days: ${school.daysPerWeek}, Periods: ${school.periodsPerDay}`);

// Find class "I B"
const clsIB = school.classes.find(c => c.name === "I B");
if (!clsIB) { console.error("Class 'I B' not found"); process.exit(1); }

// Find subject "E.V.S"
const evsSubj = school.subjects.find(s => s.name === "E.V.S");
if (!evsSubj) { console.error("Subject 'E.V.S' not found"); process.exit(1); }

// Find EVS lessons for I B
const evsLessons = school.lessons.filter(l => 
  l.subjectId === evsSubj.id && l.classIds?.includes(clsIB.id)
);
console.log(`\nEVS lessons for I B: ${evsLessons.length}`);
for (const l of evsLessons) {
  console.log(`  Lesson ${l.id}: ppw=${l.periodsPerWeek}, isLabDouble=${l.isLabDouble}, lessonLength=${l.lessonLength}`);
}

// Solve
console.log(`\n=== Solving (30s budget)... ===`);
const result = solve(school, {
  timeLimitSec: 30,
  seed: 42,
  onProgress(p) {},
});

console.log(`Result: status=${result.status} placed=${result.stats?.placed || '?'} unplaced=${result.stats?.unplaced || '?'}`);

// Check distribution
const dayNames = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const assignment = result.assignment || [];

// Build a map: classId+subjectId -> { day -> count }
const violations = [];
const classMap = new Map(school.classes.map(c => [c.id, c.name]));
const subjectMap = new Map(school.subjects.map(s => [s.id, s.name]));
const lessonMap = new Map(school.lessons.map(l => [l.id, l]));

// Group assignments by class+subject+day
const distrib = {};
for (const a of assignment) {
  if (a.day == null) continue;
  const lesson = lessonMap.get(a.lessonId);
  if (!lesson) continue;
  for (const cid of (lesson.classIds || [])) {
    const key = `${cid}|${lesson.subjectId}`;
    if (!distrib[key]) distrib[key] = {};
    if (!distrib[key][a.day]) distrib[key][a.day] = 0;
    distrib[key][a.day]++;
  }
}

// Find violations
let violCount = 0;
for (const [key, days] of Object.entries(distrib)) {
  const [cid, sid] = key.split("|");
  for (const [day, count] of Object.entries(days)) {
    if (count > 1) {
      violCount++;
      const cn = classMap.get(cid) || cid;
      const sn = subjectMap.get(sid) || sid;
      violations.push(`${cn}: ${sn} x${count} on ${dayNames[day] || `day${day}`}`);
    }
  }
}

if (violCount === 0) {
  console.log("\n✅ ALL classes have perfect subject distribution!");
} else {
  console.log(`\n❌ ${violCount} distribution violations found:`);
  for (const v of violations) {
    console.log(`  ${v}`);
  }
}

// Show I B schedule
console.log("\n=== Class I B schedule ===");
const ibAssignments = assignment.filter(a => {
  if (a.day == null) return false;
  const l = lessonMap.get(a.lessonId);
  return l && l.classIds?.includes(clsIB.id);
});
for (let d = 0; d < school.daysPerWeek; d++) {
  const dayCards = ibAssignments.filter(a => a.day === d).sort((a, b) => a.period - b.period);
  const names = dayCards.map(a => {
    const l = lessonMap.get(a.lessonId);
    return subjectMap.get(l.subjectId) || "??";
  });
  console.log(`  ${dayNames[d]}: ${names.join(", ")}`);
}
