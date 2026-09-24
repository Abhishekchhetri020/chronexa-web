import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test("mark a teacher absent for a date, assign a substitute, see it on the grid for that date only", async ({ page }) => {
  await loadDemoSchool(page);

  // Switch to Overview grid to see all classes and cells easily
  const overviewBtn = page.locator('[data-focus-nav="overview"]');
  if (await overviewBtn.isVisible()) {
    await overviewBtn.click();
  }

  // 1. Open substitution planner dialog
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:substitutions")));
  const dialog = page.locator(".chrx-sub-dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // 2. Pick a date: 2026-09-25 (Friday, day 4)
  const dateInput = page.locator(".chrx-sub-date");
  await dateInput.fill("2026-09-25");
  await dateInput.dispatchEvent("change");

  // 3. Search and select the first teacher in absent autocomplete
  const searchInput = page.locator(".chrx-sub-search");
  await searchInput.click();
  await searchInput.fill("");
  const firstTeacherOpt = page.locator(".chrx-sub-opt:not(.is-empty)").first();
  await expect(firstTeacherOpt).toBeVisible({ timeout: 5_000 });
  const teacherName = await firstTeacherOpt.locator(".chrx-sub-opt__nm").textContent();
  await firstTeacherOpt.click();

  // Verify chip was added
  await expect(page.locator(".chrx-sub-chip")).toHaveCount(1);

  // 4. Click Generate substitutions
  const generateBtn = page.locator(".chrx-sub-btn--primary");
  await expect(generateBtn).toBeEnabled();
  await generateBtn.click();

  // 5. Automatically navigates to Class-wise tab with substitutions table
  const subTable = page.locator(".chrx-sub-table");
  await expect(subTable).toBeVisible({ timeout: 10_000 });
  const rows = page.locator(".chrx-sub-tr");
  expect(await rows.count()).toBeGreaterThan(0);

  // 6. Close the dialog
  await page.locator(".chrx-sub-x").click();
  await expect(dialog).not.toBeVisible();

  // 7. Verify the editor date input is set to 2026-09-25
  const editorDateInput = page.locator("#editor-date-input");
  await expect(editorDateInput).toBeVisible();
  await editorDateInput.fill("2026-09-25");
  await editorDateInput.dispatchEvent("change");

  // 8. Grid shows substituted cards with struck-through original on 2026-09-25
  const substitutedCard = page.locator("#editor-root .chrx-vkarta--substituted").first();
  await expect(substitutedCard).toBeVisible({ timeout: 10_000 });
  const cardText = await substitutedCard.textContent();
  expect(cardText).toContain("➔");

  // 9. Change the date to another date (e.g. 2026-09-26) -> substitutions disappear!
  await editorDateInput.fill("2026-09-26");
  await editorDateInput.dispatchEvent("change");
  await expect(page.locator("#editor-root .chrx-vkarta--substituted")).toHaveCount(0);

  // 10. Switch back to 2026-09-25 -> substitutions appear again!
  await editorDateInput.fill("2026-09-25");
  await editorDateInput.dispatchEvent("change");
  await expect(page.locator("#editor-root .chrx-vkarta--substituted").first()).toBeVisible({ timeout: 10_000 });

  // 11. Clear date filter -> normal view with no substituted styling
  await page.locator("#editor-date-clear").click();
  await expect(page.locator("#editor-root .chrx-vkarta--substituted")).toHaveCount(0);
});
