import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

/**
 * Lane W3b-7 — week / term filters in the grid.
 *
 * A user flow, not an API call: look at the whole school, restrict one lesson
 * to Week A and another to Term 1 (through the app's own write path), then use
 * the editor's week/term filter to look at one week and one term, watch the
 * card and the unplaced count follow, and get the filter back from a saved view.
 */

async function openOverview(page) {
  await page.locator('[data-focus-nav="overview"]').click();
  await expect(page.locator("#editor-root .chrx-grid")).toBeVisible();
}

function cardsFor(page, lessonId) {
  return page.locator(`#editor-root .chrx-vkarta[data-lesson-id="${lessonId}"]`);
}

async function openFilterPanel(page) {
  const btn = page.locator("#editor-view-filter");
  const panel = page.locator(".chrx-view-filter-panel");
  if (!(await panel.isVisible().catch(() => false))) await btn.click();
  await expect(panel).toBeVisible();
  return panel;
}

async function chooseWeek(page, value) {
  const panel = await openFilterPanel(page);
  await panel.locator("#chrx-vf-week").selectOption(value);
  return panel;
}

async function chooseTerm(page, value) {
  const panel = await openFilterPanel(page);
  await panel.locator("#chrx-vf-term").selectOption(value);
  return panel;
}

test.describe("Lane W3b-7: week / term filters in the grid", () => {
  test("the focus board — the view the editor opens in — follows the filter too", async ({ page }) => {
    await loadDemoSchool(page);

    // The focus board draws one class, so the restricted lesson has to belong to
    // that class for the assertion to mean anything.
    const focusClassId = await page.locator(".chrx-class-rail__item.is-active").getAttribute("data-class-id");
    expect(focusClassId).toBeTruthy();

    const setup = await page.evaluate((classId) => {
      const T = window.ViewFilter.__test;
      const ids = T.seedPatterns();
      const S = window.APP.school;
      const cardsFor = (id) => (S.cards || []).filter((c) => c.lessonId === id);
      const lesson = S.lessons.find((l) => (l.classIds || []).includes(classId) && cardsFor(l.id).length >= 2);
      T.restrictLesson(lesson.id, { weeksDefId: ids.weekA });
      return { ids, lessonId: lesson.id, count: cardsFor(lesson.id).length };
    }, focusClassId);
    expect(setup.count).toBeGreaterThan(1);

    const cards = page.locator(`#editor-root .chrx-vkarta[data-lesson-id="${setup.lessonId}"]`);
    await expect(cards).toHaveCount(setup.count);
    await expect(page.locator("#editor-view-filter")).toHaveText(/all weeks/i);

    // Week B on the focus board: the Week-A lesson is gone, and the toolbar says why.
    await page.evaluate((weekId) => window.ViewFilter.setAxis("week", weekId), setup.ids.weekB);
    await expect(cards).toHaveCount(0);
    await expect(page.locator("#editor-view-filter")).toHaveText(/week b/i);
    await expect(page.locator("#editor-view-filter")).toHaveAttribute("aria-pressed", "true");

    await page.evaluate(() => window.ViewFilter.clear());
    await expect(cards).toHaveCount(setup.count);
    await expect(page.locator("#editor-view-filter")).toHaveText(/all weeks/i);
  });

  test("weeks and terms trim the grid, the unplaced tray follows, and a saved view restores the filter", async ({ page }) => {
    await loadDemoSchool(page);
    await openOverview(page);

    // 1. Default state: no filter, the control says so and hides nothing.
    const filterBtn = page.locator("#editor-view-filter");
    await expect(filterBtn).toBeVisible();
    await expect(filterBtn).toHaveText(/all weeks/i);

    // 2. Restrict real demo lessons through the app's own write path (APP.mutate):
    //    one to Week A, one to Term 1, and add an unplaced lesson scoped to Week A.
    const seeded = await page.evaluate(() => {
      const T = window.ViewFilter.__test;
      const ids = T.seedPatterns();
      const S = window.APP.school;
      const cardsFor = (id) => (S.cards || []).filter((c) => c.lessonId === id);
      const withCards = S.lessons.filter((l) => cardsFor(l.id).length >= 2);
      const weekLesson = withCards[0];
      const termLesson = withCards[1];
      T.restrictLesson(weekLesson.id, { weeksDefId: ids.weekA });
      T.restrictLesson(termLesson.id, { termsDefId: ids.term1 });
      const unplacedLessonId = T.addUnplacedLesson({ weeksDefId: ids.weekA, periodsPerWeek: 1 });
      return {
        ids,
        weekLessonId: weekLesson.id,
        weekCards: cardsFor(weekLesson.id).length,
        termLessonId: termLesson.id,
        termCards: cardsFor(termLesson.id).length,
        unplacedLessonId,
      };
    });
    expect(seeded.weekCards).toBeGreaterThan(1);
    expect(seeded.termCards).toBeGreaterThan(1);
    expect(seeded.unplacedLessonId).toBeTruthy();

    const weekCards = cardsFor(page, seeded.weekLessonId);
    const termCards = cardsFor(page, seeded.termLessonId);

    // Both lessons are on the grid while the filter is "All weeks".
    await expect(weekCards).toHaveCount(seeded.weekCards);
    await expect(termCards).toHaveCount(seeded.termCards);

    // 3. Week filter → the Week A lesson survives, the Term 1-only lesson is not
    //    affected (its week pattern is unrestricted), everything else is trimmed.
    const allCardCount = await page.locator("#editor-root .chrx-vkarta").count();
    const panel = await chooseWeek(page, seeded.ids.weekB);
    await expect(weekCards).toHaveCount(0);
    await expect(termCards).toHaveCount(seeded.termCards);
    await expect(panel.locator("#chrx-vf-summary")).toContainText(/hidden/i);
    await expect(filterBtn).toHaveText(/week b/i);
    expect(await page.locator("#editor-root .chrx-vkarta").count()).toBeLessThan(allCardCount);

    // …and back: Week A shows it again, All weeks shows everything again.
    await chooseWeek(page, seeded.ids.weekA);
    await expect(weekCards).toHaveCount(seeded.weekCards);
    await chooseWeek(page, "all");
    await expect(weekCards).toHaveCount(seeded.weekCards);
    await expect(page.locator("#editor-root .chrx-vkarta")).toHaveCount(allCardCount);

    // 4. Term filter → same story on the term axis.
    await chooseTerm(page, seeded.ids.term2);
    await expect(termCards).toHaveCount(0);
    await expect(weekCards).toHaveCount(seeded.weekCards); // no week restriction active
    await chooseTerm(page, seeded.ids.term1);
    await expect(termCards).toHaveCount(seeded.termCards);
    await chooseTerm(page, "all");
    await expect(termCards).toHaveCount(seeded.termCards);

    // 5. The unplaced tray and its counts respect the filter.
    await expect(page.locator("#pending-count")).toHaveText(/^\(1 unplaced\)$/);
    await expect(page.locator("#editor-unplaced-count")).toContainText(/1 unplaced/);

    const trayPanel = await chooseWeek(page, seeded.ids.weekB);
    await expect(page.locator("#pending-count")).toHaveText(/^\(0 unplaced\)$/);
    await expect(page.locator("#editor-unplaced-count")).not.toContainText(/unplaced/);
    expect(trayPanel).toBeTruthy(); // (the panel stays open across a filter change)
    await expect(page.locator(".chrx-pending-scroll")).toContainText(/every lesson is on the timetable/i);

    await chooseWeek(page, seeded.ids.weekA);
    await expect(page.locator("#pending-count")).toHaveText(/^\(1 unplaced\)$/);

    // 6. The filter is view state captured by a saved view: save "Week B", wander
    //    off to All weeks, then apply the view and the grid is filtered again.
    await chooseWeek(page, seeded.ids.weekB);
    await expect(weekCards).toHaveCount(0);
    await page.evaluate(() => window.SavedViews.save("Week B only"));
    await expect.poll(() => page.evaluate(() =>
      (window.APP.school.savedViews || []).map((v) => ({ name: v.name, week: v.weekFilter }))))
      .toEqual([{ name: "Week B only", week: seeded.ids.weekB }]);

    await chooseWeek(page, "all");
    await expect(weekCards).toHaveCount(seeded.weekCards);

    await page.evaluate(() => window.SavedViews.apply("Week B only"));
    await expect(filterBtn).toHaveText(/week b/i);
    await expect(weekCards).toHaveCount(0);

    const restored = await openFilterPanel(page);
    await expect(restored.locator("#chrx-vf-week")).toHaveValue(seeded.ids.weekB);
    await expect(restored.locator("#chrx-vf-term")).toHaveValue("all");

    // 7. "Show all weeks & terms" clears both axes.
    await restored.locator("#chrx-vf-reset").click();
    await expect(weekCards).toHaveCount(seeded.weekCards);
    await expect(filterBtn).toHaveText(/all weeks/i);
  });
});
