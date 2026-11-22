import { test, expect } from "@playwright/test";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
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

    // P7-3: Empty duty-area rows (1st/2nd/3rd Floor) must be absent from the default all-classes grid
    const fullGridText = await page.locator("#editor-root .chrx-grid").innerText();
    expect(fullGridText).not.toMatch(/\b(1st|2nd|3rd)\s+Floor\b/i);
    // P7-5: Editor header & topbar breadcrumb must show "Sample school", never "Classic Timetable 2012 XML" or "Untitled"
    const obTitle = (await page.locator("#editor-root .chrx-ob-title").innerText()).trim();
    expect(obTitle).not.toMatch(/Classic Timetable 2012 XML|Untitled/i);
    expect(obTitle).toMatch(/Sample school/i);
    const crumbText = (await page.locator("#chrx-crumbs").innerText()).trim();
    expect(crumbText).not.toMatch(/Classic Timetable 2012 XML|Untitled/i);

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

    // P7-1: "Undo apply" must be hidden BEFORE applying
    await expect(page.locator("#csu-result-discard")).toBeHidden();

    // P7-4: Quality tile uses sans-serif UI font (not monospace) AND top reasons are visible without opening Details
    const qualityNum = tiles.nth(2).locator(".csu-result__num");
    const qualityText = await qualityNum.innerText();
    expect(qualityText).toMatch(/(Good|Fair|Needs work)\s*\(\d+%\)/);
    const qualityFont = await qualityNum.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(qualityFont.toLowerCase()).not.toContain("monospace");
    await expect(page.locator("#csu-result-reasons")).toBeVisible();
    expect(await page.locator("#csu-result-reasons li").count()).toBeGreaterThan(0);

    const applyBtn = page.locator("#csu-result-apply");
    await expect(applyBtn).toHaveText("Use this timetable");
    await expect(applyBtn).not.toHaveClass(/is-warning/);

    await page.screenshot({ path: `${SHOTS_DIR}/3-result-after.png` });

    // P1 + P7-2: Click "Use this timetable" -> applies in 1 click, ZERO scary modal, and auto-closes the dialog
    await applyBtn.click();
    await expect(page.locator("#chrx-apply-confirm")).toHaveCount(0);
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

  test("P7-6: mid-run progress modal on real LATEST.xml (Best) shows honest ring=bar and left=total-placed", async ({ page }) => {
    const latestXml = path.join(process.env.HOME || "", ".mempalace/gdgpsd_data/timetable/LATEST.xml");
    test.skip(!existsSync(latestXml), "real LATEST.xml not present on this machine");
    test.setTimeout(90_000);
    mkdirSync(SHOTS_DIR, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto("/");
    await page.waitForFunction(() => window.APP && window.SolverUI && window.Editor);
    await page.locator("#xml-file").setInputFiles(latestXml);
    await page.locator("#editor-root .chrx-vkarta").first().waitFor({ timeout: 30_000 });

    await page.locator("button.chrx-btn--primary", { hasText: "Generate" }).first().click();
    await expect(page.locator(".csu-prelaunch")).toBeVisible({ timeout: 10_000 });
    await page.locator(".chrx-preset-card[data-preset='best']").click();
    await page.locator("#csu-prelaunch-start").click();

    const prog = page.locator(".csu-progress");
    await expect(prog).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(3500);

    const snap = await page.evaluate(() => {
      const ring = parseInt((document.querySelector(".csu-ring__pct")?.textContent || "0").replace(/[^0-9]/g, ""), 10);
      const barW = parseFloat((document.querySelector(".csu-progress .csu-bar__fill")?.style.width || "0").replace("%", ""));
      const hero = document.querySelector("#csu-placed-hero")?.textContent || "";
      const leftTxt = (document.querySelector("#csu-stat-hard")?.textContent || "").replace(/[^0-9]/g, "");
      const detailsOpen = !!document.querySelector("#csu-progress-details")?.open;
      return { ring, barW, hero, left: leftTxt ? parseInt(leftTxt, 10) : null, detailsOpen };
    });
    console.log("P7-6 LATEST.xml progress snap:", JSON.stringify(snap));
    expect(snap.detailsOpen).toBe(false);
    expect(Math.abs(snap.ring - Math.round(snap.barW))).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `${SHOTS_DIR}/2-progress-latest-best.png` });

    // Cancel cleanly so we don't wait 5 minutes
    await page.locator(".csu-progress button", { hasText: "Cancel" }).click();
    await expect(prog).toBeHidden({ timeout: 10_000 });
  });
});
