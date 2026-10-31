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
