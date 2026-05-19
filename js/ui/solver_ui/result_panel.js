/* Chronexa Solver — Result panel.
 *
 *   SolverUI.Result.open({
 *     result:    SolveResponse,                  // per DATA_SHAPES.md
 *     mode:      "test" | "generate",
 *     school:    SchoolData,                     // the input — needed for totals
 *     onApply(newCards)                          // applied to APP.school.cards
 *     onDiscard()                                // restore previous
 *     onViewViolations(violations)               // open verification panel
 *     onClose()                                  // dismissed without action
 *   })
 *
 * Apply semantics:
 *   - Snapshot the existing APP.school.cards (deep copy).
 *   - Replace with SolveResponse.assignment mapped to the {lessonId, day, period,
 *     classroomId} card schema.
 *   - Discard restores the snapshot.
 *
 * The snapshot is owned by this module so a user can re-open and discard up
 * until they close the panel.
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

  function fmt(n) {
    if (n == null || !isFinite(n)) return "—";
    return Number(n).toLocaleString();
  }

  function build() {
    host = el("div", { class: "csu-backdrop", role: "presentation", "aria-hidden": "true" });
    dlg = el("section", {
      class: "csu-dialog csu-result",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "csu-result-title",
    });

    const title = el("h2", { class: "csu-dialog__title", id: "csu-result-title" }, "Solver finished");
    const status = el("div", { class: "csu-result__status", id: "csu-result-status" }, "");

    const hero = el("div", { class: "csu-result__hero" });
    const placed   = el("div", { class: "csu-result__tile csu-result__tile--ok"   });
    const unplaced = el("div", { class: "csu-result__tile csu-result__tile--warn" });
    const relax    = el("div", { class: "csu-result__tile" });
    const soft     = el("div", { class: "csu-result__tile" });
    hero.append(placed, unplaced, relax, soft);

    const grid = el("div", { class: "csu-result__grid", id: "csu-result-grid" });

    const apply = el("button", { type: "button", class: "chrx-btn chrx-btn--primary", onclick: doApply, id: "csu-result-apply" }, "Apply to timetable");
    const view  = el("button", { type: "button", class: "chrx-btn", onclick: doView },  "View violations");
    const disc  = el("button", { type: "button", class: "chrx-btn chrx-btn--danger", onclick: doDiscard, id: "csu-result-discard" }, "Discard");
    const close = el("button", { type: "button", class: "chrx-btn", onclick: doClose }, "Close");
    const actions = el("div", { class: "csu-dialog__actions" }, disc, view, close, apply);

    dlg.append(title, status, hero, grid, actions);
    host.appendChild(dlg);
    document.body.appendChild(host);

    refs = { title, status, placed, unplaced, relax, soft, grid, apply, view, disc, close };
  }

  function renderHero(result, totalLessons) {
    const s = result.stats || {};
    refs.placed.innerHTML   = "";
    refs.unplaced.innerHTML = "";
    refs.relax.innerHTML    = "";
    refs.soft.innerHTML     = "";

    refs.placed.append(
      el("div", { class: "csu-result__num" }, fmt(s.placed)),
      el("div", { class: "csu-result__lbl" }, `placed of ${fmt(totalLessons)}`),
    );
    refs.unplaced.append(
      el("div", { class: "csu-result__num" }, fmt(s.unplaced)),
      el("div", { class: "csu-result__lbl" }, "unplaced"),
    );
    refs.relax.append(
      el("div", { class: "csu-result__num" }, fmt(s.hardConflicts)),
      el("div", { class: "csu-result__lbl" }, "hard conflicts"),
    );
    refs.soft.append(
      el("div", { class: "csu-result__num" }, fmt(s.softScore)),
      el("div", { class: "csu-result__lbl" }, "soft score"),
    );
  }

  function renderPerSlotGrid(result, school) {
    refs.grid.innerHTML = "";
    const periods = (school && school.bell && school.bell.periods) || [];
    if (!periods.length) return;
    const dayNames = (global.I18N && I18N.STRINGS && I18N.STRINGS.days && I18N.STRINGS.days.en) || ["Mon","Tue","Wed","Thu","Fri","Sat"];
    const periodIdxs = periods.map(p => p.index).sort((a, b) => a - b);

    // Build a (day,period) → count of placements.
    const buckets = new Map();
    for (const a of (result.assignment || [])) {
      const k = a.day + ":" + a.period;
      buckets.set(k, (buckets.get(k) || 0) + 1);
    }
    let maxCount = 1;
    for (const v of buckets.values()) if (v > maxCount) maxCount = v;

    const header = el("div", { class: "csu-result__gridRow csu-result__gridRow--head" });
    header.appendChild(el("div", { class: "csu-result__gridCell csu-result__gridCell--day" }, ""));
    for (const p of periodIdxs) {
      header.appendChild(el("div", { class: "csu-result__gridCell csu-result__gridCell--head" }, "P" + p));
    }
    refs.grid.appendChild(header);

    for (let d = 0; d < 6; d++) {
      const row = el("div", { class: "csu-result__gridRow" });
      row.appendChild(el("div", { class: "csu-result__gridCell csu-result__gridCell--day" }, dayNames[d] || ("D" + (d + 1))));
      for (const p of periodIdxs) {
        const k = d + ":" + p;
        const n = buckets.get(k) || 0;
        const intensity = n / maxCount;
        const cell = el("div", {
          class: "csu-result__gridCell",
          title: `${dayNames[d] || ("D" + (d + 1))} · P${p} · ${n} placements`,
          style: intensity > 0 ? `background: rgba(0,100,224,${(0.10 + 0.60 * intensity).toFixed(2)});` : "",
        }, n ? String(n) : "");
        row.appendChild(cell);
      }
      refs.grid.appendChild(row);
    }
  }

  function assignmentToCards(assignment) {
    if (!Array.isArray(assignment)) return [];
    const out = [];
    for (const a of assignment) {
      out.push({
        lessonId: a.lessonId,
        day: a.day,
        period: a.period,
        classroomId: a.classroomId || null,
      });
    }
    return out;
  }

  function doApply() {
    if (!state) return;
    const newCards = assignmentToCards(state.result.assignment);
    if (state.school && !state.snapshot) {
      state.snapshot = Array.isArray(state.school.cards) ? state.school.cards.slice() : [];
    }
    if (state.school) state.school.cards = newCards;
    state.applied = true;
    state.discarded = false;
    refs.apply.disabled = true;
    refs.disc.disabled = false;
    refs.status.textContent = "Applied to timetable.";
    refs.status.style.color = "var(--chrx-green)";
    if (state.onApply) try { state.onApply(newCards); } catch (e) { console.error(e); }
  }
  function doDiscard() {
    if (!state) return;
    if (state.school && state.snapshot != null) {
      state.school.cards = state.snapshot;
      state.snapshot = null;
    }
    state.discarded = true;
    refs.apply.disabled = false;
    refs.disc.disabled = true;
    refs.status.textContent = "Discarded — your previous timetable is restored.";
    refs.status.style.color = "var(--chrx-orange)";
    if (state.onDiscard) try { state.onDiscard(); } catch (e) { console.error(e); }
  }
  function doView() {
    if (!state) return;
    const v = (state.result && state.result.violations) || [];
    // Auto-apply on view-violations too (same intent as close).
    if (canAutoApply()) doApply();
    close();
    if (state.onViewViolations) try { state.onViewViolations(v); } catch (e) { console.error(e); }
  }
  function canAutoApply() {
    if (!state) return false;
    if (state.mode === "test") return false;
    if (state.applied || state.discarded) return false;
    const r = state.result;
    if (!r) return false;
    const a = r.assignment;
    if (!Array.isArray(a) || a.length === 0) return false;
    // Refuse to silently overwrite a working timetable with an inferior
    // run. Only auto-apply on clean, complete solutions.
    if (r.status === "TIMEOUT" || r.status === "INFEASIBLE") return false;
    const hard = (r.stats && r.stats.hardConflicts) || 0;
    if (hard > 0) return false;
    const before = (state.school && state.school.cards && state.school.cards.length) || 0;
    if (before > 0 && a.length < before) return false;
    return true;
  }
  function doClose() {
    // Implicit-apply: if the solver produced placements and the user
    // didn't explicitly Discard, treat Close as "keep these cards" so
    // a successful run isn't silently thrown away.
    if (canAutoApply()) doApply();
    close();
    if (state && state.onClose) try { state.onClose(); } catch (e) { console.error(e); }
    state = null;
  }

  function open(opts) {
    if (!host) build();
    state = {
      result: opts.result || { stats: {}, assignment: [], violations: [] },
      school: opts.school || null,
      mode:   opts.mode || "generate",
      onApply: opts.onApply,
      onDiscard: opts.onDiscard,
      onViewViolations: opts.onViewViolations,
      onClose: opts.onClose,
      snapshot: null,
    };
    const status = state.result.status || "DONE";
    // Hero denominator should be total expected cards (lessons × periodsPerWeek),
    // not lesson count — a single lesson can spawn many cards per week.
    let expectedCards = 0;
    if (state.school && state.school.lessons) {
      for (const l of state.school.lessons) {
        expectedCards += Math.max(1, (l.periodsPerWeek || 1));
      }
    }
    const placedNum  = (state.result.stats && state.result.stats.placed)   || 0;
    const unplacedNm = (state.result.stats && state.result.stats.unplaced) || 0;
    const totalLessons = expectedCards || (placedNum + unplacedNm);
    refs.title.textContent = state.mode === "test" ? "Test finished" : "Generator finished";
    refs.status.textContent = `${status} · ${(state.result.stats && state.result.stats.durationMs) ? Math.round(state.result.stats.durationMs / 1000) + "s" : ""}`;
    refs.status.style.color = (status === "OPTIMAL" || status === "FEASIBLE") ? "var(--chrx-green)" : "var(--chrx-orange)";
    refs.apply.disabled = state.mode === "test";
    refs.disc.disabled = true;
    renderHero(state.result, totalLessons);
    renderPerSlotGrid(state.result, state.school);

    host.classList.add("is-open");
    host.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => refs.close.focus());
  }
  function close() {
    if (!host) return;
    host.classList.remove("is-open");
    host.setAttribute("aria-hidden", "true");
  }

  global.SolverUI = global.SolverUI || {};
  global.SolverUI.Result = { open, close };
})(typeof window !== "undefined" ? window : globalThis);
