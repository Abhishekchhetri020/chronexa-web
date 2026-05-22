// XML round-trip diff — loads sample-school.xml, parses it through
// parse_timetable_xml.js, re-serializes via the live exporter, and
// reports field-level deltas per entity. Surfaces audit §3 + §20 gaps
// (Class / Teacher / Lesson / Classroom fields that get dropped).
//
// Usage: node tools/xml_roundtrip_diff.mjs [path-to-xml]
//
// Output:
//   ENTITY COUNTS    teachers: N → N, classes: …
//   FIELD COVERAGE   teachers.foo  100% kept  /  bar  0% kept
//   ATTRIBUTES LOST  per-element list of attributes that disappeared
//
// Exit code 0 always (informational tool, not a CI check).

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
catch (e) {
  console.error("Install jsdom first:  npm install jsdom");
  process.exit(0);
}

const xmlPath = path.resolve(process.argv[2] || path.join(repoRoot, "sample-school.xml"));
if (!fs.existsSync(xmlPath)) {
  console.error("Not found:", xmlPath);
  process.exit(0);
}
const original = fs.readFileSync(xmlPath, "utf8");

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;

// Use the live parser
const { parseText } = await import(path.join("file://", repoRoot, "js/xml/parse_timetable_xml.js"));
const school = parseText(original);

// Read the source XML attribute-set per element (so we can compare what came in
// vs what survived parsing).
const srcDoc = new dom.window.DOMParser().parseFromString(original, "application/xml");

function attrSet(el) {
  const out = {};
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    out[a.name] = a.value;
  }
  return out;
}
function attrsByTag(tag, parent) {
  const out = [];
  srcDoc.querySelectorAll(parent + " > " + tag).forEach(el => out.push(attrSet(el)));
  return out;
}

const buckets = {
  teacher:   attrsByTag("teacher",   "teachers"),
  class:     attrsByTag("class",     "classes"),
  classroom: attrsByTag("classroom", "classrooms"),
  subject:   attrsByTag("subject",   "subjects"),
  lesson:    attrsByTag("lesson",    "lessons"),
};

console.log("---- ENTITY COUNTS ----");
for (const [k, list] of Object.entries(buckets)) {
  const kept = school[k + "s"] ? school[k + "s"].length : 0;
  console.log(`  ${k.padEnd(10)} XML=${String(list.length).padStart(4)}  parsed=${String(kept).padStart(4)}`
    + (list.length !== kept ? "  ⚠ count mismatch" : ""));
}

console.log("\n---- ATTRIBUTE COVERAGE (top 15 dropped attributes per entity) ----");
function diffEntity(tag, parsedList) {
  const xmlAttrs = buckets[tag];
  if (!xmlAttrs.length) return;
  const seen = {};       // attrName → total occurrences in XML
  const kept = {};       // attrName → occurrences whose value made it into parsed
  for (let i = 0; i < xmlAttrs.length; i++) {
    const x = xmlAttrs[i];
    const p = parsedList[i] || {};
    for (const k of Object.keys(x)) {
      seen[k] = (seen[k] || 0) + 1;
      // Heuristic: an attribute is "kept" if any field on the parsed entity
      // contains the value (case-insensitive substring) — covers renames
      // (e.g. short → abbr) and array splits (classroomids → _classroomIds).
      const v = String(x[k]);
      if (!v) { kept[k] = (kept[k] || 0) + 1; continue; }
      const blob = JSON.stringify(p).toLowerCase();
      if (blob.indexOf(v.toLowerCase()) !== -1) kept[k] = (kept[k] || 0) + 1;
    }
  }
  const rows = Object.keys(seen).map(k => ({
    name: k, seen: seen[k], kept: kept[k] || 0,
    pct: Math.round(100 * (kept[k] || 0) / seen[k]),
  }));
  rows.sort((a, b) => a.pct - b.pct || b.seen - a.seen);
  console.log(`\n  ${tag}:`);
  for (const r of rows.slice(0, 15)) {
    const tag2 = r.pct === 100 ? "  ok" : r.pct >= 50 ? " mid" : "DROP";
    console.log(`    [${tag2}]  ${r.name.padEnd(24)}  ${String(r.pct).padStart(3)}%  ${r.kept}/${r.seen}`);
  }
}
const parsedMap = {
  teacher:   school.teachers   || [],
  class:     school.classes    || [],
  classroom: school.classrooms || [],
  subject:   school.subjects   || [],
  lesson:    school.lessons    || [],
};
for (const tag of Object.keys(buckets)) {
  diffEntity(tag, parsedMap[tag]);
}

console.log("\nDone.");
