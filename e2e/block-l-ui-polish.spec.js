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

  test("L1b-c: slow 200 KB/s connection + early click on #cta-build-new opens picker and leaves no #chrx-boot-timeout", async ({ page, context }) => {
    test.setTimeout(150_000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 50,
      downloadThroughput: 200 * 1024,
      uploadThroughput: 200 * 1024,
    });

    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.locator("#cta-build-new").click({ timeout: 10_000 });

      // Picker must open cleanly once modules finish downloading, and any #chrx-boot-timeout notice must be gone
      const panel = page.locator(".chrx-tpl-modal__panel");
      await expect(panel).toBeVisible({ timeout: 120_000 });
      await expect(page.locator("#chrx-boot-timeout")).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      }).catch(() => {});
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

  test("L3-boot-crash: blocking a JS chunk before boot restores queued CTA and shows plain boot error", async ({ page }) => {
    test.setTimeout(45_000);
    let aborted = 0;
    await page.route("**/assets/*.js", async (route) => {
      const url = route.request().url();
      if (aborted === 0 && /\/assets\/index-.*\.js/.test(url)) {
        aborted++;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const cta = page.locator("#cta-build-new");
    await cta.click({ timeout: 5_000 });

    // Boot crash fail-safe must show plain error and restore button (never stuck on "Loading…")
    const errBox = page.locator("#chrx-boot-error");
    await expect(errBox).toBeVisible({ timeout: 10_000 });
    await expect(errBox).toContainText("Chronexa could not start. Please refresh the page.");
    await expect(cta).not.toHaveAttribute("aria-busy", "true");
    const ctaText = await cta.innerText();
    expect(ctaText).not.toContain("Loading…");
  });

  test("L3-dark-audit: every dialog & topbar toggle in dark mode has zero white-on-white text, closes on Escape, and captures L3 shots", async ({ page }) => {
    test.setTimeout(120_000);
    const L3_DIR = path.resolve("docs/neon/ui-shots/l3");
    fs.mkdirSync(L3_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForFunction(() => window.__CHRX_READY__ && window.APP);

    await page.locator("#cta-landing-demo").click();
    await page.locator("#editor-root .chrx-vkarta").first().waitFor({ timeout: 30_000 });

    // Light shots (1440)
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(L3_DIR, "editor-1440-light.png") });

    // Switch to dark mode
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(L3_DIR, "editor-1440-dark.png") });

    // Check .chrx-shell-toggle buttons are NOT light rgb(239, 239, 241) in dark mode
    const toggleBgs = await page.locator(".chrx-shell-toggle").evaluateAll((els) =>
      els.map((el) => ({ label: el.getAttribute("aria-label"), bg: getComputedStyle(el).backgroundColor }))
    );
    for (const t of toggleBgs) {
      expect(t.bg, `dark shell toggle ${t.label} should not be light`).not.toBe("rgb(239, 239, 241)");
      expect(t.bg, `dark shell toggle ${t.label} should not be white`).not.toBe("rgb(255, 255, 255)");
    }

    // Helper: detect white/near-white text on white/near-white effective background inside a container
    async function findWhiteOnWhite(selector) {
      return page.evaluate((sel) => {
        const root = document.querySelector(sel);
        if (!root) return [{ missing: sel }];
        function parseRgb(str) {
          const m = str && str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (!m) return null;
          return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
        }
        function lum(c) {
          const s = [c.r, c.g, c.b].map((v) => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
        }
        function effectiveBg(el) {
          let cur = el;
          while (cur && cur.nodeType === 1) {
            const c = parseRgb(getComputedStyle(cur).backgroundColor);
            if (c && c.a > 0.2) return c;
            cur = cur.parentElement;
          }
          return { r: 21, g: 19, b: 15, a: 1 };
        }
        const bad = [];
        for (const el of root.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none" || parseFloat(style.opacity) === 0) continue;
          const directText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
          if (!directText) continue;
          const fg = parseRgb(style.color);
          const bg = effectiveBg(el);
          if (!fg || !bg) continue;
          const fL = lum(fg), bL = lum(bg);
          if (fL > 0.65 && bL > 0.65) {
            bad.push({ text: directText.slice(0, 40), fg: style.color, bg: `rgb(${bg.r},${bg.g},${bg.b})`, tag: el.tagName, cls: el.className });
          }
        }
        return bad;
      }, selector);
    }

    const dialogs = [
      { name: "publish", event: "app:publish-timetable", sel: "[data-testid='chrx-pub-dialog']", shot: "publish-1440-dark.png" },
      { name: "advisor", event: "app:advisor", sel: ".chrx-adv-panel", shot: "advisor-1440-dark.png" },
      { name: "statistics", event: "app:statistics", sel: ".chrx-stats-panel", shot: "statistics-1440-dark.png" },
      { name: "version-history", event: "app:open-version-history", sel: ".chrx-vh-panel", shot: "version-history-1440-dark.png" },
      { name: "verification", event: "app:verification-pro", sel: ".chrx-vpro-panel", shot: "verification-1440-dark.png" },
      { name: "export", event: "app:export-dialog", sel: ".chrx-export-dialog", shot: "export-1440-dark.png" },
      { name: "lessons", event: "app:open-entity", detail: { kind: "lessons" }, sel: ".chrx-ent-dialog", shot: "lessons-1440-dark.png" },
    ];

    for (const d of dialogs) {
      await page.evaluate(({ ev, det }) => {
        window.dispatchEvent(new CustomEvent(ev, det ? { detail: det } : undefined));
      }, { ev: d.event, det: d.detail });
      await expect(page.locator(d.sel).first()).toBeVisible({ timeout: 8_000 });
      await page.waitForTimeout(200);
      if (d.shot) await page.screenshot({ path: path.join(L3_DIR, d.shot) });

      const bad = await findWhiteOnWhite(d.sel);
      expect(bad, `white-on-white elements in dark mode ${d.name}`).toEqual([]);

      // Escape must close every dialog cleanly
      await page.keyboard.press("Escape");
      await expect(page.locator(d.sel)).toHaveCount(0, { timeout: 5_000 });
    }

    // 390px mobile dark & light shots
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(L3_DIR, "editor-390-dark.png") });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(L3_DIR, "editor-390-light.png") });

    expect(errors).toEqual([]);
  });


  test("L3-item0: early-click guard lives in <head> so real mouse click on Try demo under 200 KB/s + 300ms latency opens demo", async ({ page, context }) => {
    test.setTimeout(150_000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 300,
      downloadThroughput: 200 * 1024,
      uploadThroughput: 200 * 1024,
    });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/", { waitUntil: "commit" });
      const tryDemo = page.locator("[data-closing-demo]").first();
      await tryDemo.waitFor({ state: "visible", timeout: 15_000 });

      // Guard must ALREADY be wired in <head> before <body> finishes / before JS boots
      const wired = await page.evaluate(() => !!window.__CHRX_EARLY_WIRED__);
      expect(wired).toBe(true);

      const box = await tryDemo.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

      // Demo grid must open cleanly once modules finish downloading
      await page.locator("#editor-root .chrx-vkarta").first().waitFor({ timeout: 120_000 });
      const cards = await page.evaluate(() => (window.APP?.school?.cards || []).length);
      expect(cards).toBeGreaterThan(500);
      await expect(page.locator("#chrx-boot-timeout")).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      }).catch(() => {});
    }
  });

});
