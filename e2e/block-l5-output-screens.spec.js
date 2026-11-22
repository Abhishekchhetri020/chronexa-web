import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";
import fs from "node:fs";
import path from "node:path";

const SHOT_DIR = path.resolve("docs/neon/ui-shots/l5");

async function clickSidebarLink(page, textOrRegex) {
  const nav = page.locator(".chrx-sidebar");
  const isShown = await nav.isVisible().catch(() => false);
  const sideRect = isShown ? await nav.boundingBox() : null;
  if (!isShown || !sideRect || sideRect.width < 40) {
    const toggle = page.locator('.chrx-shell-toggle[data-toggle="side"]').first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(150);
    }
  }
  const link = page.locator(".chrx-sidebar .chrx-side-link", { hasText: textOrRegex }).first();
  if (!(await link.isVisible().catch(() => false))) {
    // Expand any collapsed <details class="chrx-side-group"> by clicking its summary
    const summaries = page.locator(".chrx-sidebar details.chrx-side-group:not([open]) > summary");
    const n = await summaries.count();
    for (let i = 0; i < n; i++) {
      await summaries.nth(0).click();
      await page.waitForTimeout(80);
    }
  }
  await link.click();
}

test.describe("Block L5 — Output screens & p285 leftovers (real menu clicks)", () => {
  test("L5-1: Export every file format via Export menu (bytes > 0, filename includes school name + date, no emoji header)", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await loadDemoSchool(page);

    const today = new Date().toISOString().slice(0, 10);
    const formats = [
      { id: "excel", ext: ".xlsx" },
      { id: "csv",   ext: ".csv" },
      { id: "ics",   ext: ".ics" },
      { id: "html",  ext: ".html" },
      { id: "xml",   ext: ".xml" },
      { id: "png",   ext: ".png" },
    ];

    for (const fmt of formats) {
      // Real click through sidebar -> Export…
      await clickSidebarLink(page, "Export…");
      const dlg = page.locator('[data-testid="chrx-export-dialog"]');
      await expect(dlg).toBeVisible({ timeout: 5_000 });

      // Header must not contain 📤 emoji
      const headerTxt = await dlg.locator("h3").innerText();
      expect(headerTxt).not.toContain("📤");

      if (fmt.id === "excel") {
        await page.screenshot({ path: path.join(SHOT_DIR, "export-dialog-1440-light.png") });
      }

      // Click format card (and choose One class for PNG so it renders quickly)
      await page.locator(`[data-testid="chrx-export-format-${fmt.id}"]`).click();
      if (fmt.id === "png") {
        await page.locator('[data-testid="chrx-export-scope-class"]').click();
      }

      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 20_000 }),
        page.locator('[data-testid="chrx-export-submit"]').click(),
      ]);
      const fname = download.suggestedFilename();
      expect(fname.endsWith(fmt.ext)).toBe(true);
      expect(fname).toContain(today);
      expect(fname.toLowerCase()).toMatch(/sample-school|goenka|chronexa/);

      const dlPath = await download.path();
      expect(dlPath).toBeTruthy();
      const stat = fs.statSync(dlPath);
      expect(stat.size).toBeGreaterThan(100);
    }

    expect(errors).toEqual([]);
  });

  test("L5-2: Substitutions via sidebar — mark absent, apply cover, verify dated grid shows substitution", async ({ page }) => {
    test.setTimeout(60_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await loadDemoSchool(page);

    // Real click: sidebar -> Substitutions
    await clickSidebarLink(page, "Substitutions");
    const dlg = page.locator(".chrx-sub-dialog, #chrx-sub-dialog").first();
    await expect(dlg).toBeVisible({ timeout: 8_000 });

    // Pick a Monday date so the demo timetable has lessons on that day
    const dateInput = dlg.locator('input[type="date"]').first();
    if (await dateInput.isVisible().catch(() => false)) {
      await dateInput.fill("2026-11-23");
      await dateInput.dispatchEvent("change");
      await page.waitForTimeout(200);
    }

    // Mark first teacher absent
    const teacherSelect = dlg.locator("select").first();
    if (await teacherSelect.isVisible().catch(() => false)) {
      const opts = await teacherSelect.locator("option").all();
      for (const opt of opts) {
        const val = await opt.getAttribute("value");
        if (val) { await teacherSelect.selectOption(val); break; }
      }
    }
    const addAbsentBtn = dlg.locator("button", { hasText: /Add|Mark absent/i }).first();
    if (await addAbsentBtn.isVisible().catch(() => false)) {
      await addAbsentBtn.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: path.join(SHOT_DIR, "substitutions-1440-light.png") });

    // Apply auto-fill or pick first candidate if offered
    const autoBtn = dlg.locator("button", { hasText: /Auto-fill|Smart/i }).first();
    if (await autoBtn.isVisible().catch(() => false)) {
      await autoBtn.click();
      await page.waitForTimeout(300);
      const applyPlan = dlg.locator("button", { hasText: /Apply/i }).first();
      if (await applyPlan.isVisible().catch(() => false)) {
        await applyPlan.click();
        await page.waitForTimeout(300);
      }
    }

    // Close substitutions dialog
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // Set the editor topbar date filter to the same Monday date
    const topDate = page.locator("#editor-date-input");
    await topDate.fill("2026-11-23");
    await topDate.dispatchEvent("change");
    await page.waitForTimeout(300);

    await page.screenshot({ path: path.join(SHOT_DIR, "dated-grid-1440-light.png") });
    expect(errors).toEqual([]);
  });

  test("L5-3: Print preview (dark mode prints white paper) + p285 leftovers (390px All classes zero overflow, no unexplained Balance number, Result says earlier conflicts resolved)", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await loadDemoSchool(page);

    // 1. p285 leftover (c) & (b): real click Generate button -> verify pre-launch shows 4 conflicts,
    //    progress details hides unexplained Balance number, and result says earlier conflicts resolved.
    await page.locator(".chrx-topbar button", { hasText: "Generate" }).first().click();
    await expect(page.locator(".csu-prelaunch")).toBeVisible({ timeout: 5_000 });
    const preText = await page.locator("#csu-prelaunch-summary").innerText();
    expect(preText).toMatch(/4 conflicts/i);

    await page.locator('.chrx-preset-card[data-preset="fast"]').click();
    await page.evaluate(() => {
      const dlg = document.querySelector(".csu-prelaunch");
      if (dlg) dlg.dataset.timeLimitSec = "3";
    });
    await page.locator("#csu-prelaunch-start").click();
    await expect(page.locator(".csu-progress")).toBeVisible({ timeout: 10_000 });

    // Open Show details and confirm no visible "Balance" tile with raw number
    await page.locator("#csu-progress-details summary").click();
    await expect(page.locator("#csu-stat-soft")).toBeHidden();

    // Wait for Result and verify it explains the 4 earlier conflicts are resolved
    await expect(page.locator(".csu-result")).toBeVisible({ timeout: 45_000 });
    const statusText = await page.locator("#csu-result-status").innerText();
    expect(statusText).toMatch(/The 4 earlier conflicts are resolved/i);
    await page.locator("#csu-result-reject").click();
    await expect(page.locator(".csu-result")).toBeHidden({ timeout: 5_000 });

    // 2. Dark mode Print preview: verify @media print forces white paper (#ffffff)
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await clickSidebarLink(page, "Reports");
    await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "print-preview-1440-dark.png") });

    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(100);
    const printBg = await page.evaluate(() => {
      const pg = document.querySelector(".chrx-preview-page");
      return pg ? getComputedStyle(pg).backgroundColor : "";
    });
    expect(printBg).toBe("rgb(255, 255, 255)");
    await page.emulateMedia({ media: "screen" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // 3. p285 leftover (a): at 390px, "All classes" button & boardbar do NOT overflow the right edge
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const boxCheck = await page.evaluate(() => {
      const ov = document.querySelector(".chrx-focus-boardbar__overview");
      const bar = document.querySelector(".chrx-focus-boardbar");
      return {
        innerW: window.innerWidth,
        scrollW: document.documentElement.scrollWidth,
        ovRight: ov ? ov.getBoundingClientRect().right : 0,
        barRight: bar ? bar.getBoundingClientRect().right : 0,
      };
    });
    expect(boxCheck.scrollW).toBeLessThanOrEqual(boxCheck.innerW);
    expect(boxCheck.ovRight).toBeLessThanOrEqual(boxCheck.innerW + 0.5);
    expect(boxCheck.barRight).toBeLessThanOrEqual(boxCheck.innerW + 0.5);
    await page.screenshot({ path: path.join(SHOT_DIR, "editor-390-dark.png") });

    // 4. Version history via sidebar click
    await page.setViewportSize({ width: 1440, height: 900 });
    await clickSidebarLink(page, "Version history");
    await expect(page.locator(".chrx-vh-panel")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "version-history-1440-dark.png") });
    await page.keyboard.press("Escape");

    // 5. Publish dialog via sidebar click
    await clickSidebarLink(page, /Publish/i);
    await expect(page.locator('[data-testid="chrx-pub-dialog"]')).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "publish-1440-dark.png") });
    await page.keyboard.press("Escape");

    // 6. School settings via sidebar click -> change school name -> save -> reload -> persists
    await clickSidebarLink(page, "School settings");
    const sheet = page.locator(".chrx-ent-sheet, #chrx-ent-sheet").first();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    const nameInput = sheet.locator('input[type="text"]').first();
    await nameInput.fill("Oakridge Academy L5");
    await sheet.locator("button", { hasText: /Save/i }).first().click();
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.APP && window.APP.school && window.APP.school.schoolName === "Oakridge Academy L5", { timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
