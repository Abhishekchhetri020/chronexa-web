import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test("W3c-1 topbar date field has sufficient width for full date/placeholder at 1470px and 1280px without topbar expansion", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 727 });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  await loadDemoSchool(page);
  await page.waitForTimeout(500);

  const measure = async (width) => {
    await page.setViewportSize({ width, height: 727 });
    await page.waitForTimeout(300);

    return page.evaluate(() => {
      const input = document.getElementById("editor-date-input");
      const topbar = document.querySelector(".chrx-topbar");
      const crumbs = document.getElementById("chrx-crumbs");
      const winW = window.innerWidth;
      const buttons = [...document.querySelectorAll(".chrx-topbar button, .chrx-topbar input, .chrx-topbar .chrx-action-row")]
        .filter(el => el.offsetParent !== null);
      const offscreenButtons = buttons.filter(el => {
        const r = el.getBoundingClientRect();
        return r.right > winW || r.left < 0;
      });

      const inputRect = input.getBoundingClientRect();
      const topbarRect = topbar.getBoundingClientRect();

      return {
        inputWidth: inputRect.width,
        topbarHeight: topbarRect.height,
        crumbsTruncated: crumbs.scrollWidth > crumbs.clientWidth + 1,
        offscreenCount: offscreenButtons.length,
      };
    });
  };

  // 1. At 1470px
  const at1470 = await measure(1470);
  expect(at1470.inputWidth, "Date input is too narrow (< 120px) at 1470px, clipping placeholder/year").toBeGreaterThanOrEqual(120);
  expect(at1470.topbarHeight, "Topbar height exceeded 46px at 1470px").toBeLessThanOrEqual(46);
  expect(at1470.crumbsTruncated, "Breadcrumb title truncated at 1470px").toBe(false);
  expect(at1470.offscreenCount, "Buttons overflow off-screen at 1470px").toBe(0);

  // 2. At 1280px
  const at1280 = await measure(1280);
  expect(at1280.inputWidth, "Date input is too narrow (< 120px) at 1280px, clipping placeholder/year").toBeGreaterThanOrEqual(120);
  expect(at1280.topbarHeight, "Topbar height exceeded 46px at 1280px").toBeLessThanOrEqual(46);
  expect(at1280.crumbsTruncated, "Breadcrumb title truncated at 1280px").toBe(false);
  expect(at1280.offscreenCount, "Buttons overflow off-screen at 1280px").toBe(0);
});
