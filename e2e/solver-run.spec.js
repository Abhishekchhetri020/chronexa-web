import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test("run the solver from the workspace Generate button → result panel shows placement", async ({ page }) => {
  await loadDemoSchool(page);

  // The shell workspace has its own Generate button (the header CTA with
  // id=cta-generate is hidden in editor mode).
  await page.locator("button.chrx-btn--primary", { hasText: "Generate" }).first().click();

  // Pre-launch dialog: "Best timetable" (JS draft → WASM CP-SAT polish) is
  // the default mode — assert that, pick the 30s "Fast preview" preset
  // (time/complexity only; mode is untouched), and start.
  await page.locator(".chrx-preset-card[data-preset='fast']").click();
  await page.locator("#csu-prelaunch-start").click();

  // The pipeline (JS draft → WASM CP-SAT polish) runs ~27s at the 30s
  // budget, then the result panel appears with the placed-count tile.
  const placedTile = page.locator(".csu-result__tile--ok .csu-result__num").first();
  await expect(placedTile).toBeVisible({ timeout: 100_000 });
  const placed = parseInt((((await placedTile.textContent()) || "").split("/")[0]).replace(/[^0-9]/g, ""), 10);
  expect(placed).toBeGreaterThan(900); // 946-card school; pipeline lands 944-946
});
