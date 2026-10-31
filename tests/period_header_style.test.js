// aSc `gridheadertexts`: the period label and the bell-time line are styled
// separately, and the time line can be switched off. PrintHeaderDialog has
// always edited report.periodHeader — this is the reader that made those edits
// show up in the printed grid.
import { describe, it, expect, beforeAll } from "vitest";
import "../js/ui/print_preview/print_report_schema.js";
import "../js/ui/print_preview/pivot_engine.js";

const style = (report, settings) =>
  window.APP.PrintPivot.periodHeaderStyle(report, settings);

describe("periodHeaderStyle", () => {
  it("defaults to the schema values with times on", () => {
    const rep = window.APP.PrintReportSchema.create({ context: "class" });
    const s = style(rep, {});
    expect(s.labelPx).toBeGreaterThan(10);
    expect(s.showTimes).toBe(true);
    expect(s.bold).toBe(true);
    expect(s.align).toBe("center");
  });

  it("honours the dialog's size, font and alignment", () => {
    const rep = window.APP.PrintReportSchema.create({ context: "class" });
    rep.periodHeader = { ...rep.periodHeader, size: 60, font: "Bahnschrift", anchor: "bottom-left", italic: true };
    const s = style(rep, {});
    expect(s.labelPx).toBe(27);                       // 60 * .45
    expect(s.font).toContain("Bahnschrift");
    expect(s.align).toBe("left");
    expect(s.italic).toBe(true);
  });

  it("switches the time line off per report", () => {
    const rep = window.APP.PrintReportSchema.create({ context: "class" });
    rep.periodHeader.showTimeIntervals = false;
    expect(style(rep, {}).showTimes).toBe(false);
  });

  it("lets the global 'show bell times' setting win", () => {
    const rep = window.APP.PrintReportSchema.create({ context: "class" });
    expect(style(rep, { showBellTimes: false }).showTimes).toBe(false);
    expect(style(rep, { showBellTimes: true }).showTimes).toBe(true);
  });

  it("supports two-line times and a separate time font", () => {
    const rep = window.APP.PrintReportSchema.create({ context: "class" });
    rep.periodHeader.timeTwoLines = true;
    rep.periodHeader.timeFont = "Bahnschrift";
    rep.periodHeader.timeSize = 20;
    const s = style(rep, {});
    expect(s.twoLines).toBe(true);
    expect(s.timeFont).toContain("Bahnschrift");
    expect(s.timePx).toBe(9);
  });

  it("never renders a zero-size header", () => {
    const rep = { periodHeader: { size: 0, timeSize: 0 } };
    const s = style(rep, {});
    expect(s.labelPx).toBeGreaterThanOrEqual(7);
    expect(s.timePx).toBeGreaterThanOrEqual(5);
  });
});

describe("report title and date line", () => {
  const P = () => window.APP.PrintPivot;

  it("never prints the XML placeholder as the school name", () => {
    expect(P().printTitle({ schoolName: "aSc Timetables 2012 XML" }, {}))
      .toBe("");
    expect(P().printTitle({ schoolName: "aSc Timetables 2012 XML", regName: "G.D. Goenka, Darbhanga" }, {}))
      .toBe("G.D. Goenka, Darbhanga");
  });

  it("lets the print header text win over the file", () => {
    expect(P().printTitle({ schoolName: "File School" }, { headerText: "Printed Header" }))
      .toBe("Printed Header");
  });

  it("prints W.E.F only when the file carries a date", () => {
    expect(P().printDateLine({})).toBe("");
    expect(P().printDateLine({ dateFrom: "12.05.2026" })).toBe("W.E.F 12.05.2026");
    expect(P().printDateLine({ globals: { dateBelowTT: "W.E.F  12.05.2026" } }))
      .toBe("W.E.F  12.05.2026");
  });

  it("does not print today's date as if it were the effective date", () => {
    const today = new Date().toLocaleDateString("en-GB");
    expect(P().printDateLine({ schoolName: "x" })).not.toContain(today);
  });
});
