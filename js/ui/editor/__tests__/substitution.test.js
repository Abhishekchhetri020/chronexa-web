import { describe, it, expect, beforeEach } from "vitest";
import { loadSampleSchool } from "../../../solver/__tests__/helpers/load_school.js";
import "../../substitution/main.js";
import "../../substitution/absence_input.js";
import "../../substitution/candidate_ranker.js";
import "../../substitution/classwise_output.js";
import "../../substitution/teacherwise_output.js";
import "../../substitution/print_memo.js";
import "../../print_preview/print_report_schema.js";
import "../../print_preview/pivot_engine.js";
import "../../io/snapshot.js";

describe("Lane W2-4: Saved substitutions and dated views", () => {
  let school;

  beforeEach(() => {
    school = JSON.parse(JSON.stringify(loadSampleSchool()));
    window.APP = window.APP || {};
    window.APP.school = school;
  });

  it("create absence -> planner assigns -> records saved with correct slots", () => {
    const teacherId = school.teachers[0].id;
    const date = "2026-09-25"; // Friday -> day 4
    
    // Step 1: create absence
    window.Substitution.recordAbsence(school, {
      date,
      teacherId,
      reason: "Sick leave",
    });

    expect(school.absences).toBeDefined();
    expect(school.absences.length).toBeGreaterThan(0);
    const abs = school.absences.find(a => a.teacherId === teacherId && a.date === date);
    expect(abs).toBeDefined();
    expect(abs.id).toMatch(/^abs_/);
    expect(abs.periods).toBe("all");
    expect(abs.reason).toBe("Sick leave");

    // Step 2: planner assigns substitutions for that date
    window.Substitution.assignSubstitutions(school, date);

    expect(school.substitutions).toBeDefined();
    expect(school.substitutions.length).toBeGreaterThan(0);

    for (const sub of school.substitutions) {
      expect(sub.id).toMatch(/^sub_/);
      expect(sub.date).toBe(date);
      expect(sub.absentTeacherId).toBe(teacherId);
      expect(typeof sub.day).toBe("number");
      expect(typeof sub.period).toBe("number");
      expect(sub.cardId).toBeDefined();
      expect(sub.createdAt).toBeDefined();
    }
  });

  it("cancel: allows cancelling an assignment to leave lesson cancelled / free period", () => {
    const teacherId = school.teachers[0].id;
    const date = "2026-09-25";

    window.Substitution.recordAbsence(school, { date, teacherId });
    window.Substitution.assignSubstitutions(school, date);

    const firstSub = school.substitutions[0];
    expect(firstSub).toBeDefined();

    // Cancel this slot
    window.Substitution.cancelSubstitution(school, {
      id: firstSub.id,
      date,
      cardId: firstSub.cardId,
    });

    const updated = school.substitutions.find(s => s.id === firstSub.id);
    expect(updated).toBeDefined();
    expect(updated.substituteTeacherId).toBeNull();
  });

  it("round-trip: save/load and JSON export preserve school.absences and school.substitutions", () => {
    const teacherId = school.teachers[0].id;
    const date = "2026-09-25";

    window.Substitution.recordAbsence(school, { date, teacherId });
    window.Substitution.assignSubstitutions(school, date);

    const origAbsCount = school.absences.length;
    const origSubCount = school.substitutions.length;

    // Test JSON export & import round-trip
    const json = window.APP.io.exportJson(school);
    expect(typeof json).toBe("string");

    const parsed = JSON.parse(json);
    expect(parsed.absences).toHaveLength(origAbsCount);
    expect(parsed.substitutions).toHaveLength(origSubCount);

    const restoredSchool = window.APP.io.importJson(json);
    expect(restoredSchool.absences).toHaveLength(origAbsCount);
    expect(restoredSchool.substitutions).toHaveLength(origSubCount);
    expect(restoredSchool.substitutions[0].cardId).toBe(school.substitutions[0].cardId);
  });

  it("pivot count: pivot_engine sum-of-covered-lessons reads saved substitution records", () => {
    const teacherId = school.teachers[0].id;
    const date = "2026-09-25";

    window.Substitution.recordAbsence(school, { date, teacherId });
    window.Substitution.assignSubstitutions(school, date);

    const subWithCover = school.substitutions.find(s => s.substituteTeacherId !== null);
    expect(subWithCover).toBeDefined();

    // Find the subject of this substitution card
    const targetCard = (school.cards || []).find(c =>
      (c.id || `placed_${c.lessonId}_${c.day}_${c.period}`) === subWithCover.cardId
    );
    expect(targetCard).toBeDefined();
    const lesson = (school.lessons || []).find(l => l.id === targetCard.lessonId);
    const subjectId = lesson.subjectId;

    // Generate pivot report page with extra column 'sum-of-covered-lessons'
    const report = {
      orientation: "portrait",
      rows: ["classes"],
      cols: ["days", "periods"],
      pages: [],
      extraWidth: 150,
      extraCols: [
        { type: "subjects-count", header: "Subject", width: 15 },
        { type: "sum-of-covered-lessons", header: "Covered", width: 10 },
      ],
      cells: {},
    };

    const pages = window.APP.PrintPivot.renderReport(report, school, school.bell?.periods || []);
    expect(pages.length).toBeGreaterThan(0);

    const firstPage = pages[0];
    const extrasTable = firstPage.querySelector(".chrx-pivot-extras");
    expect(extrasTable).not.toBeNull();

    // The covered column should NOT be 0 for the subject that was substituted
    const rows = Array.from(extrasTable.querySelectorAll("tbody tr"));
    const subjectRow = rows.find(r => r.cells[0]?.textContent?.includes(school._idx.subjectById[subjectId]?.name || ""));
    expect(subjectRow).toBeDefined();
    const coveredCountText = subjectRow.cells[1]?.textContent;
    expect(Number(coveredCountText)).toBeGreaterThan(0);
  });

  it("dated view: shows struck-through original + substitute on date, and extra lesson in teacher view", () => {
    const teacherId = school.teachers[0].id;
    const date = "2026-09-25"; // Friday -> day 4

    window.Substitution.recordAbsence(school, { date, teacherId });
    window.Substitution.assignSubstitutions(school, date);

    const subWithCover = school.substitutions.find(s => s.substituteTeacherId !== null);
    expect(subWithCover).toBeDefined();
    const substituteTeacherId = subWithCover.substituteTeacherId;

    // Build dummy DOM container representing grid
    const rootEl = document.createElement("div");
    rootEl.innerHTML = `
      <div class="chrx-row" data-row="${substituteTeacherId}">
        <div class="chrx-slot empty" data-day="${subWithCover.day}" data-period="${subWithCover.period}"></div>
      </div>
      <div class="chrx-row" data-row="some_class">
        <div class="chrx-slot" data-day="${subWithCover.day}" data-period="${subWithCover.period}">
          <div class="chrx-vkarta" data-card-id="${subWithCover.cardId}">
            <div class="chrx-vk-line1">Math</div>
            <div class="chrx-vk-line2">${school._idx.teacherById[teacherId]?.name || teacherId}</div>
          </div>
        </div>
      </div>
    `;

    // 1. Without date set -> no overrides applied
    window.APP.editor = { date: null, perspective: "class" };
    window.Substitution.applyGridOverrides(rootEl, school);
    let cardEl = rootEl.querySelector(`.chrx-vkarta[data-card-id="${subWithCover.cardId}"]`);
    expect(cardEl.classList.contains("chrx-vkarta--substituted")).toBe(false);

    // 2. With wrong date -> no overrides applied
    window.APP.editor = { date: "2026-09-26", perspective: "class" };
    window.Substitution.applyGridOverrides(rootEl, school);
    expect(cardEl.classList.contains("chrx-vkarta--substituted")).toBe(false);

    // 3. With matching date -> class view shows struck-through original + substitute
    window.APP.editor = { date: "2026-09-25", perspective: "class" };
    window.Substitution.applyGridOverrides(rootEl, school);
    expect(cardEl.classList.contains("chrx-vkarta--substituted")).toBe(true);
    expect(cardEl.querySelector(".chrx-vk-line2").innerHTML).toContain("line-through");
    const subName = school._idx.teacherById[substituteTeacherId]?.name || substituteTeacherId;
    expect(cardEl.querySelector(".chrx-vk-line2").textContent).toContain(subName);

    // 4. In teacher view -> substitute teacher row shows extra lesson
    window.APP.editor = { date: "2026-09-25", perspective: "teacher" };
    window.Substitution.applyGridOverrides(rootEl, school);
    const subSlot = rootEl.querySelector(`.chrx-row[data-row="${substituteTeacherId}"] .chrx-slot[data-day="${subWithCover.day}"][data-period="${subWithCover.period}"]`);
    expect(subSlot.classList.contains("empty")).toBe(false);
    const subLessonCard = subSlot.querySelector(".chrx-vkarta--substitute");
    expect(subLessonCard).not.toBeNull();
    expect(subLessonCard.textContent).toContain("Sub");

    // 5. Test cancelled slot shows (Cancelled)
    window.Substitution.cancelSubstitution(school, { id: subWithCover.id, date });
    window.APP.editor = { date: "2026-09-25", perspective: "class" };
    window.Substitution.applyGridOverrides(rootEl, school);
    expect(cardEl.classList.contains("chrx-vkarta--cancelled")).toBe(true);
    expect(cardEl.querySelector(".chrx-vk-line2").textContent).toContain("Cancelled");
  });
});
