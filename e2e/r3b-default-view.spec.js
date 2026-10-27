import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test("first run on a laptop opens the whole school in Compact; the choice is remembered", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 900 });
  await loadDemoSchool(page, { view: null });
  const state = () => page.evaluate(() => ({ view: window.APP.editor.viewMode, zoom: window.APP.editor.zoom }));
  expect(await state()).toEqual({ view: "overview", zoom: "far" });
  expect(await page.locator("#editor-root .chrx-row[data-row]").count()).toBeGreaterThan(20);

  await page.locator('[data-focus-nav="focus"]').click();
  await page.reload();
  await page.waitForFunction(() => window.APP && window.Editor);
  await page.locator("#cta-landing-demo").click();
  await page.locator("#editor-root .chrx-vkarta").first().waitFor();
  expect((await state()).view).toBe("focus");
});

test("specification buttons sit in the grid header and open their dialogs", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 900 });
  await loadDemoSchool(page, { view: null });
  const bar = page.locator(".chrx-overview-bar .chrx-entbar");
  await expect(bar.locator("[data-open-entity]")).toHaveCount(7);
  const fired = page.evaluate(() => new Promise((res) => window.addEventListener("app:open-entity", (e) => res(e.detail.kind), { once: true })));
  await bar.locator('[data-open-entity="teachers"]').click();
  expect(await fired).toBe("teachers");
});
