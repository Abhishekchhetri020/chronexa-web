/**
 * Landing demo — a small timetable that places, detects, and resolves cards.
 *
 * Stage-machine edition (landing redesign 2026-08-02): the loop is a 12s,
 * five-stage progression (lessons → solve → conflict → reassign → ready)
 * with a pause between phases, and any stage can be frozen for manual
 * inspection via the landing page stepper tabs.
 *
 * Exports window.LandingDemo = { mount, destroy, setStage, resume, isFrozen, STAGES }.
 * Emits "landing-demo:stage" (bubbles; detail: {stage}) on the container
 * whenever the visible stage changes.
 */
(function (global) {
  "use strict";

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const SUBJECTS = [
    { abbr: "MTH", color: "#2f6fed" },
    { abbr: "SCI", color: "#1f8a70" },
    { abbr: "ENG", color: "#c47a18" },
    { abbr: "HIS", color: "#b24b4b" },
    { abbr: "ART", color: "#7556a8" },
  ];
  const SOLVED = [
    [0, 1, 2, 3, 4],
    [1, 2, 3, 4, 0],
    [2, 3, 4, 0, 1],
    [3, 4, 0, 1, 2],
    [4, 0, 1, 2, 3],
  ];

  const STAGES = ["lessons", "solve", "conflict", "reassign", "ready"];
  const STAGE_STATUS = {
    lessons:  ["Reading lessons…", "working"],
    solve:    ["Solver placing cards…", "working"],
    conflict: ["Conflict found — Tue P3 double-booked", "conflict"],
    reassign: ["Reassigning the clashing card…", "working"],
    ready:    ["Ready — same shape for your data", "done"],
  };
  const LOOP_MS = 12000;

  // Which cards each phase adds to the 5×5 grid.
  const LESSON_CARDS = [[0, 0], [6, 2], [12, 4], [18, 1], [24, 3]];
  const SOLVE_CARDS  = [[4, 4], [8, 3], [16, 0], [20, 4]];
  const ALL_CARDS    = LESSON_CARDS.concat(SOLVE_CARDS);
  const CONFLICT_CELL = 7;

  const active = new Map();

  function mount(container) {
    if (!container) return;
    destroy(container);

    container.innerHTML = `
      <div class="chrx-landing-demo__days" aria-hidden="true">
        ${DAYS.map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="chrx-landing-demo__grid" role="img"
           aria-label="Animated five-day timetable preview that places cards, detects a conflict, and resolves it.">
        ${Array.from({ length: 25 }, (_, i) => `<div class="chrx-landing-demo__cell" data-cell="${i}"></div>`).join("")}
      </div>
    `;

    const reduced = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Reduced motion: no loop, no registered state — render the final
      // frame; the stepper still swaps static frames via setStage().
      renderStage(container, "ready");
      emit(container, "ready");
      return;
    }

    const state = { timers: [], stopped: false, frozen: null };
    active.set(container, state);
    play(container, state);
  }

  function play(container, state) {
    if (state.stopped || state.frozen || !container.isConnected) return;
    reset(container);
    gotoStage(container, "lessons");

    LESSON_CARDS.forEach(([cell, subject], index) => {
      later(state, 380 + index * 300, () => {
        place(container, cell, subject);
        setStatus(container, `Reading lessons… ${index + 1} of ${ALL_CARDS.length}`, "working");
      });
    });

    later(state, 2300, () => gotoStage(container, "solve"));
    SOLVE_CARDS.forEach(([cell, subject], index) => {
      later(state, 2500 + index * 300, () => {
        place(container, cell, subject);
        setStatus(container, `Placing card ${LESSON_CARDS.length + index + 1} of ${ALL_CARDS.length}…`, "working");
      });
    });

    // Pause so the placed grid reads, then surface the conflict.
    later(state, 4600, () => {
      gotoStage(container, "conflict");
      place(container, CONFLICT_CELL, 0);
      place(container, CONFLICT_CELL, 3, true);
      container.querySelector(`[data-cell="${CONFLICT_CELL}"]`)?.classList.add("is-conflict");
    });

    // Hold the conflict on screen, then clear the clashing card.
    later(state, 6800, () => {
      gotoStage(container, "reassign");
      container.querySelector(".is-conflict-card")?.remove();
      container.querySelector(`[data-cell="${CONFLICT_CELL}"]`)?.classList.remove("is-conflict");
    });

    later(state, 8000, () => {
      gotoStage(container, "ready");
      renderSolved(container);
    });

    // Hold the solved frame, then loop.
    later(state, LOOP_MS, () => play(container, state));
  }

  function gotoStage(container, stage) {
    const [text, tone] = STAGE_STATUS[stage] || ["", ""];
    setStatus(container, text, tone);
    emit(container, stage);
  }

  /**
   * Render a static, deterministic frame for one stage. Used for frozen
   * (stepper) inspection and for the reduced-motion path.
   */
  function renderStage(container, stage) {
    reset(container);
    if (stage === "lessons") {
      LESSON_CARDS.slice(0, 3).forEach(([cell, subject]) => place(container, cell, subject));
    } else if (stage === "solve") {
      ALL_CARDS.forEach(([cell, subject]) => place(container, cell, subject));
    } else if (stage === "conflict") {
      ALL_CARDS.forEach(([cell, subject]) => place(container, cell, subject));
      place(container, CONFLICT_CELL, 0);
      place(container, CONFLICT_CELL, 3, true);
      container.querySelector(`[data-cell="${CONFLICT_CELL}"]`)?.classList.add("is-conflict");
    } else if (stage === "reassign") {
      ALL_CARDS.forEach(([cell, subject]) => place(container, cell, subject));
      place(container, CONFLICT_CELL, 0);
      container.querySelector(`[data-cell="${CONFLICT_CELL}"]`)?.classList.add("is-solved");
    } else {
      renderSolved(container);
    }
    const [text, tone] = STAGE_STATUS[stage] || ["", ""];
    setStatus(container, text, tone);
  }

  function emit(container, stage) {
    container.dispatchEvent(new CustomEvent("landing-demo:stage", {
      bubbles: true,
      detail: { stage },
    }));
  }

  function later(state, delay, fn) {
    const id = global.setTimeout(() => {
      state.timers = state.timers.filter((timer) => timer !== id);
      if (!state.stopped) fn();
    }, delay);
    state.timers.push(id);
  }

  function place(container, cellIndex, subjectIndex, conflict) {
    const cell = container.querySelector(`[data-cell="${cellIndex}"]`);
    const subject = SUBJECTS[subjectIndex];
    if (!cell || !subject) return;
    const card = document.createElement("span");
    card.className = "chrx-landing-demo__card" + (conflict ? " is-conflict-card" : "");
    card.style.setProperty("--demo-card", subject.color);
    card.textContent = subject.abbr;
    cell.appendChild(card);
  }

  function renderSolved(container) {
    reset(container);
    SOLVED.flat().forEach((subjectIndex, cellIndex) => place(container, cellIndex, subjectIndex));
    container.querySelectorAll(".chrx-landing-demo__cell").forEach((cell) => cell.classList.add("is-solved"));
  }

  function reset(container) {
    container.querySelectorAll(".chrx-landing-demo__card").forEach((card) => card.remove());
    container.querySelectorAll(".chrx-landing-demo__cell").forEach((cell) => {
      cell.classList.remove("is-conflict", "is-solved");
    });
  }

  function setStatus(container, text, tone) {
    const panel = container.closest(".chrx-landing-demo");
    const status = panel && panel.querySelector("[data-landing-demo-status]");
    if (!status) return;
    status.textContent = text;
    status.dataset.tone = tone || "";
  }

  function destroy(container) {
    const state = active.get(container);
    if (state) {
      state.stopped = true;
      state.timers.forEach((timer) => global.clearTimeout(timer));
      active.delete(container);
    }
    if (container) container.innerHTML = "";
  }

  /** Freeze the loop on a stage for manual inspection (stepper tabs). */
  function setStage(container, stage) {
    if (!container || !STAGES.includes(stage)) return;
    const state = active.get(container);
    if (state) {
      state.frozen = stage;
      state.timers.forEach((timer) => global.clearTimeout(timer));
      state.timers = [];
    }
    renderStage(container, stage);
    emit(container, stage);
  }

  /** Resume the automatic loop after a freeze. */
  function resume(container) {
    const state = active.get(container);
    if (!state || state.stopped) return;
    state.frozen = null;
    state.timers.forEach((timer) => global.clearTimeout(timer));
    state.timers = [];
    play(container, state);
  }

  function isFrozen(container) {
    const state = active.get(container);
    return !!(state && state.frozen);
  }

  global.LandingDemo = { mount, destroy, setStage, resume, isFrozen, STAGES };
})(window);

// [vite-esm] exports auto-generated by the 2026-07 Vite migration.
export const LandingDemo = window.LandingDemo;
