// Print-area fit check: does the rendered page fit the paper inside the margins?
import { describe, it, expect } from "vitest";
import { printableArea, evaluateFit, mmFromPx, checkPage } from "../js/ui/print_preview/fit_check.js";

describe("printableArea", () => {
  it("subtracts the margins from the chosen paper", () => {
    expect(printableArea({ pageSize: "A4", orientation: "portrait", marginMM: 10 }))
      .toMatchObject({ w: 190, h: 277 });
    expect(printableArea({ pageSize: "A4", orientation: "landscape", marginMM: 0 }))
      .toMatchObject({ w: 297, h: 210 });
  });

  it("falls back to A4 and never returns a negative box", () => {
    const a = printableArea({ pageSize: "Bogus", marginMM: 5 });
    expect(a.w).toBe(200);
    expect(printableArea({ marginMM: 400 }).w).toBeGreaterThan(0);
  });
});

describe("evaluateFit", () => {
  const area = { areaWmm: 190, areaHmm: 277 };

  it("passes a page that fits comfortably", () => {
    const r = evaluateFit({ pageWmm: 180, pageHmm: 260, contentWmm: 180, contentHmm: 260, ...area });
    expect(r.ok).toBe(true);
    expect(r.scale).toBe(1);
  });

  it("flags vertical spill with the amount", () => {
    const r = evaluateFit({ pageWmm: 180, pageHmm: 260, contentWmm: 180, contentHmm: 300, ...area });
    expect(r.ok).toBe(false);
    expect(r.okY).toBe(false);
    expect(r.overflowYMm).toBe(23);
    expect(r.scale).toBeLessThan(1);
  });

  it("flags a page authored wider than the printable area even when short", () => {
    const r = evaluateFit({ pageWmm: 297, pageHmm: 100, contentWmm: 297, contentHmm: 100, ...area });
    expect(r.ok).toBe(false);
    expect(r.okX).toBe(false);
    expect(r.overflowXMm).toBe(107);
  });

  it("tolerates sub-half-millimetre rounding", () => {
    const r = evaluateFit({ pageWmm: 190.4, pageHmm: 277.2, contentWmm: 190.4, contentHmm: 277.2, ...area });
    expect(r.ok).toBe(true);
  });
});

describe("measurePage / checkPage", () => {
  it("converts pixels to millimetres", () => {
    expect(Math.round(mmFromPx(96))).toBe(25);
  });

  it("returns null for a missing node instead of throwing", () => {
    expect(checkPage(null, {})).toBeNull();
  });
});
