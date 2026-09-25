import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

// Lane W3-1 — automatic backups + version history.
//
// The whole flow a coordinator performs: make edits, open Files → Version
// history, see one version per edit, preview a version read-only, diff a
// version against the current timetable, restore an old version, then ⌘Z the
// restore back.

function versionCount(page) {
  return page.evaluate(() => window.VersionHistory.list().then((l) => l.length));
}

/** Where does this lesson sit right now? Read from APP.school, not the DOM. */
function slotOf(page, lessonId) {
  return page.evaluate((id) => {
    const card = (window.APP.school.cards || []).find((c) => c.lessonId === id);
    return card ? { day: card.day, period: card.period } : null;
  }, lessonId);
}

/** A single-period card whose lesson is placed EXACTLY ONCE in the whole
 *  school, so "where is this lesson" has one answer for the assertions. */
function pickUniqueCard(page) {
  return page.evaluate(() => {
    const S = window.APP.school;
    const counts = new Map();
    for (const c of S.cards || []) counts.set(c.lessonId, (counts.get(c.lessonId) || 0) + 1);
    const card = [...document.querySelectorAll('#editor-root .chrx-vkarta:not(.locked)[data-block-len="1"]')]
      .find((el) => counts.get(el.dataset.lessonId) === 1);
    return card ? { ...card.dataset } : null;
  });
}

/** An occupied slot in another single-period lesson's place — dropping on it
 *  swaps (or, when the swap cannot fit, offers the collision menu). */
async function pickTarget(page, excludeLessonId) {
  return page.evaluate((exclude) => {
    const slots = [...document.querySelectorAll("#editor-root .chrx-slot:not(.out-of-bell)")];
    for (const slot of slots) {
      const card = slot.querySelector(".chrx-vkarta");
      if (!card || card.dataset.lessonId === exclude) continue;
      if (card.dataset.blockLen && card.dataset.blockLen !== "1") continue;
      return { day: slot.dataset.day, period: slot.dataset.period };
    }
    return null;
  }, excludeLessonId);
}

/** Drag one placed card onto another occupied slot — a real mouse drag. */
async function dragCardOnto(page, lessonId, target) {
  const source = page.locator(`#editor-root .chrx-vkarta[data-lesson-id="${lessonId}"]`).first();
  const slot = page.locator(`#editor-root .chrx-slot[data-day="${target.day}"][data-period="${target.period}"]`).first();
  const from = await source.boundingBox();
  const to = await slot.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  // A swap that could not fit cleanly shows the collision menu instead.
  const force = page.locator('.chrx-collision-popup__option[data-act="force"]');
  if (await force.count()) await force.click();
  else await page.keyboard.press("Escape");   // drop the card the swap displaced
  await expect(page.locator(".chrx-card-ghost")).toHaveCount(0, { timeout: 5_000 });
}

test("3 edits produce 3+ versions; preview, diff and restore work and ⌘Z undoes the restore", async ({ page }) => {
  await loadDemoSchool(page);

  // The demo load itself is the first version.
  await expect.poll(() => versionCount(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

  const firstCard = await pickUniqueCard(page);
  expect(firstCard).not.toBeNull();
  const homeSlot = { day: Number(firstCard.day), period: Number(firstCard.period) };

  // ── 3 user edits ────────────────────────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const before = await versionCount(page);
    const target = await pickTarget(page, firstCard.lessonId);
    expect(target).not.toBeNull();
    await dragCardOnto(page, firstCard.lessonId, target);
    await expect.poll(() => versionCount(page), { timeout: 20_000 }).toBeGreaterThan(before);
  }

  const afterEdits = await versionCount(page);
  expect(afterEdits).toBeGreaterThanOrEqual(3);           // the lane's bar
  const movedSlot = await slotOf(page, firstCard.lessonId);
  expect(movedSlot).not.toEqual(homeSlot);

  // ── Files → Version history ────────────────────────────────────────────
  // The ribbon itself is hidden inside the editor shell, so the entry points
  // are asserted here and opened through the shell's ⌘K palette (which lists
  // the sidebar's Files section). The ribbon Files menu carries the same
  // command, and the command palette flattens every ribbon menu.
  await expect(page.locator('.chrx-side-link', { hasText: "Version history" })).toHaveCount(1);
  expect(await page.evaluate(() => {
    const files = (window.APP.ribbon.menus || []).find((m) => m.key === "files");
    const item = files && files.build().find((e) => e.label === "Version history…");
    return item ? { hasRun: typeof item.run === "function", disabled: !!item.disabled } : null;
  })).toEqual({ hasRun: true, disabled: false });
  // …and that command really is what opens this panel.
  await page.evaluate(() => {
    const files = window.APP.ribbon.menus.find((m) => m.key === "files");
    files.build().find((e) => e.label === "Version history…").run();
  });
  await expect(page.locator("#chrx-version-history")).toBeVisible();
  await page.locator("#chrx-version-history .chrx-vh-close").click();

  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#chrx-palette input").fill("Version history");
  await page.locator("#chrx-palette .chrx-palette-item", { hasText: "Version history" }).first().click();

  const panel = page.locator("#chrx-version-history");
  await expect(panel).toBeVisible();
  const rows = panel.locator("[data-vh-version]");
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });   // list() is async
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  // Newest first, labelled with the last undo label.
  await expect(rows.first()).toHaveAttribute("data-vh-label", /Move card|Swap cards/);
  await expect(rows.first().locator(".chrx-vh-stat")).toHaveText(/cards/);

  // ── Preview a version read-only (published viewer, not the editor) ──────
  await rows.first().locator('[data-vh-act="preview"]').click();
  const mount = panel.locator(".chrx-vh-preview-mount");
  await expect(mount.locator(".chrx-pub")).toBeVisible({ timeout: 20_000 });
  await expect(mount.locator(".chrx-pub-grid")).toBeVisible();
  await expect(mount.locator(".chrx-vkarta")).toHaveCount(0);
  await panel.locator('[data-vh-act="back"]').click();
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });

  // ── Diff vs current: the moved lesson ───────────────────────────────────
  const oldest = rows.last();
  await oldest.locator('[data-vh-act="diff"]').click();
  const diff = panel.locator(".chrx-vh-diff");
  await expect(diff).toBeVisible();
  await expect(diff.locator("[data-vh-diff-summary]")).toHaveText(/\d+ moved · \d+ added · \d+ removed/);
  const movedItems = diff.locator(".chrx-vh-diff__item--moved");
  expect(await movedItems.count()).toBeGreaterThanOrEqual(1);
  await expect(movedItems.first()).toHaveText(/moved .+ → .+/);
  await panel.locator('[data-vh-act="back"]').click();
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });

  // ── Restore the oldest version (the load state) ─────────────────────────
  page.once("dialog", (d) => d.accept());
  await rows.last().locator('[data-vh-act="restore"]').click();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => slotOf(page, firstCard.lessonId), { timeout: 20_000 }).toEqual(homeSlot);
  // …and the grid shows it back home.
  await expect(
    page.locator(`#editor-root .chrx-slot[data-day="${homeSlot.day}"][data-period="${homeSlot.period}"] .chrx-vkarta[data-lesson-id="${firstCard.lessonId}"]`)
  ).toHaveCount(1, { timeout: 20_000 });

  // ── ⌘Z re-applies the edits (the restore is one undoable step) ──────────
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => slotOf(page, firstCard.lessonId), { timeout: 20_000 }).toEqual(movedSlot);
  await expect(
    page.locator(`#editor-root .chrx-slot[data-day="${movedSlot.day}"][data-period="${movedSlot.period}"] .chrx-vkarta[data-lesson-id="${firstCard.lessonId}"]`)
  ).toHaveCount(1, { timeout: 20_000 });
});

// The lane spec requires manual Save / Save as to keep working: the backup ring
// is a second, independent store and must not have taken over the ribbon's
// Save path (io/snapshot.js still owns it).
test("manual Save and Save as… still work alongside the automatic backups", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loadDemoSchool(page);

  // "Save as…" prompts for a name and writes the manual snapshot store.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:save-as")));
  const dlg = page.locator(".chrx-dlg");
  await expect(dlg).toBeVisible();
  await expect(dlg.locator("h2")).toHaveText(/Save as/);
  await dlg.locator("input[type=text]").fill("W3-1 manual snapshot");
  await dlg.getByRole("button", { name: "Save" }).click();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("chronexa.snapshots") || "[]"));
  expect(stored.map((s) => s.name)).toContain("W3-1 manual snapshot");

  // A second Save updates that named snapshot instead of prompting again.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:save")));
  await expect(dlg).toHaveCount(0);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("chronexa.snapshots") || "[]"));
  expect(after.length).toBe(1);
  expect(errors).toEqual([]);
});
