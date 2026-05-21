/* AI — assist toggle + maintenance actions on the timetable */
(function () {
  "use strict";
  const APP = window.APP;
  const fire = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d || {} }));
  const notify = (m, k) => (window._chrxNotify || console.log)(m, k);

  function aiOn() { return localStorage.getItem("chronexa.ai") === "1"; }
  function toggleAi() {
    const next = !aiOn();
    try { localStorage.setItem("chronexa.ai", next ? "1" : "0"); } catch {}
    fire("app:ai-toggle", { on: next });
    notify("AI assist: " + (next ? "on" : "off"));
  }

  // Mark every lesson that has at least one placed card as fixed to that
  // (day, period). Future Generate runs will refuse to move them. Useful
  // after a hand-tuned schedule the user wants to keep.
  function lockAllPlacedCells() {
    const s = APP.school;
    if (!s) { notify("Open a timetable first.", "error"); return; }
    const cards = s.cards || [];
    if (!cards.length) { notify("No placed cards to lock.", "error"); return; }
    const lessonById = Object.fromEntries((s.lessons || []).map(l => [l.id, l]));
    let locked = 0, alreadyFixed = 0;
    for (const c of cards) {
      // Strip the #N suffix the solver appends to expanded cards.
      const srcId = String(c.lessonId).replace(/#\d+$/, "");
      const lesson = lessonById[srcId] || lessonById[c.lessonId];
      if (!lesson) continue;
      if (lesson.fixedDay != null && lesson.fixedPeriod != null) { alreadyFixed++; continue; }
      // fixedDay is 0-based to match card.day; fixedPeriod is 1-based to
      // match card.period and CLASSIC's convention.
      lesson.fixedDay = c.day | 0;
      lesson.fixedPeriod = c.period | 0;
      locked++;
    }
    if (APP.audit && APP.audit.append) APP.audit.append({ entity: "lessons", op: "lock-all-placed", locked, alreadyFixed });
    notify(`Locked ${locked} placement${locked === 1 ? "" : "s"} as fixed.${alreadyFixed ? ` ${alreadyFixed} already fixed.` : ""}`);
    // Re-render the editor so the UI reflects the new lock state.
    window.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { source: "lock-all" } }));
  }

  APP.ribbon.registerMenu({
    key: "ai", label: "AI",
    build() {
      const on = aiOn();
      return [
        { icon: on ? "✓" : " ", label: "AI assist", run: toggleAi },
        { sep: true },
        { icon: "🧠", label: "Auto-fill empty cells",      soon: true },
        { icon: "🧹", label: "Cleanup last card move",     soon: true },
        { icon: "🔒", label: "Lock all placed cells",      run: lockAllPlacedCells },
        { sep: true },
        { icon: "✨", label: "Suggest placements (beta)",  soon: true },
      ];
    },
  });

  APP.ai = APP.ai || {};
  APP.ai.lockAllPlacedCells = lockAllPlacedCells;
})();
