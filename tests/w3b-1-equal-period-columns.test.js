/**
 * W3b-1 · equal period columns in the print/PNG templates.
 *
 * The browser sizes a column to its widest cell under the default
 * `table-layout:auto`, so one slot holding "Sports Meet Practice" plus 17
 * teacher names stretched its P4/P5 columns to ~3x the width of P1–P3
 * (measured 150.5px vs 56.4px on the demo school's teacher page).
 *
 * The invariant that fixes it is structural, and this file pins it: every
 * day × period grid is `table-layout:fixed`, carries a <colgroup> whose
 * column count matches the header row, and pins ONLY the day column (and,
 * in print_preview's grid, the break columns) — every period column is left
 * width-less so the fixed layout hands it an identical share. Cells must
 * also be allowed to wrap, or the long content would paint outside its cell.
 *
 * The measured outcome (all period columns within 1px) is asserted in
 * e2e/w3b-1-equal-period-columns.spec.js, which needs real layout.
 */
import { describe, it, expect, beforeAll } from "vitest";
import "../js/ui/state.js";
import "../js/ui/print_preview/templates_registry.js";
import "../js/ui/print_preview/templates/_helpers.js";
import "../js/ui/print_preview/templates/teacherwise_with_table.js";
import "../js/ui/print_preview/templates/classwise_with_table.js";
import "../js/ui/print_preview/templates/timetable_for_student.js";
import "../js/ui/print_preview/templates/timetable_for_each_subject.js";
import "../js/ui/print_preview/templates/timetable_for_each_student.js";
import "../js/ui/print_preview/print_preview.js";

const PERIODS = [
  { index: 1, label: "P1", startMin: 480, endMin: 530 },
  { index: 2, label: "P2", startMin: 545, endMin: 590 },
  { index: 3, label: "P3", startMin: 590, endMin: 635 },
];
// A slot that made P2 wide enough to be visible in the screenshot evidence.
const LONG_TEACHERS = Array.from({ length: 17 }, (_, i) => ({ id: "t" + i, name: "Teacher " + i, abbr: "T" + i }));

function school() {
  const cards = [{ lessonId: "l1", day: 0, period: 2, classroomId: null }];
  return {
    schoolName: "Column Test School",
    daysPerWeek: 6,
    bell: { periods: PERIODS },
    breaks: [],
    classes: [{ id: "c1", name: "I A" }],
    teachers: LONG_TEACHERS,
    subjects: [{ id: "s1", name: "Sports Meet Practice", abbr: "Sports Meet Practice" }],
    lessons: [{
      id: "l1", subjectId: "s1", classIds: ["c1"],
      teacherIds: LONG_TEACHERS.map(t => t.id), periodsPerWeek: 2,
    }],
    cards,
    students: [{ id: "st1", firstName: "A", lastName: "B", classId: "c1" }],
    _idx: {
      lessonById: { l1: { id: "l1", subjectId: "s1", classIds: ["c1"], teacherIds: LONG_TEACHERS.map(t => t.id) } },
      teacherById: Object.fromEntries(LONG_TEACHERS.map(t => [t.id, t])),
      classById: { c1: { id: "c1", name: "I A" } },
      subjectById: { s1: { id: "s1", name: "Sports Meet Practice", abbr: "Sports Meet Practice" } },
      classroomById: {},
      cardsByClass: { c1: cards.map(c => ({ ...c, subject: "Sports Meet Practice", subjectAbbr: "Sports Meet Practice", teachers: LONG_TEACHERS.map(t => t.name), classes: ["I A"] })) },
      cardsByTeacher: Object.fromEntries(LONG_TEACHERS.map(t => [t.id, cards.map(c => ({ ...c, subject: "Sports Meet Practice", subjectAbbr: "Sports Meet Practice", teachers: LONG_TEACHERS.map(x => x.name), classes: ["I A"] }))])),
      cardsByRoom: {},
    },
  };
}

/** The day × period grid is always the first <table> on a page. */
function firstTable(pages) {
  const page = pages.find(p => p && p.querySelector && p.querySelector("table"));
  return page ? page.querySelector("table") : null;
}

function colWidths(table) {
  return Array.from(table.querySelectorAll("colgroup > col"))
    .map(c => (c.getAttribute("style") || "").replace(/\s/g, ""));
}

/** Column count of a table's header row (rowspan-free header rows only). */
function headerArity(table) {
  const row = table.querySelector("thead tr");
  return row ? row.children.length : 0;
}

beforeAll(() => {
  window.APP = window.APP || {};
  window.APP.school = school();
});

describe("W3b-1 equal period columns — shared helpers", () => {
  it("gridCSS() switches the table to fixed layout", () => {
    const U = window.APP.printTemplateUtils;
    expect(U.tableCSS()).not.toContain("table-layout");
    expect(U.gridCSS()).toContain("table-layout:fixed");
  });

  it("gridCols() pins only the label column and leaves one equal-share col per period", () => {
    const U = window.APP.printTemplateUtils;
    const cg = U.gridCols([{}, {}, {}], 62);
    const cols = Array.from(cg.children);
    expect(cols.length).toBe(4);
    expect(cols[0].getAttribute("style")).toBe("width:62px");
    cols.slice(1).forEach(c => expect(c.getAttribute("style")).toBeNull());
  });

  it("cell styles let long content wrap instead of widening the column", () => {
    const U = window.APP.printTemplateUtils;
    expect(U.tdCSS()).toContain("overflow-wrap:anywhere");
    expect(U.thCSS()).toContain("overflow-wrap:anywhere");
  });
});

describe("W3b-1 equal period columns — day × period templates", () => {
  const cases = [
    "teacherwise_with_table",
    "classwise_with_table",
    "timetable_for_student",
    "timetable_for_each_subject",
    "timetable_for_each_student",
  ];

  for (const id of cases) {
    it(`${id}: fixed layout + one width-less <col> per period`, () => {
      const tpl = window.APP.printTemplates.get(id);
      expect(tpl, `${id} must be registered`).toBeTruthy();
      const pages = tpl.render(window.APP.school);
      const table = firstTable(pages);
      expect(table, `${id} must render a grid table`).toBeTruthy();

      expect(table.getAttribute("style")).toContain("table-layout:fixed");
      const widths = colWidths(table);
      expect(widths.length).toBe(headerArity(table));
      expect(widths.length).toBe(PERIODS.length + 1);
      expect(widths[0]).toBe("width:62px");
      widths.slice(1).forEach(w => expect(w).toBe(""));
    });
  }
});

describe("W3b-1 equal period columns — print_preview gridTable (the PNG path)", () => {
  it("pins the day column and the break column, every period column equal", () => {
    const s = window.APP.school;
    // Sits in the 530→545 gap between P1 and P2.
    s.breaks = [
      { name: "Recess", printtext: "BREAK", starttime: "08:50", endtime: "09:05" },
    ];
    const pages = window.APP.printPreview.renderPagesForScope({ type: "teacher", id: "t0" });
    const table = firstTable(pages);
    expect(table).toBeTruthy();
    expect(table.getAttribute("style")).toContain("table-layout:fixed");

    const widths = colWidths(table);
    // 1 day column + 3 periods + the break column that follows P1.
    expect(widths.length).toBe(1 + PERIODS.length + 1);
    expect(widths.length).toBe(headerArity(table));
    expect(widths[0]).toBe("width:62px");
    expect(widths[2]).toBe("width:28px");        // break after P1
    expect(widths[1]).toBe("");                  // P1
    expect(widths[3]).toBe("");                  // P2
    expect(widths[4]).toBe("");                  // P3
  });

  it("the long teacher list is wrapped by the cell, not clipped away", () => {
    const pages = window.APP.printPreview.renderPagesForScope({ type: "teacher", id: "t0" });
    const table = firstTable(pages);
    const cell = Array.from(table.querySelectorAll("tbody td"))
      .find(td => td.textContent.includes("Sports Meet Practice"));
    expect(cell, "the P2 cell must hold the long-content card").toBeTruthy();
    expect(cell.textContent).toContain("Teacher 16");
    expect(cell.getAttribute("style")).toContain("overflow-wrap:anywhere");
  });
});
