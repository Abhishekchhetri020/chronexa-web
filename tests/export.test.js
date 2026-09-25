/**
 * W3-4 · Export dialog, CSV, PNG, one-click PDF, and scoped exports unit tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { fixtureSchool } from "./fixtures/school.js";
import { buildCsvExport } from "../js/ui/io/export_csv.js";
import { buildHtmlExport } from "../js/ui/io/export_html.js";
import { buildIcsText } from "../js/ui/io/export_ics.js";
import { buildExcelWorkbook } from "../js/ui/io/export_excel.js";
import { renderSvgForPage } from "../js/ui/io/export_png.js";
import { ExportDialog } from "../js/ui/components/export_dialog.js";

describe("W3-4: CSV export with scope", () => {
  it("builds CSV for whole school containing all placed cards", () => {
    const school = fixtureSchool();
    const csv = buildCsvExport(school, { type: "all" });
    expect(csv).toContain("Day,Period,Start,End,Class,Subject,Teacher,Room");
    expect(csv).toContain("I A");
    expect(csv).toContain("Maths");
    expect(csv).toContain("Ms. Sushmita");
    expect(csv).toContain("Science Lab");
  });

  it("builds CSV for a single class scope (both grid and list rows)", () => {
    const school = fixtureSchool();
    const csv = buildCsvExport(school, { type: "class", id: "c1" });
    expect(csv).toContain("Timetable: I A");
    expect(csv).toContain("Monday");
    expect(csv).toContain("Maths");
    // Should not contain cards from other classes that don't belong to c1
    expect(csv).not.toContain("ghost");
  });

  it("builds CSV for a single teacher scope", () => {
    const school = fixtureSchool();
    const csv = buildCsvExport(school, { type: "teacher", id: "t1" });
    expect(csv).toContain("Teacher: Ms. Sushmita");
    expect(csv).toContain("Maths");
  });

  it("builds CSV for a single room scope", () => {
    const school = fixtureSchool();
    const csv = buildCsvExport(school, { type: "room", id: "r1" });
    expect(csv).toContain("Room: Science Lab");
    expect(csv).toContain("Maths");
  });
});

describe("W3-4: HTML export with scope", () => {
  it("filters HTML export to a single class when scope is provided", () => {
    const school = fixtureSchool();
    const html = buildHtmlExport(school, { type: "class", id: "c1" });
    expect(html).toContain("<h2>I A</h2>");
    expect(html).not.toContain("<h2>I B</h2>");
  });

  it("exports teacher timetable HTML when scope is teacher", () => {
    const school = fixtureSchool();
    const html = buildHtmlExport(school, { type: "teacher", id: "t1" });
    expect(html).toContain("Ms. Sushmita");
    expect(html).toContain("Maths");
  });
});

describe("W3-4: ICS export with room scope", () => {
  it("exports calendar events for a specific room", () => {
    const school = fixtureSchool();
    const ics = buildIcsText(school, "room", "r1");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("LOCATION:Science Lab");
  });
});

describe("W3-4: Excel export with scope", () => {
  it("builds Excel workbook filtered by scope", () => {
    const school = fixtureSchool();
    const wb = buildExcelWorkbook(school, { type: "class", id: "c1" });
    expect(wb).toBeDefined();
    expect(wb.SheetNames).toContain("Class Schedule");
  });
});

describe("W3-4: PNG export via SVG foreignObject", () => {
  it("renders an HTML element into an SVG string with foreignObject", () => {
    const el = document.createElement("div");
    el.className = "chrx-preview-page";
    el.innerHTML = "<h2>Class I A</h2><p>Maths</p>";
    const svg = renderSvgForPage(el, { width: 1123, height: 794 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("<foreignObject");
    expect(svg).toContain("Class I A");
    expect(svg).toContain("</svg>");
  });
});

describe("W3-4: Export Dialog component", () => {
  beforeEach(() => {
    window.APP = window.APP || {};
    window.APP.school = fixtureSchool();
  });

  it("provides open, close, and available formats/scopes", () => {
    expect(ExportDialog).toBeDefined();
    expect(typeof ExportDialog.open).toBe("function");
    expect(typeof ExportDialog.close).toBe("function");

    ExportDialog.open();
    const dialogEl = document.querySelector('[data-testid="chrx-export-dialog"]');
    expect(dialogEl).not.toBeNull();

    // Must offer the required formats: Excel, CSV, ICS, HTML, aSc XML, PNG, PDF
    const formats = ["excel", "csv", "ics", "html", "xml", "png", "pdf"];
    for (const f of formats) {
      expect(dialogEl.querySelector(`[data-testid="chrx-export-format-${f}"]`)).not.toBeNull();
    }

    // Must offer scope selector (whole school, class, teacher, room)
    const scopes = ["all", "class", "teacher", "room"];
    for (const s of scopes) {
      expect(dialogEl.querySelector(`[data-testid="chrx-export-scope-${s}"]`)).not.toBeNull();
    }

    ExportDialog.close();
  });
});
