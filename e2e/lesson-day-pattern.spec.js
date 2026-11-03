import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

// B2 — the lesson dialog carries "Day pattern", "Week pattern" and "Term".
// Nothing had ever exercised them, and two things were wrong:
//
//  · the solver ignored the day pattern entirely, so a "Monday only" lesson was
//    timetabled on any day (covered by js/solver/__tests__/day_pattern.test.js);
//  · the dialog could not show or select the file's own patterns. The dropdown
//    listed freshly seeded defaults while an imported lesson points at the ids
//    in school.daysDefs, so the control fell back to its first option — a lesson
//    with no pattern read "Monday", and its real pattern was unselectable.
//
// This drives the dialog the way a coordinator does and asserts the round trip.

const DIALOG = ".chrx-ent-sheet";

/** The select control that belongs to a named field in the edit sheet. */
function fieldSelect(page, label) {
  return page.evaluate((wanted) => {
    const rows = Array.from(document.querySelectorAll("label, div"));
    for (const row of rows) {
      const text = (row.firstChild && row.firstChild.textContent || "").trim();
      if (text !== wanted) continue;
      const sel = row.querySelector("select");
      if (sel) return true;
    }
    return false;
  }, label);
}

async function openLesson(page, lessonId) {
  await page.evaluate((id) => window.EntityLessons.open({ focusLessonId: id }), lessonId);
  await expect(page.locator(DIALOG).first()).toBeVisible({ timeout: 10_000 });
  // The table opens first, then the edit sheet for the focused lesson.
  await expect
    .poll(async () => page.locator("select").count(), { timeout: 10_000 })
    .toBeGreaterThan(3);
}

/** Read the Day pattern select's current value + options. */
function dayPatternControl(page) {
  return page.evaluate(() => {
    for (const sel of document.querySelectorAll("select")) {
      const options = Array.from(sel.options);
      if (!options.length) continue;
      const looksLikeDayPattern = options.some((o) => /\(Mo\)|Monday|Every day|day/i.test(o.textContent));
      if (!looksLikeDayPattern) continue;
      return {
        value: sel.value,
        selected: options[sel.selectedIndex] ? options[sel.selectedIndex].textContent.trim() : null,
        options: options.map((o) => ({ value: o.value, text: o.textContent.trim() })),
      };
    }
    return null;
  });
}

async function save(page) {
  const btn = page.getByRole("button", { name: /^(Save|Save changes|Apply)$/i }).first();
  await btn.click();
  await expect(page.locator(DIALOG).first()).toBeHidden({ timeout: 10_000 });
}

test("the day pattern is shown truthfully, can be changed, and persists", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await loadDemoSchool(page);

  // Imported lessons almost always carry a pattern, so build both cases: one
  // lesson with its imported pattern, one with none.
  const target = await page.evaluate(() => {
    const S = window.APP.school;
    const withPattern = (S.lessons || []).find((l) => l.daysDefId);
    const plain = (S.lessons || []).find((l) => l !== withPattern && !l.daysDefId);
    if (!withPattern) return null;
    const second = plain || (S.lessons || []).find((l) => l !== withPattern);
    if (!second) return null;
    delete second.daysDefId;
    return {
      withPattern: { id: withPattern.id, daysDefId: withPattern.daysDefId },
      noPattern: { id: second.id },
      imported: (S.daysDefs || []).map((d) => ({ id: d.id, name: d.name, bits: d.bits })),
    };
  });
  expect(target, "need two lessons and the file's day patterns").not.toBeNull();
  expect(target.imported.length).toBeGreaterThan(0);

  // ── a lesson WITH a pattern shows that pattern, and it is selectable ─────
  await openLesson(page, target.withPattern.id);
  const shown = await dayPatternControl(page);
  expect(shown, "no Day pattern control found").not.toBeNull();
  for (const def of target.imported) {
    expect(
      shown.options.some((o) => o.value === def.id),
      `imported day pattern ${def.name} (${def.id}) is missing from the dropdown`
    ).toBe(true);
  }
  expect(shown.value, "the lesson's own imported pattern is not selected").toBe(
    target.withPattern.daysDefId
  );
  await page.getByRole("button", { name: /^Cancel$/ }).first().click();
  await expect(page.locator(DIALOG).first()).toBeHidden({ timeout: 10_000 });

  // ── a lesson WITHOUT a pattern must read "—", not the first entry ───────
  await openLesson(page, target.noPattern.id);
  const blank = await dayPatternControl(page);
  expect(
    blank.value,
    `a lesson with no pattern must not show ${blank.selected}`
  ).toBe("");

  // Pick a different pattern and save.
  const pick = target.imported.find((d) => d.name !== "Every day") || target.imported[0];
  await page.evaluate((id) => {
    for (const sel of document.querySelectorAll("select")) {
      if (!Array.from(sel.options).some((o) => o.value === id)) continue;
      sel.value = id;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    throw new Error("day pattern select not found");
  }, pick.id);
  await save(page);

  const stored = await page.evaluate((id) => {
    const l = window.APP.school.lessons.find((x) => x.id === id);
    return l ? l.daysDefId : null;
  }, target.noPattern.id);
  expect(stored, "the chosen day pattern did not persist on the lesson").toBe(pick.id);

  // Re-open: it comes back selected.
  await openLesson(page, target.noPattern.id);
  const reopened = await dayPatternControl(page);
  expect(reopened.value).toBe(pick.id);
  expect(errors, `console/page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("the day pattern reaches the solve used by Generate", async ({ page }) => {
  await loadDemoSchool(page);

  const setup = await page.evaluate(() => {
    const S = window.APP.school;
    const monday = (S.daysDefs || []).find((d) => d.name === "Monday");
    if (!monday) return null;
    // The fewest-periods lesson keeps the solve short and the assertion sharp.
    const lesson = (S.lessons || [])
      .filter((l) => (l.periodsPerWeek | 0) > 0 && (l.periodsPerWeek | 0) <= 2)
      .sort((a, b) => (a.periodsPerWeek | 0) - (b.periodsPerWeek | 0))[0];
    if (!lesson) return null;
    lesson.daysDefId = monday.id;
    return { lessonId: lesson.id, ppw: lesson.periodsPerWeek | 0 };
  });
  expect(setup, "need the file's Monday pattern and a small lesson").not.toBeNull();

  // Solve through the same entry point the Generate button uses.
  const days = await page.evaluate(async (lessonId) => {
    const S = window.APP.school;
    S.cards = [];
    const src = window.SolverUI.run({
      school: S,
      options: { timeLimitSec: 5, verbose: false },
      algorithm: "browser",
    });
    const res = await new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      if (src && typeof src.subscribe === "function") {
        src.subscribe((ev) => { if (ev && ev.type === "done") finish(ev.result || ev.data || ev); });
      }
      if (src && typeof src.onResult === "function") src.onResult = finish;
      setTimeout(() => finish(null), 40_000);
    });
    const rows = (res && res.assignment) || [];
    return rows
      .filter((a) => String(a.lessonId).replace(/#\d+$/, "") === lessonId)
      .map((a) => a.day);
  }, setup.lessonId);

  expect(days.length, "the Monday-only lesson was not placed at all").toBeGreaterThan(0);
  for (const d of days) {
    expect(d, `a Monday-only lesson was placed on day ${d}`).toBe(0);
  }
});
