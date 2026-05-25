// Focused regression for the ASC print-preview parity gaps found from the
// 2026-05-26 user video: pivot pages must be real preview pages, dense
// reports must compact, bell-times must read parsed startMin/endMin fields,
// and List of classes must be the ASC-style roster report.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom");

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
window.APP = {};

function load(rel) {
  const src = fs.readFileSync(path.join(repoRoot, rel), "utf8");
  vm.runInThisContext(src, { filename: rel });
}

load("js/ui/print_preview/templates_registry.js");
load("js/ui/print_preview/print_report_schema.js");
load("js/ui/print_preview/pivot_cell_renderer.js");
load("js/ui/print_preview/pivot_engine.js");
load("js/ui/print_preview/print_presets.js");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    console.log("  ✓ " + name);
    pass++;
  } else {
    console.log("  ✗ " + name + (detail ? " — " + detail : ""));
    fail++;
  }
}

const school = {
  schoolName: "G. D GOENKA PUBLIC SCHOOL, DARBHANGA",
  daysPerWeek: 6,
  classes: [
    { id: "C1", name: "IA", _teacherId: "T1", _classroomIds: ["R1"] },
    { id: "C2", name: "IB", _teacherId: "T2", _classroomIds: ["R2"] },
  ],
  teachers: [
    { id: "T1", name: "Bindu" },
    { id: "T2", name: "Anil" },
  ],
  classrooms: [
    { id: "R1", name: "Room 1" },
    { id: "R2", name: "Room 2" },
  ],
  subjects: [
    { id: "S1", name: "Maths", abbreviation: "Maths" },
    { id: "S2", name: "English", abbreviation: "Eng" },
  ],
  groups: [
    { id: "G1", name: "Group 1", classId: "C1", entireClass: false },
  ],
  lessons: [
    { id: "L1", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S1", groupIds: ["G1"], periodsPerWeek: 6 },
    { id: "L2", classIds: ["C2"], teacherIds: ["T2"], subjectId: "S2", groupIds: [], periodsPerWeek: 3 },
    { id: "L3", classIds: ["C1"], teacherIds: ["T2"], subjectId: "S2", groupIds: [], periodsPerWeek: 2 },
  ],
  cards: [
    { lessonId: "L1", day: 0, period: 1, classroomId: "R1" },
    { lessonId: "L2", day: 0, period: 2, classroomId: "R2" },
  ],
  bell: {
    periods: [
      { index: 1, label: "1", startMin: 480, endMin: 525 },
      { index: 2, label: "2", startMin: 540, endMin: 585 },
      { index: 3, label: "3", startMin: 600, endMin: 645 },
      { index: 4, label: "4", startMin: 660, endMin: 705 },
    ],
  },
};

const classPages = window.APP.PrintPivot.renderPreset("class", school, school.bell.periods);
const classPage = classPages[0];
check("pivot class report uses preview page class", classPage.className.includes("chrx-preview-page"), classPage.className);
check("pivot class report uses landscape A4 width", /width:297mm/.test(classPage.getAttribute("style")), classPage.getAttribute("style"));

const withTablePages = window.APP.PrintPivot.renderPreset("classwise_with_table", school, school.bell.periods);
const withTableText = withTablePages[0].textContent;
check("Class-with-table header shows home classroom and class teacher", withTableText.includes("Home classroom: Room 1") && withTableText.includes("Class teacher: Bindu"), withTableText);
check("Class-with-table includes subject/count side panel", withTableText.includes("Subjects") && withTableText.includes("Count") && withTableText.includes("Lessons/week"), withTableText);

const subjectPresetReport = window.APP.PrintReportSchema.create({ context: "subject" });
const countStyle = subjectPresetReport.elementStyles.find(s => s.key === "count");
check("subject report defaults include count element", !!countStyle?.enabled && countStyle.anchor === "top-right", JSON.stringify(countStyle));

const report = window.APP.PrintReportSchema.create({ context: "class" });
window.APP.PrintReportSchema.applyPreset(report, window.APP.PrintPresets.get("class"));
report.elementStyles = report.elementStyles.map(s => ({
  ...s,
  enabled: s.key === "bellTimes",
}));
const bellPage = window.APP.PrintPivot.renderReport(report, school, school.bell.periods)[0];
check("bell-times element reads startMin/endMin", bellPage.textContent.includes("8:00–8:45"), bellPage.textContent);

const manyPeriods = Array.from({ length: 40 }, (_, i) => ({
  index: i + 1,
  label: String(i + 1),
  startMin: 480 + i * 45,
  endMin: 520 + i * 45,
}));
const denseReport = window.APP.PrintReportSchema.create({ context: "summary" });
denseReport.pages = [];
denseReport.rows = ["class"];
denseReport.cols = ["day", "period"];
const denseSchool = { ...school, bell: { periods: manyPeriods } };
window.APP.PrintPivot.renderReport(denseReport, denseSchool, manyPeriods);
check("dense reports switch to compact cell height", denseReport._layout.cellMinHeightPx <= 22, String(denseReport._layout.cellMinHeightPx));

const summarySubjectPages = window.APP.PrintPivot.renderPreset("summary_of_subjects", school, school.bell.periods);
const summarySubjectText = summarySubjectPages[0].textContent;
check("Summary timetable of subjects uses aggregate count mode", summarySubjectText.includes("1") && summarySubjectText.includes("IA"), summarySubjectText);

check(
  "Class element can print group instead of class",
  window.APP.PrintCellRenderer.joinElementLabels(
    [{ classIds: ["C1"], groupIds: ["G1"] }],
    "class",
    school,
    { textFormat: "abbreviation", conditional: { printGroupInsteadOfClass: true } },
  ) === "Group 1",
);

check(
  "Classroom element hides imported home classroom",
  window.APP.PrintCellRenderer.joinElementLabels(
    [{ classIds: ["C1"], roomId: "R1" }],
    "classroom",
    school,
    { textFormat: "abbreviation", conditional: { doNotPrintIfHomeClassroom: true } },
  ) === "",
);

const listTpl = window.APP.printTemplates.get("list_of_classes");
const listPages = listTpl.render(school, school.bell.periods);
const listText = listPages[0].textContent;
check("List of classes shows class-teacher column", listText.includes("Class teacher"), listText);
check("List of classes shows home-classroom column", listText.includes("Home classroom"), listText);
check("List of classes resolves teacher and room names", listText.includes("Bindu") && listText.includes("Room 1"), listText);

const teacherListTpl = window.APP.printTemplates.get("list_of_teachers");
const teacherListPages = teacherListTpl.render(school, school.bell.periods);
const teacherListText = teacherListPages[0].textContent;
check("List of teachers shows ASC class-teacher-for-class column", teacherListText.includes("Class teacher for the class"), teacherListText);
check("List of teachers maps class teachers back to classes", teacherListText.includes("Bindu") && teacherListText.includes("IA"), teacherListText);

const lessonGridTpl = window.APP.printTemplates.get("lesson_grid");
const lessonGridPages = lessonGridTpl.render(school, school.bell.periods);
const lessonGridText = lessonGridPages[0].textContent;
const iaCells = Array.from(lessonGridPages[0].querySelectorAll("tbody tr")).find(tr => tr.textContent.includes("IA"))?.querySelectorAll("td") || [];
check("Lesson grid renders ASC class-subject weekly count matrix", lessonGridText.includes("Lesson grid") && lessonGridText.includes("Maths") && lessonGridText.includes("Eng"), lessonGridText);
check("Lesson grid counts lesson definitions, including unplaced lessons", Array.from(iaCells).some(td => td.textContent.trim() === "6") && Array.from(iaCells).some(td => td.textContent.trim() === "2"), lessonGridText);
check("Lesson grid does not render teacher-list aggregate cells", !lessonGridText.includes("Bindu6") && !lessonGridText.includes("Anil2"), lessonGridText);

const dailyTpl = window.APP.printTemplates.get("daily_attendance");
const dailyPages = dailyTpl.render(school, school.bell.periods);
const dailyText = dailyPages[0].textContent;
check("Daily attendance uses two class-day slips per landscape page", dailyPages[0].querySelectorAll(".chrx-pivot-grid").length === 2, dailyText);
check("Daily attendance titles match ASC day-class format", dailyText.includes("Monday - IA") && dailyText.includes("Monday - IB"), dailyText);

const posterPeriods = Array.from({ length: 8 }, (_, i) => ({
  index: i + 1,
  label: String(i + 1),
  startMin: 480 + i * 45,
  endMin: 525 + i * 45,
}));
const wallPosterSchool = {
  ...school,
  daysPerWeek: 2,
  bell: { periods: posterPeriods },
  cards: [
    { lessonId: "L1", day: 0, period: 1, classroomId: "R1" },
    { lessonId: "L2", day: 1, period: 1, classroomId: "R2" },
  ],
};
const wallPosterTpl = window.APP.printTemplates.get("wall_poster_classrooms");
const wallPosterPages = wallPosterTpl.render(wallPosterSchool, posterPeriods);
const wallPosterText = wallPosterPages[0].textContent;
check("Wall poster of classrooms paginates horizontal day-period chunks", wallPosterPages.length === 2 && wallPosterText.includes("Monday") && !wallPosterText.includes("Tuesday"), wallPosterText);
check("Wall poster of classrooms keeps classrooms as rows", wallPosterText.includes("Room 1") && wallPosterText.includes("Room 2"), wallPosterText);
check("Wall poster of classrooms renders classroom slot lessons", wallPosterText.includes("Maths") && wallPosterText.includes("Bindu"), wallPosterText);

const teacherExtraTpl = window.APP.printTemplates.get("teacherwise_extra");
const teacherExtraPages = teacherExtraTpl.render(school, school.bell.periods);
const teacherExtraText = teacherExtraPages[0].textContent;
check("Teacher-extra report stacks two teacher timetables per landscape page", teacherExtraPages[0].querySelectorAll(".chrx-pivot-grid").length === 2, teacherExtraText);
check("Teacher-extra report labels compact grids by teacher", teacherExtraText.includes("Anil") && teacherExtraText.includes("Bindu"), teacherExtraText);

const contractTpl = window.APP.printTemplates.get("contract_overview");
const contractPages = contractTpl.render(school, school.bell.periods);
const contractText = contractPages[0].textContent;
check("Contract overview uses teacher-subject class-list matrix", contractText.includes("Contract overview") && contractText.includes("Bindu") && contractText.includes("IA"), contractText);
check("Contract overview cells do not collapse to numeric-only counts", !contractText.includes("Bindu1"), contractText);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
