// Pinpoint why URDU lesson AA08F1D868F792E4 can't coexist with SANSKRIT
// lesson 7B996421036291A6 at the same slot for the same class.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// [vite-esm] The 2026-07 Vite migration added ESM import/export lines to the
// classic UI modules. Strip them so vm.runInThisContext keeps working; the
// module BODIES are unchanged.
const stripVite = (s) => s
  .replace(/^import "[^"]+";$/gm, "")
  .replace(/^export const [A-Za-z_$][\w$]* = window\.[A-Za-z_$][\w$]*;$/gm, "");


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, "..");
const require_  = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require_("jsdom")); }
catch { ({ JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom")); }
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.DOMParser=dom.window.DOMParser;

const parserSrc = fs.readFileSync(path.join(repoRoot, "js/xml/parse_timetable_xml.js"), "utf8");
vm.runInThisContext(stripVite(parserSrc));
const parseTimetableXml = globalThis.window.parseTimetableXml;

const xml = fs.readFileSync(path.join(repoRoot, "sample-school.xml"), "utf8");
const school = parseTimetableXml.parseText(xml, "sample-school.xml");

const urduLesson = school.lessons.find(l => l.id === "AA08F1D868F792E4");
const sanskritLesson = school.lessons.find(l => l.id === "7B996421036291A6");

console.log("=== URDU lesson AA08F1D868F792E4 ===");
console.log("classIds:", urduLesson.classIds);
console.log("groupIds:", urduLesson.groupIds);
console.log("teacherIds:", urduLesson.teacherIds);
console.log("subjectId:", urduLesson.subjectId, "(", school.subjects.find(s => s.id === urduLesson.subjectId)?.name, ")");
console.log("periodsPerWeek:", urduLesson.periodsPerWeek);

console.log("\n=== SANSKRIT lesson 7B996421036291A6 ===");
console.log("classIds:", sanskritLesson.classIds);
console.log("groupIds:", sanskritLesson.groupIds);
console.log("teacherIds:", sanskritLesson.teacherIds);
console.log("subjectId:", sanskritLesson.subjectId, "(", school.subjects.find(s => s.id === sanskritLesson.subjectId)?.name, ")");
console.log("periodsPerWeek:", sanskritLesson.periodsPerWeek);

console.log("\n=== Groups in school.groups (Urdu+Sanskrit groups for this class) ===");
const cls = "B3D5B254A7F660DD";
for (const g of school.groups) {
  if (g.classId === cls) {
    console.log(`  ${g.id} ${JSON.stringify(g)}`);
  }
}
console.log("\n=== Does parser have groupById['CFA494657665299B']? ===");
const sg = school.groups.find(g => g.id === "CFA494657665299B");
console.log(sg || "NOT FOUND");

console.log("\n=== Cards for this class (sorted) ===");
const cardsForClass = school.cards.filter(c => {
  const l = school._idx?.lessonById?.[c.lessonId] || school.lessons.find(ll => ll.id === c.lessonId);
  return l && (l.classIds || []).includes(cls);
});
console.log("total cards:", cardsForClass.length);

const slotsMap = new Map();
for (const c of cardsForClass) {
  const k = `d${c.day}p${c.period}`;
  if (!slotsMap.has(k)) slotsMap.set(k, []);
  slotsMap.get(k).push(c.lessonId);
}
console.log("\nSlots with multiple lessons (overlap candidates):");
for (const [slot, lids] of slotsMap) {
  if (lids.length > 1) {
    const subjects = lids.map(lid => {
      const l = school.lessons.find(ll => ll.id === lid);
      return school.subjects.find(s => s.id === l?.subjectId)?.name || lid;
    });
    console.log(`  ${slot}: ${lids.length} lessons → ${subjects.join(" + ")}`);
  }
}
