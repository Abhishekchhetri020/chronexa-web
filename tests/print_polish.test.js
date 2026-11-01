// Print polish: one owner for page numbers, and the logo behaving like a file.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import "../js/ui/print_preview/print_report_schema.js";
import "../js/ui/print_preview/print_presets.js";
import "../js/ui/print_preview/pivot_engine.js";
import "../js/ui/print_preview/templates/_helpers.js";

const school = () => ({
  schoolName: "G.D. Goenka, Darbhanga",
  daysPerWeek: 2,
  bell: { periods: [
    { index: 1, startMin: 480, endMin: 520, isTeaching: true },
    { index: 2, startMin: 520, endMin: 560, isTeaching: true },
  ] },
  days: [{ id: "d1", name: "Monday", short: "Mo" }, { id: "d2", name: "Tuesday", short: "Tu" }],
  subjects: [{ id: "s1", name: "Maths", abbreviation: "MA" }],
  teachers: [{ id: "t1", name: "Ms. Rao" }],
  classes: [{ id: "c1", name: "IX A" }],
  classrooms: [{ id: "r1", name: "R1" }],
  breaks: [],
  lessons: [{ id: "l1", subjectId: "s1", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 1 }],
  cards: [{ lessonId: "l1", day: 0, period: 1, classroomId: "r1" }],
  _idx: { cardsByClass: { c1: [{ day: 0, period: 1, subject: "MA", classroom: "R1" }] } },
});

beforeEach(() => {
  window.APP = window.APP || {};
  window.APP.printSettings = { pageNumbers: "none" };
});

function renderClass() {
  const Schema = window.APP.PrintReportSchema;
  const Presets = window.APP.PrintPresets;
  const r = Schema.create({ context: "class" });
  Schema.applyPreset(r, Presets.get("class"));
  return window.APP.PrintPivot.renderReport(r, school(), school().bell.periods);
}

describe("page numbering has one owner", () => {
  it("the report does not print its own page counter", () => {
    const pages = renderClass();
    expect(pages.length).toBeGreaterThan(0);
    const text = pages.map((p) => p.textContent).join(" ");
    expect(text).not.toMatch(/Page \d+ of \d+/);
  });
});

describe("logo printing", () => {
  it("prints no image when the logo is off or unset", () => {
    const pages = renderClass();
    expect(pages[0].querySelectorAll("img").length).toBe(0);
  });

  it("prints the stored logo when enabled, without forcing a square", () => {
    window.APP.printSettings.showLogo = true;
    window.APP.printSettings.logoUrl = "data:image/png;base64,iVBORw0KGgo=";
    const pages = renderClass();
    const img = pages[0].querySelector("img");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain("data:image/png");
    expect(img.getAttribute("style")).toMatch(/max-height:16mm/);
    expect(img.getAttribute("style")).not.toMatch(/width:14mm/);
  });
});
