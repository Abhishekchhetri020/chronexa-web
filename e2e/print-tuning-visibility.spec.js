import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

const CONTROLS = ".chrx-preview-controls";
const PAGE = ".chrx-preview-doc .chrx-preview-page";

async function openClassReport(page) {
  await loadDemoSchool(page);
  await page.evaluate(() => document.getElementById("chrx-pwa-banner")?.remove());
  await page.evaluate(() => window.dispatchEvent(new Event("app:print-preview")));
  await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible();
  await page.selectOption(`${CONTROLS} select`, "class");
  await expect(page.locator(PAGE)).toBeVisible();
  await page.locator(`${CONTROLS} button:has-text("Tuning")`).click();
  await expect(page.locator("#chrx-preview-tuning")).toBeVisible();
}

test("Tuning → Visible Elements hides and restores pivot-report labels", async ({ page }) => {
  await openClassReport(page);

  const subjects = page.locator(`${PAGE} [data-chrx-el="subject"]`);
  const teachers = page.locator(`${PAGE} [data-chrx-el="teacher"]`);
  await expect(subjects.first()).toBeVisible();
  await expect(teachers.first()).toBeVisible();

  const subjectToggle = page.locator("#chrx-preview-tuning label", { hasText: "Subject Code" }).locator("input");
  await subjectToggle.uncheck();
  await expect(page.locator(`${PAGE} [data-chrx-el="subject"]`)).toHaveCount(0);
  await expect(teachers.first()).toBeVisible();
  expect(await page.evaluate(() =>
    window.APP.activePrintReport?.elementStyles?.find((row) => row.key === "subject")?.enabled
  )).toBe(false);

  await subjectToggle.check();
  await expect(subjects.first()).toBeVisible();

  const teacherToggle = page.locator("#chrx-preview-tuning label", { hasText: "Teacher Initials" }).locator("input");
  await teacherToggle.uncheck();
  await expect(page.locator(`${PAGE} [data-chrx-el="teacher"]`)).toHaveCount(0);
  await expect(subjects.first()).toBeVisible();

  await teacherToggle.check();
  await expect(teachers.first()).toBeVisible();
});
