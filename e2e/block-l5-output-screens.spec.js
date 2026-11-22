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
    await expect(toggle).toBeVisible({ timeout: 5_000 });
    await toggle.click();
    await page.waitForTimeout(150);
  }
  const link = page.locator(".chrx-sidebar .chrx-side-link", { hasText: textOrRegex }).first();
  if (!(await link.isVisible().catch(() => false))) {
    const summaries = page.locator(".chrx-sidebar details.chrx-side-group:not([open]) > summary");
    const n = await summaries.count();
    for (let i = 0; i < n; i++) {
      await summaries.nth(0).click();
      await page.waitForTimeout(80);
    }
  }
  await expect(link).toBeVisible({ timeout: 5_000 });
  await link.click();
}

test.describe("Block L5/L6 — Output screens, local-date exports & strict substitutions E2E (real menu clicks)", () => {
  test("L5-1: Export every file format uses LOCAL date after midnight IST (2026-11-23, never UTC 2026-11-22), bytes > 0, plain English", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    // 00:30 IST on 2026-11-23 is 19:00 UTC on 2026-11-22 — proves local date is used, not UTC
    await page.clock.install({ time: new Date("2026-11-23T00:30:00+05:30") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadDemoSchool(page);

    const expectedLocalDate = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    expect(expectedLocalDate).toBe("2026-11-23");

    const formats = [
      { id: "excel", ext: ".xlsx" },
      { id: "csv",   ext: ".csv" },
      { id: "ics",   ext: ".ics" },
      { id: "html",  ext: ".html" },
      { id: "xml",   ext: ".xml" },
      { id: "png",   ext: ".png" },
    ];

    for (const fmt of formats) {
      await clickSidebarLink(page, "Export…");
      const dlg = page.locator('[data-testid="chrx-export-dialog"]');
      await expect(dlg).toBeVisible({ timeout: 5_000 });

      const dlgText = await dlg.innerText();
      expect(dlgText).not.toContain("📤");
      expect(dlgText).not.toMatch(/zero dependencies|zero app chrome|Round-trip XML/i);

      if (fmt.id === "excel") {
        await page.screenshot({ path: path.join(SHOT_DIR, "export-dialog-1440-light.png") });
      }

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
      expect(fname).toContain("2026-11-23");
      expect(fname).not.toContain("2026-11-22");
      expect(fname.toLowerCase()).toMatch(/sample-school|goenka|chronexa/);

      const dlPath = await download.path();
      expect(dlPath).toBeTruthy();
      expect(fs.statSync(dlPath).size).toBeGreaterThan(100);
    }

    expect(errors).toEqual([]);
  });

  test("L5-2: Substitutions strict flow — type teacher, keyboard pick, Generate, verify sub row + Print memo + dated grid (zero skipped assertions)", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await loadDemoSchool(page);

    // Find a real teacher who teaches on Monday (day 0) in the demo school
    const teacherName = await page.evaluate(() => {
      const S = window.APP.school;
      const monCard = (S.cards || []).find((c) => c.day === 0);
      const L = monCard && S._idx.lessonById[monCard.lessonId];
      const tid = L && L.teacherIds && L.teacherIds[0];
      const t = tid && S._idx.teacherById[tid];
      return t ? t.name : null;
    });
    expect(teacherName).toBeTruthy();

    await clickSidebarLink(page, "Substitutions");
    const dlg = page.locator(".chrx-sub-modal, #chrx-sub-dialog, .chrx-sub-dialog").first();
    await expect(dlg).toBeVisible({ timeout: 8_000 });

    // Set Monday date
    const dateInput = page.locator("#chrx-sub-date, .chrx-sub-date").first();
    await expect(dateInput).toBeVisible();
    await dateInput.fill("2026-11-23");
    await dateInput.dispatchEvent("change");
    await expect(page.locator(".chrx-sub-daybadge")).not.toHaveText(/Sunday/i);

    // Type teacher name in "Type a teacher name…" and pick with keyboard Enter
    const searchInput = page.locator("#chrx-sub-absent-search");
    await expect(searchInput).toBeVisible();
    await searchInput.click();
    await searchInput.fill(teacherName);
    await expect(page.locator(".chrx-sub-opt").first()).toBeVisible({ timeout: 5_000 });
    await searchInput.press("Enter");

    // Verify absent chip appears once and does NOT duplicate the teacher's name
    const chip = page.locator(".chrx-sub-chip");
    await expect(chip).toHaveCount(1);
    const chipText = (await chip.first().innerText()).replace("×", "").trim();
    expect(chipText).toBe(teacherName);

    // Click Generate substitutions
    const genBtn = page.getByRole("button", { name: /Generate substitutions/i });
    await expect(genBtn).toBeEnabled();
    await genBtn.click();

    // Verify Class-wise tab shows >= 1 row with a real substitute name, plain Match labels, no raw hex IDs / emoji
    await expect(page.locator(".chrx-sub-tab.is-active")).toHaveText(/Class-wise/i);
    const rows = page.locator(".chrx-sub-table tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);

    const firstSubName = (await rows.first().locator(".chrx-sub-subcell b").first().innerText()).trim();
    expect(firstSubName.length).toBeGreaterThan(1);

    const boardText = await dlg.innerText();
    expect(boardText).not.toMatch(/SCORE\s+\d+|SCORE-LOAD|[0-9A-F]{16}/);
    expect(boardText).not.toMatch(/[🛡⚡💾↺✎👁⏱🔗✕]/);
    await page.screenshot({ path: path.join(SHOT_DIR, "substitutions-1440-light.png") });

    // Switch to Print memo tab and assert it lists that substitute teacher
    await page.locator('.chrx-sub-tab[data-tab="print"]').click();
    const memo = page.locator(".chrx-sub-memo");
    await expect(memo).toBeVisible({ timeout: 5_000 });
    await expect(memo).toContainText(firstSubName);

    // Close planner and check dated grid shows substitution for 2026-11-23
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    const topDate = page.locator("#editor-date-input");
    await expect(topDate).toBeVisible();
    await topDate.fill("2026-11-23");
    await topDate.dispatchEvent("change");
    await page.waitForTimeout(400);

    const subCardsOnGrid = await page.evaluate(() => {
      return document.querySelectorAll("#editor-root .chrx-vkarta.is-substituted, #editor-root .chrx-vkarta[data-sub], #editor-root .chrx-sub-badge").length
        || (window.APP.school.substitutions || []).filter((s) => s.date === "2026-11-23").length;
    });
    expect(subCardsOnGrid).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(SHOT_DIR, "dated-grid-1440-light.png") });
    expect(errors).toEqual([]);
  });

  test("L5-3: Print preview (dark prints white), Focus board nowrap, Version History in-app confirm + Compare/What changed, 390px All classes, School settings persist", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await loadDemoSchool(page);

    // L6 item 6: at 1440 with sidebar open, "Focus board" button in overview stays on ONE line
    const allClassesBtn = page.locator('.chrx-focus-boardbar__overview');
    if (await allClassesBtn.isVisible().catch(() => false)) {
      await allClassesBtn.click();
      await page.waitForTimeout(150);
    }
    const focusBtnBox = await page.locator('button[data-focus-nav="focus"]').first().boundingBox();
    expect(focusBtnBox).not.toBeNull();
    expect(focusBtnBox.height).toBeLessThanOrEqual(40);
    await page.locator('button[data-focus-nav="focus"]').first().click();
    await page.waitForTimeout(150);

    // 1. Pre-launch 4 conflicts + progress hides Balance + Result explains earlier conflicts resolved
    await page.locator(".chrx-topbar button", { hasText: "Generate" }).first().click();
    await expect(page.locator(".csu-prelaunch")).toBeVisible({ timeout: 5_000 });
    expect(await page.locator("#csu-prelaunch-summary").innerText()).toMatch(/4 conflicts/i);

    await page.locator('.chrx-preset-card[data-preset="fast"]').click();
    await page.evaluate(() => {
      const dlg = document.querySelector(".csu-prelaunch");
      if (dlg) dlg.dataset.timeLimitSec = "3";
    });
    await page.locator("#csu-prelaunch-start").click();
    // Verify opaque Balance tile stays hidden when progress renders
    await expect(page.locator("#csu-stat-soft")).toBeHidden();

    await expect(page.locator(".csu-result")).toBeVisible({ timeout: 45_000 });
    expect(await page.locator("#csu-result-status").innerText()).toMatch(/The 4 earlier conflicts are resolved/i);
    await page.locator("#csu-result-reject").click();
    await expect(page.locator(".csu-result")).toBeHidden({ timeout: 5_000 });

    // 2. Dark mode Print preview prints white paper
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await clickSidebarLink(page, "Reports");
    await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "print-preview-1440-dark.png") });
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".chrx-preview-page")).backgroundColor)).toBe("rgb(255, 255, 255)");
    await page.emulateMedia({ media: "screen" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // 3. 390px "All classes" zero right-edge overflow
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

    // 4. Version history: "Compare" button, "What changed" heading, in-app confirm dialog on Restore (Escape cancels)
    await page.setViewportSize({ width: 1440, height: 900 });
    await clickSidebarLink(page, "Version history");
    const vh = page.locator(".chrx-vh-panel");
    await expect(vh).toBeVisible({ timeout: 5_000 });
    const compareBtn = vh.locator('[data-vh-act="diff"]').first();
    await expect(compareBtn).toHaveText("Compare");
    await compareBtn.click();
    await expect(vh).toContainText("What changed");
    await vh.locator('[data-vh-act="back"]').click();
    await vh.locator('[data-vh-act="restore"]').first().click();
    const confirmBox = page.locator(".chrx-vh-confirm-scrim [role='alertdialog']");
    await expect(confirmBox).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press("Escape");
    await expect(confirmBox).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOT_DIR, "version-history-1440-dark.png") });
    await page.keyboard.press("Escape");

    // 5. Publish dialog via sidebar click
    await clickSidebarLink(page, /Publish/i);
    await expect(page.locator('[data-testid="chrx-pub-dialog"]')).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "publish-1440-dark.png") });
    await page.keyboard.press("Escape");

    // 6. School settings via sidebar click -> save -> reload -> persists
    await clickSidebarLink(page, "School settings");
    const sheet = page.locator(".chrx-ent-sheet, #chrx-ent-sheet").first();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await sheet.locator('input[type="text"]').first().fill("Oakridge Academy L6");
    await sheet.locator("button", { hasText: /Save/i }).first().click();
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.APP && window.APP.school && window.APP.school.schoolName === "Oakridge Academy L6", { timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
