import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test("placed cards track the pointer directly and cancel without rebuilding the grid", async ({ page }) => {
  await loadDemoSchool(page);

  const card = page.locator("#editor-root .chrx-vkarta:not(.locked)").first();
  const target = page.locator("#editor-root .chrx-slot:not(.out-of-bell)").nth(12);
  await expect(card).toBeVisible();
  await expect(target).toBeVisible();

  const cardMeta = await card.evaluate((el) => ({ ...el.dataset }));
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

  await page.evaluate(() => {
    window.__dragRenderCount = 0;
    const original = window.Editor.render;
    window.Editor.render = function (...args) {
      window.__dragRenderCount += 1;
      return original.apply(this, args);
    };
  });

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 1);

  await expect(page.locator(".chrx-card-ghost")).toBeVisible();
  await expect(card).toHaveClass(/chrx-vk-source/);
  expect(await page.evaluate((meta) => window.APP.school.cards.some((c) =>
    c.lessonId === meta.lessonId && c.day === Number(meta.day) && c.period === Number(meta.period)
  ), cardMeta)).toBe(true);

  await page.mouse.move(end.x, end.y);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const firstTransform = await page.locator(".chrx-card-ghost").evaluate((el) => {
    const match = el.style.transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  });
  const secondPointer = { x: end.x + 72, y: end.y + 18 };
  await page.mouse.move(secondPointer.x, secondPointer.y);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const secondTransform = await page.locator(".chrx-card-ghost").evaluate((el) => {
    const match = el.style.transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  });
  expect(firstTransform).not.toBeNull();
  expect(secondTransform.x - firstTransform.x).toBeCloseTo(72, 3);
  expect(secondTransform.y - firstTransform.y).toBeCloseTo(18, 3);

  await page.keyboard.press("Escape");
  await expect(page.locator(".chrx-card-ghost")).toHaveCount(0, { timeout: 2_000 });
  await expect(card).not.toHaveClass(/chrx-vk-source/);
  expect(await page.evaluate(() => window.__dragRenderCount)).toBe(0);
});
