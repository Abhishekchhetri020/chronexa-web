// The bug: a class report printed "INFORMATION TECHNOLOGY" where the short form
// is "I.T". The XML importer stores the aSc attribute as `abbr` (and `short` for
// classes), while the print renderer looked for `abbreviation` / `shortName` — so
// every imported subject silently fell back to the full name.
import { describe, it, expect, beforeAll } from "vitest";
import { entityShort, entityFull, entityLabel } from "../js/ui/print_preview/entity_label.js";
import "../js/ui/print_preview/print_report_schema.js";
import "../js/ui/print_preview/print_presets.js";
import "../js/ui/print_preview/pivot_engine.js";

describe("entityLabel", () => {
  it("accepts every spelling of the short form we write or import", () => {
    expect(entityShort({ abbreviation: "IT" })).toBe("IT");
    expect(entityShort({ abbr: "IT" })).toBe("IT");
    expect(entityShort({ shortName: "IT" })).toBe("IT");
    expect(entityShort({ short: "IT" })).toBe("IT");
    expect(entityShort({ code: "IT" })).toBe("IT");
  });

  it("prefers the short form by default and the full form only when asked", () => {
    const s = { name: "INFORMATION TECHNOLOGY", abbr: "I.T" };
    expect(entityLabel(s)).toBe("I.T");
    expect(entityLabel(s, "abbreviation")).toBe("I.T");
    expect(entityLabel(s, "full")).toBe("INFORMATION TECHNOLOGY");
    expect(entityLabel(s, "both")).toBe("INFORMATION TECHNOLOGY (I.T)");
  });

  it("falls back to the full name when no short form exists at all", () => {
    expect(entityLabel({ name: "Mathematics" })).toBe("Mathematics");
  });

  it("never renders 'undefined' for a half-filled entity", () => {
    expect(entityLabel({ id: "x1" })).toBe("x1");
    expect(entityLabel(null)).toBe("");
    expect(entityShort({ name: "Only name" })).toBe("");
    expect(entityFull({ abbr: "IT" })).toBe("");
  });
});

describe("rendered class report uses the short form", () => {
  const school = () => ({
    schoolName: "Abbr test",
    daysPerWeek: 1,
    bell: { periods: [{ index: 1, startMin: 480, endMin: 520, isTeaching: true }] },
    days: [{ id: "d1", name: "Monday", short: "Mo" }],
    // importer output: `abbr` / `short`, no `abbreviation`
    subjects: [{ id: "s1", name: "INFORMATION TECHNOLOGY", abbr: "I.T" }],
    teachers: [{ id: "t1", name: "Ms. Rao", abbr: "RAO" }],
    classes: [{ id: "c1", name: "IX A", short: "IXA" }],
    classrooms: [{ id: "r1", name: "R1" }],
    breaks: [],
    lessons: [{ id: "l1", subjectId: "s1", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 1 }],
    cards: [{ lessonId: "l1", day: 0, period: 1, classroomId: "r1" }],
    _idx: {},
  });

  beforeAll(() => {
    window.APP = window.APP || {};
    window.APP.printSettings = { marginMM: 0 };
  });

  const render = () => {
    const Schema = window.APP.PrintReportSchema;
    const r = Schema.create({ context: "class" });
    Schema.applyPreset(r, window.APP.PrintPresets.get("class"));
    return window.APP.PrintPivot.renderReport(r, school(), school().bell.periods);
  };

  it("prints the abbreviation, not the full subject name", () => {
    const text = render()[0].textContent;
    expect(text).toContain("I.T");
    expect(text).not.toContain("INFORMATION TECHNOLOGY");
  });

  it("resolves teacher and class short forms from the same spellings", () => {
    // (cell content for these is covered by the renderer defaults; the lookup is
    // what broke, so assert the resolver the renderer now shares)
    expect(entityLabel({ id: "t1", name: "Ms. Rao", abbr: "RAO" }, "abbreviation")).toBe("RAO");
    expect(entityLabel({ id: "c1", name: "IX A", short: "IXA" }, "abbreviation")).toBe("IXA");
  });

  it("still prints the full name when a subject has no short form", () => {
    const s = school();
    s.subjects = [{ id: "s1", name: "Information Technology" }];
    const Schema = window.APP.PrintReportSchema;
    const r = Schema.create({ context: "class" });
    Schema.applyPreset(r, window.APP.PrintPresets.get("class"));
    expect(window.APP.PrintPivot.renderReport(r, s, s.bell.periods)[0].textContent)
      .toContain("Information Technology");
  });
});
