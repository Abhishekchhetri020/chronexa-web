import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

function selectedCards(page) {
  return page.locator("#editor-root .chrx-vkarta.chrx-vkarta--selected");
}

test.describe("W2-6 card multi-select and clipboard", () => {
  test("Cmd-click three cards → bulk Lock → Cmd+Z restores all three", async ({ page }) => {
    await loadDemoSchool(page);

    const cards = page.locator("#editor-root .chrx-vkarta:not(.locked)");
    await expect(cards.nth(2)).toBeVisible({ timeout: 30_000 });
    const chosen = await cards.evaluateAll(elements =>
      elements.slice(0, 3).map(element => ({ ...element.dataset })));
    expect(chosen).toHaveLength(3);

    for (let i = 0; i < chosen.length; i++) {
      await cards.nth(i).click({ modifiers: ["Meta"] });
    }
    await expect.poll(() => page.evaluate(() => window.APP.editor.selectedCardIds.length)).toBe(3);
    await expect(selectedCards(page)).toHaveCount(3);
    await expect(page.locator('[data-selection-bar]')).toBeVisible();
    await expect(page.locator('[data-selection-count]')).toHaveText("3 selected");

    const before = await page.evaluate(ids => {
      const selected = new Set(ids);
      const key = card => `placed_${card.lessonId}_${card.day}_${card.period}`;
      return window.APP.school.cards
        .filter(card => selected.has(key(card)))
        .map(card => !!card.locked);
    }, await page.evaluate(() => window.APP.editor.selectedCardIds));
    expect(before).toEqual([false, false, false]);

    await page.locator('[data-selection-action="lock"]').click();
    await expect.poll(() => page.evaluate(ids => {
      const selected = new Set(ids);
      const key = card => `placed_${card.lessonId}_${card.day}_${card.period}`;
      return window.APP.school.cards
        .filter(card => selected.has(key(card)))
        .every(card => card.locked === true);
    }, chosen.map(card => card.cardId))).toBe(true);

    await page.keyboard.press("Meta+z");
    await expect.poll(() => page.evaluate(ids => {
      const selected = new Set(ids);
      const key = card => `placed_${card.lessonId}_${card.day}_${card.period}`;
      return window.APP.school.cards
        .filter(card => selected.has(key(card)))
        .map(card => !!card.locked);
    }, chosen.map(card => card.cardId))).toEqual(before);
  });

  test("dragging from empty grid space marquee-selects multiple cards", async ({ page }) => {
    await loadDemoSchool(page);

    const geometry = await page.evaluate(() => {
      const S = window.APP.school;
      const classId = S.classes[0]?.id;
      const classLessons = (S.lessons || []).filter(lesson =>
        (lesson.classIds || []).includes(classId) &&
        lesson.fixedDay == null && lesson.fixedPeriod == null &&
        !lesson.isLabDouble && (lesson.lessonLength || 1) === 1);
      const periods = (S.bell?.periods || []).map(period => Number(period.index))
        .filter(Number.isFinite);
      if (!classId || classLessons.length < 3 || periods.length < 4) {
        throw new Error("Demo has no deterministic marquee fixture");
      }
      S.cards = classLessons.slice(0, 3).map((lesson, index) => ({
        lessonId: lesson.id,
        day: 0,
        period: periods[index],
        classroomId: lesson.preferredRoomId,
      }));
      window.CreateNew.refreshIndex();
      window.APP.history.clear();
      window.APP.editor.perspective = "class";
      window.APP.editor.viewMode = "focus";
      window.APP.editor.selectedClassId = classId;
      window.APP.editor.focusRowByPerspective = {
        ...(window.APP.editor.focusRowByPerspective || {}),
        class: classId,
      };
      window.Editor.render(document.querySelector("#editor-root"));

      const root = document.querySelector("#editor-root");
      const cards = [...root.querySelectorAll(".chrx-vkarta")].map(element => ({
        id: element.dataset.cardId,
        rect: (() => {
          const r = element.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        })(),
      }));
      const empties = [...root.querySelectorAll(".chrx-slot.empty:not(.out-of-bell)")]
        .map(element => {
          const r = element.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
      const points = cards.flatMap(({ rect }) => [
        { x: rect.left, y: rect.top },
        { x: rect.right, y: rect.bottom },
        { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 },
      ]);
      const countIn = (start, end) => {
        const left = Math.min(start.x, end.x);
        const right = Math.max(start.x, end.x);
        const top = Math.min(start.y, end.y);
        const bottom = Math.max(start.y, end.y);
        return cards.filter(({ rect }) =>
          rect.right >= left && rect.left <= right &&
          rect.bottom >= top && rect.top <= bottom).length;
      };

      let best = null;
      for (const start of empties) {
        for (const end of points) {
          const count = countIn(start, end);
          if ((!best || count > best.count) && count >= 2 &&
              Math.hypot(start.x - end.x, start.y - end.y) > 8) {
            best = { start, end, count };
          }
        }
      }
      if (!best) throw new Error("Demo focus grid has no marquee rectangle containing two cards");
      return best;
    });

    await page.mouse.move(geometry.start.x, geometry.start.y);
    await page.mouse.down();
    await page.mouse.move(geometry.end.x, geometry.end.y, { steps: 8 });
    await page.mouse.up();

    await expect.poll(() => page.evaluate(() => window.APP.editor.selectedCardIds.length))
      .toBeGreaterThanOrEqual(2);
    await expect(selectedCards(page)).toHaveCount(geometry.count);
    await expect(page.locator('[data-selection-bar]')).toBeVisible();
  });

  test("copy/paste creates only the remaining weekly lesson count", async ({ page }) => {
    await loadDemoSchool(page);

    const fixture = await page.evaluate(() => {
      const S = window.APP.school;
      const candidate = (S.lessons || []).find(lesson => {
        const source = (S.cards || []).find(card => card.lessonId === lesson.id && !card.locked);
        return source && !lesson.isLabDouble && (lesson.lessonLength || 1) === 1 &&
          lesson.fixedDay == null && lesson.fixedPeriod == null &&
          (lesson.classIds || []).length && Number(lesson.periodsPerWeek) >= 2;
      });
      if (!candidate) throw new Error("Demo has no repeatable single-period lesson");
      const source = S.cards.find(card => card.lessonId === candidate.id && !card.locked);
      const roomId = source.classroomId || candidate.preferredRoomId;
      const periods = (S.bell?.periods || []).map(period => Number(period.index))
        .filter(Number.isFinite);
      const days = Math.max(1, Math.min(6, Number(S.daysPerWeek) || 6));
      candidate.periodsPerWeek = 2;
      S.cards = [{
        lessonId: source.lessonId,
        day: Number(source.day),
        period: Number(source.period),
        classroomId: roomId,
      }];
      window.CreateNew.refreshIndex();
      window.APP.history.clear();
      window.APP.editor.perspective = "class";
      window.APP.editor.viewMode = "focus";
      window.APP.editor.selectedClassId = candidate.classIds[0];
      window.APP.editor.focusRowByPerspective = {
        ...(window.APP.editor.focusRowByPerspective || {}),
        class: candidate.classIds[0],
      };

      const targets = [];
      for (let day = 0; day < days && targets.length < 2; day++) {
        for (const period of periods) {
          if (day === Number(source.day) && period === Number(source.period)) continue;
          const validity = window.Placement.classify(candidate.id, day, period, roomId, []).validity;
          if (validity !== "red") targets.push({ day, period });
        }
      }
      if (targets.length < 2) throw new Error("Fixture has fewer than two legal paste targets");
      window.Editor.render(document.querySelector("#editor-root"));
      return {
        lessonId: candidate.id,
        source: { day: Number(source.day), period: Number(source.period) },
        targets,
        classId: candidate.classIds[0],
      };
    });

    const source = page.locator(
      `#editor-root .chrx-vkarta[data-lesson-id="${fixture.lessonId}"][data-day="${fixture.source.day}"][data-period="${fixture.source.period}"]`
    ).first();
    await expect(source).toBeVisible();
    await source.click({ modifiers: ["Meta"] });
    await page.keyboard.press("Meta+c");

    const firstTarget = page.locator(
      `#editor-root .chrx-slot.empty[data-row="${fixture.classId}"][data-day="${fixture.targets[0].day}"][data-period="${fixture.targets[0].period}"]`
    ).first();
    await expect(firstTarget).toBeVisible();
    await firstTarget.hover();
    await page.keyboard.press("Meta+v");
    await expect.poll(() => page.evaluate(lessonId =>
      window.APP.school.cards.filter(card => card.lessonId === lessonId).length,
    fixture.lessonId)).toBe(2);

    const secondTarget = page.locator(
      `#editor-root .chrx-slot.empty[data-row="${fixture.classId}"][data-day="${fixture.targets[1].day}"][data-period="${fixture.targets[1].period}"]`
    ).first();
    await expect(secondTarget).toBeVisible();
    await secondTarget.hover();
    await page.keyboard.press("Meta+v");
    await expect.poll(() => page.evaluate(lessonId =>
      window.APP.school.cards.filter(card => card.lessonId === lessonId).length,
    fixture.lessonId)).toBe(2);
  });
});

test("read-only perspectives (student, supervision) cannot select, bulk-edit or paste", async ({ page }) => {
  await loadDemoSchool(page);
  const count = () => page.evaluate(() => window.APP.school.cards.length);
  const n0 = await count();
  await page.evaluate(() => { window.APP.editor.perspective = "student"; window.Editor.render(document.querySelector(".chrx-editor")); });
  const cards = page.locator("#editor-root .chrx-vkarta");
  await cards.nth(0).click({ modifiers: ["ControlOrMeta"] });
  await cards.nth(1).click({ modifiers: ["ControlOrMeta"] });
  expect(await page.evaluate(() => window.APP.editor.selectedCardIds.length)).toBe(0);
  await expect(page.locator("[data-selection-bar]")).toBeHidden();
  await page.keyboard.press("ControlOrMeta+v");
  expect(await count()).toBe(n0);
});
