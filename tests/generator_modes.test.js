import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";

import "../js/xml/parse_timetable_xml.js";
import { solve } from "../js/solver/csp_solver.js";
import "../js/solver/improve_mode.js";

function getDemoSchool() {
  const xml = fs.readFileSync(path.resolve(process.cwd(), "sample-school.xml"), "utf8");
  return window.parseTimetableXml.parseText(xml, "sample-school.xml");
}

describe("W3b-2 Generator Modes", () => {
  it('"Add unplaced only": unplace 5 cards, run → no previously placed card moved and temporary locks do not leak', () => {
    const school = getDemoSchool();
    expect(school.cards.length).toBeGreaterThan(50);
    const initialCount = school.cards.length;

    // Lock one card explicitly in the input to verify that genuine user locks are preserved
    school.cards[10].locked = true;
    const inputLockedCard = { ...school.cards[10] };

    // Unplace 5 cards (from index 0 to 4, leaving index 10 untouched)
    const unplacedCards = school.cards.splice(0, 5);
    expect(school.cards.length).toBe(initialCount - 5);

    // Snapshot the remaining placed cards with their positions
    const remainingPlaced = school.cards.map((c) => ({
      lessonId: c.lessonId,
      day: c.day,
      period: c.period,
      classroomId: c.classroomId,
      locked: !!c.locked,
    }));

    // Run solver in "Add unplaced only" mode
    const result = solve(school, {
      generatorMode: "add_unplaced",
      timeLimitSec: 2,
      seed: 42,
    });

    expect(result).toBeDefined();
    expect(result.assignment).toBeDefined();

    // Guarantee 1: Every single previously placed card must NOT have moved
    for (const prev of remainingPlaced) {
      const match = result.assignment.find(
        (a) =>
          (a.lessonId === prev.lessonId || String(a.lessonId).replace(/#\d+$/, "") === String(prev.lessonId).replace(/#\d+$/, "")) &&
          a.day === prev.day &&
          a.period === prev.period
      );
      expect(
        match,
        `Previously placed card for lesson ${prev.lessonId} at day ${prev.day} period ${prev.period} must not have moved`
      ).toBeDefined();
    }

    // Guarantee 2: No card in returned assignment is locked UNLESS it was locked in the input
    // (temporary locks must never leak into the returned timetable)
    const matchedLockedInput = result.assignment.find(
      (a) =>
        (a.lessonId === inputLockedCard.lessonId || String(a.lessonId).replace(/#\d+$/, "") === String(inputLockedCard.lessonId).replace(/#\d+$/, "")) &&
        a.day === inputLockedCard.day &&
        a.period === inputLockedCard.period
    );
    expect(matchedLockedInput).toBeDefined();
    expect(matchedLockedInput.locked).toBe(true);

    for (const a of result.assignment) {
      if (a === matchedLockedInput) continue;
      expect(
        a.locked,
        `Card for lesson ${a.lessonId} at day ${a.day} period ${a.period} must not leak temporary lock`
      ).toBeUndefined();
    }
  });

  it('"Improve only": baseline = score of demo initial placement; assert result is not worse and no card unplaced', () => {
    const school = getDemoSchool();
    const initialPlacedCount = school.cards.length;

    const result = solve(school, {
      generatorMode: "improve_only",
      timeLimitSec: 2,
      seed: 42,
    });

    expect(result).toBeDefined();
    expect(result.assignment).toBeDefined();

    // Guarantee 1: Keep every placed card on the timetable (no card becomes unplaced)
    expect(result.stats.placed).toBeGreaterThanOrEqual(initialPlacedCount);
    expect(result.assignment.length).toBe(initialPlacedCount);

    // Guarantee 2: Baseline score of the initial placement is recorded
    expect(result.stats.baselineSoftScore).toBeDefined();
    const baseline = result.stats.baselineSoftScore;

    // Guarantee 3: Direction check — stats.softScore is non-positive (-penalty).
    // Higher (closer to 0) is better; assert result is not worse than baseline (softScore >= baseline):
    expect(result.stats.softScore).toBeGreaterThanOrEqual(baseline);
  });

  it('"Improve only": forced worse result triggers rollback and restores initial assignment', () => {
    const school = getDemoSchool();
    const initialPlacedCount = school.cards.length;
    const initialSnapshot = school.cards.map((c) => ({
      lessonId: c.lessonId,
      day: c.day,
      period: c.period,
      classroomId: c.classroomId || null,
      ...(c.locked ? { locked: true } : {}),
    }));

    // Run solver in "Improve only" mode with forced worse placement hook
    const result = solve(school, {
      generatorMode: "improve_only",
      timeLimitSec: 2,
      seed: 42,
      _forceWorsePlacement: true,
    });

    // Guarantee: Rollback triggers, restoring exact initial timetable
    expect(result.status).toBe("NO_IMPROVEMENT");
    expect(result.stats.placed).toBe(initialPlacedCount);
    expect(result.stats.softScore).toBe(result.stats.baselineSoftScore);
    expect(result.assignment).toEqual(initialSnapshot);
  });

  it('PreLaunch dialog provides Mode choice with "Rebuild", "Improve only", and "Add unplaced only"', async () => {
    await import("../js/ui/solver_ui/prelaunch_dialog.js");
    expect(window.SolverUI.PreLaunch).toBeDefined();

    let confirmedCfg = null;
    window.SolverUI.PreLaunch.open({
      defaultMode: "best",
      school: getDemoSchool(),
      onConfirm: (cfg) => { confirmedCfg = cfg; },
    });

    const dialog = document.querySelector(".csu-prelaunch");
    expect(dialog).toBeDefined();

    // Check presence of Mode choice cards/buttons
    const rebuildCard = dialog.querySelector("[data-gen-mode='rebuild']");
    const improveCard = dialog.querySelector("[data-gen-mode='improve_only']");
    const addUnplacedCard = dialog.querySelector("[data-gen-mode='add_unplaced']");

    expect(rebuildCard).not.toBeNull();
    expect(improveCard).not.toBeNull();
    expect(addUnplacedCard).not.toBeNull();

    // Test clicking "Add unplaced only"
    addUnplacedCard.click();
    const startBtn = dialog.querySelector("#csu-prelaunch-start");
    startBtn.click();

    expect(confirmedCfg).toBeDefined();
    expect(confirmedCfg.generatorMode).toBe("add_unplaced");
    expect(confirmedCfg.addUnplacedOnly).toBe(true);
  });

  it('SolverUI.Result applies generation result through APP.mutate so APP.undo() restores previous cards', async () => {
    await import("../js/ui/core/mutate.js");
    await import("../js/ui/solver_ui/result_panel.js");

    const school = getDemoSchool();
    window.APP = window.APP || {};
    window.APP.school = school;

    const initialCardsCount = school.cards.length;
    const initialFirstCard = { ...school.cards[0] };

    // Simulate solver result with different placements
    const fakeAssignment = school.cards.slice(1).map((c) => ({
      lessonId: c.lessonId,
      day: (c.day + 1) % 5,
      period: c.period,
      classroomId: c.classroomId,
    }));

    window.SolverUI.Result.open({
      school: window.APP.school,
      result: {
        status: "FEASIBLE",
        assignment: fakeAssignment,
        stats: {
          placed: fakeAssignment.length,
          unplaced: 1,
          hardConflicts: 0,
          softScore: 50,
          durationMs: 100,
        },
        violations: [],
      },
      mode: "generate",
    });

    const applyBtn = document.getElementById("csu-result-apply");
    expect(applyBtn).not.toBeNull();
    applyBtn.click();

    // If destructive confirmation overlay is shown, confirm it
    const confirmBtn = document.querySelector("#chrx-apply-confirm [data-confirm]");
    if (confirmBtn) confirmBtn.click();

    // Cards should now be the new cards
    expect(window.APP.school.cards.length).toBe(fakeAssignment.length);
    expect(window.APP.history.canUndo).toBe(true);

    // Call APP.undo()
    window.APP.undo();

    // Previous timetable restored!
    expect(window.APP.school.cards.length).toBe(initialCardsCount);
    expect(window.APP.school.cards[0].day).toBe(initialFirstCard.day);
    expect(window.APP.school.cards[0].period).toBe(initialFirstCard.period);
  });
});

