import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

/* W3b-1 (part 1) — an unplaced card must say WHY it is unplaced.
 *
 * The reason sweep lives in js/ui/editor/pending_strip.js and piggybacks on
 * the existing classifier (window.Placement.classify) plus the school's
 * daily caps and window.RelationEnforcer — never a second copy of the
 * constraint rules. The counts are exposed as data attributes so the test
 * asserts numbers, not prose.
 */

const WHY = "#pending-strip-root .chrx-pending-why";

/**
 * A card that is visible in the grid AND (a) still leaves its lesson unplaced
 * when removed and (b) leaves that lesson with no legal slot at all.
 */
async function findBlockedCard(page) {
  return page.evaluate(() => {
    const S = window.APP.school;
    const cards = S.cards;
    for (const el of document.querySelectorAll("#editor-root .chrx-vkarta")) {
      const lessonId = el.dataset.lessonId, day = +el.dataset.day, period = +el.dataset.period;
      const i = cards.findIndex(c => c.lessonId === lessonId && c.day === day && c.period === period);
      if (i < 0) continue;
      const L = S._idx.lessonById[lessonId];
      const len = L.lessonLength || (L.isLabDouble ? 2 : 1);
      const needed = (L.periodsPerWeek || 0) > 0 ? Math.max(1, Math.round(L.periodsPerWeek / len)) : 0;
      const placedAfterRemoval = cards.filter(c => c.lessonId === lessonId).length - 1;
      const [c] = cards.splice(i, 1);
      const why = window.PendingStrip.explainLesson(S, lessonId);
      cards.splice(i, 0, c);
      if (needed - placedAfterRemoval > 0 && why.free === 0 && why.blocked > 0) {
        return { cardId: el.dataset.cardId, lessonId, summary: why.summary };
      }
    }
    return null;
  });
}

async function removeCard(page, card) {
  await card.click({ button: "right" });
  const menu = page.locator("#chrx-card-ctx");
  await expect(menu).toBeVisible();
  await menu.locator("button").first().click(); // 🗑 Remove
}

/** Parse "class busy:41,teacher busy:24" → [{label,count}] */
async function reasonCounts(why) {
  const raw = (await why.getAttribute("data-why-reasons")) || "";
  return raw.split(",").filter(Boolean).map(part => {
    const at = part.lastIndexOf(":");
    return { label: part.slice(0, at), count: Number(part.slice(at + 1)) };
  });
}

test("W3b-1 · unplaced tray explains WHY a card cannot be placed and links to Verification", async ({ page }) => {
  await loadDemoSchool(page);

  const target = await findBlockedCard(page);
  expect(target, "the demo school must contain a visible card whose lesson then has no free slot").not.toBeNull();

  // 1. Delete a card in a full class — exactly what the user does.
  const card = page.locator(`#editor-root .chrx-vkarta[data-card-id="${target.cardId}"]`);
  await expect(card).toBeVisible();
  await removeCard(page, card);

  // 2. The tray card carries a reason line with NON-ZERO counts.
  const why = page.locator(WHY).first();
  await expect(why).toBeVisible({ timeout: 10_000 });
  await expect(why).toHaveAttribute("data-why-free", "0");
  expect(Number(await why.getAttribute("data-why-blocked"))).toBeGreaterThan(0);

  const counts = await reasonCounts(why);
  expect(counts.length, "at least one reason must be reported").toBeGreaterThan(0);
  expect(Math.max(...counts.map(c => c.count))).toBeGreaterThan(0);
  expect(counts.map(c => c.label)).toContain("class busy");

  await expect(why.locator(".chrx-pending-why-text")).toContainText(/^No free slot: /);
  await expect(why.locator(".chrx-pending-why-text")).toContainText(/class busy in \d+/);

  // The counts are per-slot, so they can never exceed the number of slots.
  const total = await page.evaluate(() => {
    const S = window.APP.school;
    const days = Math.min(6, S.daysPerWeek || 6);
    return days * (S.bell.periods || []).length;
  });
  for (const c of counts) expect(c.count, `${c.label} cannot exceed ${total} slots`).toBeLessThanOrEqual(total);

  // 3. "Show in Verification" opens the REAL Verification panel.
  await why.locator(".chrx-pending-why-link").click();
  await expect(page.locator(".chrx-vpro-panel")).toBeVisible();
  await expect(page.locator("#chrx-vpro-title")).toHaveText(/Verification/);
});

test("W3b-1 · a card that is merely hard to place still reports its blockers and its free-slot count", async ({ page }) => {
  await loadDemoSchool(page);

  // Removing the very first placed card frees its own slot for the class, so
  // this lesson keeps a legal (day, period) — the tray must say so instead of
  // claiming there is no free slot.
  const card = page.locator("#editor-root .chrx-vkarta").first();
  await removeCard(page, card);

  const why = page.locator(WHY).first();
  await expect(why).toBeVisible({ timeout: 10_000 });

  const free = Number(await why.getAttribute("data-why-free"));
  expect(free).toBeGreaterThan(0);
  const counts = await reasonCounts(why);
  expect(Math.max(...counts.map(c => c.count))).toBeGreaterThan(0);
  await expect(why.locator(".chrx-pending-why-text")).toContainText(`Free in ${free} of`);
  await expect(why).toHaveClass(/is-free/);
});

test("W3b-1 · the reason line survives regrouping and searching the tray", async ({ page }) => {
  await loadDemoSchool(page);

  // A lesson that keeps a free slot — the tray line must follow the grouping.
  await removeCard(page, page.locator("#editor-root .chrx-vkarta").first());
  await expect(page.locator(WHY).first()).toBeVisible({ timeout: 10_000 });

  await page.locator('#pending-strip-root .chrx-pending-tab[data-group="teacher"]').click();
  await expect(page.locator(WHY).first()).toBeVisible();
  expect(await page.locator(WHY).first().getAttribute("data-why-reasons")).toBeTruthy();

  await page.locator('#pending-strip-root .chrx-pending-tab[data-group="class"]').click();
  const why = page.locator(WHY).first();
  await expect(why).toBeVisible();
  expect(await why.getAttribute("data-why-free")).not.toBeNull();

  // A search that matches nothing hides the cards without breaking the strip.
  await page.locator("#pending-strip-root .chrx-pending-search").fill("zzz-no-such-card");
  await expect(page.locator(WHY)).toHaveCount(0);
  await page.locator("#pending-strip-root .chrx-pending-search").fill("");
  await expect(page.locator(WHY).first()).toBeVisible();
});
