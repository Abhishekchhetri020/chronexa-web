// "What a cell shows" (aSc ttreports.celltype) and the page prefix
// (pageheaderprefixenabled). One helper drives every template, so this pins the
// modes rather than each of the 14 templates separately.
import { describe, it, expect, beforeEach } from "vitest";
import "../js/ui/print_preview/templates/_helpers.js";

const card = {
  subject: "Maths", subjectAbbr: "MA",
  teacher: "Ms. Rao", classroom: "R12",
  teachers: ["Ms. Rao", "Mr. Das"], groups: ["Boys"],
};

function label(mode, c) {
  window.APP.printSettings = { cellText: mode };
  const target = c === undefined ? card : c;   // null must stay null
  return window.APP.printTemplateUtils.subjectLabel(target);
}

describe("cellText modes", () => {
  beforeEach(() => { window.APP = window.APP || {}; });

  it("subject is the default", () => {
    expect(label(undefined)).toBe("MA");        // abbr wins when present
    expect(label("subject")).toBe("MA");
    expect(label("subject", { subject: "Maths" })).toBe("Maths");
  });

  it("subject-abbr never falls back to the long name", () => {
    expect(label("subject-abbr")).toBe("MA");
    expect(label("subject-abbr", { subject: "Maths" })).toBe("Maths");
  });

  it("teacher mode shows the teacher", () => {
    expect(label("teacher")).toBe("Ms. Rao");
    expect(label("teacher", { teachers: ["Ms. Rao", "Mr. Das"] })).toBe("Ms. Rao, Mr. Das");
    expect(label("teacher", { subject: "Maths" })).toBe("Maths");  // no teacher -> subject
  });

  it("subject-teacher and subject-room combine with a dot", () => {
    expect(label("subject-teacher")).toBe("MA · Ms. Rao");
    expect(label("subject-room")).toBe("MA · R12");
    expect(label("subject-room", { subject: "Maths", subjectAbbr: "MA" })).toBe("MA");
  });

  it("group mode prefers the group names", () => {
    expect(label("group")).toBe("Boys");
    expect(label("group", { subject: "Maths", subjectAbbr: "MA" })).toBe("MA");
  });

  it("an empty card prints nothing rather than 'undefined'", () => {
    expect(label("subject", null)).toBe("");
  });
});

describe("page prefix", () => {
  it("renders above the report title when set", () => {
    window.APP.printSettings = { headerPrefix: "G.D. Goenka School, Darbhanga" };
    const h = window.APP.printTemplateUtils.header("Timetable for each class", "page 1/3");
    expect(h.textContent).toContain("G.D. Goenka School, Darbhanga");
    expect(h.textContent).toContain("Timetable for each class");
  });

  it("adds nothing when unset", () => {
    window.APP.printSettings = {};
    const h = window.APP.printTemplateUtils.header("Timetable for each class", "");
    expect(h.textContent.trim()).toBe("Timetable for each class");
  });
});
