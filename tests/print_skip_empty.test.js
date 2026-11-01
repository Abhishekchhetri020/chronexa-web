// "Skip pages with no lessons": the pivot engine marks a page whose scope holds
// no placed cards, and the preview/print drops it. aSc prints the blank page.
import { describe, it, expect, beforeAll } from "vitest";
import "../js/ui/print_preview/print_report_schema.js";
import "../js/ui/print_preview/print_presets.js";
import "../js/ui/print_preview/pivot_engine.js";

function schoolWithEmptyClass() {
  return {
    schoolName: "Skip test",
    daysPerWeek: 2,
    bell: { periods: [
      { index: 1, startMin: 480, endMin: 520, isTeaching: true },
      { index: 2, startMin: 520, endMin: 560, isTeaching: true },
    ] },
    days: [{ id: "d1", name: "Monday", short: "Mo" }, { id: "d2", name: "Tuesday", short: "Tu" }],
    subjects: [{ id: "s1", name: "Maths", abbreviation: "MA" }],
    teachers: [{ id: "t1", name: "Ms. Rao" }],
    // IX B has no lessons at all — its page would print as an empty grid.
    classes: [{ id: "c1", name: "IX A" }, { id: "c2", name: "IX B" }],
    classrooms: [{ id: "r1", name: "R1" }],
    breaks: [],
    lessons: [{ id: "l1", subjectId: "s1", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 1 }],
    cards: [{ lessonId: "l1", day: 0, period: 1, classroomId: "r1" }],
    _idx: { cardsByClass: { c1: [{ day: 0, period: 1, subject: "MA", classroom: "R1" }] } },
  };
}

beforeAll(() => {
  window.APP = window.APP || {};
  window.APP.printSettings = {};
});

describe("empty-page marking", () => {
  it("marks the page of a class with no lessons and leaves the others alone", () => {
    const Schema = window.APP.PrintReportSchema;
    const r = Schema.create({ context: "class" });
    Schema.applyPreset(r, window.APP.PrintPresets.get("class"));
    const pages = window.APP.PrintPivot.renderReport(r, schoolWithEmptyClass(), schoolWithEmptyClass().bell.periods);
    expect(pages).toHaveLength(2);
    const empties = pages.filter((p) => p.dataset && p.dataset.chrxEmpty === "1");
    expect(empties).toHaveLength(1);
    // the marked page is the one for IX B
    expect(empties[0].textContent).toContain("IX B");
  });

  it("does not mark a page that has cards", () => {
    const Schema = window.APP.PrintReportSchema;
    const r = Schema.create({ context: "class" });
    Schema.applyPreset(r, window.APP.PrintPresets.get("class"));
    const pages = window.APP.PrintPivot.renderReport(r, schoolWithEmptyClass(), schoolWithEmptyClass().bell.periods);
    const ixA = pages.find((p) => p.textContent.includes("IX A") && !p.textContent.includes("IX B"));
    expect(ixA.dataset.chrxEmpty).toBeUndefined();
  });
});
