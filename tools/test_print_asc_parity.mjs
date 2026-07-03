// Focused regression for the ASC print-preview parity gaps found from the
// 2026-05-26 user video: pivot pages must be real preview pages, dense
// reports must compact, bell-times must read parsed startMin/endMin fields,
// and List of classes must be the ASC-style roster report.

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
  vm.runInThisContext(stripVite(src), { filename: rel });
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

// Click-to-style: every timetable data cell is tagged and carries its cards
// so the preview can open the per-card style dialog on click (aSc parity).
const classDataCells = Array.from(classPage.querySelectorAll("td.chrx-pivot-datacell"));
const aCellWithCards = classDataCells.find(td => Array.isArray(td._cards) && td._cards.length > 0);
check("timetable data cells are tagged chrx-pivot-datacell", classDataCells.length > 0, "count=" + classDataCells.length);
check("data cells carry their cards for click-to-style", !!aCellWithCards, "found cell with cards: " + !!aCellWithCards);

// Card colours (aSc parity): colour cards by subject by default, but cards
// with no teacher (free/leisure periods) print white.
const colorSchool = {
  ...school,
  subjects: [
    { id: "S1", name: "Maths", abbreviation: "Maths", color: "#cce5ff" },
    { id: "S9", name: "Leisure", abbreviation: "Leis", color: "#ffeeaa" },
  ],
  lessons: [
    { id: "LC", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S1", periodsPerWeek: 1 },
    { id: "LF", classIds: ["C1"], teacherIds: [], subjectId: "S9", periodsPerWeek: 1 },
  ],
  cards: [
    { lessonId: "LC", day: 0, period: 1 },
    { lessonId: "LF", day: 0, period: 2 },
  ],
};
const colorReport = window.APP.PrintReportSchema.create({ context: "class" });
window.APP.PrintReportSchema.applyPreset(colorReport, window.APP.PrintPresets.get("class"));
check("cards are coloured by subject by default", colorReport.colors.cardOn === true, "cardOn=" + colorReport.colors.cardOn);
const colorPage = window.APP.PrintPivot.renderReport(colorReport, colorSchool, colorSchool.bell.periods)[0];
const colorByCard = {};
colorPage.querySelectorAll("td.chrx-pivot-datacell").forEach(td => {
  const c = td._cards && td._cards[0]; if (!c) return;
  colorByCard[c.subjectId] = td.querySelector(".chrx-pivot-cell").style.background;
});
check("teaching card takes its subject colour", /204, 229, 255|#cce5ff/.test(colorByCard["S1"] || ""), "Maths bg=" + colorByCard["S1"]);
check("teacherless (leisure) card prints white", /255, 255, 255|#ffffff/.test(colorByCard["S9"] || ""), "Leisure bg=" + colorByCard["S9"]);

// Regression: when a school has breaks, the per-class (non-summary) grid
// inserts a break column in BOTH header and body. If the body skips it the
// two go out of sync under table-layout:fixed and every period cell shifts
// into the narrow break slot (the 2026-06-14 "messed up print preview" bug).
const perClassBreakSchool = {
  ...school,
  breaks: [{ starttime: "10:25", endtime: "10:40", name: "Recess", printtext: "RECESS" }],
  bell: {
    periods: [
      { index: 1, label: "1", startMin: 480, endMin: 525 },
      { index: 2, label: "2", startMin: 540, endMin: 585 },
      { index: 3, label: "3", startMin: 600, endMin: 625 },  // ends 10:25
      { index: 4, label: "4", startMin: 640, endMin: 705 },  // starts 10:40 → break between 3 and 4
    ],
  },
};
const breakClassPage = window.APP.PrintPivot.renderPreset("class", perClassBreakSchool, perClassBreakSchool.bell.periods)[0];
const bcHeaderTh = breakClassPage.querySelectorAll("table.chrx-pivot-grid thead tr th").length;
const bcFirstBodyRow = breakClassPage.querySelector("table.chrx-pivot-grid tbody tr");
const bcFirstRowTd = bcFirstBodyRow ? bcFirstBodyRow.querySelectorAll("td").length : 0;
check("per-class break column appears in header", breakClassPage.textContent.includes("RECESS"), breakClassPage.textContent.slice(0, 200));
check("per-class header and first body row have equal column count", bcHeaderTh === bcFirstRowTd, "header th=" + bcHeaderTh + " body td=" + bcFirstRowTd);

const withTablePages = window.APP.PrintPivot.renderPreset("classwise_with_table", school, school.bell.periods);
const withTableText = withTablePages[0].textContent;
check("Class-with-table header shows home classroom and class teacher", withTableText.includes("Home classroom: Room 1") && withTableText.includes("Class teacher: Bindu"), withTableText);
check("Class-with-table includes subject/count side panel", withTableText.includes("Subjects") && withTableText.includes("Count") && withTableText.includes("Lessons/week"), withTableText);

// Width protection: the extra-columns side panel must be capped so it can't
// push the timetable off the page. Even with absurdly wide column configs the
// panel width stays within ~42% of the printable page width.
const wideReport = window.APP.PrintReportSchema.create({ context: "class" });
window.APP.PrintReportSchema.applyPreset(wideReport, window.APP.PrintPresets.get("classwise_with_table"));
wideReport.extraCols = [
  { type: "subjects-count", header: "Subjects", width: 200 },
  { type: "sum-of-lessons", header: "Count", width: 200 },
  { type: "teachers-of-lessons", header: "Teachers", width: 200 },
];
const widePanel = window.APP.PrintPivot.renderReport(wideReport, school, school.bell.periods)[0].querySelector("table.chrx-pivot-extras");
const widePanelPx = widePanel ? parseFloat(widePanel.style.width) : 0;
const mmToPx = 3.779527559;
const landscapeInnerPx = 297 * mmToPx - 24 * mmToPx; // class report is landscape
check("Extra-columns side panel width is capped to ~42% of page width",
  widePanelPx > 0 && widePanelPx <= Math.floor(landscapeInnerPx * 0.42) + 0.5,
  "panel=" + widePanelPx.toFixed(0) + "px cap=" + Math.floor(landscapeInnerPx * 0.42) + "px");
check("Extra-columns panel does not flex-grow (flex:0 0 auto)",
  !!widePanel && /flex:0 0 auto/.test(widePanel.getAttribute("style")),
  widePanel ? widePanel.getAttribute("style") : "<none>");

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

const summaryPages = window.APP.PrintPivot.renderPreset("summary", school, school.bell.periods);
const summaryReport = window.APP.PrintReportSchema.create({ context: "summary" });
window.APP.PrintReportSchema.applyPreset(summaryReport, window.APP.PrintPresets.get("summary"));
window.APP.PrintPivot.renderReport(summaryReport, school, school.bell.periods);
const summaryRequestedWidthPx = summaryReport._layout.rowHeaderWidthPx + summaryReport._layout.summaryDayColumns.reduce((sum, col) => sum + (col.kind === "break" ? summaryReport._layout.summaryDayBreakColWidthPx : summaryReport._layout.summaryDayPeriodColWidthPx), 0);
const summaryAvailableWidthPx = 297 * 3.779527559 - 24 * 3.779527559;
check("summary day grid requested width fits page", summaryRequestedWidthPx <= summaryAvailableWidthPx + 0.5, summaryRequestedWidthPx.toFixed(1) + " <= " + summaryAvailableWidthPx.toFixed(1));
const summaryPage = summaryPages[0];
const summaryTuesdayPage = summaryPages[1];
const summaryHeaderRows = Array.from(summaryPage.querySelectorAll("table.chrx-pivot-grid thead tr"));
const summaryTopHeaders = summaryHeaderRows.length > 1 ? Array.from(summaryHeaderRows[0].querySelectorAll("th")).slice(1).map(th => th.textContent.trim().replace(/\s+/g, " ")) : [];
const summaryPeriodHeaders = Array.from(summaryHeaderRows[summaryHeaderRows.length - 1].querySelectorAll("th")).slice(1).map(th => th.textContent.trim().replace(/\s+/g, " "));
const summaryCells = Array.from(summaryPage.querySelectorAll("table.chrx-pivot-grid tbody td")).slice(1);
check("summary classes render one page per day", summaryPages.length === school.daysPerWeek, "Expected " + school.daysPerWeek + " pages, got " + summaryPages.length);
check("summary Monday page contains only Monday data", summaryPage.textContent.includes("Monday") && !summaryPage.textContent.includes("Tuesday"), summaryPage.textContent.slice(0, 220));
check("summary Tuesday page contains only Tuesday data", summaryTuesdayPage.textContent.includes("Tuesday") && !summaryTuesdayPage.textContent.includes("Monday"), summaryTuesdayPage.textContent.slice(0, 220));
check("summary day pages use period-only headers", summaryTopHeaders.length === 0 && summaryPeriodHeaders[0] === "1st" && summaryPeriodHeaders.join(" | ") === "1st | 2nd | 3rd | 4th", summaryPeriodHeaders.join(" | "));
check("summary class/day-period cells show period subject codes", summaryPage.textContent.includes("1st") && summaryCells.some(td => td.textContent.includes("Maths")), summaryCells.map(td => td.textContent.trim()).join(" | ").slice(0, 160));
check("summary day-wise cells use common element renderer with teacher names", summaryPage.textContent.includes("Bindu") && summaryPage.textContent.includes("Anil"), summaryPage.textContent.slice(0, 360));

const breakSchool = { ...school, cards: [...school.cards, { lessonId: "L3", day: 0, period: 2, classroomId: "R1" }], breaks: [{ starttime: "8:45", endtime: "9:00", name: "RECESS" }] };
const breakSummaryPage = window.APP.PrintPivot.renderPreset("summary", breakSchool, breakSchool.bell.periods)[0];
const breakSummaryHeaderRow = Array.from(breakSummaryPage.querySelectorAll("table.chrx-pivot-grid thead tr")).pop();
const breakSummaryHeaders = Array.from(breakSummaryHeaderRow.querySelectorAll("th")).slice(1).map(th => th.textContent.trim().replace(/\s+/g, " "));
const breakSummaryFirstRow = Array.from(breakSummaryPage.querySelectorAll("table.chrx-pivot-grid tbody tr:first-child td")).slice(1);
check("summary break column stays between period 1 and 2 in header", breakSummaryHeaders[0] === "1st" && breakSummaryHeaders[1] === "" && breakSummaryHeaders[2] === "2nd", breakSummaryHeaders.join(" | ").slice(0, 160));
check("summary break column stays between period 1 and 2 in body", breakSummaryFirstRow[0]?.textContent.includes("Maths") && breakSummaryFirstRow[1]?.textContent.includes("RECESS") && breakSummaryFirstRow[2]?.textContent.includes("Eng"), breakSummaryFirstRow.map(td => td.textContent.trim()).join(" | ").slice(0, 160));

const summarySubjectPages = window.APP.PrintPivot.renderPreset("summary_of_subjects", school, school.bell.periods);
const summarySubjectText = summarySubjectPages[0].textContent;
check("Summary timetable of subjects uses aggregate count mode", summarySubjectText.includes("1") && summarySubjectText.includes("IA"), summarySubjectText);

// Regression: day×period summary reports (cols=["day","period"]) must use the
// ASC grouped day header — a top row of day names with colspans over their
// periods, then a period sub-row — NOT the generic header that repeats the day
// label in every period column ("MonMonMon" + overlapping bell times bug).
const sumSubjPage = summarySubjectPages[0];
const sumSubjHeadRows = Array.from(sumSubjPage.querySelectorAll("table.chrx-pivot-grid thead tr"));
const sumSubjTopLabels = sumSubjHeadRows.length ? Array.from(sumSubjHeadRows[0].querySelectorAll("th")).map(t => t.textContent.trim()).filter(Boolean) : [];
const sumSubjDayColspans = sumSubjHeadRows.length ? Array.from(sumSubjHeadRows[0].querySelectorAll("th[colspan]")) : [];
check("Summary of subjects uses two header rows", sumSubjHeadRows.length === 2, "rows=" + sumSubjHeadRows.length);
check("Summary of subjects groups days with colspan (no MonMonMon repeat)",
  sumSubjTopLabels.includes("Monday") && sumSubjTopLabels.filter(l => l === "Monday").length === 1 && sumSubjDayColspans.length >= 1,
  "top=" + sumSubjTopLabels.join("|"));
const sumSubjPeriodRow = sumSubjHeadRows[sumSubjHeadRows.length - 1];
const sumSubjPeriodLabels = sumSubjPeriodRow ? Array.from(sumSubjPeriodRow.querySelectorAll("th")).map(t => t.textContent.trim()).filter(Boolean) : [];
check("Summary of subjects period sub-row shows period labels", sumSubjPeriodLabels[0] === "1st", sumSubjPeriodLabels.join("|"));

// Regression: the period sub-row must NOT begin with a blank leading <th>.
// The day-group row above carries a rowspan:2 corner cell that already fills
// column 1; an extra leading cell here shifts every period label one column
// right of the body ("1st period shows under 2nd" off-by-one). The very first
// cell of the period row must already be a period label, not an empty spacer.
const sumSubjPeriodFirstCell = sumSubjPeriodRow ? sumSubjPeriodRow.querySelector("th") : null;
check("Summary of subjects period row has no leading blank (no off-by-one)",
  !!sumSubjPeriodFirstCell && sumSubjPeriodFirstCell.textContent.trim() === "1st",
  "first period-row cell = '" + (sumSubjPeriodFirstCell ? sumSubjPeriodFirstCell.textContent.trim() : "<none>") + "'");

// Strict column geometry: the day-group row, the period sub-row (+ the spanned
// corner) and the first body row must all describe the same number of columns.
// This catches a header/body off-by-one in ANY grid mode, not just this one.
function colWidth(cells, attr) {
  return cells.reduce((s, c) => s + (parseInt(c.getAttribute(attr) || "1", 10) || 1), 0);
}
const sumSubjDayRowCols = colWidth(Array.from(sumSubjHeadRows[0].querySelectorAll("th")), "colspan");
const sumSubjPeriodRowCols = sumSubjPeriodRow.querySelectorAll("th").length + 1; // +1 for the rowspan corner
const sumSubjBodyRow0 = sumSubjPage.querySelector("table.chrx-pivot-grid tbody tr");
const sumSubjBodyRow0Cols = colWidth(Array.from(sumSubjBodyRow0.querySelectorAll("td")), "colspan");
check("Summary of subjects: header rows and body row describe equal column counts",
  sumSubjDayRowCols === sumSubjPeriodRowCols && sumSubjPeriodRowCols === sumSubjBodyRow0Cols,
  "dayRow=" + sumSubjDayRowCols + " periodRow(+corner)=" + sumSubjPeriodRowCols + " body0=" + sumSubjBodyRow0Cols);

// Broad sweep: for EVERY pivot-grid preset (class-wise, teacher-wise,
// subject-wise, room-wise, all summary variants, posters…), the first header
// row and the first body row must describe the same number of columns. The
// first <thead> row always spans the full grid width (leading/corner cell +
// period or day-colspan cells), so this single invariant catches any
// header/body off-by-one regardless of mode. Custom-rendered presets (lists,
// lesson grid, contract) are skipped — they don't use the pivot grid.
let geomChecked = 0;
for (const preset of window.APP.PrintPresets.list()) {
  if (preset.render) continue; // custom renderer, not a pivot grid
  const pages = window.APP.PrintPivot.renderPreset(preset.id, school, school.bell.periods);
  const page = pages && pages[0];
  if (!page) continue;
  const grid = page.querySelector("table.chrx-pivot-grid");
  if (!grid) continue;
  const headRow0 = grid.querySelector("thead tr");
  const bodyRow0 = grid.querySelector("tbody tr");
  if (!headRow0 || !bodyRow0) continue;
  const headCols = colWidth(Array.from(headRow0.children), "colspan");
  const bodyCols = colWidth(Array.from(bodyRow0.children), "colspan");
  geomChecked++;
  check("Column geometry aligns header↔body for preset '" + preset.id + "'",
    headCols === bodyCols, "header=" + headCols + " body=" + bodyCols);
}
check("Column-geometry sweep covered the grid presets", geomChecked >= 8, "checked=" + geomChecked);

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
