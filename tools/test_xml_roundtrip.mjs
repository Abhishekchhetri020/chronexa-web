// Phase 6 regression — relations XML round-trip.
//
// Capture: load school with relations into solver state shape → render
// exportSynthesized → parse back → verify relations list and normalized
// semantics survive import → export → re-import.
//
// Run: node tools/test_xml_roundtrip.mjs

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

// Pull the ES module exports attached to window by the existing modules.
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;

// Load exporter + parser scripts as side effects (they attach to window)
await import("../js/xml/parse_timetable_xml.js");
await import("../js/ui/io/export_timetable_xml.js");

const parse  = globalThis.window.parseTimetableXml;
const expo   = globalThis.window.APP && globalThis.window.APP.io;

function schoolWithRelations() {
  return {
    schoolName: "RT",
    daysPerWeek: 5,
    bell: { periods: [
      { i:1, label: "P1", index: 1, startMin: 480,  endMin: 525  },
      { i:2, label: "P2", index: 2, startMin: 525,  endMin: 570  },
      { i:3, label: "P3", index: 3, startMin: 600,  endMin: 645  },
    ] },
    teachers: [{ id: "tA", name: "TA" }, { id: "tB", name: "TB" }],
    classes:  [{ id: "c1", name: "C1" }],
    classrooms:[{ id: "r1", name: "R1" }],
    subjects: [{ id: "sA", name: "SA" }, { id: "sB", name: "SB" }],
    lessons: [
      { id: "L1", subjectId: "sA", periodsPerWeek: 1, periodsPerDay: 1, classIds: ["c1"], teacherIds: ["tA"] },
      { id: "L2", subjectId: "sB", periodsPerWeek: 1, periodsPerDay: 1, classIds: ["c1"], teacherIds: ["tB"] },
    ],
    cards: [],
    relations: [
      { typ: "n_6", subjectids: ["sA"], subject2ids: ["sB"], classids: ["c1"], importance: "hard" },
      { typ: "n_16", subjectids: ["sA"], classids: ["c1"], positions: "first", importance: "hard" },
    ],
    groups: [],
    settings: {},
  };
}

// Seed both the exporter APP.school and parse._meta so the template path is exercised.
const school = schoolWithRelations();
globalThis.window.APP = globalThis.window.APP || {};
globalThis.window.APP.school = school;

const xml = expo.exportSynthesized(school);
if (!/cx:relations/.test(xml)) {
  console.error("FAIL: exportSynthesized did not emit a <cx:relations> block."); process.exit(1);
}

const re = parse.parseText(xml, "roundtrip.xml");
const nt = (re.relations || []).length;
console.log(`parse: relations=${nt}`);
if (nt !== 2) { console.error(`FAIL: expected 2 relations back, got ${nt}`); process.exit(1); }

const n6 = re.relations.find(r => r.typ === "n_6");
const n16 = re.relations.find(r => r.typ === "n_16");
if (!n6 || !n16) { console.error("FAIL: n_6 or n_16 missing after RT"); process.exit(1); }
if (!n6.subjectids?.includes("sA") || !n6.subject2ids?.includes("sB")) {
  console.error("FAIL: n_6 subject ids not preserved"); process.exit(1);
}
if (n16.positions !== "first") {
  console.error("FAIL: n_16 positions not preserved"); process.exit(1);
}
console.log("PASS: 2 relations round-trip with type + sides + modifier semantics intact");

// Template-path round-trip: write the synthesized XML back through the
// template importer, verify relations survive and no dangling entries.
const school2 = schoolWithRelations();
school2._meta = school2._meta || {};
school2._meta.sourceText = xml;
school2._meta.sourceFilename = "roundtrip.xml";
globalThis.window.APP.school = school2;
const xml2 = expo.exportFromTemplate(school2);
if (!/cx:relations/.test(xml2)) {
  console.error("FAIL: template path did not emit <cx:relations> block"); process.exit(1);
}
const re2 = parse.parseText(xml2, "roundtrip2.xml");
const n2 = (re2.relations || []).length;
console.log(`template reparse: relations=${n2}`);
if (n2 !== 2) { console.error(`FAIL: template path dropped relations: ${n2}`); process.exit(1); }
console.log("PASS: template path round-trip also preserves relations");
process.exit(0);
