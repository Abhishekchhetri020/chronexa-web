import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test("switch to Student perspective, pick student, verify lessons and drag disabled", async ({ page }) => {
  await loadDemoSchool(page);

  // 1. Switch perspective to "Student" using the header rotator button
  const persBtn = page.locator("#editor-perspective");
  for (let i = 0; i < 6; i++) {
    const text = await persBtn.textContent();
    if (/by student/i.test(text || "")) break;
    await persBtn.click();
  }
  await expect(persBtn).toHaveText(/by student/i);

  // 2. Focus board shows Student perspective and read-only hint
  const hint = page.locator(".chrx-student-hint");
  await expect(hint).toBeVisible();
  await expect(hint).toContainText(/read-only.*disabled/i);

  // 3. Pick student "Tariq Ahmad" (in VI A, enrolled in Urdu group)
  // Search or click in student rail
  const tariqRailBtn = page.locator(".chrx-student-rail .chrx-class-rail__item", { hasText: "Tariq Ahmad" });
  if (await tariqRailBtn.isVisible()) {
    await tariqRailBtn.click();
  } else {
    const select = page.locator("select[data-focus-entity]");
    await select.selectOption({ label: /Tariq Ahmad/ });
  }

  // Verify focus entity selected Tariq Ahmad
  await expect(page.locator("select[data-focus-entity] option:checked")).toContainText(/Tariq Ahmad/);

  // 4. Verify the grid shows only Tariq's lessons (includes Urdu, excludes Sanskrit)
  const urduCards = page.locator("#editor-root .chrx-vkarta", { hasText: /urdu/i });
  await expect(urduCards.first()).toBeVisible({ timeout: 10_000 });
  expect(await urduCards.count()).toBeGreaterThan(0);

  const sansCardsForTariq = page.locator("#editor-root .chrx-vkarta", { hasText: /sans/i });
  expect(await sansCardsForTariq.count()).toBe(0);

  // 5. Switch to "Aarav Sharma" (in VI A, enrolled in Sanskrit group)
  const aaravRailBtn = page.locator(".chrx-student-rail .chrx-class-rail__item", { hasText: "Aarav Sharma" });
  if (await aaravRailBtn.isVisible()) {
    await aaravRailBtn.click();
  } else {
    const select = page.locator("select[data-focus-entity]");
    await select.selectOption({ label: /Aarav Sharma/ });
  }

  await expect(page.locator("select[data-focus-entity] option:checked")).toContainText(/Aarav Sharma/);

  // Verify the grid shows Aarav's lessons (includes Sanskrit, excludes Urdu)
  const sansCards = page.locator("#editor-root .chrx-vkarta", { hasText: /sans/i });
  await expect(sansCards.first()).toBeVisible({ timeout: 10_000 });
  expect(await sansCards.count()).toBeGreaterThan(0);

  const urduCardsForAarav = page.locator("#editor-root .chrx-vkarta", { hasText: /urdu/i });
  expect(await urduCardsForAarav.count()).toBe(0);

  // 6. Verify read-only in student view (no lock stripes/padlock, 0 locked cards, drag/click-pickup does nothing)
  const board = page.locator(".chrx-focus-board");
  await expect(board).toHaveClass(/chrx-readonly/);

  // In student view, 0 cards have .locked (unless actually locked in timetable)
  await expect(page.locator("#editor-root .chrx-vkarta.locked")).toHaveCount(0);

  const card = page.locator("#editor-root .chrx-vkarta").first();
  await expect(card).not.toHaveClass(/locked/);

  const cardMeta = await card.evaluate(el => ({
    day: el.dataset.day,
    period: el.dataset.period,
    lessonId: el.dataset.lessonId,
  }));

  // Click-pickup does nothing
  await card.click();
  let cardInHand = await page.evaluate(() => window.APP?.editor?.cardInHand);
  expect(cardInHand).toBeFalsy();
  await expect(page.locator(".chrx-card-ghost")).toHaveCount(0);

  const from = await card.boundingBox();
  expect(from).not.toBeNull();

  // Attempt to drag card across the board
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 150, from.y + 150, { steps: 8 });

  // No drag ghost created
  await expect(page.locator(".chrx-card-ghost")).toHaveCount(0);

  // No card was picked up into hand
  cardInHand = await page.evaluate(() => window.APP?.editor?.cardInHand);
  expect(cardInHand).toBeFalsy();

  await page.mouse.up();

  // The original slot still contains the card
  const originalSlotCard = page.locator(
    `#editor-root .chrx-slot[data-day="${cardMeta.day}"][data-period="${cardMeta.period}"] .chrx-vkarta`
  );
  await expect(originalSlotCard).toBeVisible();
});

test("student search filter in student rail and picker", async ({ page }) => {
  await loadDemoSchool(page);

  // Rotate to Student perspective
  const persBtn = page.locator("#editor-perspective");
  for (let i = 0; i < 6; i++) {
    const text = await persBtn.textContent();
    if (/by student/i.test(text || "")) break;
    await persBtn.click();
  }
  await expect(persBtn).toHaveText(/by student/i);

  // Test rail search filter input
  const filterInput = page.locator("[data-student-filter]");
  if (await filterInput.isVisible()) {
    await filterInput.fill("Tariq");
    const visibleRailItems = page.locator(".chrx-student-rail .chrx-class-rail__item:visible");
    expect(await visibleRailItems.count()).toBe(1);
    await expect(visibleRailItems.first()).toContainText("Tariq");

    // Clear filter
    await filterInput.fill("");
    const allVisible = page.locator(".chrx-student-rail .chrx-class-rail__item:visible");
    expect(await allVisible.count()).toBeGreaterThan(1);
  }

  // Test picker search input with exact and starts-with match
  const searchInput = page.locator("[data-focus-student-search]");
  if (await searchInput.isVisible()) {
    // Starts-with match
    await searchInput.fill("Tariq");
    await searchInput.dispatchEvent("change");
    await expect(page.locator("select[data-focus-entity] option:checked")).toContainText(/Tariq/);

    // Starts-with match for Aarav
    await searchInput.fill("Aarav");
    await searchInput.dispatchEvent("change");
    await expect(page.locator("select[data-focus-entity] option:checked")).toContainText(/Aarav/);
  }
});
