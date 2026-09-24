import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test.describe("Lane L4 Data Presentation E2E", () => {
  test("B8: booting application produces no [print templates] bad registration warning", async ({ page }) => {
    const badRegWarnings = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[print templates] bad registration")) {
        badRegWarnings.push(text);
      }
    });

    await loadDemoSchool(page);
    expect(badRegWarnings).toEqual([]);
  });

  test("B13: lessons master table displays resolved human names instead of raw hex IDs", async ({ page }) => {
    await loadDemoSchool(page);

    // Open Lessons dialog
    await page.evaluate(() => {
      window.EntityLessons.open();
    });

    const dialog = page.locator(".chrx-ent-dialog");
    await expect(dialog).toBeVisible();

    // Check table headers (case-insensitive due to CSS uppercase)
    const rawHeaders = await dialog.locator("th").allInnerTexts();
    const headers = rawHeaders.map(h => h.replace(/\s*[▲▼]/g, "").trim().toUpperCase());
    expect(headers).toContain("TERM");
    expect(headers).toContain("WEEK");
    expect(headers).toContain("DAYS");

    // Check first 10 rows for Term, Week, Days
    const rows = dialog.locator("tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    const termIdx = headers.indexOf("TERM");
    const weekIdx = headers.indexOf("WEEK");
    const daysIdx = headers.indexOf("DAYS");

    for (let i = 0; i < Math.min(rowCount, 10); i++) {
      const cells = rows.nth(i).locator("td");
      const termText = (await cells.nth(termIdx).innerText()).trim();
      const weekText = (await cells.nth(weekIdx).innerText()).trim();
      const daysText = (await cells.nth(daysIdx).innerText()).trim();

      expect(termText).not.toMatch(/^[0-9A-Fa-f]{16}$/);
      expect(weekText).not.toMatch(/^[0-9A-Fa-f]{16}$/);
      expect(daysText).not.toMatch(/^[0-9A-Fa-f]{16}$/);

      expect(termText).toBe("All");
      expect(weekText).toBe("All");
      expect(daysText).toBe("All");
    }
  });

  test("B14: inputted constraints dialog omits default calendar definitions and shows real constraints", async ({ page }) => {
    await loadDemoSchool(page);

    // Open inputted constraints dialog
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("app:list-constraints"));
    });

    const panel = page.locator(".chrx-cst-panel");
    await expect(panel).toBeVisible();

    // Summary count should show 89 (not 851)
    const countEl = panel.locator(".chrx-cst-count");
    await expect(countEl).toHaveText(/89 of 89/);

    // Verify no row contains raw week definition hex
    const listText = await panel.locator(".chrx-cst-list").innerText();
    expect(listText).not.toContain("Week definition: 3CF8AC1951FD43B8");
    expect(listText).not.toContain("Term definition: 7F8912974819318E");
  });

  test("B18: pickers in entity dialogs do not show duplicated parentheticals", async ({ page }) => {
    await loadDemoSchool(page);

    // Open Classes dialog
    await page.evaluate(() => {
      window.EntityClasses.open();
    });

    const dialog = page.locator(".chrx-ent-dialog");
    await expect(dialog).toBeVisible();

    // Select first class row so Edit button is enabled
    await dialog.locator("tbody tr").first().click();

    // Click Edit button
    const editBtn = dialog.locator('button:has-text("Edit"), [data-act="edit"]').first();
    await expect(editBtn).toBeEnabled();
    await editBtn.click();

    // In the edit sheet, check teacher list labels
    const sheet = page.locator(".chrx-ent-sheet");
    await expect(sheet).toBeVisible();

    const teacherLabels = await sheet.locator("label span").allInnerTexts();
    for (const label of teacherLabels) {
      // Must not have "X (X)" where inner matches outer case-insensitively
      const match = label.match(/^(.+?)\s*\((.+?)\)$/);
      if (match) {
        expect(match[1].trim().toLowerCase()).not.toBe(match[2].trim().toLowerCase());
      }
    }
  });

  test("Count column: classes and classrooms tables show lesson count", async ({ page }) => {
    await loadDemoSchool(page);

    // Open Classes dialog
    await page.evaluate(() => {
      window.EntityClasses.open();
    });

    let dialog = page.locator(".chrx-ent-dialog");
    await expect(dialog).toBeVisible();

    let rawHeaders = await dialog.locator("th").allInnerTexts();
    let headers = rawHeaders.map(h => h.replace(/\s*[▲▼]/g, "").trim().toUpperCase());
    expect(headers).toContain("COUNT");

    const countIdx = headers.indexOf("COUNT");
    const countTexts = await dialog.locator(`tbody tr td:nth-child(${countIdx + 1})`).allInnerTexts();
    const numbers = countTexts.map(t => Number(t.trim())).filter(n => !isNaN(n));
    expect(numbers.some(n => n > 0)).toBe(true);

    // Find row for "I A" specifically and verify count > 0
    const iaRow = dialog.locator("tbody tr", { hasText: "I A" });
    if (await iaRow.count() > 0) {
      const iaCount = Number((await iaRow.first().locator("td").nth(countIdx).innerText()).trim());
      expect(iaCount).toBeGreaterThan(0);
    }

    // Close Classes dialog
    await page.evaluate(() => {
      window.EntityDialog.close();
    });

    // Open Classrooms dialog
    await page.evaluate(() => {
      window.EntityClassrooms.open();
    });

    dialog = page.locator(".chrx-ent-dialog");
    await expect(dialog).toBeVisible();

    rawHeaders = await dialog.locator("th").allInnerTexts();
    headers = rawHeaders.map(h => h.replace(/\s*[▲▼]/g, "").trim().toUpperCase());
    expect(headers).toContain("COUNT");

    const roomCountIdx = headers.indexOf("COUNT");
    const roomCountTexts = await dialog.locator(`tbody tr td:nth-child(${roomCountIdx + 1})`).allInnerTexts();
    const roomNumbers = roomCountTexts.map(t => Number(t.trim())).filter(n => !isNaN(n));
    expect(roomNumbers.some(n => n > 0)).toBe(true);
  });
});
