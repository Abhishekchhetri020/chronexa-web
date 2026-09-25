import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test.describe("W2-1 card transactions", () => {
  test("Delete is one undo step and redo deletes the exact card again", async ({ page }) => {
    await loadDemoSchool(page);

    // Choose a card from the rendered focus row. The first model card is not
    // guaranteed to belong to the currently visible class row.
    const lockable = await page.locator("#editor-root .chrx-vkarta:not(.locked)").evaluateAll((elements) => {
      const S = window.APP.school;
      for (const element of elements) {
        const meta = { ...element.dataset };
        const card = (S.cards || []).find(candidate =>
          candidate.lessonId === meta.lessonId &&
          String(candidate.day) === meta.day &&
          String(candidate.period) === meta.period);
        const lesson = card && S._idx.lessonById[card.lessonId];
        if (card && lesson && lesson.fixedDay == null && lesson.fixedPeriod == null) {
          return { lessonId: card.lessonId, day: card.day, period: card.period };
        }
      }
      throw new Error("Visible demo has no unlocked non-fixed card");
    });
    const card = page.locator(`#editor-root .chrx-vkarta:not(.locked)[data-lesson-id="${lockable.lessonId}"][data-day="${lockable.day}"][data-period="${lockable.period}"]`).first();
    await expect(card).toBeVisible();
    const meta = await card.evaluate((el) => ({ ...el.dataset }));
    const before = await page.evaluate(() => JSON.stringify(window.APP.school.cards));

    await card.click();
    await expect.poll(() => page.evaluate(() => window.APP.editor.cardInHand?.mode)).toBe("click");
    await page.keyboard.press("Delete");

    const afterDelete = await page.evaluate(() => ({
      cards: JSON.stringify(window.APP.school.cards),
      canUndo: window.APP.history.canUndo,
    }));
    expect(afterDelete.canUndo).toBe(true);
    expect(afterDelete.cards).not.toBe(before);

    await page.keyboard.press("Meta+z");
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.APP.school.cards))).toBe(before);

    await page.keyboard.press("Meta+Shift+z");
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.APP.school.cards))).toBe(afterDelete.cards);
    expect(await page.evaluate(({ lessonId, day, period }) =>
      window.APP.school.cards.some(c => c.lessonId === lessonId && c.day === Number(day) && c.period === Number(period)), meta)).toBe(false);
  });

  test("drag move is one undo step and restores the original slot", async ({ page }) => {
    await loadDemoSchool(page);

    const selection = await page.evaluate(() => {
      const S = window.APP.school;
      const periods = (S.bell?.periods || []).map(p => Number(p.index)).filter(Number.isFinite);
      const days = Math.max(1, Math.min(6, Number(S.daysPerWeek) || 6));
      const candidates = (S.cards || []).map(card => ({
        card,
        lesson: S._idx.lessonById[card.lessonId],
        roomId: card.classroomId || S._idx.lessonById[card.lessonId]?.preferredRoomId,
      })).filter(({ card, lesson, roomId }) =>
        card && lesson && roomId && !lesson.isLabDouble && (lesson.lessonLength || 1) === 1 &&
        lesson.fixedDay == null && lesson.fixedPeriod == null && !card.locked
      );

      let chosen = null;
      for (const candidate of candidates) {
        const { card, lesson, roomId } = candidate;
        const targets = [];
        for (let day = 0; day < days; day++) {
          for (const period of periods) {
            if (day === Number(card.day) && period === Number(card.period)) continue;
            const validity = window.Placement.classify(card.lessonId, day, period, roomId, []).validity;
            if (validity !== "red") targets.push({ day, period });
          }
        }
        if (targets.length) {
          targets.sort((a, b) =>
            (Math.abs(a.day - Number(card.day)) * 10 + Math.abs(a.period - Number(card.period))) -
            (Math.abs(b.day - Number(card.day)) * 10 + Math.abs(b.period - Number(card.period))));
          chosen = { ...candidate, target: targets[0] };
          break;
        }
      }
      if (!chosen) throw new Error("Demo has no unlocked single-period card with a legal move target");

      // The stock demo is deliberately conflict-heavy. Reduce this fixture to
      // the selected real card, preserving the actual lesson/room data while
      // making the pointer gesture deterministic and the before/after arrays
      // small enough to compare exactly.
      S.cards = [{ ...chosen.card }];
      window.CreateNew.refreshIndex();
      window.APP.history.clear();
      window.APP.editor.perspective = "room";
      window.APP.editor.viewMode = "focus";
      window.APP.editor.focusRowByPerspective = {
        ...(window.APP.editor.focusRowByPerspective || {}),
        room: chosen.roomId,
      };
      window.Curtain?.setState("collapsed", { instant: true, user: true });
      window.Editor.render(document.querySelector("#editor-root"));

      const source = document.querySelector(
        `#editor-root .chrx-vkarta:not(.locked)[data-lesson-id="${chosen.card.lessonId}"]`
      );
      const target = [...document.querySelectorAll("#editor-root .chrx-slot.empty:not(.out-of-bell)")]
        .find(slot => slot.dataset.row === chosen.roomId &&
          Number(slot.dataset.day) === chosen.target.day &&
          Number(slot.dataset.period) === chosen.target.period);
      if (!source || !target) throw new Error("Deterministic drag fixture did not render source and target");
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      return {
        source: { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 },
        target: { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 },
        meta: { lessonId: chosen.card.lessonId, origin: { day: chosen.card.day, period: chosen.card.period }, target: chosen.target },
      };
    });
    expect(selection.source).toBeDefined();

    const before = await page.evaluate(() => JSON.stringify(window.APP.school.cards));
    await page.mouse.move(selection.source.x, selection.source.y);
    await page.mouse.down();
    await page.mouse.move(selection.source.x + 10, selection.source.y + 2);
    await page.mouse.move(selection.target.x, selection.target.y, { steps: 12 });
    await page.mouse.up();

    const afterMove = await page.evaluate(() => ({
      cards: JSON.stringify(window.APP.school.cards),
      canUndo: window.APP.history.canUndo,
      hand: window.APP.editor.cardInHand,
      history: window.APP.history.peek()?.label || null,
      bodyClasses: document.body.className,
    }));
    expect(afterMove.canUndo, JSON.stringify(afterMove)).toBe(true);
    expect(afterMove.cards).not.toBe(before);

    await page.keyboard.press("Meta+z");
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.APP.school.cards))).toBe(before);
    await page.keyboard.press("Meta+Shift+z");
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.APP.school.cards))).toBe(afterMove.cards);
  });

  test("swap is one undo step and restores the exact cards array", async ({ page }) => {
    await loadDemoSchool(page);

    const fixture = await page.evaluate(() => {
      const S = window.APP.school;
      const classId = S.lessons.find(lesson => (lesson.classIds || []).length)?.classIds?.[0];
      const pair = (S.lessons || []).filter(lesson =>
        (lesson.classIds || []).includes(classId) &&
        lesson.fixedDay == null && lesson.fixedPeriod == null &&
        (lesson.lessonLength || (lesson.isLabDouble ? 2 : 1)) === 1
      ).slice(0, 2);
      const periods = (S.bell?.periods || []).map(period => Number(period.index)).filter(Number.isFinite);
      if (!classId || pair.length < 2 || periods.length < 2) {
        throw new Error("Demo has no deterministic two-card swap fixture");
      }
      const [first, second] = pair;
      const beforeCards = [
        { lessonId: first.id, day: 0, period: periods[0] },
        { lessonId: second.id, day: 0, period: periods[1] },
      ];
      S.cards = beforeCards.map(card => ({ ...card }));
      window.CreateNew.refreshIndex();
      window.APP.history.clear();
      window.APP.editor.perspective = "class";
      window.APP.editor.viewMode = "focus";
      window.APP.editor.selectedClassId = classId;
      window.APP.editor.focusRowByPerspective = {
        ...(window.APP.editor.focusRowByPerspective || {}),
        class: classId,
      };
      window.Curtain?.setState("collapsed", { instant: true, user: true });
      window.Editor.render(document.querySelector("#editor-root"));

      const source = document.querySelector(
        `#editor-root .chrx-vkarta[data-lesson-id="${first.id}"][data-day="0"][data-period="${periods[0]}"]`
      );
      const target = document.querySelector(
        `#editor-root .chrx-slot[data-row="${classId}"][data-day="0"][data-period="${periods[1]}"]`
      );
      if (!source || !target || !target.querySelector(".chrx-vkarta")) {
        throw new Error("Deterministic swap fixture did not render source and occupied target");
      }
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      return {
        source: { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 },
        target: { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 },
        before: JSON.stringify(beforeCards),
      };
    });

    await page.mouse.click(fixture.source.x, fixture.source.y);
    await expect.poll(() => page.evaluate(() => window.APP.editor.cardInHand?.mode)).toBe("click");
    await page.mouse.click(fixture.target.x, fixture.target.y);

    const afterSwap = await page.evaluate(() => ({
      cards: JSON.stringify(window.APP.school.cards),
      canUndo: window.APP.history.canUndo,
      label: window.APP.history.peek()?.label || null,
    }));
    expect(afterSwap.canUndo).toBe(true);
    expect(afterSwap.label).toBe("Swap cards");
    expect(afterSwap.cards).not.toBe(fixture.before);

    await page.keyboard.press("Meta+z");
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.APP.school.cards))).toBe(fixture.before);

    await page.keyboard.press("Meta+Shift+z");
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.APP.school.cards))).toBe(afterSwap.cards);
  });

  test("editing a subject name is one undo step", async ({ page }) => {
    await loadDemoSchool(page);

    const subject = await page.evaluate(() => ({
      id: window.APP.school.subjects[0].id,
      name: window.APP.school.subjects[0].name,
      subjects: JSON.stringify(window.APP.school.subjects),
    }));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:open-entity", {
      detail: { kind: "subjects" },
    })));

    const dialog = page.locator(".chrx-ent-dialog");
    await expect(dialog).toBeVisible();
    const row = dialog.locator(`.chrx-ent-tr[data-id="${subject.id}"]`);
    await expect(row).toBeVisible();
    await row.dblclick();

    const sheet = page.locator(".chrx-ent-sheet");
    await expect(sheet).toBeVisible();
    const renamed = `${subject.name} Undo`;
    await sheet.locator('input[type="text"]').first().fill(renamed);
    await sheet.getByRole("button", { name: "Save", exact: true }).click();

    const afterEdit = await page.evaluate(() => ({
      subjects: JSON.stringify(window.APP.school.subjects),
      canUndo: window.APP.history.canUndo,
    }));
    expect(afterEdit.canUndo).toBe(true);
    expect(afterEdit.subjects).not.toBe(subject.subjects);

    await page.keyboard.press("Meta+z");
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.APP.school.subjects))).toBe(subject.subjects);

    await page.keyboard.press("Meta+Shift+z");
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.APP.school.subjects))).toBe(afterEdit.subjects);
  });

  test("locking a card is one undo step and restores the exact card object", async ({ page }) => {
    await loadDemoSchool(page);

    const card = page.locator("#editor-root .chrx-vkarta:not(.locked)").first();
    await expect(card).toBeVisible();
    const meta = await card.evaluate((el) => ({ ...el.dataset }));
    const before = await page.evaluate(() => JSON.stringify(window.APP.school.cards));

    await card.click({ button: "right" });
    const menu = page.locator("#chrx-card-ctx");
    await expect(menu).toBeVisible();
    await menu.locator("button").filter({ hasText: "Lock" }).click();

    const afterLock = await page.evaluate(({ lessonId, day, period }) => ({
      cards: JSON.stringify(window.APP.school.cards),
      canUndo: window.APP.history.canUndo,
      card: window.APP.school.cards.find(c => c.lessonId === lessonId && c.day === Number(day) && c.period === Number(period)),
    }), meta);
    expect(afterLock.canUndo).toBe(true);
    expect(afterLock.cards).not.toBe(before);
    expect(afterLock.card.locked).toBe(true);

    await page.keyboard.press("Meta+z");
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.APP.school.cards))).toBe(before);

    await page.keyboard.press("Meta+Shift+z");
    await expect.poll(() => page.evaluate(() => JSON.stringify(window.APP.school.cards))).toBe(afterLock.cards);
  });
});
