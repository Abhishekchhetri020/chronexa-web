import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

/** Rotate the header perspective button until the Supervision view is active. */
async function switchToSupervision(page) {
  const persBtn = page.locator("#editor-perspective");
  for (let i = 0; i < 8; i++) {
    const text = await persBtn.textContent();
    if (/by supervision/i.test(text || "")) break;
    await persBtn.click();
  }
  await expect(persBtn).toHaveText(/by supervision/i);
}

test("Supervision view: empty plan says so, seeded duties show the supervisor per area/day/period", async ({ page }) => {
  await loadDemoSchool(page);
  await switchToSupervision(page);

  // The bundled demo ships no classroomsupervisions rows — the view must say
  // that instead of showing a blank grid, and must offer the entity dialog.
  const empty = page.locator("#editor-root .chrx-sup-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText(/no supervision slots yet/i);
  await expect(empty.locator('[data-editor-tool="open-supervisions"]')).toBeVisible();
  await expect(page.locator("#editor-root .chrx-sup-chip")).toHaveCount(0);

  // Seed three supervision slots through the app's own write path.
  const seeded = await page.evaluate(() => {
    const S = window.APP.school;
    const before = (S.classroomsupervisions || []).length;
    window.SupervisionView.seedFixture(S);
    return {
      before,
      after: S.classroomsupervisions.length,
      canUndo: !!window.APP.history.canUndo,
      summary: window.SupervisionView.supervisionSummary(S),
      rows: window.SupervisionView.rowsFor(S).map(r => ({ key: r.key, label: r.label, sub: r.sub })),
    };
  });
  expect(seeded.before).toBe(0);
  expect(seeded.after).toBe(3);
  expect(seeded.canUndo).toBe(true); // the seed goes through APP.mutate, so ⌘Z undoes it
  expect(seeded.summary.duties).toBe(3);
  expect(seeded.summary.conflicts).toBe(1); // one slot deliberately clashes with teaching

  // Read-only, and it says so.
  await expect(page.locator("#editor-root .chrx-sup-hint")).toContainText(/read-only/i);
  await expect(page.locator("#editor-root .chrx-readonly").first()).toBeVisible();

  // Focus board: the first supervised area's week, with the supervisor's full name.
  const focusChip = page.locator("#editor-root .chrx-sup-chip").first();
  await expect(focusChip).toBeVisible();
  const focusName = await focusChip.locator(".chrx-sup-chip__teacher").textContent();
  await expect(focusChip).toHaveAttribute("data-teacher-name", focusName || "");
  expect(focusName.trim().length).toBeGreaterThan(2); // a real name, not initials

  // Overview: one row per supervised area, with a chip per duty.
  await page.locator('[data-focus-nav="overview"]').click();
  const chips = page.locator("#editor-root .chrx-sup-chip");
  await expect(chips).toHaveCount(seeded.summary.duties);
  // One row per supervised area (the grid header row is not an area).
  await expect(page.locator("#editor-root .chrx-row:not(.chrx-row-head)")).toHaveCount(seeded.rows.length);
  for (const row of seeded.rows) {
    await expect(page.locator(`#editor-root .chrx-row[data-row="${row.key}"] .chrx-rowlabel`)).toContainText(row.label);
  }

  // The names on the chips are the teachers who are actually on duty.
  const firstRow = seeded.rows.find(r => /dut(y|ies)/.test(r.sub));
  const firstRowChip = page.locator(`#editor-root .chrx-row[data-row="${firstRow.key}"] .chrx-sup-chip`).first();
  await expect(firstRowChip.locator(".chrx-sup-chip__teacher")).not.toBeEmpty();
  await expect(firstRowChip).toHaveAttribute("data-teacher-id", /.+/);
  // A ~30px overview cell cannot hold "Ms. Ankita Sharma", so it shows initials
  // and keeps the full name in the tooltip — like the subject codes next door.
  await expect(firstRowChip).toHaveClass(/chrx-sup-chip--compact/);
  await expect(firstRowChip.locator(".chrx-sup-chip__teacher")).toHaveText(/^[A-Z?]{1,3}$/);
  await expect(firstRowChip).toHaveAttribute("data-teacher-name", /[A-Za-z]{3,}/);

  // A cell with no supervisor is a gap, not a lesson slot.
  expect(await page.locator("#editor-root .chrx-sup-gap").count()).toBeGreaterThan(0);

  // The clash between supervising and teaching is visible, and explains itself.
  const conflicted = page.locator("#editor-root .chrx-sup-chip--conflict");
  await expect(conflicted).toHaveCount(1);
  await expect(conflicted.first()).toHaveAttribute("data-conflict", /Teaching/);
  await expect(conflicted.first().locator(".chrx-sup-chip__warn")).toContainText(/⚠/);

  // Overview stats describe the supervision plan, not the lesson grid.
  const stats = page.locator("#chrx-ob-stats");
  await expect(stats).toContainText("duties");
  await expect(stats).toContainText(/conflicts?/);
  await expect(stats).not.toContainText("unplaced");
});

test("Supervision view is read-only: chips cannot be picked up, dropped or right-clicked into a lesson slot", async ({ page }) => {
  await loadDemoSchool(page);
  await switchToSupervision(page);
  await page.evaluate(() => window.SupervisionView.seedFixture(window.APP.school));
  await page.locator('[data-focus-nav="overview"]').click();

  const cardsBefore = await page.evaluate(() => window.APP.school.cards.length);

  const chip = page.locator("#editor-root .chrx-sup-chip").first();
  await expect(chip).toBeVisible();
  const box = await chip.boundingBox();
  expect(box).not.toBeNull();

  // A click must not open the card panel or put anything "in hand".
  await chip.click();
  await expect(page.locator(".chrx-card-ghost")).toHaveCount(0);
  expect(await page.evaluate(() => window.APP?.editor?.cardInHand || null)).toBeFalsy();

  // A drag across the board must not pick the chip up or move any card.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 140, { steps: 10 });
  await expect(page.locator(".chrx-card-ghost")).toHaveCount(0);
  expect(await page.evaluate(() => window.APP?.editor?.cardInHand || null)).toBeFalsy();
  await page.mouse.up();

  expect(await page.evaluate(() => window.APP.school.cards.length)).toBe(cardsBefore);
  await expect(page.locator("#editor-root .chrx-sup-chip")).toHaveCount(
    await page.evaluate(() => window.SupervisionView.supervisionSummary(window.APP.school).duties)
  );

  // A gap cell is not a lesson drop target either: no "place lesson here" menu.
  const gap = page.locator("#editor-root .chrx-sup-gap").first();
  await expect(gap).toBeVisible();
  await gap.click({ button: "right" });
  await expect(page.getByText("Place lesson here")).toHaveCount(0);

  // Returning to the By-Class grid still works and still drags.
  const persBtn = page.locator("#editor-perspective");
  for (let i = 0; i < 8; i++) {
    if (/by class/i.test((await persBtn.textContent()) || "")) break;
    await persBtn.click();
  }
  await expect(persBtn).toHaveText(/by class/i);
  await expect(page.locator("#editor-root .chrx-vkarta").first()).toBeVisible();
});
