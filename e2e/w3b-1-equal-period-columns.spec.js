import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

/* W3b-1 (part 2) — every period column in a print/PNG timetable is the same
 * width, and long content wraps inside its own cell.
 *
 * Bug evidence: on the demo school's teacher page a slot holding "Sports Meet
 * Practice" + 16 teacher names made P4/P5 measure 150.5px while P1–P3/P6/P7
 * measured 56.4px. The fix is `table-layout:fixed` + a <colgroup> that leaves
 * one width-less <col> per period, so these assertions pin the MEASURED
 * outcome, not the markup.
 */

/** The teacher in the demo whose timetable holds the widest teacher list. */
async function worstTeacher(page) {
  return page.evaluate(() => {
    const S = window.APP.school;
    const byT = S._idx.cardsByTeacher;
    let best = null;
    for (const t of S.teachers) {
      for (const c of (byT[t.id] || [])) {
        const L = S._idx.lessonById[c.lessonId];
        const n = (L.teacherIds || []).length;
        if (!best || n > best.n) best = { n, id: t.id, name: t.name };
      }
    }
    return best;
  });
}

/** Measured widths of the period columns of a mounted day × period page. */
async function measure(page) {
  return page.evaluate(() => {
    const table = document.querySelector(".chrx-preview-doc table") ||
      document.querySelector(".chrx-preview-page table");
    const widthOf = el => Math.round(el.getBoundingClientRect().width * 10) / 10;
    const ths = [...table.querySelectorAll("thead tr > *")];
    const periods = ths.filter(th => th.classList.contains("chrx-print-th-period"));
    const breaks = ths.filter(th => th.classList.contains("chrx-print-th-break"));
    const widths = periods.map(widthOf);
    return {
      tableLayout: getComputedStyle(table).tableLayout,
      dayWidth: widthOf(ths[0]),
      colCount: table.querySelectorAll("colgroup > col").length,
      headerCount: ths.length,
      widths,
      min: Math.min(...widths),
      max: Math.max(...widths),
      breakWidths: breaks.map(widthOf),
      longCell: (() => {
        const td = [...table.querySelectorAll("tbody td")].find(c => c.textContent.includes("Sports"));
        return td ? { h: Math.round(td.getBoundingClientRect().height), overflow: td.scrollWidth - td.clientWidth } : null;
      })(),
    };
  });
}

test("W3b-1 · PNG scope page: every period column is the same width and long cells wrap", async ({ page }) => {
  await loadDemoSchool(page);
  const t = await worstTeacher(page);
  expect(t.n, "the demo school must contain a many-teacher card").toBeGreaterThan(10);

  const m = await page.evaluate((tid) => {
    const box = document.createElement("div");
    // The PNG exporter renders the page at A4 landscape inside a
    // 1123x794 wrapper — reproduce exactly that geometry.
    box.style.cssText = "position:fixed;left:-9999px;top:0;width:1123px;height:794px;background:#fff";
    document.body.appendChild(box);
    const pages = window.APP.printPreview.renderPagesForScope({ type: "teacher", id: tid });
    box.appendChild(pages[0]);
    const table = box.querySelector("table");
    const widthOf = el => Math.round(el.getBoundingClientRect().width * 10) / 10;
    const ths = [...table.querySelectorAll("thead tr > *")];
    const periods = ths.filter(th => th.classList.contains("chrx-print-th-period"));
    const res = {
      tableLayout: getComputedStyle(table).tableLayout,
      colCount: table.querySelectorAll("colgroup > col").length,
      headerCount: ths.length,
      widths: periods.map(widthOf),
      dayWidth: widthOf(ths[0]),
      breakWidths: ths.filter(th => th.classList.contains("chrx-print-th-break")).map(widthOf),
      spilledCells: [...table.querySelectorAll("tbody td div")]
        .filter(d => {
          const r = d.getBoundingClientRect(), cell = d.closest("td").getBoundingClientRect();
          return r.right > cell.right + 1;
        }).length,
      longCell: (() => {
        const td = [...table.querySelectorAll("tbody td")].find(c => c.textContent.includes("Sports"));
        return td ? { text: td.textContent.slice(0, 40), h: Math.round(td.getBoundingClientRect().height) } : null;
      })(),
    };
    res.min = Math.min(...res.widths);
    res.max = Math.max(...res.widths);
    box.remove();
    return res;
  }, t.id);

  // The bug first, exactly as the user sees it: unequal period columns.
  expect(m.widths.length).toBeGreaterThan(2);
  expect(m.max - m.min, `period columns must be equal, got ${JSON.stringify(m.widths)}`).toBeLessThanOrEqual(1);
  expect(m.tableLayout).toBe("fixed");
  expect(m.colCount, "the colgroup must match the header row column-for-column").toBe(m.headerCount);
  // Break columns keep their own, narrower width — they are not periods.
  for (const w of m.breakWidths) expect(w).toBeLessThanOrEqual(30);
  // The many-teacher card is on this page and its content stays inside the cell.
  expect(m.longCell, "the many-teacher card must be on this page").toBeTruthy();
  expect(m.longCell.text).toContain("Sports Meet Practice");
  expect(m.spilledCells, "no cell content may spill outside its column").toBe(0);
  expect(m.longCell.h).toBeGreaterThan(0);
  expect(m.dayWidth).toBeLessThan(m.min + 1);
});

test("W3b-1 · user flow: Export → PDF (class scope) mounts a page with equal period columns", async ({ page }) => {
  await loadDemoSchool(page);
  await page.evaluate(() => document.getElementById("chrx-pwa-banner")?.remove());

  // Stub the print dialog: the point is the PAGE that gets printed.
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });

  // Files → Export dialog (⌘E) → PDF → class scope → Export.
  await page.keyboard.press("Meta+e");
  const dialog = page.locator('[data-testid="chrx-export-dialog"]');
  await expect(dialog).toBeVisible();
  await page.click('[data-testid="chrx-export-format-pdf"]');
  await page.click('[data-testid="chrx-export-scope-class"]');
  await page.click('[data-testid="chrx-export-submit"]');

  await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible();
  await expect(page.locator(".chrx-preview-doc .chrx-preview-page")).toHaveCount(1);
  expect(await page.evaluate(() => window.__printed)).toBe(1);

  const m = await measure(page);
  expect(m.widths.length).toBeGreaterThan(2);
  expect(m.max - m.min, `period columns must be equal, got ${JSON.stringify(m.widths)}`).toBeLessThanOrEqual(1);
  expect(m.tableLayout).toBe("fixed");
  expect(m.colCount).toBe(m.headerCount);
});

test("W3b-1 · user flow: the preview's own report templates also keep equal period columns", async ({ page }) => {
  await loadDemoSchool(page);
  await page.evaluate(() => document.getElementById("chrx-pwa-banner")?.remove());
  await page.evaluate(() => window.dispatchEvent(new Event("app:print-preview")));
  await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible();

  const bar = page.locator(".chrx-preview-controls");
  for (const tpl of ["teacher", "class"]) {
    await bar.locator("select").selectOption(tpl);
    await expect(page.locator(".chrx-preview-doc .chrx-preview-page").first()).toBeVisible();
    // The on-screen report uses the pivot grid (its own `.chrx-pivot-grid`);
    // it must be as equal as the scope pages above.
    const widths = await page.evaluate(() => {
      const table = document.querySelector(".chrx-preview-doc .chrx-pivot-grid");
      if (!table) return null;
      // Period headers only — the pivot grid labels them "1st 8:00–8:45" and
      // interleaves narrow (28px) break columns with empty text.
      return [...table.querySelectorAll("thead tr > *")]
        .filter(th => /^\d/.test(th.textContent.trim()))
        .map(th => Math.round(th.getBoundingClientRect().width * 10) / 10);
    });
    expect(widths, `${tpl} must render a pivot grid`).not.toBeNull();
    expect(widths.length, `${tpl} must render period columns`).toBeGreaterThan(2);
    const min = Math.min(...widths), max = Math.max(...widths);
    expect(max - min, `${tpl}: period columns must be equal, got ${JSON.stringify(widths)}`).toBeLessThanOrEqual(1);
  }
});

test("W3b-1 · exported PNG is produced by the same equal-column page", async ({ page }) => {
  await loadDemoSchool(page);
  const t = await worstTeacher(page);

  const png = await page.evaluate(async (tid) => {
    const res = await window.APP.io.exportPng({ type: "teacher", id: tid });
    const buf = new Uint8Array(await res.blob.arrayBuffer());
    const view = new DataView(buf.buffer);
    return {
      magic: [...buf.slice(0, 8)],
      width: view.getUint32(16),
      height: view.getUint32(20),
      bytes: buf.length,
      filename: res.filename,
    };
  }, t.id);

  expect(png.magic).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(png.width).toBeGreaterThanOrEqual(1123);
  expect(png.height).toBeGreaterThanOrEqual(794);
  expect(png.bytes).toBeGreaterThan(5000);
  expect(png.filename).toMatch(/\.png$/);
});
