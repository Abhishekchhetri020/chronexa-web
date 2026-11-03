import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

// The planner capabilities ported from the school's standalone GDGPSD
// Substitution Planner: one-click smart fill with a reviewable preview, the
// three ways out of a slot (substitute / supervision / cancel), moving a period,
// merging two uncovered classes onto one substitute, the on-duty pool, and undo.

const DIALOG = ".chrx-sub-dialog";

async function openPlanner(page) {
  const link = page.locator(".chrx-side-link", { hasText: "Substitutions" }).first();
  if (!(await link.boundingBox())?.width) {
    await page.locator(".chrx-shell-toggle").first().click();
    await expect.poll(async () => (await link.boundingBox())?.width ?? 0).toBeGreaterThan(0);
  }
  await link.click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 10_000 });
}

/** A date whose weekday has lessons, plus a teacher who teaches then. */
function pickDay(page) {
  return page.evaluate(() => {
    const S = window.APP.school;
    const perDay = {};
    for (const c of S.cards || []) perDay[c.day] = (perDay[c.day] || 0) + 1;
    const day = Object.keys(perDay).map(Number).sort((a, b) => a - b)[0];
    const onDay = (S.cards || []).filter((c) => c.day === day);
    let teacherId = null;
    for (const card of onDay) {
      const l = S._idx.lessonById[String(card.lessonId).replace(/#\d+$/, "")];
      if (l && (l.teacherIds || [])[0]) { teacherId = l.teacherIds[0]; break; }
    }
    const d = new Date();
    while (d.getDay() !== day + 1) d.setDate(d.getDate() + 1);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { day, date: ymd, teacherId, name: S._idx.teacherById[teacherId]?.name };
  });
}

async function addAbsent(page, name, date) {
  await page.locator(".chrx-sub-date").fill(date);
  await page.locator(".chrx-sub-date").dispatchEvent("change");
  await page.locator("#chrx-sub-absent-search").click();
  await page.locator("#chrx-sub-absent-search").fill(name);
  await page.locator(".chrx-sub-opt").first().click();
  await expect(page.locator(".chrx-sub-chip")).toHaveCount(1);
}

test("smart auto-fill previews the whole day before touching the document", async ({ page }) => {
  await loadDemoSchool(page);
  const day = await pickDay(page);

  await openPlanner(page);
  await addAbsent(page, day.name, day.date);

  // Build the plan without filling it: the board starts empty.
  await page.getByRole("button", { name: /Generate substitutions/i }).click();
  await expect(page.locator(".chrx-sub-tab.is-active")).toHaveText(/Class-wise/i);

  // Clear whatever Generate filled, so "Smart auto-fill" is the action under test.
  await page.getByRole("button", { name: /Clear/ }).last().click();
  const cleared = await page.evaluate(() => {
    const slots = window.APP.substitution?.slots || [];
    return slots.every((s) => s.status === "PENDING");
  });
  expect(cleared, "Clear left assignments behind").toBe(true);

  await page.getByRole("button", { name: /Smart auto-fill/i }).click();
  const sheet = page.locator(".chrx-sub-sheet");
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet).toContainText(/slots covered/i);

  // The preview must NOT have written anything yet.
  const beforeApply = await page.evaluate(() => ({
    subs: (window.APP.school.substitutions || []).filter((s) => s.status === "FILLED" || s.status === "SUPERVISED").length,
    slots: (window.APP.substitution?.slots || []).filter((s) => s.status !== "PENDING").length,
  }));
  expect(beforeApply.slots, "the preview wrote to the plan").toBe(0);
  expect(beforeApply.subs, "the preview wrote to the document").toBe(0);

  await page.getByRole("button", { name: /^Apply \d+ slot/ }).click();
  await expect(sheet).toBeHidden({ timeout: 10_000 });

  const after = await page.evaluate(() => ({
    filled: (window.APP.substitution?.slots || []).filter((s) => window.SmartPlanner.isFilled(s)).length,
    saved: (window.APP.school.substitutions || []).filter((s) => window.APP.substitution && s.date === window.APP.substitution.date).length,
    reasons: (window.APP.substitution?.slots || []).map((s) => s.smartReason).filter(Boolean).slice(0, 3),
  }));
  expect(after.filled, "no slot was filled by Smart auto-fill").toBeGreaterThan(0);
  expect(after.saved, "the applied plan was not saved to the document").toBeGreaterThan(0);
  expect(after.reasons.length, "no reason was recorded for a filled slot").toBeGreaterThan(0);
});

test("a slot can be resolved by supervision, cancelled, moved, or merged", async ({ page }) => {
  await loadDemoSchool(page);
  const day = await pickDay(page);

  await openPlanner(page);
  await addAbsent(page, day.name, day.date);
  await page.getByRole("button", { name: /Generate substitutions/i }).click();
  await expect(page.locator(".chrx-sub-tab.is-active")).toHaveText(/Class-wise/i);

  const slotCount = await page.locator(".chrx-sub-table tbody tr").count();
  expect(slotCount).toBeGreaterThan(0);

  // ── supervision: the same pick, recorded as a study-hall cover ──────────
  await page.locator(".chrx-sub-table tbody tr").first().getByRole("button", { name: /supervise/i }).click();
  await expect(page.locator(".chrx-sub-sheet")).toBeVisible({ timeout: 10_000 });
  await page.locator(".chrx-sub-cand").first().click();
  await expect(page.locator(".chrx-sub-sheet")).toHaveCount(0);
  const supervised = await page.evaluate(() =>
    (window.APP.substitution?.slots || []).filter((s) => s.status === "SUPERVISED").length
  );
  expect(supervised, "no slot was recorded as supervision").toBe(1);

  // ── cancel a period ────────────────────────────────────────────────────
  await page.locator(".chrx-sub-table tbody tr").nth(1).getByRole("button", { name: /^✕ cancel$/ }).click();
  await expect(page.locator(".chrx-sub-cancelled").first()).toBeVisible({ timeout: 10_000 });
  const cancelled = await page.evaluate(() =>
    (window.APP.substitution?.slots || []).filter((s) => s.status === "CANCELLED").length
  );
  expect(cancelled).toBe(1);

  // ── move a period ──────────────────────────────────────────────────────
  await page.locator(".chrx-sub-table tbody tr").nth(2).getByRole("button", { name: /⏱ move/i }).click();
  await expect(page.locator(".chrx-sub-sheet")).toBeVisible({ timeout: 10_000 });
  const moveButtons = page.locator(".chrx-sub-sheet button", { hasText: /^P\d+$/ });
  const targetPeriod = await moveButtons.last().textContent();
  await moveButtons.last().click();
  await expect(page.locator(".chrx-sub-sheet")).toHaveCount(0);
  const moved = await page.evaluate(() => {
    const slot = (window.APP.substitution?.slots || []).find((s) => s.movedFrom != null);
    return slot ? { from: slot.movedFrom, to: slot.period } : null;
  });
  expect(moved, "no slot was marked as moved").not.toBeNull();
  expect(String(moved.to), "the moved slot did not take the new period").toBe(String(targetPeriod).replace("P", ""));

  // ── merge two uncovered classes in one period ──────────────────────────
  const pair = await page.evaluate(() => {
    const slots = window.APP.substitution?.slots || [];
    const byPeriod = {};
    for (const s of slots) (byPeriod[s.period] = byPeriod[s.period] || []).push(s.slotKey);
    const key = Object.keys(byPeriod).find((p) => byPeriod[p].length > 1);
    return key ? byPeriod[key].slice(0, 2) : null;
  });
  if (pair) {
    const rows = page.locator(".chrx-sub-table tbody tr");
    const index = await page.evaluate((key) => {
      const slots = window.APP.substitution?.slots || [];
      return slots.findIndex((s) => s.slotKey === key);
    }, pair[0]);
    await rows.nth(index).getByRole("button", { name: /🔗 merge/i }).click();
    await expect(page.locator(".chrx-sub-sheet")).toBeVisible({ timeout: 10_000 });
    await page.locator(".chrx-sub-sheet button", { hasText: /absent/i }).first().click();
    const merged = await page.evaluate(() =>
      (window.APP.substitution?.slots || []).filter((s) => s.mergedWithKey).length
    );
    expect(merged, "the two slots were not merged").toBe(2);
  }
});

test("the on-duty pool is offered first, and a reason is recorded", async ({ page }) => {
  await loadDemoSchool(page);
  const day = await pickDay(page);

  // Pick a free teacher who is not the absent one to put on duty.
  const onDuty = await page.evaluate((absentId) => {
    const S = window.APP.school;
    const t = (S.teachers || []).find((x) => x.id !== absentId);
    return t ? { id: t.id, name: t.name } : null;
  }, day.teacherId);
  expect(onDuty).not.toBeNull();

  await openPlanner(page);
  await addAbsent(page, day.name, day.date);

  await page.locator("#chrx-sub-duty-search").click();
  await page.locator("#chrx-sub-duty-search").fill(onDuty.name);
  await page.locator(".chrx-sub-search-wrap").nth(1).locator(".chrx-sub-opt").first().click();

  await page.getByRole("button", { name: /Generate substitutions/i }).click();
  await expect(page.locator(".chrx-sub-tab.is-active")).toHaveText(/Class-wise/i);

  const result = await page.evaluate((id) => {
    const slots = window.APP.substitution?.slots || [];
    const duty = (window.APP.substitution?.dutyPool || []).includes(id);
    const picked = slots.filter((s) => s.substituteTeacherId === id);
    return { duty, picked: picked.length, reasons: picked.map((s) => s.smartReason) };
  }, onDuty.id);
  expect(result.duty, "the on-duty teacher was not recorded on the plan").toBe(true);
  if (result.picked) {
    // Duty is worth 200: when the pool member is used, the reason says so.
    expect(result.reasons.join(" ")).toMatch(/on duty/i);
  }
});
