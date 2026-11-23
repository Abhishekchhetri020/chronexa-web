// Block M2 — Cloud 503 plain fallback, in-app Help guide, SEO/OG/manifest/404, clean console.
import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test.describe("Block M2 — Ship polish (items 2, 3, 4, 6)", () => {
  test("M2-1: Cloud solver 503 shows plain-English message and falls back cleanly to local solver", async ({ page }) => {
    await loadDemoSchool(page);

    await page.route("**/solve/start", (route) =>
      route.fulfill({ status: 503, contentType: "text/plain", body: "Service Unavailable" })
    );

    const outcome = await page.evaluate(() => new Promise((resolve) => {
      const prevUrl = window.CHRONEXA_BACKEND_URL;
      window.CHRONEXA_BACKEND_URL = "https://mock-cloud-503.example";
      let fallbackMsg = null;
      let fallbackEventMsg = null;
      const src = window.SolverUI.run({
        school: window.APP.school,
        options: { timeLimitSec: 4, verbose: false, warmStart: true },
        algorithm: "cloud",
        onFallback: (msg) => { fallbackMsg = msg; },
      });
      const timer = setTimeout(() => {
        window.CHRONEXA_BACKEND_URL = prevUrl;
        try { src.cancel(); } catch {}
        resolve({ timedOut: true, fallbackMsg, fallbackEventMsg });
      }, 20000);
      src.subscribe((ev) => {
        if (ev && ev.type === "fallback") fallbackEventMsg = ev.message;
        if (ev && ev.type === "done") {
          clearTimeout(timer);
          window.CHRONEXA_BACKEND_URL = prevUrl;
          const placed = (ev.result && ev.result.assignment && ev.result.assignment.length) || 0;
          resolve({ timedOut: false, fallbackMsg, fallbackEventMsg, placed });
        }
        if (ev && ev.type === "error") {
          clearTimeout(timer);
          window.CHRONEXA_BACKEND_URL = prevUrl;
          resolve({ timedOut: false, error: ev.message, fallbackMsg, fallbackEventMsg });
        }
      });
    }));

    expect(outcome.timedOut).toBe(false);
    expect(outcome.error).toBeUndefined();
    expect(outcome.fallbackMsg).toContain("temporarily unavailable");
    expect(outcome.fallbackMsg).toContain("running on your device instead");
    expect(outcome.fallbackMsg).not.toMatch(/503|HTTP|Exception/i);
    expect(outcome.fallbackEventMsg).toBe(outcome.fallbackMsg);
    expect(outcome.placed).toBeGreaterThan(500);
  });

  test("M2-2: In-app Help guide ('How to build your first timetable') opens from sidebar and '?' and closes on Escape", async ({ page }) => {
    await loadDemoSchool(page);

    // Ensure sidebar is open
    const nav = page.locator(".chrx-sidebar");
    const sideRect = await nav.boundingBox().catch(() => null);
    if (!sideRect || sideRect.width < 40) {
      await page.locator('.chrx-shell-toggle[data-toggle="side"]').first().click();
      await page.waitForTimeout(150);
    }

    const helpLink = page.locator(".chrx-sidebar .chrx-side-link", { hasText: /Help & guide/i }).first();
    await expect(helpLink).toBeVisible({ timeout: 5000 });
    await helpLink.click();

    const dlg = page.locator("#chrx-help-guide-scrim [role='dialog']");
    await expect(dlg).toBeVisible({ timeout: 5000 });
    await expect(dlg).toContainText("How to build your first timetable");
    await expect(dlg.locator("ol > li")).toHaveCount(6);

    // Escape closes
    await page.keyboard.press("Escape");
    await expect(dlg).not.toBeVisible();

    // '?' shortcut opens it again
    await page.keyboard.press("?");
    await expect(dlg).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await expect(dlg).not.toBeVisible();
  });

  test("M2-3: SEO/OG/Twitter tags, favicon, manifest (brand teal), and 404.html", async ({ page, request }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const meta = await page.evaluate(() => {
      const q = (sel) => document.querySelector(sel)?.getAttribute("content") || document.querySelector(sel)?.getAttribute("href") || "";
      return {
        title: document.title,
        description: q('meta[name="description"]'),
        themeColor: q('meta[name="theme-color"]'),
        ogTitle: q('meta[property="og:title"]'),
        ogDesc: q('meta[property="og:description"]'),
        ogImage: q('meta[property="og:image"]'),
        twitterCard: q('meta[name="twitter:card"]'),
        canonical: q('link[rel="canonical"]'),
        manifest: q('link[rel="manifest"]'),
        iconSvg: q('link[rel="icon"][type="image/svg+xml"]'),
      };
    });

    expect(meta.title).toContain("Chronexa");
    expect(meta.description.length).toBeGreaterThan(40);
    expect(meta.themeColor).toBe("#0d4f54");
    expect(meta.ogTitle).toContain("Chronexa");
    expect(meta.ogDesc.length).toBeGreaterThan(30);
    expect(meta.ogImage).toContain("icon-512.png");
    expect(meta.twitterCard).toBe("summary");
    expect(meta.canonical).toContain("chronexa-web");
    expect(meta.manifest).toMatch(/manifest.*\.json/);
    expect(meta.iconSvg).toMatch(/icon.*\.svg/);

    const manResp = await request.get("/manifest.json");
    expect(manResp.status()).toBe(200);
    const man = await manResp.json();
    expect(man.theme_color).toBe("#0d4f54");

    const nfResp = await request.get("/404.html");
    expect(nfResp.status()).toBe(200);
    const nfHtml = await nfResp.text();
    expect(nfHtml).toContain("Page not found");
    expect(nfHtml).toContain("Open Chronexa");
  });

  test("M2-4: Clean console — zero console.error, zero pageerror, zero solver/boot console.log noise", async ({ page }) => {
    const errors = [];
    const noisyLogs = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + (e.message || e)));
    page.on("console", (msg) => {
      const t = msg.type();
      const txt = msg.text();
      if (t === "error") errors.push("console.error: " + txt);
      if (t === "log" && /\[SolverLearning\]|\[multi-branch\]|\[solver\] Using multi-branch|\[main\.js\] boot/i.test(txt)) {
        noisyLogs.push(txt);
      }
    });

    await loadDemoSchool(page);
    // Run a short local solve to exercise multi-branch + solver learning
    await page.evaluate(() => new Promise((resolve) => {
      const src = window.SolverUI.run({
        school: window.APP.school,
        options: { timeLimitSec: 3, verbose: false, warmStart: true },
        algorithm: "browser",
      });
      const timer = setTimeout(() => { try { src.cancel(); } catch {} resolve(); }, 15000);
      src.subscribe((ev) => {
        if (ev && (ev.type === "done" || ev.type === "error")) {
          clearTimeout(timer);
          resolve();
        }
      });
    }));

    expect(errors).toEqual([]);
    expect(noisyLogs).toEqual([]);
  });
});
