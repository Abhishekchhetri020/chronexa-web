import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

// "Class grid" = the editor workspace's By-Class perspective (one row per
// class). The legacy step-3 grid panel still exists in the DOM but the
// shell-v3 workspace hides the old step nav, so it is not user-reachable.
test("load demo school → the by-class timetable grid renders", async ({ page }) => {
  await loadDemoSchool(page);

  // Fully placed demo school: 946 cards on the grid.
  const cards = page.locator("#editor-root .chrx-vkarta");
  expect(await cards.count()).toBeGreaterThan(900);

  // The grid is in By-Class perspective with per-class rows.
  await expect(page.locator("#editor-perspective")).toHaveText(/by class/i);
  await expect(page.locator("#editor-unplaced-count")).toHaveText(/all placed/i);

  // Day/period headers exist (6 days × 8 teaching periods).
  expect(await page.locator("#editor-root .chrx-h-day").count()).toBeGreaterThanOrEqual(5);
  expect(await page.locator("#editor-root .chrx-h-period").count()).toBeGreaterThan(30);
});
