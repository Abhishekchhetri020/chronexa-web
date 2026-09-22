import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

// Lane D — placement suggestions: picking up an unplaced card lights every
// valid destination and marks exactly one slot Best (DOM marker only, no
// tooltip), without touching the drag ghost path.
test("unplaced card pickup marks exactly one Best slot; clicking it places", async ({
  page,
}) => {
  await loadDemoSchool(page);

  // Work in Overview so every class row is rendered (Best is row-scoped).
  const overviewBtn = page.locator('[data-focus-nav="overview"]');
  if (await overviewBtn.isVisible()) await overviewBtn.click();
  await expect(page.locator("#editor-root .chrx-row").first()).toBeVisible();

  // Unplace a card: right-click → Remove sends it to the pending strip.
  const card = page.locator("#editor-root .chrx-vkarta").first();
  await card.click({ button: "right" });
  await page.getByRole("button", { name: /remove/i }).first().click();
  const pendingCard = page.locator("#pending-strip-root [data-card-id]").first();
  await expect(pendingCard).toBeVisible({ timeout: 10_000 });

  // Click-select the unplaced card (click mode — no ghost involved).
  await pendingCard.click();
  await expect(page.locator(".chrx-card-ghost")).toHaveCount(0);

  // Exactly one Best marker, on an empty slot, with no tooltip attached.
  const best = page.locator("#editor-root .chrx-slot--suggest-best");
  await expect(best).toHaveCount(1);
  await expect(best).toHaveAttribute("data-suggest", "best");
  await expect(best).toHaveClass(/chrx-slot--highlight-place/);
  expect(await best.evaluate((el) => el.querySelector(".chrx-vkarta"))).toBeNull();
  expect(await best.getAttribute("title")).toBeNull();

  // A red (hard-invalid) slot is never marked Best.
  await expect(
    page.locator('#editor-root .chrx-slot[data-validity="red"].chrx-slot--suggest-best')
  ).toHaveCount(0);

  // Clicking the Best slot commits through the existing click-place path.
  const dest = await best.evaluate((el) => ({ ...el.dataset }));
  await best.click();
  await expect(
    page.locator(
      `#editor-root .chrx-slot[data-day="${dest.day}"][data-period="${dest.period}"] .chrx-vkarta`
    ).first()
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#pending-strip-root [data-card-id]")).toHaveCount(0);
  await expect(page.locator("#editor-root .chrx-slot--suggest-best")).toHaveCount(0);
});
