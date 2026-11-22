import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { loadDemoSchool } from "./helpers.js";

const SHOTS_DIR = "docs/neon/ui-shots/block-p";

test.describe("Block P — Generate flow & grid clarity", () => {
  test("P1-P6: Generate dialog, honest progress, clean result, 0 lost cards on keep, chip=result truth, clean class grid", async ({ page }) => {
    test.setTimeout(120_000);
    mkdirSync(SHOTS_DIR, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await loadDemoSchool(page, { view: "overview" });

    // P6: Legacy step-tab strip hidden, empty duty-area rows ("1st Floor" etc.) absent from class grid
    const legacyNavVisible = await page.locator(".chrx-shell .chrx-main > nav:has(button.step-btn)").isVisible().catch(() => false);
    expect(legacyNavVisible).toBe(false);

    const gridRowTexts = await page.locator("#editor-root .chrx-row-head").allInnerTexts();
    expect(gridRowTexts.some((t) => /\b1st Floor\b/i.test(t))).toBe(false);
    expect(gridRowTexts.some((t) => /\b2nd Floor\b/i.test(t))).toBe(false);
    expect(gridRowTexts.some((t) => /\b3rd Floor\b/i.test(t))).toBe(false);

    // P3: Open Generate dialog
    await page.locator("button.chrx-btn--primary", { hasText: "Generate" }).first().click();
    const dlg = page.locator(".csu-prelaunch");
    await expect(dlg).toBeVisible({ timeout: 10_000 });

    // No placeholder "Classic Timetable 2012 XML"
    const summaryText = await page.locator("#csu-prelaunch-summary").innerText();
    expect(summaryText).not.toMatch(/Classic Timetable 2012 XML/i);

    // Recommended badge matches the preselected speed card
    const selectedPreset = await page.locator(".chrx-preset-card.is-selected").getAttribute("data-preset");
    const recPreset = await page.locator(".chrx-preset-card.chrx-preset-card--recommended").getAttribute("data-preset");
    expect(selectedPreset).toBeTruthy();
    expect(recPreset).toBe(selectedPreset);

    // More options collapsed by default
    expect(await page.locator("#csu-advanced").evaluate((el) => el.open)).toBe(false);
    await expect(page.locator("#csu-prelaunch-start")).toHaveText("Build timetable");

    await page.screenshot({ path: `${SHOTS_DIR}/1-generate-dialog-after.png` });

    // Pick Quick (~30s) and start
    await page.locator(".chrx-preset-card[data-preset='fast']").click();
    await page.locator("#csu-prelaunch-start").click();

    // P4: Progress modal — verify honest ring vs bar + placed vs left + details collapsed
    const prog = page.locator(".csu-progress");
    await expect(prog).toBeVisible({ timeout: 10_000 });
    expect(await page.locator("#csu-progress-details").evaluate((el) => el.open)).toBe(false);

    // Capture progress modal right away and verify ring vs bar + placed vs left
    await page.screenshot({ path: `${SHOTS_DIR}/2-progress-after.png` });
    await page.waitForTimeout(400);
    if (await prog.isVisible().catch(() => false)) {
      const snap = await page.evaluate(() => {
        const ring = parseInt((document.querySelector(".csu-ring__pct")?.textContent || "0").replace(/[^0-9]/g, ""), 10);
        const barW = parseFloat((document.querySelector(".csu-progress .csu-bar__fill")?.style.width || "0").replace("%", ""));
        const hero = document.querySelector("#csu-placed-hero")?.textContent || "";
        const leftTxt = (document.querySelector("#csu-stat-hard")?.textContent || "").replace(/[^0-9]/g, "");
        return { ring, barW, hero, left: leftTxt ? parseInt(leftTxt, 10) : null };
      });
      // Ring and Progress bar must agree (within 2 percentage points)
      expect(Math.abs(snap.ring - Math.round(snap.barW))).toBeLessThanOrEqual(2);
      // If hero shows "X of Y", left must equal Y - X
      const m = snap.hero.match(/([\d,]+)\s+of\s+([\d,]+)/);
      if (m && snap.left != null) {
        const placed = parseInt(m[1].replace(/,/g, ""), 10);
        const total = parseInt(m[2].replace(/,/g, ""), 10);
        expect(snap.left).toBe(Math.max(0, total - placed));
      }
      await page.screenshot({ path: `${SHOTS_DIR}/2-progress-after.png` });
    }

    // P5: Wait for Result panel
    const res = page.locator(".csu-result");
    await expect(res).toBeVisible({ timeout: 100_000 });

    const statusLine = await page.locator("#csu-result-status").innerText();
    expect(statusLine).not.toMatch(/FEASIBLE|OPTIMAL/i);
    expect(statusLine).toMatch(/Finished/i);

    // Exactly 3 tiles: Placed, Clashes, Quality
    const tiles = page.locator(".csu-result .csu-result__tile");
    expect(await tiles.count()).toBe(3);

    const clashNumText = await tiles.nth(1).locator(".csu-result__num").innerText();
    const resultClashes = parseInt(clashNumText.replace(/[^0-9]/g, ""), 10);

    const qualityText = await tiles.nth(2).locator(".csu-result__num").innerText();
    expect(qualityText).toMatch(/(Good|Fair|Needs work)\s*\(\d+%\)/);

    const applyBtn = page.locator("#csu-result-apply");
    await expect(applyBtn).toHaveText("Use this timetable");
    await expect(applyBtn).not.toHaveClass(/is-warning/);

    await page.screenshot({ path: `${SHOTS_DIR}/3-result-after.png` });

    // P1: Click "Use this timetable" -> MUST apply in 1 click with ZERO scary "will lose 5 cards" modal
    await applyBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator("#chrx-apply-confirm")).toHaveCount(0);

    // Close result panel if still open, and verify P2 (topbar chip matches resultClashes!)
    if (await page.locator("#csu-result-close").isVisible().catch(() => false)) {
      await page.locator("#csu-result-close").click();
    }
    await expect(res).toBeHidden({ timeout: 5_000 });
    await page.waitForTimeout(400);

    const chipText = (await page.locator("#editor-unplaced-count").innerText()).trim();
    if (resultClashes === 0) {
      expect(chipText).toMatch(/^All placed$/i);
    } else {
      expect(chipText).toContain(String(resultClashes));
    }

    await page.screenshot({ path: `${SHOTS_DIR}/4-grid-after.png` });
    expect(pageErrors).toEqual([]);
  });
});
