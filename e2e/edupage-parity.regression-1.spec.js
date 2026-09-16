import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

const REPORT = ".gstack/qa-reports/qa-report-localhost-2026-09-16.md";

test("verification shortcut dispatches once and never replaces paste in a field", async ({ page }) => {
  // Regression: ISSUE-001 — duplicate global handlers opened two verification modals and hijacked Cmd/Ctrl+V.
  // Found by /qa on 2026-09-16
  // Report: .gstack/qa-reports/qa-report-localhost-2026-09-16.md
  await loadDemoSchool(page);
  await page.evaluate(() => {
    window.__verifyEvents = 0;
    window.addEventListener("app:verify", () => window.__verifyEvents++);
  });

  await page.keyboard.press("Meta+v");
  await expect(page.locator(".chrx-vpro-root")).toHaveCount(1);
  expect(await page.evaluate(() => window.__verifyEvents)).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".chrx-vpro-root")).toHaveCount(0);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:open-entity", {
    detail: { kind: "lessons" },
  })));
  const input = page.locator(".chrx-ent-search");
  await expect(input).toBeVisible();
  await input.focus();
  await page.keyboard.press("Meta+v");
  await expect(page.locator(".chrx-vpro-root")).toHaveCount(0);
  expect(await page.evaluate(() => window.__verifyEvents)).toBe(1);
});

test("room-row deletion removes only cards in the clicked room and remains undoable", async ({ page }) => {
  // Regression: ISSUE-002 — room perspective fell through to subjectId and cleared a subject across every room.
  // Found by /qa on 2026-09-16
  // Report: .gstack/qa-reports/qa-report-localhost-2026-09-16.md
  await loadDemoSchool(page);
  await page.evaluate(() => {
    APP.editor.perspective = "room";
    APP.editor.viewMode = "overview";
    Editor.render(document.querySelector(".chrx-editor"));
  });

  const card = page.locator('#editor-root .chrx-vkarta[data-classroom-id]:not([data-classroom-id=""])').first();
  await expect(card).toBeVisible();
  const before = await card.evaluate((node) => {
    const lesson = APP.school._idx.lessonById[node.dataset.lessonId];
    const roomId = node.closest(".chrx-row").dataset.row;
    const inRoom = APP.school.cards.filter(c => {
      const l = APP.school._idx.lessonById[c.lessonId];
      return (c.classroomId || l?.preferredRoomId) === roomId;
    }).length;
    const sameSubjectElsewhere = APP.school.cards.filter(c => {
      const l = APP.school._idx.lessonById[c.lessonId];
      return l?.subjectId === lesson.subjectId && (c.classroomId || l?.preferredRoomId) !== roomId;
    }).length;
    return {
      total: APP.school.cards.length,
      roomId,
      roomName: APP.school._idx.classroomById[roomId]?.name || roomId,
      inRoom,
      sameSubjectElsewhere,
      subjectId: lesson.subjectId,
    };
  });

  let confirmation = "";
  page.once("dialog", async dialog => {
    confirmation = dialog.message();
    await dialog.accept();
  });
  await card.click({ button: "right" });
  await page.getByRole("button", { name: "Delete row" }).click();

  expect(confirmation).toContain(`room "${before.roomName}"`);
  const after = await page.evaluate(({ roomId, subjectId }) => {
    const inRoom = APP.school.cards.filter(c => {
      const l = APP.school._idx.lessonById[c.lessonId];
      return (c.classroomId || l?.preferredRoomId) === roomId;
    }).length;
    const sameSubjectElsewhere = APP.school.cards.filter(c => {
      const l = APP.school._idx.lessonById[c.lessonId];
      return l?.subjectId === subjectId && (c.classroomId || l?.preferredRoomId) !== roomId;
    }).length;
    return { total: APP.school.cards.length, inRoom, sameSubjectElsewhere };
  }, before);
  expect(after.total).toBe(before.total - before.inRoom);
  expect(after.inRoom).toBe(0);
  expect(after.sameSubjectElsewhere).toBe(before.sameSubjectElsewhere);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:undo")));
  expect(await page.evaluate(() => APP.school.cards.length)).toBe(before.total);
});

test("constraint catalogue reads canonical matrices and entity rules", async ({ page }) => {
  // Regression: ISSUE-003 — collector read lowercase string timeoff and silently omitted canonical timeOff matrices.
  // Found by /qa on 2026-09-16
  // Report: .gstack/qa-reports/qa-report-localhost-2026-09-16.md
  await loadDemoSchool(page);
  const types = await page.evaluate(() => InputtedConstraintsDialog.collectConstraints({
    teachers: [{ id: "t1", name: "Teacher One", timeOff: [[0, 2]], constraints: { maxGapsPerDay: 1 } }],
    classes: [{ id: "c1", name: "Class One", timeOff: [[1, 0]] }],
    classrooms: [{ id: "r1", name: "Room One", constraints: { maxCardsPos: 2 } }],
    subjects: [{ id: "s1", name: "Subject One", timeOff: [[0, 1]] }],
    lessons: [], cards: [], relations: [], _idx: {},
  }).map(item => item.type));

  expect(types).toEqual(expect.arrayContaining([
    "teacher-timeoff", "teacher-constraint-maxGapsPerDay", "class-timeoff",
    "room-constraint-maxCardsPos", "subject-timeoff",
  ]));

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:list-constraints")));
  await expect(page.getByRole("dialog", { name: "List of inputted constraints" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search constraints" })).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Filter by constraint type" })).toBeVisible();
});

test("quick add opens creation and suggest-fix reaches verification", async ({ page }) => {
  // Regression: ISSUE-004 — entity routing discarded create/focus details and suggest-fix listened on the wrong target.
  // Found by /qa on 2026-09-16
  // Report: .gstack/qa-reports/qa-report-localhost-2026-09-16.md
  await loadDemoSchool(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:quick-add-lesson")));
  await expect(page.getByRole("heading", { name: "New lesson" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:suggest-fix", {
    detail: { cardId: "regression-card" },
  })));
  await expect(page.locator(".chrx-vpro-root")).toHaveCount(1);
});

test("compare-last opens an actual timetable diff", async ({ page }) => {
  // Regression: ISSUE-005 — Compare with last saved opened version history instead of comparing.
  // Found by /qa on 2026-09-16
  // Report: .gstack/qa-reports/qa-report-localhost-2026-09-16.md
  await loadDemoSchool(page);
  await page.evaluate(() => APP.snapshot.saveAs());
  const name = page.locator(".chrx-dlg input");
  await name.fill("Regression baseline");
  await page.locator(".chrx-dlg").getByRole("button", { name: "Save" }).click();
  const savedCount = await page.evaluate(() => APP.school.cards.length);
  await page.evaluate(() => APP.school.cards.pop());

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:compare-last")));
  await expect(page.locator(".chrx-diff-root")).toHaveCount(1);
  await expect(page.locator(".chrx-diff-summary")).toContainText(`${savedCount - 1} cards → ${savedCount} cards`);
  await expect(page.locator(".chrx-dlg-scrim")).toHaveCount(0);
});
