import { expect, test } from "@playwright/test";
import fs from "node:fs";

test("Pages artifact contains the compiled app shell", async ({ page }) => {
  await page.goto("/");

  const stylesheet = page.locator(
    'link[rel="stylesheet"][href*="assets/index-"]'
  );
  const module = page.locator('script[type="module"][src*="assets/index-"]');

  await expect(stylesheet).toHaveCount(1);
  await expect(module).toHaveCount(1);
  await expect(page.locator('script[src*="js/entry/main.js"]')).toHaveCount(0);
  await expect(page.locator(".chrx-landing")).toHaveCSS("display", "flex");
  await expect(page.locator(".chrx-landing__wordmark")).toHaveCSS(
    "font-family",
    /Fraunces|Georgia/
  );
});

test("source shell carries the GitHub Pages cache recovery guard", () => {
  const source = fs.readFileSync("index.html", "utf8");

  expect(source).toContain("IS_RAW_PAGES_SHELL");
  expect(source).toContain('chronexa_recover');
  expect(source).toContain('href*="assets/index-"');
  expect(source).toContain('src*="assets/index-"');
});

test("generated worker self-heals shell assets", () => {
  const worker = fs.readFileSync("dist/sw.js", "utf8");

  expect(worker).toContain('const APP_VER = "20260803-p201-pages-shell-recovery"');
  expect(worker).toContain('request.destination === "style"');
  expect(worker).toContain("keeping the previous worker");
});
