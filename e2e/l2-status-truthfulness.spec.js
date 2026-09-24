import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

// Lane L2 — status truthfulness on the stock demo (102 hard violations, all placed).
// B1: chip must read "All placed · N conflicts" (warning style) and open Verification.
// B9: Suggest-fix shows an explicit Apply proposal + hint; applying re-runs verification.
// B17: footer buttons stay inside the dialog; the toast hides while the modal is open.

test("B1: chip reports conflicts on the stock demo and opens Verification", async ({ page }) => {
  await loadDemoSchool(page);
  const chip = page.locator("#editor-unplaced-count");

  // The hard-conflict recount is debounced (300ms) over ~950 cards — allow time.
  await expect(chip).toContainText(/conflict/i, { timeout: 30_000 });
  await expect(chip).toHaveText(/all placed/i);
  await expect(chip).toHaveClass(/is-conflict/);
  await expect(chip).toHaveAttribute("role", "button");

  await chip.click();
  const panel = page.locator(".chrx-vpro-panel");
  await expect(panel).toBeVisible({ timeout: 10_000 });
  const summary = page.locator(".chrx-vpro-summary");
  await expect(summary).toContainText(/hard/);

  // Chip count and Verification header hard count agree.
  const chipHard = Number((await chip.innerText()).match(/(\d+)\s+conflict/)?.[1]);
  const headHard = Number((await summary.innerText()).match(/(\d+)\s+hard/)?.[1]);
  expect(chipHard).toBeGreaterThan(0);
  expect(headHard).toBe(chipHard);

  await page.locator(".chrx-vpro-close").click();
  await expect(panel).toBeHidden();
});

test("B9+B17: explicit apply proposal, recount, unclipped footer, hidden toast", async ({ page }) => {
  await loadDemoSchool(page);
  await page.locator("#editor-unplaced-count").click();
  const panel = page.locator(".chrx-vpro-panel");
  await expect(panel).toBeVisible({ timeout: 10_000 });

  const hardOf = async () =>
    Number((await page.locator(".chrx-vpro-summary").innerText()).match(/(\d+)\s+hard/)?.[1]);
  const before = await hardOf();
  expect(before).toBeGreaterThan(0);

  // Walk rows until one yields an explicit Apply proposal (some shared-event
  // rows legitimately report "No feasible slot" — also an explicit state).
  const rows = panel.locator(".chrx-vpro-row");
  const n = await rows.count();
  let applied = false;
  for (let i = 0; i < Math.min(n, 60); i++) {
    const row = rows.nth(i);
    const btn = row.locator(".chrx-vpro-fix");
    if (!(await btn.isVisible())) continue;
    await btn.click();
    const txt = await btn.innerText();
    if (/^Apply: move to D\d+P\d+$/.test(txt)) {
      await expect(row.locator(".chrx-vpro-hint")).toBeVisible();
      await expect(row.locator(".chrx-vpro-hint")).toContainText(/click.*again/i);
      await btn.click();
      applied = true;
      break;
    }
    expect(txt).toMatch(/Apply: move to|No feasible slot/);
  }
  expect(applied).toBe(true);

  // Applying re-ran verification: the header hard count dropped.
  await expect
    .poll(async () => hardOf(), { timeout: 15_000 })
    .toBeLessThan(before);

  // B17: footer buttons are fully inside the dialog (not clipped at its edge).
  const panelBox = await panel.boundingBox();
  for (const sel of [".chrx-vpro-autofix", ".chrx-vpro-rescan"]) {
    const b = await panel.locator(sel).boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(panelBox.x - 1);
    expect(b.x + b.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
    expect(b.y).toBeGreaterThanOrEqual(panelBox.y - 1);
    expect(b.y + b.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
  }

  // B17: the bottom-right toast hides while the modal is open.
  await page.evaluate(() => window.PWA && window.PWA.showBanner());
  const toast = page.locator("#chrx-pwa-banner");
  await expect(toast).toBeHidden({ timeout: 5000 });
});
