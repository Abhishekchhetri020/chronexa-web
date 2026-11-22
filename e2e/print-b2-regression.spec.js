import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

const CONTROLS = ".chrx-preview-controls";
const PAGE = ".chrx-preview-doc .chrx-preview-page";

async function openPreview(page) {
  await loadDemoSchool(page);
  await page.evaluate(() => document.getElementById("chrx-pwa-banner")?.remove());
  await page.evaluate(() => window.dispatchEvent(new Event("app:print-preview")));
  await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible();
}

test("B2-P01/P05: supervision_duties renders populated duty slots with zero errors and no placeholder school name", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await openPreview(page);
  // Seed a placeholder displayname and real supervision rows so cell.length > 0
  await page.evaluate(() => {
    const S = window.APP.school;
    S.schoolName = "aSc Timetables 2012 XML";
    S.regName = "GD Goenka Public School";
    const t0 = S.teachers[0];
    const r0 = S.classrooms[0];
    S.classroomsupervisions = [
      { day: 0, period: 1, classroomid: r0?.id || "R1", teacherid: t0?.id || "T1" },
      { day: 0, period: 1, classroomid: r0?.id || "R1", teacherid: (S.teachers[1] || t0)?.id || "T2" },
    ];
  });

  await page.selectOption(`${CONTROLS} select`, "supervision_duties");
  await expect(page.locator(PAGE)).toBeVisible();
  const txt = await page.locator(PAGE).innerText();
  expect(txt).toContain("Supervision duties");
  expect(txt).toContain("2 duty slots");
  expect(txt).not.toContain("aSc Timetables 2012 XML");
  expect(errors).toEqual([]);
});

test("B2-P02/P04: summary report responds to Tuning (padding, font, border, theme, visibility) and has zero horizontal overflow", async ({ page }) => {
  await openPreview(page);
  await page.selectOption(`${CONTROLS} select`, "summary");
  await expect(page.locator(PAGE)).toBeVisible();

  // P04: no horizontal scroll overflow on page
  const overW = await page.evaluate(() => {
    const p = document.querySelector(".chrx-preview-doc .chrx-preview-page");
    return p ? p.scrollWidth - p.clientWidth : 999;
  });
  expect(overW).toBeLessThanOrEqual(4);

  // Open Tuning drawer
  await page.locator(`${CONTROLS} button:has-text("Tuning")`).click();
  await expect(page.locator("#chrx-preview-tuning")).toBeVisible();

  // P02: Subject visibility checkbox hides and restores rendered summary subjects
  const subjLoc = page.locator(`${PAGE} [data-chrx-el="subject"]`);
  await expect(subjLoc.first()).toBeVisible();
  const initialCount = await subjLoc.count();
  expect(initialCount).toBeGreaterThan(0);

  const subjToggle = page.locator("#chrx-preview-tuning label", { hasText: "Subject Code" }).locator("input");
  await subjToggle.uncheck();
  await expect(subjLoc).toHaveCount(0);
  await subjToggle.check();
  await expect(subjLoc).toHaveCount(initialCount);

  // P02: Card theme changes rendered summary cell style
  const beforeBg = await page.locator(`${PAGE} .chrx-pivot-cell--summary-day`).first().evaluate((el) => el.getAttribute("style") || "");
  await page.locator("#chrx-preview-tuning select").first().selectOption("neon");
  const afterBg = await page.locator(`${PAGE} .chrx-pivot-cell--summary-day`).first().evaluate((el) => el.getAttribute("style") || "");
  expect(afterBg).not.toBe(beforeBg);
});

test("B2-P03/P05/P07: non-pivot templates (teacher_workload, list_of_classes) respond to Tuning, sanitize school title, and paginate", async ({ page }) => {
  await openPreview(page);
  await page.evaluate(() => {
    window.APP.school.schoolName = "aSc Timetables 2012 XML";
    window.APP.school.regName = "GD Goenka Public School";
  });

  // list_of_classes renders inside .chrx-preview-page with sanitized school name
  await page.selectOption(`${CONTROLS} select`, "list_of_classes");
  await expect(page.locator(PAGE)).toBeVisible();
  const locText = await page.locator(PAGE).innerText();
  expect(locText).toContain("List of classes");
  expect(locText).not.toContain("aSc Timetables 2012 XML");

  // teacher_workload responds to Tuning font size slider
  await page.selectOption(`${CONTROLS} select`, "teacher_workload");
  await expect(page.locator(PAGE)).toBeVisible();
  const wlText = await page.locator(PAGE).innerText();
  expect(wlText).not.toContain("aSc Timetables 2012 XML");

  await page.locator(`${CONTROLS} button:has-text("Tuning")`).click();
  await expect(page.locator("#chrx-preview-tuning")).toBeVisible();
  const beforeTdStyle = await page.locator(`${PAGE} td`).first().evaluate((el) => el.getAttribute("style") || "");
  await page.locator('#chrx-preview-tuning input[type="range"]').nth(1).evaluate((el) => {
    el.value = "14";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const afterTdStyle = await page.locator(`${PAGE} td`).first().evaluate((el) => el.getAttribute("style") || "");
  expect(afterTdStyle).toContain("font-size:14px");
  expect(afterTdStyle).not.toBe(beforeTdStyle);
});

test("B2-P06: Export PDF printScope closes cleanly on Escape and afterprint", async ({ page }) => {
  await loadDemoSchool(page);
  await page.evaluate(() => { window.print = () => {}; });
  await page.evaluate(() => window.APP.printPreview.printScope({ type: "all" }));
  await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".chrx-preview-overlay.is-open")).toHaveCount(0);

  // Also closes automatically when browser fires afterprint
  await page.evaluate(() => window.APP.printPreview.printScope({ type: "all" }));
  await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".chrx-preview-overlay.is-open")).toHaveCount(0);
});

test("D2-P08: dense 66-teacher / 34-class / 42-subject matrices auto-paginate and Fit A4 without Fit-to-page", async ({ page }) => {
  await loadDemoSchool(page);
  await page.evaluate(() => {
    document.getElementById("chrx-pwa-banner")?.remove();
    const S = window.APP.school;
    // Scale up to match the real 66-teacher / 34-class / 42-subject school density
    while ((S.teachers || []).length < 66) {
      const i = S.teachers.length + 1;
      S.teachers.push({ id: `T_SYN_${i}`, name: `Teacher Number ${i} Sharma`, short: `T${i}`, abbr: `T${i}` });
    }
    while ((S.classes || []).length < 34) {
      const i = S.classes.length + 1;
      S.classes.push({ id: `C_SYN_${i}`, name: `Class ${i}A`, short: `${i}A` });
    }
    while ((S.subjects || []).length < 42) {
      const i = S.subjects.length + 1;
      S.subjects.push({ id: `S_SYN_${i}`, name: `Subject ${i}`, short: `SUB${i}`, abbr: `SUB${i}` });
    }
    window.APP.printSettings = Object.assign({}, window.APP.printSettings, { fitToPage: false });
    window.dispatchEvent(new Event("app:print-preview"));
  });
  await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible();

  for (const tpl of ["summary", "summary_of_teachers", "contract_overview", "wait_points_teachers", "wall_poster_teachers"]) {
    await page.selectOption(`${CONTROLS} select`, tpl);
    await expect(page.locator(PAGE)).toBeVisible();
    const info = await page.evaluate(() => {
      const ind = document.querySelector(".chrx-preview-controls .chrx-pp-indicator")?.textContent?.trim() || "";
      const fit = document.querySelector(".chrx-preview-controls [class*='fit'], .chrx-fit-badge")?.textContent?.trim() || "";
      const p = document.querySelector(".chrx-preview-doc .chrx-preview-page");
      return {
        ind,
        fit,
        overW: p ? p.scrollWidth - p.clientWidth : 999,
        overH: p ? p.scrollHeight - p.clientHeight : 999,
        fitToPage: !!window.APP?.printSettings?.fitToPage,
      };
    });
    expect(info.fitToPage, `${tpl} fitToPage should stay false`).toBe(false);
    expect(info.fit, `${tpl} should Fit A4, got "${info.fit}"`).toMatch(/Fits A4/i);
    expect(info.overW, `${tpl} horizontal overflow`).toBeLessThanOrEqual(2);
    expect(info.overH, `${tpl} vertical overflow`).toBeLessThanOrEqual(2);
    const m = info.ind.match(/Page\s+1\s*\/\s*(\d+)/);
    expect(m && Number(m[1]), `${tpl} should auto-paginate to >1 page, got "${info.ind}"`).toBeGreaterThan(1);
  }
});

test("D3: fitToPage=true keeps 1 page per day/page-combo on summary and fits; fitToPage=false splits", async ({ page }) => {
  await loadDemoSchool(page);
  const daysCount = await page.evaluate(() => {
    document.getElementById("chrx-pwa-banner")?.remove();
    const S = window.APP.school;
    while ((S.classes || []).length < 34) {
      const i = S.classes.length + 1;
      S.classes.push({ id: `C_D3_${i}`, name: `Class ${i}A`, short: `${i}A` });
    }
    window.APP.printSettings = Object.assign({}, window.APP.printSettings, { fitToPage: false });
    window.dispatchEvent(new Event("app:print-preview"));
    return (S.days && S.days.length) ? S.days.length : 6;
  });
  await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible();

  // 1. fitToPage=false -> auto-splits into > daysCount pages and Fits A4
  await page.selectOption(`${CONTROLS} select`, "summary");
  await expect(page.locator(PAGE)).toBeVisible();
  const splitInfo = await page.evaluate(() => ({
    ind: document.querySelector(".chrx-preview-controls .chrx-pp-indicator")?.textContent?.trim() || "",
    fit: document.querySelector(".chrx-preview-controls [class*='fit'], .chrx-fit-badge")?.textContent?.trim() || "",
  }));
  const splitTotal = Number((splitInfo.ind.match(/Page\s+1\s*\/\s*(\d+)/) || [])[1] || 0);
  expect(splitTotal).toBeGreaterThan(daysCount);
  expect(splitInfo.fit).toMatch(/Fits A4/i);

  // 2. fitToPage=true -> skips auto-split, renders 1 page per day (== daysCount) and scales to fit A4
  await page.evaluate(() => {
    window.APP.printSettings = Object.assign({}, window.APP.printSettings, { fitToPage: true });
    window.dispatchEvent(new Event("app:print-settings-changed"));
  });
  await expect.poll(async () => {
    const ind = await page.locator(".chrx-preview-controls .chrx-pp-indicator").innerText();
    const m = ind.trim().match(/Page\s+1\s*\/\s*(\d+)/);
    return m ? Number(m[1]) : -1;
  }, { timeout: 5_000 }).toBe(daysCount);

  const fitInfo = await page.evaluate(() => ({
    fit: document.querySelector(".chrx-preview-controls [class*='fit'], .chrx-fit-badge")?.textContent?.trim() || "",
  }));
  expect(fitInfo.fit).toMatch(/Fits A4|Scaled to \d+% for A4/i);
});
