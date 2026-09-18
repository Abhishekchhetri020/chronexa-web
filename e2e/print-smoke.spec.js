import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

/* Print-pipeline smoke — the first automated coverage for the print/PDF path.
 *
 * Covers:
 *   1. app:print-preview mounts the overlay with at least one A4 page
 *   2. template switching (class / teacher / summary) re-renders with a sane
 *      page count derived from the loaded school
 *   3. printAllPages mounts EVERY page before window.print() and restores the
 *      single-page view afterwards (the "only the first page printed" guard)
 *   4. the whole flow runs without console errors or page errors
 *
 * Read-only w.r.t. the app: window.print is stubbed so nothing is sent to a
 * printer and no dialog can block the run.
 */

const CONTROLS = ".chrx-preview-controls";
const MOUNTED_PAGE = ".chrx-preview-doc .chrx-preview-page";
const INDICATOR = `${CONTROLS} .chrx-pp-indicator`;

/** Read the "Page N / M" readout and return { index, total }. */
async function pageReadout(page) {
  const text = (await page.locator(INDICATOR).innerText()).trim();
  const m = text.match(/^Page\s+(\d+)\s*\/\s*(\d+)$/);
  expect(m, `indicator should read "Page N / M", got "${text}"`).not.toBeNull();
  return { index: Number(m[1]), total: Number(m[2]) };
}

/** Switch the report template via the toolbar <select> and wait for re-render. */
async function selectTemplate(page, id) {
  await page.selectOption(`${CONTROLS} select`, id);
  await expect(page.locator(INDICATOR)).toHaveText(/^Page 1 \/ \d+$/);
  return pageReadout(page);
}

test("print preview smoke: mounts, templates, multi-page print, clean console", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  // 1. demo school + preview mount -----------------------------------------
  await loadDemoSchool(page);

  // The first-visit PWA banner overlays the bottom of the viewport and can
  // intercept clicks aimed at the preview toolbar.
  await page.evaluate(() => document.getElementById("chrx-pwa-banner")?.remove());

  await page.evaluate(() => window.dispatchEvent(new Event("app:print-preview")));
  await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible();
  await expect(page.locator(`${CONTROLS}`)).toBeVisible();
  await expect(page.locator(MOUNTED_PAGE).first()).toBeVisible();
  expect(
    await page.locator(MOUNTED_PAGE).count(),
    "exactly one page is mounted for the on-screen preview",
  ).toBe(1);

  const school = await page.evaluate(() => ({
    classes: (window.APP.school?.classes || []).length,
    teachers: (window.APP.school?.teachers || []).length,
  }));
  expect(school.classes).toBeGreaterThan(0);
  expect(school.teachers).toBeGreaterThan(0);

  // 2. template switching ---------------------------------------------------
  // class report: one page per class
  const classTpl = await selectTemplate(page, "class");
  expect(classTpl.index).toBe(1);
  expect(classTpl.total).toBe(school.classes);

  // teacher report: one page per teacher
  const teacherTpl = await selectTemplate(page, "teacher");
  expect(teacherTpl.index).toBe(1);
  expect(teacherTpl.total).toBe(school.teachers);

  // summary report: day-paged, so a handful of pages, never zero
  const summaryTpl = await selectTemplate(page, "summary");
  expect(summaryTpl.index).toBe(1);
  expect(summaryTpl.total).toBeGreaterThanOrEqual(1);
  expect(summaryTpl.total).toBeLessThanOrEqual(7);

  // 3. printAllPages: mount everything, then restore single-page view ------
  await selectTemplate(page, "teacher");
  const beforePrint = await pageReadout(page);
  expect(beforePrint.index).toBe(1);
  const totalPages = beforePrint.total;
  expect(totalPages).toBeGreaterThan(1); // multi-page is the case worth testing

  await page.evaluate(() => {
    window.__printCalls = [];
    window.print = () => {
      const mounted = document.querySelectorAll(".chrx-preview-doc .chrx-preview-page");
      window.__printCalls.push({
        mounted: mounted.length,
        zoomed: Array.from(mounted).map((p) => p.style.zoom),
      });
    };
  });

  await page.locator(`${CONTROLS} button:has-text('Print')`).click();
  await expect.poll(() => page.evaluate(() => window.__printCalls.length)).toBe(1);

  const printCall = await page.evaluate(() => window.__printCalls[0]);
  expect(
    printCall.mounted,
    "printAllPages must mount every page before window.print()",
  ).toBe(totalPages);
  expect(
    printCall.zoomed.every((z) => z === "1"),
    "printAllPages must strip the on-screen zoom for the printout",
  ).toBe(true);

  // The on-screen view is restored to a single page after printing.
  await expect(page.locator(MOUNTED_PAGE)).toHaveCount(1);
  const afterPrint = await pageReadout(page);
  expect(afterPrint.total).toBe(totalPages);
  expect(afterPrint.index).toBe(1);

  // 4. clean console --------------------------------------------------------
  expect(consoleErrors, `print preview produced console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
});
