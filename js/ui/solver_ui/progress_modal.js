/* Chronexa Solver — Progress modal.
 *
 * Source-agnostic live view of a running solve. Works against any object that
 * conforms to the Source interface in backend_client.js — i.e. the browser
 * worker adapter and the cloud HTTP client both feed it the same events.
 *
 *   SolverUI.Progress.open({
 *     source:    Source                  // { subscribe, cancel, pause, resume, mode }
 *     timeLimitSec: number               // for the global progress bar
 *     totalLessons: number               // for hard-conflict scaling
 *     mode:      "test" | "generate"
 *     showReport: boolean
 *     onDone(result, ctx)                // ctx = { mode, showReport }
 *     onCancel()
 *   })
 *
 * Live stats row mirrors Classic's m_nRychlost / m_nTries / p_VykaslalSa /
 * soft score — naming localised to plain English. Stuck counter shows "—"
 * because csp_solver.js doesn't emit it (Agent C's progress payload has
 * iter / softScore / hardConflicts / durationMs only).
 *
 * The mini-heatmap renders a 6×N (days × periods) grid and uses durationMs +
 * lastIterations to colour cells by recent activity. It is a visual hint —
 * the live cell-level conflict pattern isn't in the progress feed, so we
 * fall back to a wave animation that helps the user see the solver is alive.
 */
(function (global) {
  "use strict";

  let host, dlg, refs, state;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function fmtInt(n) {
    if (n == null || !isFinite(n)) return "—";
    return Number(n).toLocaleString();
  }
  function fmtTime(ms) {
    const s = Math.max(0, Math.round((ms || 0) / 1000));
    const m = Math.floor(s / 60), r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  function build() {
    host = el("div", { class: "csu-backdrop", role: "presentation", "aria-hidden": "true" });
    dlg = el("section", {
      class: "csu-dialog csu-progress",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "csu-progress-title",
    });

    const title = el("h2", { class: "csu-dialog__title", id: "csu-progress-title" }, "Generating timetable…");
    const sub = el("p", { class: "csu-dialog__sub", id: "csu-progress-sub" }, "Cycle 1 · in browser worker");

    // ---- progress bars
    const bar1Fill = el("div", { class: "csu-bar__fill", style: "width:0%" });
    const bar1 = el("div", { class: "csu-bar" }, el("div", { class: "csu-bar__label" }, "Overall"), el("div", { class: "csu-bar__track" }, bar1Fill));
    const bar2Fill = el("div", { class: "csu-bar__fill csu-bar__fill--accent2", style: "width:0%" });
    const bar2 = el("div", { class: "csu-bar" }, el("div", { class: "csu-bar__label" }, "Current branch"), el("div", { class: "csu-bar__track" }, bar2Fill));

    // ---- stat tiles
    const tiles = el("div", { class: "csu-tiles" });
    function tile(id, label) {
      const v = el("div", { class: "csu-tile__value", id }, "—");
      const t = el("div", { class: "csu-tile" },
        el("div", { class: "csu-tile__label" }, label),
        v,
      );
      tiles.appendChild(t);
      return v;
    }
    const tSpeed   = tile("csu-stat-speed",   "Schedules / sec");
    const tIter    = tile("csu-stat-iter",    "Iterations");
    const tHard    = tile("csu-stat-hard",    "Hard conflicts");
    const tSoft    = tile("csu-stat-soft",    "Soft score");
    const tElapsed = tile("csu-stat-elapsed", "Time");
    const tStuck   = tile("csu-stat-stuck",   "Stuck counter");

    // ---- heatmap
    const heat = el("div", { class: "csu-heatmap", "aria-hidden": "true" });

    // ---- live fault list (Top-30 #4). Populated from progress payload's
    // latestViolations array which the solver now ships every ~500ms with
    // a rotating window of currently-unassigned lessons.
    const faultsHead = el("div", { class: "csu-faults__head" }, "Currently stuck");
    const faultsList = el("ul", { class: "csu-faults__list" });
    const faultsEmpty = el("li", { class: "csu-faults__empty" }, "—");
    faultsList.appendChild(faultsEmpty);
    const faults = el("section", { class: "csu-faults" }, faultsHead, faultsList);

    // ---- buttons
    const pauseBtn  = el("button", { type: "button", class: "chrx-btn", onclick: doPauseResume }, "Pause");
    const cancelBtn = el("button", { type: "button", class: "chrx-btn chrx-btn--danger", onclick: doCancel }, "Cancel");
    const acceptBtn = el("button", { type: "button", class: "chrx-btn chrx-btn--primary", onclick: doAcceptPartial }, "Accept partial result");
    const actions = el("div", { class: "csu-dialog__actions" }, pauseBtn, acceptBtn, cancelBtn);

    dlg.append(title, sub, bar1, bar2, tiles, heat, faults, actions);
    host.appendChild(dlg);
    document.body.appendChild(host);

    refs = {
      title, sub, bar1Fill, bar2Fill, tSpeed, tIter, tHard, tSoft, tElapsed, tStuck,
      heat, faultsList, pauseBtn, cancelBtn, acceptBtn,
    };
  }

  // Render up to 5 violations as <li> rows. Uses textContent (no innerHTML)
  // so descriptions with HTML-special chars don't break or inject markup.
  function renderFaults(items) {
    if (!refs || !refs.faultsList) return;
    const list = refs.faultsList;
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!items || !items.length) {
      const empty = document.createElement("li");
      empty.className = "csu-faults__empty";
      empty.textContent = "—";
      list.appendChild(empty);
      return;
    }
    for (const v of items.slice(0, 5)) {
      const li = document.createElement("li");
      const severity = (v && v.severity) === "soft" ? "soft" : "hard";
      li.className = "csu-faults__item csu-faults__item--" + severity;
      const icon = document.createElement("span");
      icon.className = "csu-faults__icon";
      icon.textContent = severity === "hard" ? "⚠" : "•";
      const text = document.createElement("span");
      text.className = "csu-faults__text";
      text.textContent = (v && v.description) || (v && v.ruleId) || "violation";
      li.appendChild(icon);
      li.appendChild(text);
      list.appendChild(li);
    }
  }

  function buildHeatmap() {
    const cellCount = 6 * 10;     // 6 days × up to 10 periods (display only)
    refs.heat.innerHTML = "";
    for (let i = 0; i < cellCount; i++) {
      refs.heat.appendChild(el("div", { class: "csu-heatmap__cell", "data-i": i }));
    }
  }

  function pulseHeatmap(iter) {
    if (!refs || !refs.heat) return;
    const cells = refs.heat.children;
    // Sweep a small "comet" across cells driven by iteration count.
    const head = iter % cells.length;
    for (let i = 0; i < cells.length; i++) {
      const d = (i - head + cells.length) % cells.length;
      const intensity = Math.max(0, 1 - d / 6);
      const cell = cells[i];
      if (intensity > 0) cell.style.background = `rgba(0, 100, 224, ${0.10 + 0.45 * intensity})`;
      else cell.style.background = "";
    }
  }

  function doPauseResume() {
    if (!state) return;
    if (state.paused) {
      state.paused = false;
      try { state.source.resume(); } catch {}
      refs.pauseBtn.textContent = "Pause";
    } else {
      state.paused = true;
      try { state.source.pause(); } catch {}
      refs.pauseBtn.textContent = "Resume";
    }
  }
  function doCancel() {
    if (!state) return;
    state.terminating = "cancel";
    try { state.source.cancel(); } catch {}
    closeAndCallback(null, "cancel");
  }
  function doAcceptPartial() {
    if (!state) return;
    // For browser: terminate() loses the in-flight assignment — we have no
    // partial in the progress payload. Treat Accept-Partial as "stop and use
    // whatever the last `done` event delivered". If nothing arrived yet, we
    // emit a no-op cancel.
    state.terminating = "accept";
    try { state.source.cancel(); } catch {}
    // If a `done` event raced in just before, lastResult will be set.
    if (state.lastResult) {
      closeAndCallback(state.lastResult, "done");
    } else {
      closeAndCallback(null, "cancel");
    }
  }

  function closeAndCallback(result, kind) {
    if (!state) return;
    const cb = (kind === "done") ? state.onDone : state.onCancel;
    const ctx = { mode: state.mode, showReport: state.showReport };
    state.unsubscribe && state.unsubscribe();
    state = null;
    close();
    if (cb) {
      try { cb(result, ctx); } catch (e) { console.error(e); }
    }
  }

  function open(opts) {
    if (!host) build();
    buildHeatmap();
    state = {
      source: opts.source,
      mode: opts.mode || "generate",
      showReport: opts.showReport !== false,
      timeLimitSec: opts.timeLimitSec || 60,
      totalLessons: opts.totalLessons || 0,
      onDone: opts.onDone,
      onCancel: opts.onCancel,
      paused: false,
      lastResult: null,
      terminating: null,
      lastIter: 0,
      lastDurMs: 0,
      lastSpeed: 0,
    };

    // Reset DOM
    refs.title.textContent = state.mode === "test" ? "Testing timetable…" : "Generating timetable…";
    const modeLabel = (opts.source && opts.source.mode === "cloud")
      ? "cloud (OR-Tools)"
      : (opts.source && opts.source.branches)
        ? `${opts.source.branches} branches · browser`
        : "browser worker";
    refs.sub.textContent = "Cycle 1 · " + modeLabel;
    refs.bar1Fill.style.width = "0%";
    refs.bar2Fill.style.width = "0%";
    refs.pauseBtn.textContent = "Pause";
    refs.acceptBtn.style.display = state.mode === "test" ? "none" : "";
    refs.tSpeed.textContent = "—";
    refs.tIter.textContent = "—";
    refs.tHard.textContent = "—";
    refs.tSoft.textContent = "—";
    refs.tElapsed.textContent = "0:00";
    refs.tStuck.textContent = "—";

    host.classList.add("is-open");
    host.setAttribute("aria-hidden", "false");

    state.unsubscribe = state.source.subscribe(handleEvent);
  }

  function handleEvent(ev) {
    if (!state || !ev) return;
    if (ev.type === "progress") {
      const dt = Math.max(1, ev.durationMs || 0);
      const iter = ev.iter || 0;
      const speed = (iter - state.lastIter) / Math.max(0.001, (dt - state.lastDurMs) / 1000);
      if (isFinite(speed) && speed > 0) state.lastSpeed = state.lastSpeed * 0.5 + speed * 0.5;
      state.lastIter = iter;
      state.lastDurMs = dt;

      const p1 = Math.min(1, dt / (state.timeLimitSec * 1000));
      const p2 = ((iter % 1000) / 1000);
      refs.bar1Fill.style.width = (p1 * 100).toFixed(1) + "%";
      refs.bar2Fill.style.width = (p2 * 100).toFixed(1) + "%";

      refs.tSpeed.textContent   = fmtInt(Math.round(state.lastSpeed));
      refs.tIter.textContent    = fmtInt(iter);
      refs.tHard.textContent    = fmtInt(ev.hardConflicts);
      refs.tSoft.textContent    = fmtInt(ev.softScore);
      refs.tElapsed.textContent = fmtTime(dt);
      pulseHeatmap(iter);
      if (Array.isArray(ev.latestViolations)) renderFaults(ev.latestViolations);
    } else if (ev.type === "done") {
      state.lastResult = ev.result;
      // Bar fills to 100% before we transition.
      refs.bar1Fill.style.width = "100%";
      refs.bar2Fill.style.width = "100%";
      closeAndCallback(ev.result, "done");
    } else if (ev.type === "error") {
      refs.sub.textContent = "Error — " + (ev.message || "unknown");
      refs.sub.style.color = "var(--chrx-red)";
      // Treat as terminal: caller's onDone gets null + we close after a beat.
      setTimeout(() => closeAndCallback(null, "cancel"), 1500);
    } else if (ev.type === "cancelled") {
      // No-op: the user's cancel/accept handler already drove closeAndCallback.
    }
  }

  function close() {
    if (!host) return;
    host.classList.remove("is-open");
    host.setAttribute("aria-hidden", "true");
  }

  global.SolverUI = global.SolverUI || {};
  global.SolverUI.Progress = { open, close };
})(typeof window !== "undefined" ? window : globalThis);
