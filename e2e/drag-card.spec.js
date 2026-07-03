import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

// The editor's drag is custom mouse-based (card_in_hand.js pickup/commit),
// not HTML5 drag-and-drop — simulate with raw mouse events.
test("unplace a card, then drag it from the pending strip back onto the grid", async ({ page }) => {
  await loadDemoSchool(page);

  // 1. Right-click a placed card and remove it to the pending strip.
  const card = page.locator("#editor-root .chrx-vkarta").first();
  const cardMeta = await card.evaluate((el) => ({ ...el.dataset }));
  await card.click({ button: "right" });
  // Context menu items are plain <button>s; "Remove" sends the card to pending.
  await page.getByRole("button", { name: /remove/i }).first().click();

  // The card now sits in the pending strip.
  const pendingCard = page.locator("#pending-strip-root [data-card-id]").first();
  await expect(pendingCard).toBeVisible({ timeout: 10_000 });

  // 2. Drag it back: mousedown on the pending card, mousemove to the exact
  // slot it came from (guaranteed free + valid), mouseup.
  const targetSlot = page.locator(
    `#editor-root .chrx-slot.empty[data-day="${cardMeta.day}"][data-period="${cardMeta.period}"]`
  ).first();
  await expect(targetSlot).toBeVisible();

  const from = await pendingCard.boundingBox();
  const to = await targetSlot.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();

  // 3. The slot holds a card again and the strip is empty.
  await expect(
    page.locator(
      `#editor-root .chrx-slot[data-day="${cardMeta.day}"][data-period="${cardMeta.period}"] .chrx-vkarta`
    ).first()
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#pending-strip-root [data-card-id]")).toHaveCount(0);
});
