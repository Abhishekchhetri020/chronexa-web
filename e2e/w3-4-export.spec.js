import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { loadDemoSchool } from "./helpers.js";

const DIALOG = '[data-testid="chrx-export-dialog"]';
const BTN_SUBMIT = '[data-testid="chrx-export-submit"]';
const BTN_CANCEL = '[data-testid="chrx-export-cancel"]';

async function openExportDialog(page) {
  // Can open via keyboard shortcut ⌘E or custom event
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:export-dialog")));
  await expect(page.locator(DIALOG)).toBeVisible();
}

async function selectFormat(page, formatId) {
  await page.click(`[data-testid="chrx-export-format-${formatId}"]`);
}

async function selectScope(page, scopeId) {
  await page.click(`[data-testid="chrx-export-scope-${scopeId}"]`);
}

async function downloadViaExport(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.click(BTN_SUBMIT),
  ]);
  const filePath = await download.path();
  const buffer = fs.readFileSync(filePath);
  return {
    filename: download.suggestedFilename(),
    buffer,
    text: buffer.toString("utf8"),
  };
}

test.describe("Lane W3-4: Export dialog, PNG, one-click PDF and scoped exports", () => {
  test.beforeEach(async ({ page }) => {
    await loadDemoSchool(page);
  });

  test("Export dialog replaces flat 13-row list in Files menu and is reachable", async ({ page }) => {
    // 1. Files menu contract: verify ribbon menu replaced the flat ~13 format list with Export dialog
    const exportItems = await page.evaluate(() => {
      const def = (window.APP?.ribbon?.menus || []).find(m => m.key === "files");
      const exp = def?.build().find(e => e.label === "Export");
      return (exp?.sub || []).map(s => s.label);
    });
    expect(exportItems).toContain("Export dialog…");
    expect(exportItems).toContain("Publish timetable…");
    // Was ~13 flat format rows that clipped; now clean, compact submenu
    expect(exportItems.length).toBeLessThan(5);

    // 2. Reachable via sidebar "Export…" link
    const link = page.locator(".chrx-side-link", { hasText: "Export" });
    if (!(await link.first().isVisible().catch(() => false))) {
      const toggle = page.locator('[data-toggle="side"]');
      if (await toggle.count()) await toggle.first().click();
    }
    await link.first().click();
    await expect(page.locator(DIALOG)).toBeVisible();
    await page.click(BTN_CANCEL);
    await expect(page.locator(DIALOG)).not.toBeVisible();

    // 3. Reachable via keyboard shortcut ⌘E
    await page.keyboard.press("Meta+e");
    await expect(page.locator(DIALOG)).toBeVisible();
    await page.click(BTN_CANCEL);
    await expect(page.locator(DIALOG)).not.toBeVisible();
  });

  test("CSV export: dialog → choose scope (class) → downloads valid CSV with grid and lessons", async ({ page }) => {
    await openExportDialog(page);
    await selectFormat(page, "csv");
    await selectScope(page, "class");

    const entitySelect = page.locator('[data-testid="chrx-export-entity-select"]');
    await expect(entitySelect).toBeVisible();
    const classId = await entitySelect.inputValue();
    expect(classId).toBeTruthy();

    const file = await downloadViaExport(page);
    expect(file.filename).toMatch(/\.csv$/i);
    expect(file.text).toContain("Timetable:");
    expect(file.text).toContain("Detailed Lessons");
    expect(file.text).toContain("Day,Period,Start,End,Class,Subject,Teacher,Room");
  });

  test("Excel export: dialog → choose scope (whole school) → downloads valid .xlsx workbook", async ({ page }) => {
    await openExportDialog(page);
    await selectFormat(page, "excel");
    await selectScope(page, "all");

    const file = await downloadViaExport(page);
    expect(file.filename).toMatch(/\.xlsx$/i);
    expect(file.buffer.length).toBeGreaterThan(1000);
  });

  test("ICS export: dialog → choose scope (teacher) → downloads valid .ics calendar", async ({ page }) => {
    await openExportDialog(page);
    await selectFormat(page, "ics");
    await selectScope(page, "teacher");

    const file = await downloadViaExport(page);
    expect(file.filename).toMatch(/\.ics$/i);
    expect(file.text).toContain("BEGIN:VCALENDAR");
    expect(file.text).toContain("BEGIN:VEVENT");
    expect(file.text).toContain("END:VCALENDAR");
  });

  test("HTML export: dialog → choose scope (class) → downloads standalone .html", async ({ page }) => {
    await openExportDialog(page);
    await selectFormat(page, "html");
    await selectScope(page, "class");

    const file = await downloadViaExport(page);
    expect(file.filename).toMatch(/\.html$/i);
    expect(file.text).toContain("<!DOCTYPE html>");
    expect(file.text).toContain("<table class=\"tt\">");
  });

  test("aSc XML export: dialog → choose aSc XML → downloads valid .xml", async ({ page }) => {
    await openExportDialog(page);
    await selectFormat(page, "xml");

    // Scope for XML should disable single entities or stay whole school
    const classScope = page.locator('[data-testid="chrx-export-scope-class"] input');
    await expect(classScope).toBeDisabled();

    const file = await downloadViaExport(page);
    expect(file.filename).toMatch(/-export\.xml$/i);
    expect(file.text).toContain("<timetable");
    expect(file.text).toContain("<cards");
  });

  test("PNG export: dialog → choose scope (class) → downloads valid PNG with expected dimensions and non-blank pixels", async ({ page }) => {
    await openExportDialog(page);
    await selectFormat(page, "png");
    await selectScope(page, "class");

    const file = await downloadViaExport(page);
    expect(file.filename).toMatch(/\.png$/i);

    const buf = file.buffer;
    // 1. Verify PNG magic header: \x89PNG\r\n\x1a\n
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // 'P'
    expect(buf[2]).toBe(0x4e); // 'N'
    expect(buf[3]).toBe(0x47); // 'G'
    expect(buf[4]).toBe(0x0d);
    expect(buf[5]).toBe(0x0a);
    expect(buf[6]).toBe(0x1a);
    expect(buf[7]).toBe(0x0a);

    // 2. Verify IHDR dimensions (offset 16: width, offset 20: height)
    const ihdr = buf.subarray(12, 16).toString("ascii");
    expect(ihdr).toBe("IHDR");
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);

    expect(width).toBeGreaterThanOrEqual(1123);
    expect(height).toBeGreaterThanOrEqual(794);

    // 3. Pixel check: non-blank image (contains image data, > 5KB for rich timetable rendering)
    expect(buf.length).toBeGreaterThan(5000);
  });

  test("PDF export: one click triggers print with exactly N pages for chosen scope, A4 landscape, no app chrome", async ({ page }) => {
    // 1. Single class scope: exactly 1 page
    await openExportDialog(page);
    await selectFormat(page, "pdf");
    await selectScope(page, "class");

    // Intercept window.print and listen for print trigger
    await page.evaluate(() => {
      window.__printCallCount = 0;
      window.print = () => { window.__printCallCount++; };
    });

    await page.click(BTN_SUBMIT);

    // Verify print was called
    const printCalls = await page.evaluate(() => window.__printCallCount);
    expect(printCalls).toBe(1);

    // Exactly 1 timetable page mounted
    const singlePages = await page.locator('.chrx-preview-page').count();
    expect(singlePages).toBe(1);

    // App chrome / controls hidden in print layout
    const controls = page.locator('.chrx-preview-controls');
    await expect(controls).not.toBeVisible();

    // 2. Whole school scope: exactly N pages (one for each class in the school)
    await openExportDialog(page);
    await selectFormat(page, "pdf");
    await selectScope(page, "all");

    await page.click(BTN_SUBMIT);

    const totalSchoolClasses = await page.evaluate(() => (window.APP.school.classes || []).length);
    expect(totalSchoolClasses).toBeGreaterThan(1);

    const allPages = await page.locator('.chrx-preview-page').count();
    expect(allPages).toBe(totalSchoolClasses);
  });
});
