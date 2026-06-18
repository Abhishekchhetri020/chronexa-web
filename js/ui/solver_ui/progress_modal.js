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

  function svg(tag, attrs) {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
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

  /** Build the SVG progress ring (96×96). Returns { svg, circle, pctText }. */
  function buildRing() {
    const size = 96, stroke = 6, radius = (size - stroke) / 2;
    const circ = 2 * Math.PI * radius;

    const root = svg("svg", {
      class: "csu-ring__svg",
      width: String(size), height: String(size),
      viewBox: "0 0 " + size + " " + size
    });

    const bg = svg("circle", {
      cx: String(size / 2), cy: String(size / 2), r: String(radius),
      fill: "none",
      stroke: "var(--chrx-line-soft, rgba(0,0,0,0.06))",
      "stroke-width": String(stroke)
    });

    const fg = svg("circle", {
      class: "csu-ring__circle",
      cx: String(size / 2), cy: String(size / 2), r: String(radius),
      fill: "none",
      stroke: "var(--chrx-accent, #007AFF)",
      "stroke-width": String(stroke),
      "stroke-linecap": "round",
      "stroke-dasharray": String(circ),
      "stroke-dashoffset": String(circ),
      transform: "rotate(-90 " + (size / 2) + " " + (size / 2) + ")"
    });

    const pct = svg("text", {
      class: "csu-ring__pct",
      x: String(size / 2), y: String(size / 2),
      "text-anchor": "middle",
      "dominant-baseline": "central",
      fill: "var(--chrx-fg, #111)"
    });
    pct.textContent = "0%";

    root.appendChild(bg);
    root.appendChild(fg);
    root.appendChild(pct);

    return { svg: root, circle: fg, pctText: pct, circumference: circ };
  }

  function build() {
    host = el("div", { class: "csu-backdrop", role: "presentation", "aria-hidden": "true" });
    dlg = el("section", {
      class: "csu-dialog csu-progress",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "csu-progress-title",
    });

    // ---- header with progress ring
    const ring = buildRing();
    const ringWrap = el("div", { class: "csu-ring" });
    ringWrap.appendChild(ring.svg);

    const title = el("h2", { class: "csu-dialog__title", id: "csu-progress-title" }, "Generating timetable…");
    const sub = el("p", { class: "csu-dialog__sub", id: "csu-progress-sub" }, "Cycle 1 · in browser worker");
    const titleArea = el("div", { class: "csu-progress__title-text" }, title, sub);
    const header = el("div", { class: "csu-progress__header" }, ringWrap, titleArea);

    // ---- progress bars
    const bar1Fill = el("div", { class: "csu-bar__fill", style: "width:0%" });
    const bar1 = el("div", { class: "csu-bar" }, el("div", { class: "csu-bar__label" }, "Overall"), el("div", { class: "csu-bar__track" }, bar1Fill));
    const bar2Fill = el("div", { class: "csu-bar__fill csu-bar__fill--accent2", style: "width:0%" });
    const bar2 = el("div", { class: "csu-bar" }, el("div", { class: "csu-bar__label" }, "Current branch"), el("div", { class: "csu-bar__track" }, bar2Fill));

    // ---- stat tiles: 2-row layout (3 key + 3 secondary)
    const tilesKey = el("div", { class: "csu-tiles csu-tiles--key" });
    const tilesSec = el("div", { class: "csu-tiles csu-tiles--secondary" });

    function tile(parent, id, label, icon) {
      const v = el("div", { class: "csu-tile__value", id: id }, "—");
      const ic = el("span", { class: "csu-tile__icon" }, icon);
      const lb = el("div", { class: "csu-tile__label" }, label);
      const t = el("div", { class: "csu-tile" }, ic, v, lb);
      parent.appendChild(t);
      return v;
    }
    // Key metrics (top row — larger)
    const tHard    = tile(tilesKey, "csu-stat-hard",    "Conflicts",  "⚡");
    const tElapsed = tile(tilesKey, "csu-stat-elapsed", "Time",       "⏱");
    const tSoft    = tile(tilesKey, "csu-stat-soft",    "Soft score", "◎");
    // Secondary metrics (bottom row — smaller)
    const tSpeed   = tile(tilesSec, "csu-stat-speed",   "Schedules / sec", "▸");
    const tIter    = tile(tilesSec, "csu-stat-iter",    "Iterations",      "↻");
    const tStuck   = tile(tilesSec, "csu-stat-stuck",   "Phase",           "◆");

    const tilesWrap = el("div", { class: "csu-tiles-wrap" }, tilesKey, tilesSec);

    // ---- heatmap
    const heat = el("div", { class: "csu-heatmap", "aria-hidden": "true" });

    // ---- branch race lanes (populated dynamically in open())
    const branches = el("div", { class: "csu-branches" });

    // ---- live fault list
    const placingHead = el("div", { class: "csu-faults__head" }, "Currently placing");
    const placingLabel = el("div", { class: "csu-faults__placing" }, "—");
    
    const faultsHead = el("div", { class: "csu-faults__head", style: "margin-top: 12px;" }, "Currently stuck");
    const faultsList = el("ul", { class: "csu-faults__list" });
    const faultsEmpty = el("li", { class: "csu-faults__empty" }, "—");
    faultsList.appendChild(faultsEmpty);
    const faults = el("section", { class: "csu-faults" }, placingHead, placingLabel, faultsHead, faultsList);

    // ---- buttons with visual hierarchy
    const cancelBtn = el("button", { type: "button", class: "chrx-btn csu-btn--ghost", onclick: doCancel }, "Cancel");
    const pauseBtn  = el("button", { type: "button", class: "chrx-btn csu-btn--secondary", onclick: doPauseResume }, "Pause");
    const acceptBtn = el("button", { type: "button", class: "chrx-btn csu-btn--gradient", onclick: doAcceptPartial }, "Accept partial result");
    const actions = el("div", { class: "csu-dialog__actions" }, cancelBtn, pauseBtn, acceptBtn);

    dlg.append(header, bar1, bar2, tilesWrap, heat, branches, faults, actions);
    host.appendChild(dlg);
    document.body.appendChild(host);

    refs = {
      title, sub, bar1Fill, bar2Fill, tSpeed, tIter, tHard, tSoft, tElapsed, tStuck,
      heat, faultsList, placingLabel, pauseBtn, cancelBtn, acceptBtn,
      ringCircle: ring.circle, ringPct: ring.pctText, ringCircumference: ring.circumference,
      branches,
    };
  }

  // Render up to 3 violations as <li> rows. Uses textContent (no innerHTML)
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
    for (const v of items.slice(0, 3)) {
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

  /** Build branch race lanes if the source has multiple branches. */
  function buildBranches(count) {
    const wrap = refs.branches;
    wrap.innerHTML = "";
    if (!count || count <= 1) { wrap.style.display = "none"; return; }
    wrap.style.display = "";
    for (let i = 0; i < count; i++) {
      const fill = el("div", { class: "csu-branch__fill", "data-branch": String(i), style: "width:0%" });
      const label = el("span", { class: "csu-branch__label" }, "Branch " + (i + 1));
      const track = el("div", { class: "csu-branch__track" }, fill);
      wrap.appendChild(el("div", { class: "csu-branch" }, label, track));
    }
  }

  function updateRing(placed, total) {
    if (!refs || !refs.ringCircle) return;
    const pct = total > 0 ? Math.min(1, placed / total) : 0;
    const offset = refs.ringCircumference * (1 - pct);
    refs.ringCircle.setAttribute("stroke-dashoffset", String(offset));
    refs.ringPct.textContent = Math.round(pct * 100) + "%";
  }

  function updateBranches(branchProgress) {
    if (!refs || !refs.branches || !branchProgress) return;
    const fills = refs.branches.querySelectorAll(".csu-branch__fill");
    for (let i = 0; i < fills.length && i < branchProgress.length; i++) {
      const bp = branchProgress[i];
      const pct = bp && bp.total > 0 ? Math.min(100, (bp.placed / bp.total) * 100) : 0;
      fills[i].style.width = pct.toFixed(1) + "%";
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
      if (intensity > 0) cell.style.background = "rgba(0, 100, 224, " + (0.10 + 0.45 * intensity) + ")";
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
    // Branch workers attach a best-so-far placement snapshot to progress
    // events (~every 2s); the source exposes the best one via getPartial().
    // Prefer a real `done` result if one raced in, then the partial, then
    // (truly nothing yet) tell the user instead of silently cancelling.
    const partial = (state.source && typeof state.source.getPartial === "function")
      ? state.source.getPartial()
      : null;
    const result = state.lastResult || partial;
    if (!result || !result.assignment || !result.assignment.length) {
      if (refs && refs.acceptBtn) {
        refs.acceptBtn.textContent = "No partial yet — try in a few seconds";
        setTimeout(() => {
          if (refs && refs.acceptBtn) refs.acceptBtn.textContent = "Accept partial result";
        }, 2500);
      }
      return;
    }
    state.terminating = "accept";
    try { state.source.cancel(); } catch {}
    closeAndCallback(result, "done");
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

    // Build branch lanes if applicable
    const branchCount = (opts.source && opts.source.branches) || 0;
    buildBranches(branchCount);

    // Reset DOM
    refs.title.textContent = state.mode === "test" ? "Testing timetable…" : "Generating timetable…";
    const modeLabel = (opts.source && opts.source.mode === "cloud")
      ? "cloud (OR-Tools)"
      : (opts.source && opts.source.branches)
        ? opts.source.branches + " branches · browser"
        : "browser worker";
    refs.sub.textContent = "Cycle 1 · " + modeLabel;
    // The cloud (CP-SAT) backend reports cards-placed, not search iterations,
    // so relabel those two tiles to avoid the misleading "Iterations / sec".
    const isCloud = !!(opts.source && opts.source.mode === "cloud");
    const relabel = (valueNode, text) => {
      const lb = valueNode && valueNode.parentNode &&
                 valueNode.parentNode.querySelector(".csu-tile__label");
      if (lb) lb.textContent = text;
    };
    relabel(refs.tIter, isCloud ? "Cards placed" : "Iterations");
    relabel(refs.tSpeed, isCloud ? "Cards / sec" : "Schedules / sec");
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
    updateRing(0, state.totalLessons || 1);

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

      // Update the SVG progress ring — use placed/total if available,
      // else approximate from time-based overall progress.
      if (ev.placed != null && state.totalLessons > 0) {
        updateRing(ev.placed, state.totalLessons);
      } else {
        // Fallback: ring tracks overall time progress
        updateRing(p1 * state.totalLessons, state.totalLessons || 1);
      }

      // Update branch lane widths if branch progress data is available
      if (Array.isArray(ev.branchProgress)) {
        updateBranches(ev.branchProgress);
      }

      pulseHeatmap(iter);
      if (refs.placingLabel) {
        refs.placingLabel.textContent = ev.currentlyPlacing || "—";
      }
      if (Array.isArray(ev.latestViolations)) renderFaults(ev.latestViolations);
    } else if (ev.type === "done") {
      state.lastResult = ev.result;
      // Bar fills to 100% before we transition.
      refs.bar1Fill.style.width = "100%";
      refs.bar2Fill.style.width = "100%";
      updateRing(1, 1);
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
