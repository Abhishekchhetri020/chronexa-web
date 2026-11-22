import { test, expect } from "@playwright/test";

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

    // Dismiss onboarding walkthrough wizard if it opens on top of the Get Started checklist
    const closeWalkthrough = page.locator("button[aria-label='Close wizard'], .chrx-wiz-close, .chrx-modal-close, button[aria-label='Close']").first();
    await closeWalkthrough.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    if (await closeWalkthrough.isVisible().catch(() => false)) {
      await closeWalkthrough.click();
    }

    // 2. Verify Get Started checklist, progress counter, one-click sample school, and next-step highlight
    await expect(page.locator("#chrx-hero-progress")).toHaveText("0 of 4 required steps done", { timeout: 10_000 });
    await expect(page.locator("#chrx-hero-sample-btn")).toBeVisible();
    await expect(page.locator(".chrx-hero-tile[data-kind='subjects']")).toHaveAttribute("data-next", "true");
    await expect(page.locator(".chrx-hero-tile[data-kind='classrooms']")).toContainText(/Optional/i);

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
    // Select our subject (Mathematics), class (Grade 1A), and teacher (Ms. Priya)
    const subjSelect = sheet.locator("select").first();
    await subjSelect.selectOption({ index: 1 });
    // Select our class (Grade 1A) and teacher (Ms. Priya)
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
    const closeWalkthrough = page.locator("button[aria-label='Close wizard'], .chrx-wiz-close, .chrx-modal-close, button[aria-label='Close']").first();
    await closeWalkthrough.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    if (await closeWalkthrough.isVisible().catch(() => false)) {
      await closeWalkthrough.click();
    }

    await expect(page.locator("#chrx-hero-sample-btn")).toBeVisible({ timeout: 10_000 });
    await page.locator("#chrx-hero-sample-btn").click();
    await page.locator("#editor-root .chrx-vkarta").first().waitFor({ timeout: 30_000 });

    const cards = await page.evaluate(() => (window.APP?.school?.cards || []).length);
    expect(cards).toBeGreaterThan(500);
  });
});
