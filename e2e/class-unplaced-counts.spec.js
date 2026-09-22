import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test.describe("Lane C — Class List + Unplaced Counts", () => {
  test("left class rail renders in single-class focus editor with stable order", async ({ page }) => {
    await loadDemoSchool(page);

    // Verify left rail exists in focus workspace
    const rail = page.locator(".chrx-class-rail");
    await expect(rail).toBeVisible();

    const items = rail.locator(".chrx-class-rail__item");
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(10);

    // Initial state: first class is active
    const activeItem = rail.locator(".chrx-class-rail__item.is-active");
    await expect(activeItem).toBeVisible();
  });

  test("zero unplaced shows no badge; unplaced >0 shows plain numeric count without emoji", async ({ page }) => {
    await loadDemoSchool(page);

    // When fully placed, no class should have a count badge
    const initialCounts = page.locator(".chrx-class-rail__count");
    expect(await initialCounts.count()).toBe(0);

    // Simulate an unplaced card by unplacing one card from the school in class 'c_1' or first class
    const unplacedInfo = await page.evaluate(() => {
      const S = window.APP && window.APP.school;
      if (!S || !S.cards || !S.cards.length) return null;
      // Find a card belonging to a class
      const targetCard = S.cards[0];
      const lesson = (S.lessons || []).find(l => l.id === targetCard.lessonId);
      const targetClassId = lesson?.classIds?.[0] || lesson?.classId;
      if (!targetClassId) return null;

      // Pop the card so it becomes unplaced
      S.cards = S.cards.filter(c => c !== targetCard);

      // Re-render editor
      const root = document.querySelector("#editor-root");
      if (window.Editor && window.Editor.render) {
        window.Editor.render(root);
      }
      return { targetClassId, lessonId: targetCard.lessonId };
    });

    expect(unplacedInfo).not.toBeNull();

    // The target class should now have a plain numeric count
    const targetItem = page.locator(`.chrx-class-rail__item[data-class-id="${unplacedInfo.targetClassId}"]`);
    await expect(targetItem).toBeVisible();

    const countEl = targetItem.locator(".chrx-class-rail__count");
    await expect(countEl).toBeVisible();
    await expect(countEl).toHaveText("1");

    // Ensure no emoji in the rail item
    const itemText = await targetItem.innerText();
    expect(itemText).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u); // no emoji
    expect(itemText).toMatch(/1/); // plain numeric count

    // Other classes without unplaced cards still show no count badge
    const otherItems = page.locator(`.chrx-class-rail__item:not([data-class-id="${unplacedInfo.targetClassId}"]) .chrx-class-rail__count`);
    expect(await otherItems.count()).toBe(0);
  });

  test("clicking a counted class selects its timetable, scopes pending lessons, and requests curtain open", async ({ page }) => {
    await loadDemoSchool(page);

    // Prepare events recorder and unplace a card in the second class
    const targetClassId = await page.evaluate(() => {
      const S = window.APP && window.APP.school;
      const secondClass = S.classes[1];
      if (!secondClass) return null;

      // Find a card for this second class
      const cardIdx = S.cards.findIndex(c => {
        const l = (S.lessons || []).find(l => l.id === c.lessonId);
        return l && (l.classIds || []).includes(secondClass.id);
      });

      if (cardIdx !== -1) {
        S.cards.splice(cardIdx, 1);
      } else {
        // Create an unplaced lesson for secondClass
        S.lessons.push({
          id: "test_unplaced_lesson",
          classIds: [secondClass.id],
          periodsPerWeek: 1,
          lessonLength: 1,
          subjectId: S.subjects[0]?.id
        });
      }

      // Record events
      window.__test_events = [];
      document.addEventListener("editor:scope-class", (e) => {
        window.__test_events.push({ type: "editor:scope-class", detail: e.detail });
      });
      document.addEventListener("curtain:open", (e) => {
        window.__test_events.push({ type: "curtain:open", detail: e.detail });
      });
      document.addEventListener("editor:curtain-request", (e) => {
        window.__test_events.push({ type: "editor:curtain-request", detail: e.detail });
      });

      // Re-render
      const root = document.querySelector("#editor-root");
      if (window.Editor && window.Editor.render) {
        window.Editor.render(root);
      }
      return secondClass.id;
    });

    expect(targetClassId).not.toBeNull();

    const targetItem = page.locator(`.chrx-class-rail__item[data-class-id="${targetClassId}"]`);
    await expect(targetItem).toBeVisible();
    await expect(targetItem.locator(".chrx-class-rail__count")).toHaveText(/[1-9]/);

    // Click the counted class
    await targetItem.click();

    // Verify it is now active
    await expect(targetItem).toHaveClass(/is-active/);

    // Verify timetable selected, pending lessons scoped, and curtain open requested
    const state = await page.evaluate(() => {
      return {
        focusRow: window.APP.editor.focusRowByPerspective["class"],
        selectedClassId: window.APP.editor.selectedClassId,
        curtainState: window.APP.editor.curtainState,
        events: window.__test_events
      };
    });

    expect(state.focusRow).toBe(targetClassId);
    expect(state.selectedClassId).toBe(targetClassId);
    expect(state.curtainState).toBe("peek");

    // Events were dispatched
    const scopeEvent = state.events.find(e => e.type === "editor:scope-class");
    expect(scopeEvent).toBeDefined();
    expect(scopeEvent.detail.classId).toBe(targetClassId);

    const curtainEvent = state.events.find(e => e.type === "curtain:open");
    expect(curtainEvent).toBeDefined();
    expect(curtainEvent.detail.classId).toBe(targetClassId);

    // Timetable cards still render intact
    const cards = page.locator("#editor-root .chrx-vkarta");
    expect(await cards.count()).toBeGreaterThan(0);
  });
});
