import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test.describe("Lane W2-5 — Availability shading on card select", () => {
  test("Focus view: picking up a card shades visible slots matching classify(), shows legend, and Escape clears", async ({ page }) => {
    await loadDemoSchool(page);

    // Pick the first card in Focus view
    const firstCard = page.locator("#editor-root .chrx-vkarta").first();
    await expect(firstCard).toBeVisible();
    await firstCard.focus();
    await page.keyboard.press("Enter");

    // Card should now be in hand
    await expect.poll(async () => {
      return page.evaluate(() => !!(window.APP?.editor?.cardInHand));
    }).toBe(true);

    // Inspector legend should be visible
    const legend = page.locator("#editor-inspector-root #chrx-availability-legend");
    await expect(legend).toBeVisible();
    await expect(legend).toContainText(/Free|Available/i);

    // Count slots with each availability state in DOM
    const okCount = await page.locator("#editor-root .chrx-slot.chrx-avail-ok").count();
    const softCount = await page.locator("#editor-root .chrx-slot.chrx-avail-soft-conflict").count();
    const hardCount = await page.locator("#editor-root .chrx-slot.chrx-avail-hard-conflict").count();

    const totalShaded = okCount + softCount + hardCount;
    const totalSlots = await page.locator("#editor-root .chrx-slot").count();
    expect(totalShaded).toBe(totalSlots);
    expect(totalShaded).toBeGreaterThan(0);

    // Evaluate expected counts directly from window.Placement.classify for every slot in the grid
    const expectedCounts = await page.evaluate(() => {
      const inHand = window.APP.editor.cardInHand;
      const lesson = inHand && window.APP.school._idx.lessonById[inHand.lessonId];
      const slots = Array.from(document.querySelectorAll("#editor-root .chrx-slot"));
      let ok = 0, soft = 0, hard = 0;
      for (const slot of slots) {
        const d = parseInt(slot.dataset.day, 10);
        const p = parseInt(slot.dataset.period, 10);
        if (Number.isNaN(d) || Number.isNaN(p)) continue;
        const rid = inHand.originClassroomId || (lesson ? lesson.preferredRoomId : undefined);
        const res = window.Placement.classify(inHand.lessonId, d, p, rid);
        if (res.validity === "green") ok++;
        else if (res.validity === "amber") soft++;
        else hard++;
      }
      return { ok, soft, hard };
    });

    expect(okCount).toBe(expectedCounts.ok);
    expect(softCount).toBe(expectedCounts.soft);
    expect(hardCount).toBe(expectedCounts.hard);

    // Escape clears the shading and legend
    await page.keyboard.press("Escape");

    await expect(page.locator("#editor-root .chrx-slot.chrx-avail-ok")).toHaveCount(0);
    await expect(page.locator("#editor-root .chrx-slot.chrx-avail-soft-conflict")).toHaveCount(0);
    await expect(page.locator("#editor-root .chrx-slot.chrx-avail-hard-conflict")).toHaveCount(0);
    await expect(page.locator("#chrx-availability-legend")).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => window.APP?.editor?.cardInHand)).toBeNull();
  });

  test("All-classes view: whole grid shaded matching classify(), perf < 50ms, Escape clears", async ({ page }) => {
    await loadDemoSchool(page);

    // Switch to Overview (all classes view)
    const overviewBtn = page.locator('[data-focus-nav="overview"]');
    if (await overviewBtn.isVisible()) {
      await overviewBtn.click();
    }
    await expect(page.locator("#editor-root .chrx-row").first()).toBeVisible();

    // Measure shading performance on card pickup
    const firstCard = page.locator("#editor-root .chrx-vkarta").first();
    await expect(firstCard).toBeVisible();

    const perfResult = await page.evaluate(async () => {
      const card = document.querySelector("#editor-root .chrx-vkarta");
      const cardId = card.dataset.cardId;
      const lessonId = card.dataset.lessonId;
      const day = parseInt(card.dataset.day, 10);
      const period = parseInt(card.dataset.period, 10);

      const t0 = performance.now();
      window.CardInHand.pickup({ cardId, lessonId, day, period, mode: "drag" });
      const pickupDuration = performance.now() - t0;
      const shadingDuration = window.AvailabilityShading.lastDurationMs;
      return { pickupDuration, shadingDuration };
    });

    // Shading must finish in < 50ms
    expect(perfResult.shadingDuration).toBeLessThan(50);
    expect(perfResult.pickupDuration).toBeLessThan(100);

    // Shaded slots count should cover all slots across all classes (>900)
    const okCount = await page.locator("#editor-root .chrx-slot.chrx-avail-ok").count();
    const softCount = await page.locator("#editor-root .chrx-slot.chrx-avail-soft-conflict").count();
    const hardCount = await page.locator("#editor-root .chrx-slot.chrx-avail-hard-conflict").count();

    const totalShaded = okCount + softCount + hardCount;
    const totalSlots = await page.locator("#editor-root .chrx-slot").count();
    expect(totalSlots).toBeGreaterThan(800);
    expect(totalShaded).toBe(totalSlots);

    // Verify counts match classify() across all slots
    const expectedCounts = await page.evaluate(() => {
      const inHand = window.APP.editor.cardInHand;
      const lesson = inHand && window.APP.school._idx.lessonById[inHand.lessonId];
      const slots = Array.from(document.querySelectorAll("#editor-root .chrx-slot"));
      let ok = 0, soft = 0, hard = 0;
      for (const slot of slots) {
        const d = parseInt(slot.dataset.day, 10);
        const p = parseInt(slot.dataset.period, 10);
        if (Number.isNaN(d) || Number.isNaN(p)) continue;
        const rid = inHand.originClassroomId || (lesson ? lesson.preferredRoomId : undefined);
        const res = window.Placement.classify(inHand.lessonId, d, p, rid);
        if (res.validity === "green") ok++;
        else if (res.validity === "amber") soft++;
        else hard++;
      }
      return { ok, soft, hard };
    });

    expect(okCount).toBe(expectedCounts.ok);
    expect(softCount).toBe(expectedCounts.soft);
    expect(hardCount).toBe(expectedCounts.hard);

    // Press Escape to cancel
    await page.keyboard.press("Escape");

    await expect(page.locator("#editor-root .chrx-slot.chrx-avail-ok")).toHaveCount(0);
    await expect(page.locator("#editor-root .chrx-slot.chrx-avail-soft-conflict")).toHaveCount(0);
    await expect(page.locator("#editor-root .chrx-slot.chrx-avail-hard-conflict")).toHaveCount(0);
    await expect(page.locator("#chrx-availability-legend")).toHaveCount(0);
  });
});
