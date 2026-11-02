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
  window.APP.printSettings = { pageNumbers: "none", marginMM: 0, orientation: "portrait" };
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

describe("footer tokens", () => {
  const render = (tpl, ctx) => window.APP.PrintPivot.renderFooterTokens(tpl, ctx);

  it("substitutes every documented token", () => {
    const ctx = { school: "GDG", date: "W.E.F 12.05.2026", scope: "IX A",
      classTeacher: "Ms. Rao", room: "R12", report: "Timetable for each class" };
    expect(render("{school} · {scope}", ctx)).toBe("GDG · IX A");
    expect(render("{classTeacher} / {room}", ctx)).toBe("Ms. Rao / R12");
    expect(render("{date}", ctx)).toBe("W.E.F 12.05.2026");
    expect(render("{report}", ctx)).toBe("Timetable for each class");
  });

  it("leaves unknown tokens visible instead of swallowing them", () => {
    expect(render("{nope}", {})).toBe("{nope}");
  });

  it("does not offer page tokens — the sheet engine owns those", () => {
    expect(render("{page}/{pages}", { page: 1, pages: 9 })).toBe("{page}/{pages}");
  });

  it("renders the three footer slots with the old defaults", () => {
    const pages = renderClass();
    const foot = pages[0].querySelectorAll("span");
    const texts = [...foot].map((s) => s.textContent);
    expect(texts).toContain("Chronexa");           // right slot default
  });
});

describe("margin-aware page authoring", () => {
  it("authors the page at paper minus the margins, so nothing phantom-overflows", () => {
    window.APP.printSettings = { marginMM: 10 };
    const pages = renderClass();
    const style = pages[0].getAttribute("style");
    // the class preset is landscape A4 (297x210); 10mm margins → 277x190
    expect(style).toContain("width:277mm");
    expect(style).toContain("min-height:190mm");
  });

  it("keeps the full paper size when the margin is zero", () => {
    window.APP.printSettings = { marginMM: 0, orientation: "portrait" };
    const pages = renderClass();
    const style = pages[0].getAttribute("style");
    // landscape width regardless of the app default — the report decides
    expect(style).toMatch(/width:(297|210)mm/);
    expect(style).toContain("width:297mm");
  });
});

describe("page identity for warnings", () => {
  it("tags each page with its scope so a warning can name it", () => {
    const pages = renderClass();
    const scope = pages[0].querySelector("[data-chrx-scope]");
    expect(scope).toBeTruthy();
    expect(scope.getAttribute("data-chrx-scope")).toBe("IX A");
  });
});
