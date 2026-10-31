// Sheet engine — the aSc report options that change the paper rather than the
// content: paper/orientation, N-up (poster/booklet), copies, page numbers and
// hiding empty rows/columns. The maths and the empty-detection are pure and
// asserted directly; prepare() is exercised against real DOM nodes.
import { describe, it, expect, beforeEach } from "vitest";
import {
  sheetSize, sheetPlan, groupIntoSheets, isEmptyRow, emptyColumnIndexes, prepare,
} from "../js/ui/print_preview/sheet_engine.js";

describe("sheetSize", () => {
  it("knows the paper sizes and swaps for landscape", () => {
    expect(sheetSize("A4", "portrait")).toEqual({ w: 210, h: 297 });
    expect(sheetSize("A4", "landscape")).toEqual({ w: 297, h: 210 });
    expect(sheetSize("A3", "landscape")).toEqual({ w: 420, h: 297 });
  });
  it("falls back to A4 for an unknown size", () => {
    expect(sheetSize("Bogus", "portrait")).toEqual({ w: 210, h: 297 });
  });
});

describe("sheetPlan", () => {
  it("defaults to one page per sheet, one copy", () => {
    expect(sheetPlan({})).toMatchObject({ cols: 1, rows: 1, perSheet: 1, copies: 1, multi: false });
  });
  it("reads the aSc splitpage fields", () => {
    expect(sheetPlan({ splitW: 2, splitH: 2 })).toMatchObject({ perSheet: 4, multi: true });
    expect(sheetPlan({ repeatCopies: 3 })).toMatchObject({ copies: 3, multi: true });
  });
  it("clamps nonsense to something printable", () => {
    expect(sheetPlan({ splitW: 99, splitH: -2, repeatCopies: 0 }))
      .toMatchObject({ cols: 4, rows: 1, copies: 1 });
  });
});

describe("groupIntoSheets", () => {
  it("packs pages in order", () => {
    const pages = ["a", "b", "c", "d", "e"];
    expect(groupIntoSheets(pages, { perSheet: 2 })).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(groupIntoSheets(pages, { perSheet: 1 }).length).toBe(5);
  });
});

describe("empty detection", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("treats a row of blank cells as empty, whitespace included", () => {
    const t = document.createElement("table");
    t.innerHTML = "<tr><td> </td><td>\n</td></tr><tr><td>Maths</td><td></td></tr>";
    const rows = t.querySelectorAll("tr");
    expect(isEmptyRow(rows[0])).toBe(true);
    expect(isEmptyRow(rows[1])).toBe(false);
  });

  it("finds whole columns with no content in the body", () => {
    const t = document.createElement("table");
    t.innerHTML = `<thead><tr><th>#</th><th>Name</th><th>Empty</th></tr></thead>
      <tbody><tr><td>1</td><td>A</td><td></td></tr><tr><td>2</td><td>B</td><td> </td></tr></tbody>`;
    expect(emptyColumnIndexes(t)).toEqual([2]);
  });
});

describe("prepare", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  function makePages(n) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const pages = [];
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      p.className = "chrx-preview-page";
      p.innerHTML = "<table><tbody><tr><td>x</td></tr></tbody></table>";
      host.appendChild(p);
      pages.push(p);
    }
    return { host, pages };
  }

  it("injects an @page rule sized from the settings and removes it on restore", () => {
    const { host, pages } = makePages(1);
    const restore = prepare(pages, { pageSize: "A3", orientation: "landscape", marginMM: 8 }, host);
    const css = document.getElementById("chrx-print-sheet-style").textContent;
    expect(css).toMatch(/size: 420mm 297mm/);
    expect(css).toMatch(/margin: 8mm/);
    restore();
    expect(document.getElementById("chrx-print-sheet-style")).toBeNull();
  });

  it("stamps page numbers and takes them away again", () => {
    const { host, pages } = makePages(3);
    const restore = prepare(pages, { pageNumbers: "of-total" }, host);
    expect(pages[0].querySelectorAll(".chrx-print-pagenum").length).toBe(1);
    expect(pages[2].textContent).toContain("Page 3 of 3");
    restore();
    expect(document.querySelectorAll(".chrx-print-pagenum").length).toBe(0);
  });

  it("hides empty rows only when asked", () => {
    const { host, pages } = makePages(1);
    const tbody = pages[0].querySelector("tbody");
    tbody.appendChild(document.createElement("tr")).innerHTML = "<td> </td><td></td>";
    prepare(pages, {}, host);
    const blankWithout = [...pages[0].querySelectorAll("tr")].filter(r => r.style.display === "none");
    expect(blankWithout.length).toBe(0);

    const restore = prepare(pages, { hideEmptyRows: true }, host);
    const hidden = [...pages[0].querySelectorAll("tr")].filter(r => r.style.display === "none");
    expect(hidden.length).toBe(1);
    restore();
    const after = [...pages[0].querySelectorAll("tr")].filter(r => r.style.display === "none");
    expect(after.length).toBe(0);
  });

  it("builds N-up sheets with copies and restores the original order", () => {
    const { host, pages } = makePages(4);
    const before = [...host.children];
    const restore = prepare(pages, { splitW: 2, splitH: 2, repeatCopies: 2 }, host);
    const sheets = host.querySelectorAll(".chrx-print-sheet");
    expect(sheets.length).toBe(2);                       // 1 sheet of 4 x 2 copies
    expect(sheets[0].querySelectorAll(".chrx-sheet-cell").length).toBe(4);
    expect(host.querySelectorAll(".chrx-preview-page").length).toBe(4);  // pages moved, not cloned
    restore();
    expect(host.querySelectorAll(".chrx-print-sheet").length).toBe(0);
    expect([...host.children]).toEqual(before);
  });
});
