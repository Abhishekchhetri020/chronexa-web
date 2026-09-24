import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test.describe("Lane L5 — Phone day view + keyboard", () => {
  test("B5: at viewport 390x844 exactly one day column visible in Focus view; tapping another day tab switches it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadDemoSchool(page);

    // In default Focus view on mobile, day tabs must exist
    const dayTabs = page.locator("#editor-root .chrx-day-tab");
    await expect(dayTabs).toHaveCount(6);

    // Exactly one day column header should be rendered/visible
    const dayHeaders = page.locator("#editor-root .chrx-focus-day");
    await expect(dayHeaders).toHaveCount(1);
    await expect(dayHeaders.first()).toHaveText(/mon/i);

    // Tapping Tuesday tab switches to Tuesday
    const tueTab = dayTabs.filter({ hasText: /tue/i });
    await tueTab.click();

    await expect(dayHeaders).toHaveCount(1);
    await expect(dayHeaders.first()).toHaveText(/tue/i);
    await expect(tueTab).toHaveClass(/active/);
  });

  test("B5: re-renders single-day vs multi-day on viewport resize / breakpoint change", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await loadDemoSchool(page);

    const dayHeaders = page.locator("#editor-root .chrx-focus-day");
    await expect(dayHeaders).toHaveCount(6);

    // Resize down to mobile breakpoint (<=767px)
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dayHeaders).toHaveCount(1);
    await expect(dayHeaders.first()).toHaveText(/mon/i);

    // Resize back up to desktop (>767px)
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(dayHeaders).toHaveCount(6);
  });
});

test.describe("Lane L5 — Real mobile phone context", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("B5: real mobile context renders exactly 1 .chrx-focus-day column and tapping tab switches day", async ({ page }) => {
    await loadDemoSchool(page);

    const dayTabs = page.locator("#editor-root .chrx-day-tab");
    await expect(dayTabs).toHaveCount(6);

    const dayHeaders = page.locator("#editor-root .chrx-focus-day");
    await expect(dayHeaders).toHaveCount(1);
    await expect(dayHeaders.first()).toHaveText(/mon/i);

    // Tapping Tuesday tab switches to Tuesday
    const tueTab = dayTabs.filter({ hasText: /tue/i });
    await tueTab.click();

    await expect(dayHeaders).toHaveCount(1);
    await expect(dayHeaders.first()).toHaveText(/tue/i);
    await expect(tueTab).toHaveClass(/active/);
  });
});

test.describe("Lane L5 — Keyboard navigation", () => {

  test("B10: keyboard skip/entry path, roving tabindex, arrow keys between cards, and Enter pickup/place", async ({ page }) => {
    await loadDemoSchool(page);

    // 1. Skip to timetable entry path exists
    const skipLink = page.locator("#editor-root [data-skip-to-grid]");
    await expect(skipLink).toHaveCount(1);

    // Focusing skip link and pressing Enter moves focus to the first card in the grid
    await skipLink.focus();
    await page.keyboard.press("Enter");

    const firstCard = page.locator("#editor-root .chrx-vkarta").first();
    await expect(firstCard).toBeFocused();

    // 2. Roving tabindex: exactly one element in the timetable has tabindex="0"
    const zeroTabstops = page.locator("#editor-root .chrx-vkarta[tabindex='0'], #editor-root .chrx-slot[tabindex='0']");
    await expect(zeroTabstops).toHaveCount(1);

    // 3. Arrow-key navigation moves between cards
    const initialCardId = await firstCard.getAttribute("data-card-id");
    await page.keyboard.press("ArrowDown");

    const secondCard = page.locator("#editor-root .chrx-vkarta:focus, #editor-root .chrx-slot:focus");
    await expect(secondCard).toBeVisible();
    const secondCardId = await secondCard.getAttribute("data-card-id");
    expect(secondCardId).not.toBe(initialCardId);

    // 4. Enter on a card picks it up via card_in_hand
    await page.keyboard.press("Enter");
    const inHandState = await page.evaluate(() => !!(window.APP && window.APP.editor && window.APP.editor.cardInHand));
    expect(inHandState).toBe(true);

    // 5. Escape cancels pickup cleanly
    await page.keyboard.press("Escape");
    await expect.poll(async () => {
      return page.evaluate(() => !!(window.APP && window.APP.editor && window.APP.editor.cardInHand));
    }).toBe(false);
  });

  test("B10: keyboard placement into empty slot using Enter", async ({ page }) => {
    await loadDemoSchool(page);

    // 1. Unplace first card to create an empty slot at day 0, period 1
    const firstCard = page.locator("#editor-root .chrx-slot[data-day='0'][data-period='1'] .chrx-vkarta").first();
    await firstCard.click({ button: "right" });
    await page.getByRole("button", { name: /remove/i }).first().click();

    // Verify day 0, period 1 is empty
    const slotD0P1 = page.locator("#editor-root .chrx-slot[data-day='0'][data-period='1']");
    await expect(slotD0P1).toHaveClass(/empty/);

    // 2. Focus the card at day 0, period 2
    const cardD0P2 = page.locator("#editor-root .chrx-slot[data-day='0'][data-period='2'] .chrx-vkarta").first();
    await cardD0P2.focus();
    await expect(cardD0P2).toBeFocused();

    // 3. Pick it up using Enter
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => !!(window.APP?.editor?.cardInHand))).toBe(true);

    // 4. Navigate up using ArrowUp to day 0, period 1
    await page.keyboard.press("ArrowUp");
    await expect(slotD0P1).toBeFocused();

    // 5. Press Enter to place it into the slot
    await page.keyboard.press("Enter");

    // Verify placement committed
    await expect.poll(async () => {
      return page.evaluate(() => !!(window.APP?.editor?.cardInHand));
    }).toBe(false);
    await expect(page.locator("#editor-root .chrx-slot[data-day='0'][data-period='1'] .chrx-vkarta")).toBeVisible();
  });
});
