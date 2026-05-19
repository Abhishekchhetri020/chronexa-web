/* AI menu actions — wires the 4 AI ribbon items to real functions.
 *
 *   AI → Auto-fill empty cells    — runs solver on partial schedule
 *   AI → Cleanup last card move   — undo the last drag-drop placement
 *   AI → Lock all placed cells    — set card.locked=true so solver respects them
 *   AI → Suggest placements (beta) — uses RelationEnforcer + ConstraintExplainer
 *
 * Each item fires `app:ai-<kind>`; this module listens and runs the action.
 */
(function () {
  "use strict";
  const notify = window._chrxNotify || console.log;

  function autoFillEmptyCells() {
    const APP = window.APP;
    if (!APP || !APP.school) { notify("Open a timetable first.", "error"); return; }
    if (!window.SolverUI) { notify("Solver UI not loaded.", "error"); return; }
    // Triggers the same code path as the Generate button — solver respects existing cards.
    notify("Auto-filling empty cells…");
    const source = window.SolverUI.run({
      school: APP.school,
      options: { timeLimitSec: 30, verbose: false, preservePlaced: true },
      algorithm: "browser",
    });
    source.subscribe?.(e => {
      if (e.type === "done" || e.result) {
        const r = e.result || e.data;
        if (r && r.assignment) {
          const newCards = r.assignment.map(a => ({
            lessonId: a.lessonId, day: a.day, period: a.period,
            classroomId: a.classroomId || null,
          }));
          APP.school.cards = newCards;
          if (window.CreateNew?.refreshIndex) window.CreateNew.refreshIndex();
          window.dispatchEvent(new CustomEvent("entity:changed", { detail: { entity: "cards" } }));
          notify(`Placed ${newCards.length} cards.`);
        }
      }
    });
  }

  function cleanupLastCardMove() {
    const APP = window.APP;
    if (!APP || !APP.audit || !APP.audit.undo) { notify("Undo unavailable.", "error"); return; }
    APP.audit.undo();
  }

  function lockAllPlacedCells() {
    const APP = window.APP;
    if (!APP || !APP.school || !APP.school.cards) { notify("Open a timetable first.", "error"); return; }
    let count = 0;
    for (const c of APP.school.cards) {
      if (!c.locked) { c.locked = true; count++; }
    }
    if (window.APP.audit?.append) APP.audit.append({ entity: "cards", op: "lock-all", count });
    notify(`Locked ${count} cards. Solver will not move them.`);
  }

  function suggestPlacements() {
    const APP = window.APP;
    if (!APP || !APP.school) { notify("Open a timetable first.", "error"); return; }
    const school = APP.school;
    const lessons = school.lessons || [];
    const placedByLesson = {};
    for (const c of (school.cards || []))
      placedByLesson[c.lessonId] = (placedByLesson[c.lessonId] || 0) + 1;

    // Find unplaced or under-placed lessons
    const candidates = lessons.filter(l => {
      const needed = l.periodsPerWeek || 0;
      const placed = placedByLesson[l.id] || 0;
      return needed > placed;
    });
    if (!candidates.length) { notify("No unplaced lessons found. Try Generate."); return; }

    // For each candidate, find the best (day, period) using constraint check
    const suggestions = [];
    const days = 6;
    const periods = (school.bell?.periods?.length) || 8;
    for (const lesson of candidates.slice(0, 5)) {
      const scored = [];
      for (let d = 0; d < days; d++) {
        for (let p = 0; p < periods; p++) {
          let hardCount = 0, softCount = 0;
          if (window.SolverConstraints?.checkPlacement) {
            const r = window.SolverConstraints.checkPlacement(school, lesson.id, d, p, null);
            hardCount = (r.hard || []).length;
            softCount = (r.soft || []).length;
          }
          if (window.RelationEnforcer) {
            const r2 = window.RelationEnforcer.check(school, lesson.id, d, p);
            hardCount += r2.hard.length;
            softCount += r2.soft.length;
          }
          if (hardCount === 0) scored.push({ d, p, soft: softCount });
        }
      }
      if (scored.length) {
        scored.sort((a, b) => a.soft - b.soft);
        const best = scored[0];
        const subj = (school.subjects || []).find(s => s.id === lesson.subjectId);
        suggestions.push({
          lesson: lesson.id,
          subjectName: subj?.name || "?",
          day: best.d,
          period: best.p,
          softPenalty: best.soft,
        });
      }
    }
    if (!suggestions.length) { notify("No feasible slots found — check constraints.", "warn"); return; }

    // Render a simple suggestions panel
    const html = suggestions.map(s =>
      `<li><strong>${s.subjectName}</strong> → Day ${s.day + 1}, Period ${s.period + 1}${s.softPenalty > 0 ? ` (${s.softPenalty} soft warnings)` : " ✓"}</li>`
    ).join("");
    const div = document.createElement("div");
    div.style.cssText = "padding:12px;max-width:480px;font-size:13px";
    div.innerHTML = `<p>Top ${suggestions.length} suggested placements:</p><ul>${html}</ul>` +
      `<p style="margin-top:12px;font-size:11px;color:#94a3b8">These respect hard constraints and rank by fewest soft warnings. Click <em>Apply</em> in the editor to place them.</p>`;
    if (window.EntityDialog?.openSheet) {
      window.EntityDialog.openSheet(div, { title: "✨ AI suggestions" });
    } else {
      alert(suggestions.map(s => `${s.subjectName} → D${s.day + 1}P${s.period + 1}`).join("\n"));
    }
  }

  window.addEventListener("app:ai-auto-fill",   autoFillEmptyCells);
  window.addEventListener("app:ai-cleanup",     cleanupLastCardMove);
  window.addEventListener("app:ai-lock-all",    lockAllPlacedCells);
  window.addEventListener("app:ai-suggest",     suggestPlacements);

  // Also handle the more general "app:ai-<kind>" if the menu uses that pattern
  window.addEventListener("app:ai", (e) => {
    const k = e.detail?.kind || e.detail?.action;
    if (k === "auto-fill" || k === "autofill") return autoFillEmptyCells();
    if (k === "cleanup")  return cleanupLastCardMove();
    if (k === "lock-all" || k === "lock") return lockAllPlacedCells();
    if (k === "suggest")  return suggestPlacements();
  });

  window.AIActions = { autoFillEmptyCells, cleanupLastCardMove, lockAllPlacedCells, suggestPlacements };
})();
