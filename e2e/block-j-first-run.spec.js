import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe("Block J — First-run experience (empty school -> printed timetable)", () => {
  test("J1: a stranger starting from an empty school reaches a printed timetable without help", async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      window.__printCalls = 0;
      window.print = () => { window.__printCalls += 1; };
    });

    const t0 = Date.now();
    await page.goto("/");
    await page.waitForFunction(() => window.APP && window.SolverUI && window.Editor);

    // 1. Click "Start with a school template" -> pick "Blank — I'll set up everything"
    await page.locator("#cta-build-new").click();
    const blankChoice = page.getByRole("button", { name: /Blank — I'll set up everything/i }).first();
    await expect(blankChoice).toBeVisible({ timeout: 10_000 });
    await blankChoice.click();

    // 2. Lands directly on Editor (#step-6) with Get Started checklist visible (no School Info, no blocking wizard, no Restored toast)
    await expect(page.locator("#step-2")).toHaveClass(/hidden/);
    await expect(page.locator("#chrx-hero-progress")).toHaveText("0 of 4 required steps done", { timeout: 10_000 });
    await expect(page.locator("#chrx-hero-sample-btn")).toBeVisible();
    await expect(page.locator(".chrx-hero-tile[data-kind='subjects']")).toHaveAttribute("data-next", "true");
    await expect(page.locator(".chrx-hero-tile[data-kind='classrooms']")).toContainText(/Optional/i);
    await expect(page.locator("#chrx-autosave-pill")).toHaveCount(0);

    // 3. Clicking Generate or Print preview on empty school shows plain-English guard, never opens empty dialog
    await page.locator("button.chrx-btn--primary, #cta-generate", { hasText: "Generate" }).first().click();
    await page.waitForTimeout(250);
    await expect(page.locator(".csu-prelaunch")).toBeHidden();
    const noLessonsOverlay = page.locator("#chrx-no-lessons-overlay");
    if (await noLessonsOverlay.isVisible().catch(() => false)) {
      await expect(noLessonsOverlay).toContainText(/No lessons to schedule yet/i);
      await noLessonsOverlay.locator("[data-close]").click();
      await expect(noLessonsOverlay).toBeHidden();
    }

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:print-preview")));
    await page.waitForTimeout(200);
    await expect(page.locator(".chrx-preview-overlay.is-open")).toHaveCount(0);

    // 4. Use Quick Add for Subject -> Teacher -> Class (auto-selected in order!)
    const form = page.locator("[data-quick-add]");
    await form.locator("select[name='kind']").selectOption("subjects");
    await form.locator("input[name='name']").fill("Mathematics");
    await form.locator("input[name='abbr']").fill("Math");
    await form.locator("button[type='submit']").click();
    await expect(page.locator("#chrx-hero-progress")).toHaveText("1 of 4 required steps done", { timeout: 5_000 });
    await expect(page.locator(".chrx-hero-tile[data-kind='teachers']")).toHaveAttribute("data-next", "true");

    await form.locator("select[name='kind']").selectOption("teachers");
    await form.locator("input[name='name']").fill("Ms. Priya");
    await form.locator("input[name='abbr']").fill("MP");
    await form.locator("button[type='submit']").click();
    await expect(page.locator("#chrx-hero-progress")).toHaveText("2 of 4 required steps done", { timeout: 5_000 });
    await expect(page.locator(".chrx-hero-tile[data-kind='classes']")).toHaveAttribute("data-next", "true");

    await form.locator("select[name='kind']").selectOption("classes");
    await form.locator("input[name='name']").fill("Grade 1A");
    await form.locator("input[name='abbr']").fill("1A");
    await form.locator("button[type='submit']").click();
    await expect(page.locator("#chrx-hero-progress")).toHaveText("3 of 4 required steps done", { timeout: 5_000 });

    // Ready banner + "Add first lesson ->" CTA appears
    await expect(page.locator("#chrx-hero-ready")).toBeVisible();
    await page.locator("#chrx-hero-first-lesson").click();

    // 5. Add first lesson in the Lessons dialog
    const addLessonBtn = page.locator(".chrx-ent-dialog button", { hasText: /New|Add/i }).first();
    await expect(addLessonBtn).toBeVisible({ timeout: 10_000 });
    await addLessonBtn.click();

    const sheet = page.locator(".chrx-ent-sheet").first();
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    const subjSelect = sheet.locator("select").first();
    await subjSelect.selectOption({ index: 1 });
    const classCheckbox = sheet.locator("input[type='checkbox']").first();
    if (!(await classCheckbox.isChecked())) await classCheckbox.check();
    const teacherCheckbox = sheet.getByRole("checkbox", { name: /Ms\. Priya/i });
    if (await teacherCheckbox.count()) {
      if (!(await teacherCheckbox.first().isChecked())) await teacherCheckbox.first().check();
    }
    const saveBtn = sheet.getByRole("button", { name: /^(Save|Save changes|Add|Create)$/i }).first();
    await saveBtn.click();
    await expect(sheet).toBeHidden({ timeout: 10_000 });

    // Close Lessons dialog -> editor grid opens automatically!
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor-root .chrx-grid, #editor-root .chrx-focus-board").first()).toBeVisible({ timeout: 10_000 });

    // 6. Generate -> Build timetable -> Use this timetable
    await page.locator("button.chrx-btn--primary, #cta-generate", { hasText: "Generate" }).first().click();
    await expect(page.locator("#csu-prelaunch-start")).toBeVisible({ timeout: 10_000 });
    await page.locator("#csu-prelaunch-start").click();

    await expect(page.locator("#csu-result-apply")).toBeVisible({ timeout: 30_000 });
    await page.locator("#csu-result-apply").click();
    await expect(page.locator(".csu-result")).toBeHidden({ timeout: 5_000 });

    const placedCount = await page.evaluate(() => (window.APP?.school?.cards || []).length);
    expect(placedCount).toBeGreaterThan(0);

    // 7. Print preview -> verify A4 page has our lesson & class -> Print
    await page.keyboard.press("Control+p");
    await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible({ timeout: 15_000 });
    const firstPage = page.locator(".chrx-preview-doc .chrx-preview-page").first();
    await expect(firstPage).toBeVisible({ timeout: 15_000 });
    const pageText = await firstPage.innerText();
    expect(pageText).toMatch(/Math|Mathematics/i);
    expect(pageText).toMatch(/1A|Grade 1A/i);

    await page.keyboard.press("Control+p");
    await expect.poll(async () => page.evaluate(() => window.__printCalls), { timeout: 10_000 }).toBeGreaterThan(0);

    const elapsedMs = Date.now() - t0;
    console.log(`BLOCK_J_STRANGER_TIME_MS=${elapsedMs} (${(elapsedMs / 1000).toFixed(1)}s) placed=${placedCount}`);
  });

  test("J2: sample school is one click away from an empty school", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    await page.waitForFunction(() => window.APP && window.SolverUI && window.Editor);

    await page.locator("#cta-build-new").click();
    await page.getByRole("button", { name: /Blank — I'll set up everything/i }).first().click();

    await expect(page.locator("#chrx-hero-sample-btn")).toBeVisible({ timeout: 10_000 });
    await page.locator("#chrx-hero-sample-btn").click();
    await page.locator("#editor-root .chrx-vkarta").first().waitFor({ timeout: 30_000 });

    const cards = await page.evaluate(() => (window.APP?.school?.cards || []).length);
    expect(cards).toBeGreaterThan(500);
  });

  test("J3: template picker polish, clean Blank landing, collapsed Advanced sidebar, no stray tab bar, SVG School Info icons", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForFunction(() => window.APP && window.SolverUI && window.Editor);

    // 1. Template picker: sans-serif heading, plain subtitles (no raw tags), plain Cancel, balanced full-width Blank card
    await page.locator("#cta-build-new").click();
    const panel = page.locator(".chrx-tpl-modal__panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    const panelText = await panel.innerText();
    expect(panelText).not.toMatch(/·\s*(indian|western)\b/i);
    expect(panelText).not.toMatch(/keep my current school/i);
    await expect(panel.locator(".chrx-tpl-cancel")).toHaveText("Cancel");
    const titleFont = await panel.locator(".chrx-tpl-title").evaluate((el) => getComputedStyle(el).fontFamily);
    expect(titleFont).toMatch(/sans-serif/i);
    expect(titleFont).not.toMatch(/times|georgia|fraunces|playfair/i);

    const shotDir = path.resolve("docs/neon/ui-shots/block-j2");
    fs.mkdirSync(shotDir, { recursive: true });
    await page.screenshot({ path: path.join(shotDir, "1-templates-after.png") });

    // 2. Pick Blank -> lands directly on Editor with Get Started checklist, no Restored toast, no stray + New tab
    await panel.getByRole("button", { name: /Blank — I'll set up everything/i }).click();
    await expect(page.locator("#chrx-hero-progress")).toHaveText("0 of 4 required steps done", { timeout: 10_000 });
    await expect(page.locator("#chrx-hero-sample-btn")).toBeVisible();
    await expect(page.locator("#step-2")).toHaveClass(/hidden/);
    await expect(page.locator("#chrx-autosave-pill")).toHaveCount(0);
    await expect(page.locator("#chrx-tab-bar")).toBeHidden();

    // 3. Sidebar: open sidebar if collapsed in editor workspace; Basics expanded, Advanced collapsed by default
    const advGroup = page.locator("details.chrx-side-group[data-section='advanced']");
    if (!(await advGroup.isVisible().catch(() => false))) {
      await page.locator("button[aria-label='Toggle sidebar']").click();
    }
    await expect(advGroup).toBeVisible();
    await expect(advGroup).not.toHaveAttribute("open", "");

    await page.screenshot({ path: path.join(shotDir, "2-empty-school-after.png") });

    // 4. School Info subtitle is plain English (not "parsed from your XML") and sub-nav uses SVG line icons, zero emoji
    await page.evaluate(() => window.showStep && window.showStep(2));
    await expect(page.locator("#step-2")).not.toHaveClass(/hidden/);
    const step2Desc = await page.locator('#step-2 [data-i18n="step2Desc"]').innerText();
    expect(step2Desc).not.toMatch(/parsed from your XML/i);
    const svgCount = await page.locator("#step-2 .chrx-hub__navicon svg").count();
    expect(svgCount).toBe(8);
  });
});
