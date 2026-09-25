import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test.describe("W3b-2 Generator Modes E2E", () => {
  test("pick each mode in the dialog, run briefly (cap time), ⌘Z restores", async ({ page }) => {
    test.setTimeout(180_000);
    await loadDemoSchool(page);

    const modes = [
      { id: "rebuild", label: "Rebuild" },
      { id: "improve_only", label: "Improve only" },
      { id: "add_unplaced", label: "Add unplaced only" },
    ];

    for (const m of modes) {
      // Record initial cards count and snapshot
      const initialCardsCount = await page.evaluate(() => {
        return window.APP && window.APP.school && Array.isArray(window.APP.school.cards)
          ? window.APP.school.cards.length
          : 0;
      });
      expect(initialCardsCount).toBeGreaterThan(0);

      // Open Generate prelaunch dialog from workspace Generate button
      await page.locator("button.chrx-btn--primary", { hasText: "Generate" }).first().click();
      const dialog = page.locator(".csu-prelaunch");
      await expect(dialog).toBeVisible();

      // Pick the mode in the dialog
      const modeCard = page.locator(`.chrx-genmode-card[data-gen-mode='${m.id}']`);
      await expect(modeCard).toBeVisible();
      await modeCard.click();
      await expect(modeCard).toHaveClass(/is-selected/);

      // Cap time to 2 seconds for a brief run
      await page.evaluate(() => {
        const dlg = document.querySelector(".csu-prelaunch");
        if (dlg) dlg.dataset.timeLimitSec = "2";
      });

      // Start generation
      await page.locator("#csu-prelaunch-start").click();

      // Wait for solver run to finish and result panel to appear
      const resultPanel = page.locator(".csu-result");
      await expect(resultPanel).toBeVisible({ timeout: 60_000 });

      // Apply result if not already auto-applied
      const applyBtn = page.locator("#csu-result-apply");
      if ((await applyBtn.isVisible()) && (await applyBtn.isEnabled())) {
        await applyBtn.click();
        const confirmBtn = page.locator("#chrx-apply-confirm [data-confirm]");
        if (await confirmBtn.isVisible()) await confirmBtn.click();
      }

      // Close the result panel
      const closeBtn = page.locator("#csu-result-close");
      await expect(closeBtn).toBeVisible();
      await closeBtn.click();
      await expect(page.locator(".csu-result")).not.toBeVisible();
      await expect(page.locator(".csu-backdrop.is-open")).toHaveCount(0);

      // Verify that APP.history has an undo entry
      const canUndo = await page.evaluate(() => window.APP && window.APP.history && window.APP.history.canUndo);
      expect(canUndo).toBe(true);

      // Press ⌘Z (ControlOrMeta+z) to restore the previous timetable
      await page.keyboard.press("ControlOrMeta+z");

      // Verify previous timetable restored
      const afterUndoCount = await page.evaluate(() => window.APP.school.cards.length);
      expect(afterUndoCount).toBe(initialCardsCount);
    }
  });
});
