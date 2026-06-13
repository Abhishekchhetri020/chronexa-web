// Smart Lesson Grid regression tests.
//
// Usage: node tools/test_lessons_grid_matrix.mjs

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom");

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.confirm = () => true;
globalThis.prompt = () => null;
window.confirm = globalThis.confirm;
window.prompt = globalThis.prompt;
window._chrxNotify = () => {};

const src = fs.readFileSync(path.join(repoRoot, "js/ui/components/lessons_grid_matrix.js"), "utf8");
vm.runInThisContext(src, { filename: "lessons_grid_matrix.js" });
const T = window.LessonsGridMatrix.__test;

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else { console.log("  ✗ " + name + (detail ? " — " + detail : "")); fail++; }
}

function baseSchool() {
  return {
    daysPerWeek: 7,
    bell: { periods: [
      { index: 1, isTeaching: true },
      { index: 2, isTeaching: false },
      { index: 3, isTeaching: true },
    ]},
    classes: [{ id: "C1", name: "VII A" }],
    subjects: [
      { id: "MATH", name: "Math" },
      { id: "PE", name: "PE" },
      { id: "MUS", name: "Music" },
      { id: "ART", name: "Art" },
    ],
    teachers: [
      { id: "T_MATH", name: "Math Teacher", qualifiedSubjectIds: ["MATH"] },
      { id: "T_PE", name: "PE Teacher", qualifiedSubjectIds: ["PE"] },
      { id: "T_ART", name: "Art Teacher", qualifiedSubjectIds: ["ART"] },
    ],
    classrooms: [{ id: "R1", name: "Room 1" }],
    groups: [
      { id: "BOYS", classId: "C1", name: "Boys", divisionTag: 1 },
      { id: "GIRLS", classId: "C1", name: "Girls", divisionTag: 1 },
      { id: "A", classId: "C1", name: "Activity A", divisionTag: 2 },
      { id: "B", classId: "C1", name: "Activity B", divisionTag: 2 },
    ],
    lessons: [
      { id: "L_MATH", classIds: ["C1"], subjectId: "MATH", teacherIds: ["T_MATH"], groupIds: [], periodsPerWeek: 5 },
      { id: "L_BOYS", classIds: ["C1"], subjectId: "PE", teacherIds: ["T_PE"], groupIds: ["BOYS"], periodsPerWeek: 3 },
      { id: "L_GIRLS", classIds: ["C1"], subjectId: "MUS", teacherIds: [], groupIds: ["GIRLS"], periodsPerWeek: 3 },
      { id: "L_ART", classIds: ["C1"], subjectId: "ART", teacherIds: ["T_ART"], groupIds: ["A"], periodsPerWeek: 2 },
    ],
    cards: [],
  };
}

{
  const school = baseSchool();
  const m = T.classMetrics(school, "C1");
  check("same-division Boys/Girls count once, cross-division activity adds", m.total === 10, `got ${m.total}`);
  check("teacherless parallel group contributes one 3-period shortage", m.teacherShortfall === 3, `got ${m.teacherShortfall}`);
  check("formal parallel streams receive stars", m.starred.has("L_BOYS") && m.starred.has("L_GIRLS"));
  check("single active group in another division is not starred", !m.starred.has("L_ART"));
  check("capacity counts teaching periods and supports seven-day schools", T.requiredPeriods(school) === 14, `got ${T.requiredPeriods(school)}`);
}

{
  const school = baseSchool();
  school.teachers.push({ id: "T_UNQUAL", name: "Low-load but unqualified", qualifiedSubjectIds: ["ART"] });
  school.lessons.push({ id: "LOAD", classIds: ["C1"], subjectId: "MATH", teacherIds: ["T_MATH"], periodsPerWeek: 8 });
  const best = T.bestTeacherForLesson(school, { subjectId: "MATH" });
  check("qualified teacher ranks above lower-load unqualified teacher", best?.id === "T_MATH", `got ${best?.id}`);
  check("teacher suggestion refuses explicitly unqualified teachers",
    T.bestTeacherForLesson({ teachers: [{ id: "NO", qualifiedSubjectIds: ["ART"] }], lessons: [] }, { subjectId: "MATH" }) === null);
}

{
  const school = baseSchool();
  const draft = T.createDraft(school);
  draft.lessons[0].teacherIds = ["CHANGED"];
  check("draft edits do not mutate the real timetable before Save", school.lessons[0].teacherIds[0] === "T_MATH");

  draft.lessons.push({ id: "ZERO", classIds: ["C1"], subjectId: "PE", teacherIds: [], periodsPerWeek: 0 });
  draft.cards = [
    { lessonId: "L_MATH", day: 0, period: 1 },
    { lessonId: "L_MATH", day: 0, period: 2 },
    { lessonId: "L_MATH", day: 0, period: 3 },
    { lessonId: "L_MATH", day: 0, period: 4 },
    { lessonId: "L_MATH", day: 0, period: 5 },
    { lessonId: "L_MATH", day: 0, period: 6 },
    { lessonId: "ZERO", day: 0, period: 1 },
    { lessonId: "MISSING", day: 0, period: 1 },
  ];
  const clean = T.cleanDraft(draft);
  check("clean draft removes zero-count lessons", !clean.lessons.some(l => l.id === "ZERO"));
  check("clean draft removes orphan cards and trims over-placed cards", clean.cards.length === 5, `got ${clean.cards.length}`);

  const doubleDraft = T.createDraft(school);
  doubleDraft.lessons = [{
    id: "DOUBLE", classIds: ["C1"], subjectId: "MATH", teacherIds: ["T_MATH"],
    periodsPerWeek: 2, lessonLength: 2, isLabDouble: true,
  }];
  doubleDraft.cards = [
    { lessonId: "DOUBLE", day: 0, period: 1 },
    { lessonId: "DOUBLE", day: 1, period: 1 },
  ];
  check("clean draft retains one placed session for a two-period double lesson",
    T.cleanDraft(doubleDraft).cards.length === 1);
}

{
  document.body.innerHTML = "";
  const school = baseSchool();
  school.lessons.push({
    id: "L_PE_2", classIds: ["C1"], subjectId: "PE",
    teacherIds: ["T_ART"], groupIds: ["GIRLS"], periodsPerWeek: 3,
  });
  window.APP = { school, editor: {}, audit: { append() {} } };
  window.LessonsGridMatrix.open(school);
  const multiInput = document.querySelector('.chrx-matrix-cell[data-class="C1"][data-subject="PE"] input');
  check("multi-stream cells are protected from destructive one-number edits", multiInput?.readOnly === true);
  document.querySelector(".chrx-matrix-cancel")?.click();
}

{
  document.body.innerHTML = "";
  const school = baseSchool();
  window.APP = { school, editor: {}, audit: { append() {} } };
  window.LessonsGridMatrix.open(school);
  const input = document.querySelector('.chrx-matrix-cell[data-class="C1"][data-subject="MATH"] input');
  input.focus();
  Array.from(document.querySelectorAll(".chrx-matrix-inspector-actions button"))
    .find(b => b.textContent === "Add stream")?.click();
  const groupValues = Array.from(document.querySelectorAll(".chrx-matrix-stream .chrx-matrix-field:nth-child(2) select"))
    .map(s => s.value).filter(Boolean);
  check("Add stream divides the original whole-class lesson into two groups", groupValues.length === 2,
    `groups=${groupValues.join(",")}`);
  check("dividing into parallel groups preserves effective cell load", input.value === "5", `got ${input.value}`);
  document.querySelector(".chrx-matrix-cancel")?.click();
}

{
  document.body.innerHTML = "";
  const school = {
    daysPerWeek: 1,
    bell: { periods: [{ index: 1, isTeaching: true }] },
    classes: [{ id: "C1", name: "I A" }],
    subjects: [{ id: "S1", name: "Math" }],
    teachers: [],
    classrooms: [],
    groups: [],
    lessons: [{ id: "L1", classIds: ["C1"], subjectId: "S1", teacherIds: [], periodsPerWeek: 1 }],
    cards: [
      { lessonId: "L1", day: 0, period: 1 },
      { lessonId: "ORPHAN", day: 0, period: 1 },
    ],
  };
  let changed = 0;
  document.addEventListener("entity:changed", () => changed++, { once: true });
  window.APP = { school, editor: {}, audit: { append() {} } };
  window.LessonsGridMatrix.open(school);
  const input = document.querySelector('.chrx-matrix-cell[data-class="C1"][data-subject="S1"] input');
  input.value = "0";
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  document.querySelector(".chrx-matrix-save")?.click();
  check("saving zero removes the lesson", school.lessons.length === 0, `got ${school.lessons.length}`);
  check("saving removes cards belonging to deleted or missing lessons", school.cards.length === 0, `got ${school.cards.length}`);
  check("saving dispatches entity:changed for editor synchronization", changed === 1, `got ${changed}`);
}

{
  const school = baseSchool();
  window.APP = { school, io: {} };
  const exportSrc = fs.readFileSync(path.join(repoRoot, "js/ui/io/export_timetable_xml.js"), "utf8");
  vm.runInThisContext(exportSrc, { filename: "export_timetable_xml.js" });
  const xml = window.APP.io.exportSynthesized(school);
  const parsed = new dom.window.DOMParser().parseFromString(xml, "application/xml");
  const group = parsed.querySelector('groups > group[id="BOYS"]');
  const lesson = parsed.querySelector('lessons > lesson[id="L_BOYS"]');
  check("XML export preserves canonical group class/division fields",
    group?.getAttribute("classid") === "C1" && group?.getAttribute("divisiontag") === "1");
  check("XML export preserves Lesson Grid group assignments",
    lesson?.getAttribute("groupids") === "BOYS", `got ${lesson?.getAttribute("groupids")}`);

  school.lessons[0].classroomIdsExpanded = ["R1"];
  const expandedXml = window.APP.io.exportSynthesized(school);
  const expandedLesson = new dom.window.DOMParser().parseFromString(expandedXml, "application/xml")
    .querySelector('lessons > lesson[id="L_MATH"]');
  check("XML export preserves expanded classroom assignments",
    expandedLesson?.getAttribute("classroomids") === "R1", `got ${expandedLesson?.getAttribute("classroomids")}`);
}

{
  const parserSrc = fs.readFileSync(path.join(repoRoot, "js/xml/parse_timetable_xml.js"), "utf8");
  vm.runInThisContext(parserSrc, { filename: "parse_timetable_xml.js" });
  const parsed = window.parseTimetableXml.parseText(`<?xml version="1.0"?>
    <timetable displayname="Metadata test">
      <periods><period period="1" name="1" short="1" starttime="08:00" endtime="08:40"/></periods>
      <subjects><subject id="S1" name="Math" short="M"/></subjects>
      <teachers><teacher id="T1" name="Teacher" short="T"/></teachers>
      <classrooms><classroom id="R1" name="Room 1" short="R1"/><classroom id="R2" name="Room 2" short="R2"/></classrooms>
      <classes><class id="C1" name="I A" short="I A"/></classes>
      <groups><group id="G1" classid="C1" name="Group 1" entireclass="0" divisiontag="4" studentcount="2" studentids="A,B"/></groups>
      <lessons><lesson id="L1" classids="C1" subjectid="S1" teacherids="T1" classroomids="R1,R2" groupids="G1" periodspercard="1" periodsperweek="1"/></lessons>
      <cards/>
    </timetable>`, "metadata.xml");
  check("XML parser preserves imported group student metadata",
    parsed.groups[0]?.studentCount === "2" && parsed.groups[0]?.studentIds?.join(",") === "A,B");
  check("XML parser preserves all lesson-level classroom choices",
    parsed.lessons[0]?._lessonRoomIds?.join(",") === "R1,R2");
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
