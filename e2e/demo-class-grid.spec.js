import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

// "Class grid" = the editor workspace's By-Class perspective (one row per
// class). The legacy step-3 grid panel still exists in the DOM but the
// shell-v3 workspace hides the old step nav, so it is not user-reachable.
test("load demo school → the by-class timetable grid renders", async ({ page }) => {
  await loadDemoSchool(page);

  // In Focus Board (default view), the active class schedule renders (~42 cards).
  const focusCards = page.locator("#editor-root .chrx-vkarta");
  expect(await focusCards.count()).toBeGreaterThanOrEqual(30);

  // Switch to Overview to verify the full school (>900 cards).
  const overviewBtn = page.locator('[data-focus-nav="overview"]');
  if (await overviewBtn.isVisible()) {
    await overviewBtn.click();
  }
  const cards = page.locator("#editor-root .chrx-vkarta");
  expect(await cards.count()).toBeGreaterThan(900);

  // The grid is in By-Class perspective with per-class rows.
  await expect(page.locator("#editor-perspective")).toHaveText(/by class/i);
  await expect(page.locator("#editor-unplaced-count")).toHaveText(/all placed/i);

  // Day/period headers exist (6 days × 8 teaching periods).
  expect(await page.locator("#editor-root .chrx-h-day").count()).toBeGreaterThanOrEqual(5);
  expect(await page.locator("#editor-root .chrx-h-period").count()).toBeGreaterThan(30);
});
