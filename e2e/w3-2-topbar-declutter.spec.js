import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";


test("topbar title is readable and not truncated at 1470px and 1280px", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1470, height: 727 });
  await page.goto("/index.html");
  await page.waitForLoadState("networkidle");

  // Navigate to step 6 (Editor)
  await loadDemoSchool(page);
  await page.waitForTimeout(500);

  // Helper to measure breadcrumb spans and check if any text is truncated
  const checkCrumbs = async (width, filename) => {
    await page.setViewportSize({ width, height: 727 });
    await page.waitForTimeout(300);
    if (filename) {
      await page.screenshot({ path: testInfo.outputPath(filename) });
    }
    return page.evaluate(() => {
      const crumbs = document.getElementById("chrx-crumbs");
      const spans = [...crumbs.querySelectorAll("span")];
      const winW = window.innerWidth;
      const buttons = [...document.querySelectorAll(".chrx-topbar button, .chrx-topbar input, .chrx-topbar .chrx-action-row")]
        .filter(el => el.offsetParent !== null);
      const offscreenButtons = buttons.filter(el => {
        const r = el.getBoundingClientRect();
        return r.right > winW || r.left < 0;
      });
      return {
        crumbsWidth: crumbs.clientWidth,
        crumbsScrollWidth: crumbs.scrollWidth,
        text: crumbs.textContent.replace(/\s+/g, " ").trim(),
        spans: spans.map(s => ({
          text: s.textContent.trim(),
          clientWidth: s.clientWidth,
          scrollWidth: s.scrollWidth,
          truncated: s.scrollWidth > s.clientWidth + 1,
        })),
        offscreenCount: offscreenButtons.length,
      };
    });
  };

  // 1. Check at 1470px
  const at1470 = await checkCrumbs(1470, "topbar-1470-after.png");
  console.log("At 1470px:", JSON.stringify(at1470));
  const truncated1470 = at1470.spans.filter(s => s.truncated);
  expect(truncated1470.length, `At 1470px title is truncated: ${JSON.stringify(truncated1470)}`).toBe(0);
  expect(at1470.offscreenCount, "Buttons overflow off-screen at 1470px").toBe(0);

  // 2. Check at 1280px
  const at1280 = await checkCrumbs(1280, "topbar-1280-after.png");
  console.log("At 1280px:", JSON.stringify(at1280));
  const truncated1280 = at1280.spans.filter(s => s.truncated);
  expect(truncated1280.length, `At 1280px title is truncated: ${JSON.stringify(truncated1280)}`).toBe(0);
  expect(at1280.offscreenCount, "Buttons overflow off-screen at 1280px").toBe(0);

  // 3. Stress-test with a long school name at 1280px (orchestrator check)
  await page.evaluate(() => {
    const crumbFirst = document.querySelector("#chrx-crumbs span:first-child");
    if (crumbFirst) crumbFirst.textContent = "G.D. Goenka School, Darbhanga - Senior Wing";
  });
  const at1280Long = await checkCrumbs(1280, "topbar-1280-long-title.png");
  console.log("At 1280px with long title:", JSON.stringify(at1280Long));
  const truncated1280Long = at1280Long.spans.filter(s => s.truncated);
  expect(truncated1280Long.length, `At 1280px long title is truncated: ${JSON.stringify(truncated1280Long)}`).toBe(0);
  expect(at1280Long.offscreenCount, "Buttons overflow off-screen at 1280px with long title").toBe(0);
});
