import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

async function firstPlacedCard(page) {
  const card = page.locator("#editor-root .chrx-vkarta").first();
  await expect(card).toBeVisible();
  return { card, meta: await card.evaluate((el) => ({ ...el.dataset })) };
}

test.describe("Lane L1 — editor card state", () => {
  test("Delete unplaces a click-picked card and refreshes the pending strip", async ({ page }) => {
    await loadDemoSchool(page);
    const { card, meta } = await firstPlacedCard(page);
    const before = await page.evaluate(lessonId => window.APP.school.cards.filter(c => c.lessonId === lessonId).length, meta.lessonId);

    await card.click();
    await expect.poll(() => page.evaluate(() => window.APP.editor.cardInHand?.mode)).toBe("click");

    await page.keyboard.press("Delete");

    await expect.poll(() => page.evaluate(({ lessonId }) => ({
      held: window.APP.editor.cardInHand,
      placed: window.APP.school.cards.filter(c => c.lessonId === lessonId).length,
    }), { lessonId: meta.lessonId })).toEqual({ held: null, placed: before - 1 });
    await expect(page.locator(`#pending-strip-root [data-lesson-id="${meta.lessonId}"]`)).toHaveCount(1);
    await expect(page.locator("#pending-strip-root")).not.toContainText("Every lesson is on the timetable.");
    await expect(page.locator("#editor-unplaced-count")).toHaveText(/1 unplaced/);
  });

  test("Escape restores a click-picked card and clears the unplaced count", async ({ page }) => {
    await loadDemoSchool(page);
    const { card, meta } = await firstPlacedCard(page);

    await card.click();
    await expect.poll(() => page.evaluate(() => window.APP.editor.cardInHand?.mode)).toBe("click");
    await page.keyboard.press("Escape");

    await expect.poll(() => page.evaluate(({ lessonId, day, period }) => ({
      held: window.APP.editor.cardInHand,
      restored: window.APP.school.cards.some(c => c.lessonId === lessonId && c.day === Number(day) && c.period === Number(period)),
    }), meta)).toEqual({ held: null, restored: true });
    await expect(page.locator("#editor-unplaced-count")).toHaveText(/all placed/i);
    await expect(page.locator("#pending-count")).toHaveText("(0 unplaced)");
    await expect(page.locator("#pending-strip-root [data-card-id]")).toHaveCount(0);
  });

  test("dropping one occurrence onto another occurrence of the same lesson is lossless", async ({ page }) => {
    await loadDemoSchool(page);

    const pair = await page.evaluate(() => {
      const S = window.APP.school;
      const byLesson = new Map();
      for (const card of S.cards) {
        const lesson = S._idx.lessonById[card.lessonId];
        if (!lesson || !(lesson.classIds || []).some(id => S._idx.classById[id]?.name === "VI A")) continue;
        const list = byLesson.get(card.lessonId) || [];
        list.push(card);
        byLesson.set(card.lessonId, list);
      }
      const found = [...byLesson.entries()].find(([, cards]) => cards.length >= 2);
      if (!found) return null;
      const [lessonId, cards] = found;
      const classId = S._idx.lessonById[lessonId].classIds.find(id => S._idx.classById[id]?.name === "VI A");
      window.APP.editor.viewMode = "focus";
      window.APP.editor.focusRowByPerspective.class = classId;
      window.Editor.render(document.querySelector("#editor-root"));
      return {
        lessonId,
        source: cards[0],
        target: cards[1],
      };
    });
    expect(pair).not.toBeNull();

    const source = page.locator(`#editor-root .chrx-vkarta[data-lesson-id="${pair.lessonId}"][data-day="${pair.source.day}"][data-period="${pair.source.period}"]`).first();
    const target = page.locator(`#editor-root .chrx-vkarta[data-lesson-id="${pair.lessonId}"][data-day="${pair.target.day}"][data-period="${pair.target.period}"]`).first();
    await expect(source).toBeVisible();
    await expect(target).toBeVisible();
    const before = await page.evaluate(lessonId => window.APP.school.cards.filter(c => c.lessonId === lessonId).length, pair.lessonId);

    const from = await source.boundingBox();
    const to = await target.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect.poll(() => page.evaluate(lessonId => ({
      held: window.APP.editor.cardInHand,
      count: window.APP.school.cards.filter(c => c.lessonId === lessonId).length,
    }), pair.lessonId)).toMatchObject({ held: null, count: before });
    await expect(page.locator(`#editor-root .chrx-vkarta[data-lesson-id="${pair.lessonId}"][data-day="${pair.source.day}"][data-period="${pair.source.period}"]`)).toHaveCount(1);
    await expect(page.locator(`#editor-root .chrx-vkarta[data-lesson-id="${pair.lessonId}"][data-day="${pair.target.day}"][data-period="${pair.target.period}"]`)).toHaveCount(1);
    await expect(page.locator(`#pending-strip-root [data-lesson-id="${pair.lessonId}"]`)).toHaveCount(0);
  });

  test("double-clicking a placed card opens Lessons focused on that lesson", async ({ page }) => {
    await loadDemoSchool(page);
    const { card, meta } = await firstPlacedCard(page);
    const box = await card.boundingBox();
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

    const dialog = page.locator(".chrx-ent-dialog");
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.APP.editor.cardInHand)).toBeNull();
    const lessonRow = dialog.locator(`[data-id="${meta.lessonId}"]`);
    await expect(lessonRow).toHaveCount(1);
    await expect(lessonRow).toHaveClass(/is-selected/);
  });
});
