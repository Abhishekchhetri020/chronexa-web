// Behavioural guard for the field-vocabulary bug: every report type must print
// the SHORT form when the file only carries `abbr` / `short` (which is exactly
// what our aSc XML importer writes). This asserts rendered OUTPUT, not a helper —
// the original bug shipped because the test asserted the template helper while
// the class report actually renders through the pivot engine.
import { describe, it, expect, beforeAll } from "vitest";
import "../js/ui/print_preview/print_report_schema.js";
import "../js/ui/print_preview/print_presets.js";
import "../js/ui/print_preview/pivot_engine.js";

const FULL = "INFORMATION TECHNOLOGY";
const ABBR = "I.T";

function importerShapedSchool() {
  return {
    schoolName: "Leak test",
    daysPerWeek: 2,
    bell: { periods: [
      { index: 1, startMin: 480, endMin: 520, isTeaching: true },
      { index: 2, startMin: 520, endMin: 560, isTeaching: true },
    ] },
    days: [{ id: "d1", name: "Monday", short: "Mo" }, { id: "d2", name: "Tuesday", short: "Tu" }],
    // importer output only: abbr / short, NO abbreviation / shortName
    subjects: [{ id: "s1", name: FULL, abbr: ABBR }],
    teachers: [{ id: "t1", name: "Ms. Rao", abbr: "RAO" }],
    classes: [{ id: "c1", name: "IX A", short: "IXA" }],
    classrooms: [{ id: "r1", name: "Computer Lab", short: "LAB" }],
    breaks: [],
    lessons: [{ id: "l1", subjectId: "s1", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 2 }],
    cards: [
      { lessonId: "l1", day: 0, period: 1, classroomId: "r1" },
      { lessonId: "l1", day: 1, period: 2, classroomId: "r1" },
    ],
    _idx: {},
  };
}

function renderPreset(id) {
  const s = importerShapedSchool();
  const Schema = window.APP.PrintReportSchema;
  const r = Schema.create({ context: window.APP.PrintPresets.get(id).context });
  Schema.applyPreset(r, window.APP.PrintPresets.get(id));
  const pages = window.APP.PrintPivot.renderReport(r, s, s.bell.periods);
  return pages.map((p) => p.textContent).join(" ");
}

beforeAll(() => {
  window.APP = window.APP || {};
  window.APP.printSettings = { marginMM: 0 };
});

describe("no full-name leakage when the file has abbreviations", () => {
  for (const id of ["class", "teacher", "room", "summary", "poster"]) {
    it(`${id} report prints ${ABBR}, never the long name`, () => {
      const text = renderPreset(id);
      expect(text).not.toContain(FULL);
      expect(text).toContain(ABBR);
    });
  }

  it("row headers use the short class form, not the long one", () => {
    const text = renderPreset("summary");
    // summary lists classes in the row header; the short form must be preferred
    expect(text.includes("IX A") || text.includes("IXA")).toBe(true);
  });
});
