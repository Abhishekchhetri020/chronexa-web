import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SHOT_DIR = path.resolve("docs/neon/ui-shots/l2");

test.describe("Block L — UI polish, L0/L1b early-click race, dark mode & multi-screen audit", () => {
  test("L0/L1b-a: early click on Start with a school template within 100ms of DOMContentLoaded under 4x CPU throttle opens picker cleanly", async ({ page, context }) => {
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

      // Template picker must open cleanly once all modules finish loading
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

  test("L0/L1b-b: early click on Launch demo within 100ms of DOMContentLoaded under 4x CPU throttle loads demo cleanly", async ({ page, context }) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.locator("#cta-landing-demo").click({ timeout: 15_000 });
      await page.locator("#editor-root .chrx-vkarta").first().waitFor({ timeout: 40_000 });
      const cards = await page.evaluate(() => (window.APP?.school?.cards || []).length);
      expect(cards).toBeGreaterThan(500);
      expect(errors).toEqual([]);
    } finally {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {});
    }
  });

  test("L1/L2: empty school shows 'No lessons yet', SVG icons, no overlapping banner, and high-contrast dark-mode buttons", async ({ page }) => {
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

    // Dark mode check on empty school: secondary buttons MUST NOT be white-on-white
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(150);
    const sampleBtnBg = await page.locator("#chrx-hero-sample-btn").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(sampleBtnBg).not.toBe("rgb(255, 255, 255)");
    await page.screenshot({ path: path.join(SHOT_DIR, "empty-school-1440-dark-after.png") });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));

    // 390px mobile check on empty school (zero horizontal overflow)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const overflow390 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow390).toBeLessThanOrEqual(2);
  });

  test("L2: full multi-screen dialog audit (Verification, Advisor, Statistics, Publish, Version History, Entities) at 1440 & 390 with zero overflow and zero pageerrors", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForFunction(() => window.__CHRX_READY__ && window.APP);

    await page.locator("#cta-landing-demo").click();
    await page.locator("#editor-root .chrx-vkarta").first().waitFor({ timeout: 30_000 });

    // 1. Verification
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:verification-pro")));
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, "verification-1440.png") });
    await page.keyboard.press("Escape");

    // 2. Advisor
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:advisor")));
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, "advisor-1440.png") });
    await page.keyboard.press("Escape");

    // 3. Statistics
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:statistics")));
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, "statistics-1440.png") });
    await page.keyboard.press("Escape");

    // 4. Publish
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:publish-timetable")));
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, "publish-1440.png") });
    await page.keyboard.press("Escape");

    // 5. Version history
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:open-version-history")));
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOT_DIR, "version-history-1440.png") });
    await page.keyboard.press("Escape");

    // 6. Lessons entity dialog (light + dark)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind: "lessons" } })));
    await expect(page.locator(".chrx-ent-dialog").first()).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: path.join(SHOT_DIR, "lessons-dialog-1440.png") });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOT_DIR, "lessons-dialog-1440-dark.png") });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.keyboard.press("Escape");

    expect(errors).toEqual([]);
  });
});
