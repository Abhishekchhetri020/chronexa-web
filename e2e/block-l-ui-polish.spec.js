import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SHOT_DIR = path.resolve("docs/neon/ui-shots/l1");

test.describe("Block L1 — UI polish, L0 early-click race, dark mode & 390px audit", () => {
  test("L0: early click on Start with a school template within 100ms of DOMContentLoaded under 4x CPU throttle never shows legacy header or black screen", async ({ page, context }) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });

      // Legacy header & step-tab nav must NEVER be visible even before JS finishes booting
      const legacyHeaderVisible = await page.locator("body > header, .chrx-main > header").first().isVisible().catch(() => false);
      expect(legacyHeaderVisible).toBe(false);

      // Click CTA within 100ms of DOMContentLoaded
      await page.locator("#cta-build-new").click({ timeout: 5_000 });

      // Template picker must open cleanly once ready (either immediately or via early-click queue)
      const panel = page.locator(".chrx-tpl-modal__panel");
      await expect(panel).toBeVisible({ timeout: 25_000 });

      // Pick Blank -> must land on the light Editor with Get Started checklist, never a black screen
      await panel.getByRole("button", { name: /Blank — I'll set up everything/i }).click();
      await expect(page.locator("#chrx-hero-progress")).toHaveText("0 of 4 required steps done", { timeout: 20_000 });
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).not.toBe("rgb(0, 0, 0)");
      expect(errors).toEqual([]);
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {});
    }
  });

  test("L1: empty school shows 'No lessons yet', line SVG checklist icons, and no overlapping local-compute banner", async ({ page }) => {
    test.setTimeout(60_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForFunction(() => window.__CHRX_READY__ && window.APP);

    await page.locator("#cta-build-new").click();
    await page.getByRole("button", { name: /Blank — I'll set up everything/i }).click();

    await expect(page.locator("#chrx-hero-progress")).toHaveText("0 of 4 required steps done", { timeout: 10_000 });
    await expect(page.locator("#editor-unplaced-count")).toHaveText("No lessons yet");

    // All 6 checklist cards use SVG line icons (zero emoji)
    const svgCount = await page.locator(".chrx-hero-tile__icon svg").count();
    expect(svgCount).toBe(6);

    // Wait past the 3s PWA banner timer: banner must NOT appear over the Get Started checklist
    await page.waitForTimeout(3400);
    await expect(page.locator("#chrx-pwa-banner")).toHaveCount(0);

    await page.screenshot({ path: path.join(SHOT_DIR, "empty-school-1440.png") });

    // Dark mode check on empty school
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOT_DIR, "empty-school-1440-dark.png") });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));

    // 390px mobile check on empty school (zero horizontal overflow)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const overflow390 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow390).toBeLessThanOrEqual(2);
    await page.screenshot({ path: path.join(SHOT_DIR, "empty-school-390.png") });
  });

  test("L1: multi-screen visual audit (1440, 1280, 390, light & dark) with zero overflow and zero pageerrors", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    // 1. Landing at 1440 & 390
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForFunction(() => window.__CHRX_READY__ && window.APP);
    await page.screenshot({ path: path.join(SHOT_DIR, "landing-1440.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: path.join(SHOT_DIR, "landing-390.png") });

    // 2. Editor (demo school) at 1440 light, 1440 dark, 1280 light, 390 light
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#cta-landing-demo").click();
    await page.locator("#editor-root .chrx-vkarta").first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, "editor-1440.png") });

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, "editor-1440-dark.png") });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: path.join(SHOT_DIR, "editor-1280.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: path.join(SHOT_DIR, "editor-390.png") });

    // 3. Key dialogs at 1440 (light + dark check)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:export-dialog")));
    await expect(page.locator("#chrx-export-dialog, .chrx-export-dialog").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "export-1440.png") });
    await page.keyboard.press("Escape");

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:substitutions")));
    await expect(page.locator("#chrx-sub-dialog, .chrx-sub-dialog").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "substitutions-1440.png") });
    await page.keyboard.press("Escape");

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:print-preview")));
    await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "print-preview-1440.png") });
    await page.keyboard.press("Escape");

    expect(errors).toEqual([]);
  });
});
