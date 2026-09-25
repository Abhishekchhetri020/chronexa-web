import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test.describe("Lane W3b-6: Remove 'Coming soon' stubs & wire dead affordances", () => {
  test.beforeEach(async ({ page }) => {
    await loadDemoSchool(page);
  });

  test("Every ribbon menu has zero 'Coming soon', 'not wired', or .soon items", async ({ page }) => {
    const menuKeys = ["files", "spec", "options", "timetable", "view", "ai", "help"];

    for (const key of menuKeys) {
      await page.evaluate((k) => window.APP.ribbon.openMenu(k), key);
      const panel = page.locator(".chrx-menu-panel");
      await expect(panel).toBeVisible();

      const panelText = (await panel.textContent()) || "";
      expect(panelText.toLowerCase()).not.toContain("coming soon");
      expect(panelText.toLowerCase()).not.toContain("not wired");

      // Verify no items with .chrx-menu-item--soon class exist
      const soonItems = panel.locator(".chrx-menu-item--soon");
      expect(await soonItems.count()).toBe(0);

      // Close menu
      await page.keyboard.press("Escape");
      await expect(panel).not.toBeVisible();
    }
  });

  test("Options menu wires School settings and Print defaults, removes dead stubs", async ({ page }) => {
    await page.evaluate(() => window.APP.ribbon.openMenu("options"));
    const panel = page.locator(".chrx-menu-panel");
    await expect(panel).toBeVisible();

    const itemsText = (await panel.textContent()) || "";
    // Removed stubs
    expect(itemsText).not.toContain("Preferences (account)");
    expect(itemsText).not.toContain("Display settings");

    // Wired items
    expect(itemsText).toContain("School settings…");
    expect(itemsText).toContain("Print defaults…");
    expect(itemsText).toContain("Constraints library…");

    // Click Print defaults… and verify Print Settings dialog opens
    const printDefaultsBtn = panel.locator(".chrx-menu-item", { hasText: "Print defaults…" });
    await printDefaultsBtn.click();

    // Verify Print Settings sheet or dialog opened
    const printSheet = page.locator(".chrx-ent-sheet, .chrx-ent-standalone");
    await expect(printSheet.first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Lessons specification Change dialog has no dead 'Group' option or 'coming soon' stubs", async ({ page }) => {
    // Open Lessons dialog
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind: "lessons" } })));
    const lessonsDialog = page.locator(".chrx-ent-dialog");
    await expect(lessonsDialog).toBeVisible();

    // Select first lesson row in table
    const firstRow = lessonsDialog.locator(".chrx-ent-tr").first();
    await firstRow.click();

    // Click Change button in sidebar
    const changeBtn = lessonsDialog.locator('.chrx-ent-btn[data-act="change"]');
    await changeBtn.click();

    // Verify Change sub-sheet is visible
    const subSheet = page.locator(".chrx-ent-subsheet-scrim, .chrx-ent-sheet");
    await expect(subSheet.first()).toBeVisible();

    const subSheetText = (await subSheet.first().textContent()) || "";
    expect(subSheetText).not.toContain("Group");
    expect(subSheetText.toLowerCase()).not.toContain("coming soon");
    expect(subSheetText.toLowerCase()).not.toContain("not wired");

    // Ensure working bulk fields are listed
    expect(subSheetText).toContain("Available classrooms");
    expect(subSheetText).toContain("Subject");
    expect(subSheetText).toContain("Teachers");
    expect(subSheetText).toContain("Count");

    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });

  test("Row context menu has zero stubs, Time off and Test actions work", async ({ page }) => {
    // Switch to Overview if in Focus Board so full rows are visible
    const overviewBtn = page.locator('[data-focus-nav="overview"]');
    if (await overviewBtn.isVisible()) {
      await overviewBtn.click();
    }

    const firstRowLabel = page.locator(".chrx-row:not(.chrx-row-head) .chrx-rowlabel").first();
    await expect(firstRowLabel).toBeVisible();

    // Right click row label to open row context menu
    await firstRowLabel.click({ button: "right" });
    const ctxMenu = page.locator("#chrx-row-ctx");
    await expect(ctxMenu).toBeVisible();

    const menuText = (await ctxMenu.textContent()) || "";
    expect(menuText.toLowerCase()).not.toContain("coming soon");
    expect(menuText.toLowerCase()).not.toContain("not wired");

    // Click "Time off"
    const timeOffBtn = ctxMenu.locator("button", { hasText: "Time off" });
    await timeOffBtn.click();

    // Verify Time off matrix dialog / sheet opened
    const timeOffDialog = page.locator(".chrx-timeoff-body, .chrx-ent-tomatrix");
    await expect(timeOffDialog.first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.locator(".chrx-ent-dialog")).not.toBeVisible();

    // Right click row label again to test "Test" action
    await firstRowLabel.click({ button: "right" });
    await expect(ctxMenu).toBeVisible();

    const testBtn = ctxMenu.locator("button", { hasText: "Test" });
    await testBtn.click();

    // Verify Solver Test confirm dialog opened
    const testDialog = page.locator(".csu-confirm, #csu-test-go");
    await expect(testDialog.first()).toBeVisible();
  });
});
