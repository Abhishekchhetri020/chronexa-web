import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

// B1 — dropping a card onto an OCCUPIED slot must never lose a card.
//
// The rule is conservation: a swap puts the dragged card in the slot and hands
// the displaced card to the cursor. From there the displaced card is either
// placed somewhere legal or becomes UNPLACED — it is never deleted, and it is
// never stacked onto the very cell the dragged card just took.
//
// Reproduced live at p257: dragging lesson A onto lesson B's slot left
// school.cards with three cards where there had been four, with no menu and no
// toast — the displaced card was riding the pointer, announced nowhere.
//
// Fixture: the report's exact four-card state. The bundled demo file has cells
// that already hold two cards, so it cannot express "a clean swap" reliably;
// this seeds A@MonP1, B@MonP2, A@TueP3, B@TueP4 onto two real demo lessons, with
// BOTH lessons repeating (a single-occurrence lesson cannot show a lost card).

const MON = 0;
const TUE = 1;
const A_CELL = { day: MON, period: 1 };
const B_CELL = { day: MON, period: 2 };
const A_MIRROR = { day: TUE, period: 3 };
const B_MIRROR = { day: TUE, period: 4 };

const slotSel = (cell) =>
  `#editor-root .chrx-slot[data-day="${cell.day}"][data-period="${cell.period}"]`;

async function seedRepro(page) {
  const pair = await page.evaluate(
    ({ cells }) => {
      const S = window.APP.school;
      // Two lessons that already share a class row on screen, so the four cards
      // land in cells the editor actually renders.
      const cards = Array.from(document.querySelectorAll("#editor-root .chrx-vkarta")).filter(
        (el) => !el.closest(".chrx-landing-demo__cell")
      );
      const list = [];
      for (const el of cards) {
        const slot = el.closest(".chrx-slot");
        if (!slot) continue;
        const lesson = S._idx.lessonById[el.dataset.lessonId];
        if (!lesson) continue;
        // Single-period lessons only: a double-period block cannot be swapped
        // (it routes to commit's replace path), so it would not exercise the
        // swap being tested here.
        const len = lesson.lessonLength || (lesson.isLabDouble ? 2 : 1);
        if (len !== 1) continue;
        if (el.dataset.blockLen && el.dataset.blockLen !== "1") continue;
        if (el.classList.contains("locked")) continue;
        list.push({ lessonId: el.dataset.lessonId, row: slot.dataset.row });
      }
      const a = list[0];
      const b = a && list.find((x) => x.row === a.row && x.lessonId !== a.lessonId);
      if (!a || !b) return null;
      S.cards = [
        { lessonId: a.lessonId, day: cells.A.day, period: cells.A.period },
        { lessonId: b.lessonId, day: cells.B.day, period: cells.B.period },
        { lessonId: a.lessonId, day: cells.AM.day, period: cells.AM.period },
        { lessonId: b.lessonId, day: cells.BM.day, period: cells.BM.period },
      ];
      window.Editor.render(document.querySelector(".chrx-editor") || document.body);
      const lesson = S._idx.lessonById[b.lessonId];
      const subject = S._idx.subjectById[lesson.subjectId];
      return {
        a: a.lessonId,
        b: b.lessonId,
        row: a.row,
        label: (subject && (subject.abbr || subject.abbreviation || subject.shortName || subject.name)) || "",
      };
    },
    { cells: { A: A_CELL, B: B_CELL, AM: A_MIRROR, BM: B_MIRROR } }
  );
  expect(pair, "need two lessons sharing a class row").not.toBeNull();
  // The injected state needs a completed render before any drag: otherwise the
  // pointer hits the demo grid that is still on screen.
  await expect
    .poll(async () => page.locator("#editor-root .chrx-vkarta").count(), { timeout: 10_000 })
    .toBe(4);
  await expect(page.locator(`${slotSel(B_CELL)} .chrx-vkarta`).first()).toBeVisible();
  return pair;
}

function state(page) {
  return page.evaluate(() => {
    const S = window.APP.school;
    const per = {};
    for (const el of document.querySelectorAll("#editor-root .chrx-vkarta")) {
      const slot = el.closest(".chrx-slot");
      const key = `${slot.dataset.row}@${slot.dataset.day}/${slot.dataset.period}`;
      per[key] = (per[key] || 0) + 1;
    }
    return {
      placed: (S.cards || []).length,
      keys: (S.cards || []).map((c) => `${c.lessonId}@${c.day}/${c.period}`).sort(),
      stacked: Object.entries(per).filter(([, n]) => n > 1),
      inHand: !!window.APP.editor.cardInHand,
      toasts: Array.from(document.querySelectorAll(".chrx-toast__msg")).map((e) => e.textContent),
      collisionMenu: !!document.querySelector(".chrx-collision-popup__option"),
    };
  });
}

async function drag(page, fromCell, toCell) {
  const from = await page.locator(slotSel(fromCell)).first().boundingBox();
  const to = await page.locator(slotSel(toCell)).first().boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 6, from.y + from.height / 2 + 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(450);
}

test("dropping a card onto an occupied slot keeps every card and announces the swap", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await loadDemoSchool(page);
  const pair = await seedRepro(page);

  const before = await state(page);
  expect(before.placed).toBe(4);

  await drag(page, A_CELL, B_CELL);
  const after = await state(page);

  // Conservation: placed + the card riding the cursor must equal the start.
  expect(
    after.placed + (after.inHand ? 1 : 0),
    `card count changed: 4 before, ${after.placed} placed + ${after.inHand ? 1 : 0} in hand after`
  ).toBe(before.placed);
  expect(after.stacked, "the swap stacked two cards in one cell").toEqual([]);
  expect(after.collisionMenu, "a clean swap should not be blocked").toBe(false);
  expect(after.inHand, "a clean swap should hand the displaced card to the cursor").toBe(true);

  // The displaced card rides the pointer; a card that silently left the grid
  // with nothing naming it is exactly what read as data loss (B1).
  expect(
    after.toasts.some((t) => t.includes(pair.label) && /hand|unplaced/i.test(t)),
    `no announcement naming ${pair.label}; toasts: ${JSON.stringify(after.toasts)}`
  ).toBe(true);

  // Escape must resolve the carried card, never lose it: it becomes Unplaced and
  // is announced as such. The completed drop stands — Escape cancels the held
  // card, it does not undo a committed swap.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const parked = await state(page);
  expect(parked.inHand, "Escape left a card in hand").toBe(false);
  expect(parked.stacked, "Escape left two cards in one cell").toEqual([]);
  expect(parked.placed, "Escape kept both the swap and the carried card").toBe(3);
  expect(
    parked.toasts.some((t) => t.includes(pair.label) && /unplaced/i.test(t)),
    `no Unplaced notice for ${pair.label}; toasts: ${JSON.stringify(parked.toasts)}`
  ).toBe(true);

  expect(errors, `console/page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("handling a parked card while picking up another never stacks a cell or wipes a lesson", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await loadDemoSchool(page);
  const pair = await seedRepro(page);

  // Swap 1: A onto B's cell. B is handed to the cursor.
  await drag(page, A_CELL, B_CELL);
  const afterFirst = await state(page);
  expect(afterFirst.collisionMenu, "first swap unexpectedly blocked").toBe(false);
  expect(afterFirst.inHand).toBe(true);
  expect(afterFirst.stacked).toEqual([]);

  // Now the user grabs a different card while B is still parked in the cursor.
  // This used to put B back on the cell the dragged card had taken, leaving two
  // cards in one cell — the same defect as B1, reached by a different gesture.
  await page.locator(`${slotSel(A_MIRROR)} .chrx-vkarta`).first().click();
  await page.waitForTimeout(600);
  const after = await state(page);

  expect(after.stacked, "two cards ended up in one cell").toEqual([]);
  expect(after.placed, "no card may be added or removed by handling the parked one").toBe(3);
  // Neither seeded lesson may be wiped out entirely: each still holds a
  // placement (or is the card now in hand).
  for (const lessonId of [pair.a, pair.b]) {
    const held = await page.evaluate(
      (id) => !!window.APP.editor.cardInHand && window.APP.editor.cardInHand.lessonId === id,
      lessonId
    );
    const stillPlaced = after.keys.some((k) => k.startsWith(lessonId + "@"));
    expect(stillPlaced || held, `lesson ${lessonId} vanished from the timetable`).toBe(true);
  }
  expect(errors, `console/page errors: ${errors.join(" | ")}`).toEqual([]);
});
