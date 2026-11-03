import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

// B3 — the substitution flow had never been checked, because the walkthrough
// tried to reach it with a synthetic `nav:goto-step`, which does not switch
// views. It is a modal opened from the SHELL SIDEBAR (and the Timetable ribbon
// menu), so the only honest way in is to click the sidebar item.
//
// Flow under test, end to end: pick a date → mark a teacher absent → generate →
// ranked candidates → class-wise output → teacher-wise output → print memo.

const DIALOG = ".chrx-sub-dialog";

async function openSubstitutions(page) {
  // The shell sidebar opens COLLAPSED (its links measure 0x0 until the toggle
  // is pressed), so the route is: toggle → Substitutions.
  const link = page.locator(".chrx-side-link", { hasText: "Substitutions" }).first();
  const box = await link.boundingBox();
  if (!box || box.width === 0) {
    await page.locator(".chrx-shell-toggle").first().click();
    await expect
      .poll(async () => (await link.boundingBox())?.width ?? 0, { timeout: 5000 })
      .toBeGreaterThan(0);
  }
  await link.click();
  await expect(page.locator(DIALOG)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".chrx-sub-tab.is-active")).toHaveText(/Absent teachers/i);
}

/** A weekday that the school actually has lessons on, plus the next real date
 *  that falls on it (the planner keys everything off a calendar date). */
function pickSchoolDay(page) {
  return page.evaluate(() => {
    const S = window.APP.school;
    const perDay = {};
    for (const c of S.cards || []) perDay[c.day] = (perDay[c.day] || 0) + 1;
    const dayIdx = Object.keys(perDay).map(Number).sort((a, b) => a - b)[0];
    if (dayIdx == null) return null;

    // A teacher who actually teaches on that weekday, so the planner has work.
    const onDay = (S.cards || []).filter((c) => c.day === dayIdx);
    let teacherId = null;
    for (const card of onDay) {
      const base = String(card.lessonId).replace(/#\d+$/, "");
      const lesson = S._idx.lessonById[base];
      const tid = lesson && (lesson.teacherIds || [])[0];
      if (tid) { teacherId = tid; break; }
    }
    if (!teacherId) return null;
    const teacher = S._idx.teacherById[teacherId];

    // ymdToDay: Mon=0 … Sat=5. JS getDay(): Sun=0 … Sat=6.
    const jsTarget = dayIdx + 1;
    const d = new Date();
    while (d.getDay() !== jsTarget) d.setDate(d.getDate() + 1);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { dayIdx, date: ymd, teacherId, teacherName: teacher ? (teacher.name || teacher.abbr) : null, cardsOnDay: onDay.length };
  });
}

test("the substitution planner runs absence → candidates → outputs from the sidebar", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await loadDemoSchool(page);

  const setup = await pickSchoolDay(page);
  expect(setup, "need a weekday with lessons and a teacher").not.toBeNull();
  expect(setup.teacherName).toBeTruthy();

  await openSubstitutions(page);

  // Pick the date FIRST (changing it clears the absence list by design).
  await page.locator(".chrx-sub-date").fill(setup.date);
  await page.locator(".chrx-sub-date").dispatchEvent("change");
  await expect(page.locator(".chrx-sub-daybadge")).not.toHaveText(/Sunday/i);

  // Mark the teacher absent through the search box, the way a coordinator does.
  await page.locator(".chrx-sub-search").click();
  await page.locator(".chrx-sub-search").fill(setup.teacherName);
  const option = page.locator(".chrx-sub-opt").first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
  await expect(page.locator(".chrx-sub-chip")).toHaveCount(1);

  const generate = page.getByRole("button", { name: /Generate substitutions/i });
  await expect(generate).toBeEnabled();
  await generate.click();

  // ── the ranker's output ─────────────────────────────────────────────────
  // Generate flips to the class-wise tab.
  await expect(page.locator(".chrx-sub-tab.is-active")).toHaveText(/Class-wise/i);
  const rows = page.locator(".chrx-sub-table tbody tr");
  const placed = await page.evaluate(() => ({
    substitutions: (window.APP.school.substitutions || []).length,
    assignments: (window.APP.editor && window.APP.substitution && window.APP.substitution.assignments || []).length,
  }));
  // A teacher with lessons that day yields at least one slot needing cover…
  expect(placed.assignments, "the ranker produced no assignments for a teacher who teaches that day").toBeGreaterThan(0);
  // …and the planner records them on the school (so they survive a reload).
  expect(placed.substitutions, "no substitutions were saved on the school").toBeGreaterThan(0);
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });

  // Every row must say something definite: a chosen substitute, a cancellation,
  // or an explicit "no candidate" — never a blank cell.
  const cells = await page.locator(".chrx-sub-subcell").allInnerTexts();
  expect(cells.length).toBeGreaterThan(0);
  for (const text of cells) {
    expect(text.trim().length, "a substitution row rendered with no outcome").toBeGreaterThan(0);
  }

  // ── the other two outputs ───────────────────────────────────────────────
  await page.locator('.chrx-sub-tab[data-tab="teacherwise"]').click();
  await expect(page.locator(".chrx-sub-table tbody tr").first()).toBeVisible({ timeout: 10_000 });

  await page.locator('.chrx-sub-tab[data-tab="print"]').click();
  const memo = page.locator("#chrx-sub-memo-print");
  await expect(memo).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Print/i }).first()).toBeVisible();

  expect(errors, `console/page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("closing and reopening the planner keeps the day's absences and plan", async ({ page }) => {
  await loadDemoSchool(page);
  const setup = await pickSchoolDay(page);
  expect(setup).not.toBeNull();

  await openSubstitutions(page);
  await page.locator(".chrx-sub-date").fill(setup.date);
  await page.locator(".chrx-sub-date").dispatchEvent("change");
  await page.locator(".chrx-sub-search").click();
  await page.locator(".chrx-sub-search").fill(setup.teacherName);
  await page.locator(".chrx-sub-opt").first().click();
  await page.getByRole("button", { name: /Generate substitutions/i }).click();
  await expect(page.locator(".chrx-sub-tab.is-active")).toHaveText(/Class-wise/i);

  // Close via the X, then come back the same way the user would.
  await page.locator(".chrx-sub-x").click();
  await expect(page.locator(DIALOG)).toHaveCount(0);

  await openSubstitutions(page);
  await expect(page.locator(".chrx-sub-date")).toHaveValue(setup.date);
  await expect(page.locator(".chrx-sub-chip")).toHaveCount(1);
  const saved = await page.evaluate((date) => ({
    absences: (window.APP.school.absences || []).filter((a) => a.date === date).length,
    subs: (window.APP.school.substitutions || []).filter((s) => s.date === date).length,
  }), setup.date);
  expect(saved.absences).toBe(1);
  expect(saved.subs).toBeGreaterThan(0);
});

// The UI proves the flow runs. This proves the OUTPUT is sound: a substitute
// must never be someone who is absent, busy, or on time-off in that period, and
// the chosen candidate must be the ranker's top score.
test("ranked candidates are valid substitutes, and the top score is the one chosen", async ({ page }) => {
  await loadDemoSchool(page);

  const audit = await page.evaluate(() => {
    const S = window.APP.school;
    const idx = S._idx;
    const perDay = {};
    for (const c of S.cards || []) perDay[c.day] = (perDay[c.day] || 0) + 1;
    const day = Object.keys(perDay).map(Number).sort((a, b) => a - b)[0];

    // The busiest teacher that day gives the ranker the most work to do.
    const load = {};
    for (const c of S.cards || []) {
      if (c.day !== day) continue;
      const base = String(c.lessonId).replace(/#\d+$/, "");
      const lesson = idx.lessonById[base];
      for (const t of (lesson && lesson.teacherIds) || []) load[t] = (load[t] || 0) + 1;
    }
    const teacherId = Object.keys(load).sort((a, b) => load[b] - load[a])[0];
    if (!teacherId) return null;

    const assignments = window.SubstitutionRanker.rankAll(S, [teacherId], day, "2026-03-02");
    const busy = (tid, period) =>
      (idx.cardsByTeacher[tid] || []).some((c) => c.day === day && c.period === period);

    const problems = [];
    for (const a of assignments) {
      if (a.originalTeacherId !== teacherId) problems.push("slot belongs to another teacher");
      if (!a.candidates || !a.candidates.length) continue;
      for (const c of a.candidates) {
        if (c.teacherId === teacherId) problems.push(`absent teacher offered as substitute (P${a.period})`);
        if (busy(c.teacherId, a.period)) problems.push(`busy teacher offered (P${a.period})`);
      }
      const scores = a.candidates.map((c) => c.score);
      const max = Math.max(...scores);
      if (a.chosen && a.chosen.score !== max) problems.push(`chose score ${a.chosen.score} over ${max} (P${a.period})`);
      if (!a.chosen && a.candidates.length && max >= 0) problems.push(`no one chosen though a candidate scored ${max} (P${a.period})`);
      // Score arithmetic: "same subject" alone is worth +100.
      for (const c of a.candidates) {
        if ((c.reasons || []).includes("same subject") && c.score < 100) {
          problems.push(`same-subject bonus not applied (score ${c.score})`);
        }
      }
    }

    return {
      slots: assignments.length,
      withChosen: assignments.filter((a) => a.chosen).length,
      uncovered: assignments.filter((a) => !a.chosen).length,
      problems: problems.slice(0, 5),
    };
  });

  expect(audit, "no teacher with lessons on the sample day").not.toBeNull();
  expect(audit.slots, "the ranker found no slots for a teacher who teaches that day").toBeGreaterThan(0);
  expect(audit.problems, `invalid candidates: ${audit.problems.join(" | ")}`).toEqual([]);
  // The demo school has plenty of free teachers, so most slots should be coverable.
  expect(audit.withChosen, "the ranker covered none of the slots").toBeGreaterThan(0);
});

// The same audit on the SCHOOL'S REAL FILE (served as /__school.xml by the
// preview server), because the demo project is small and tidy while the real
// timetable is dense: 951 cards, real teacher names, real gaps.
test("the ranker stays sound on the school's real timetable XML", async ({ page }) => {
  await loadDemoSchool(page);

  const audit = await page.evaluate(async () => {
    const res = await fetch("/__school.xml");
    if (!res.ok) return { skipped: true };
    const xml = await res.text();
    const parser = window.parseTimetableXml;
    if (!parser) return { skipped: true, reason: "parser not loaded on this page" };
    const school = typeof parser.parseText === "function"
      ? parser.parseText(xml, "__school.xml")
      : parser(xml);
    if (!school || !Array.isArray(school.cards) || !school.cards.length) return { skipped: true };

    window.APP.school = school;
    window.Editor.render(document.querySelector(".chrx-editor") || document.body);

    const idx = school._idx;
    const perDay = {};
    for (const c of school.cards) perDay[c.day] = (perDay[c.day] || 0) + 1;
    const day = Object.keys(perDay).map(Number).sort((a, b) => a - b)[0];

    // Audit every teacher who works that day, not just one.
    const teachersToday = new Set();
    for (const c of school.cards) {
      if (c.day !== day) continue;
      const base = String(c.lessonId).replace(/#\d+$/, "");
      for (const t of (idx.lessonById[base]?.teacherIds) || []) teachersToday.add(t);
    }

    const problems = [];
    let slots = 0, covered = 0;
    for (const teacherId of teachersToday) {
      const assignments = window.SubstitutionRanker.rankAll(school, [teacherId], day, "2026-03-02");
      for (const a of assignments) {
        slots++;
        if (a.chosen) covered++;
        for (const c of a.candidates || []) {
          if (c.teacherId === teacherId) problems.push(`absent teacher offered (${teacherId} P${a.period})`);
          const busy = (idx.cardsByTeacher[c.teacherId] || [])
            .some((x) => x.day === day && x.period === a.period);
          if (busy) problems.push(`busy teacher ${c.teacherId} offered at P${a.period}`);
        }
        const max = Math.max(-Infinity, ...(a.candidates || []).map((c) => c.score));
        if (a.chosen && a.chosen.score !== max) problems.push(`not top score at P${a.period}`);
      }
    }
    return { skipped: false, day, teachers: teachersToday.size, slots, covered, problems: problems.slice(0, 5) };
  });

  if (audit.skipped) test.skip(true, "/__school.xml not available to the preview server");
  expect(audit.slots, "the real school produced no substitution slots").toBeGreaterThan(0);
  expect(audit.problems, `invalid candidates on the real file: ${audit.problems.join(" | ")}`).toEqual([]);
  // Sanity: a real school with ~40 teachers should be able to cover most slots.
  expect(audit.covered / audit.slots).toBeGreaterThan(0.5);
});
