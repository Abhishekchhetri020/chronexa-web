/**
 * CanvasGeometry — Classic-faithful pixel geometry + Floor/FD overlay.
 *
 * Exports geometry constants (period width, day gap, row heights, header)
 * and helpers (x_for_day_period, width_for_card, rowHeightFor).
 *
 * Decorates the rendered editor with:
 *   - "Floor" supervision rows when perspective === "room"
 *   - floor supervision rows when perspective === "room"
 * The overlay is gated on `<html data-skin="classic">` and is additive
 * (no source file owned by Agent E is touched).
 *
 * Agent I — wave-3, chronexa-web.
 */
window.CanvasGeometry = (function () {
  "use strict";

  const GEOMETRY = Object.freeze({
    PERIOD_WIDTH: 40,             // px per period (configurable 35-50)
    PERIOD_WIDTH_MIN: 35,
    PERIOD_WIDTH_MAX: 50,
    DAY_GAP: 8,                   // px between day-blocks
    ROW_HEIGHT: 26,               // default row height
    ROW_HEIGHT_PRE_PRIMARY: 32,   // Nursery/LKG/UKG taller — oral rows
    HEADER_HEIGHT: 32,            // period-header strip
    PENDING_STRIP_HEIGHT: 80,
    ROW_LABEL_WIDTH: 130,         // sticky left column
    FLOOR_LABELS: ["1st Floor", "2nd Floor", "3rd Floor"],
  });

  /** Absolute x-offset (px) for cell at (day, period). period is 1-indexed. */
  function x_for_day_period(d, p, periods, periodWidth) {
    const pw = periodWidth || GEOMETRY.PERIOD_WIDTH;
    const pp = periods || 8;
    return GEOMETRY.ROW_LABEL_WIDTH
      + d * (pp * pw + GEOMETRY.DAY_GAP)
      + (p - 1) * pw;
  }

  /** Card width (px) for a lesson spanning N consecutive periods. */
  function width_for_card(durationPeriods, periodWidth) {
    const pw = periodWidth || GEOMETRY.PERIOD_WIDTH;
    const n = Math.max(1, durationPeriods | 0);
    return n * pw - 2;            // -2: matches `.chrx-vkarta inset:1px` on each side
  }

  /** 32 px for pre-primary rows (label starts with Nursery/LKG/UKG/...), else 26. */
  function rowHeightFor(rowMeta) {
    const label = (rowMeta && (rowMeta.label || rowMeta.name) || "").toLowerCase();
    return /^(nursery|lkg|ukg|pre\s*primary|kg\b|kg1|kg2|prep)/.test(label)
      ? GEOMETRY.ROW_HEIGHT_PRE_PRIMARY
      : GEOMETRY.ROW_HEIGHT;
  }

  // ─────────── DOM overlays (idempotent) ───────────

  function decorate(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll(".chrx-floor-row, .chrx-fd-tag").forEach(n => n.remove());
    paintHalos(rootEl);
    if (document.documentElement.getAttribute("data-skin") !== "classic") return;
    const persp = (window.APP && window.APP.editor && window.APP.editor.perspective) || "class";
    if (persp === "room") injectFloorRows(rootEl);
  }

  // Verification halo (Top-30 #12). Walks every placed card and asks
  // SolverConstraints.checkPlacement whether the lesson has any rule
  // violations at its current slot. checkPlacement already excludes the
  // card from its own sameSlot filter so re-checking a placed card is
  // safe. Sets data-halo="red" for hard violations, "amber" for soft-only,
  // clears the attribute otherwise. CSS in editor.css paints the ring.
  // Disabled if SolverConstraints isn't loaded yet (module import racing
  // first render) — the next decorate() call re-runs and picks it up.
  function paintHalos(rootEl) {
    const APP = window.APP;
    const S = APP && APP.school;
    const check = window.SolverConstraints && window.SolverConstraints.checkPlacement;
    if (!S || !check) {
      rootEl.querySelectorAll(".chrx-vkarta[data-halo]").forEach(el => el.removeAttribute("data-halo"));
      return;
    }
    rootEl.querySelectorAll(".chrx-vkarta").forEach(el => {
      const lessonId = el.dataset.lessonId;
      const day      = parseInt(el.dataset.day, 10);
      const period   = parseInt(el.dataset.period, 10);
      if (!lessonId || Number.isNaN(day) || Number.isNaN(period)) {
        el.removeAttribute("data-halo");
        return;
      }
      const card = (S.cards || []).find(c =>
        c.lessonId === lessonId && c.day === day && c.period === period);
      const roomId = (card && card.classroomId) || null;
      let r;
      try { r = check(S, lessonId, day, period, roomId); }
      catch { r = { hard: [], soft: [] }; }
      const hard = (r.hard || []).length;
      const soft = (r.soft || []).length;
      if (hard > 0)      el.setAttribute("data-halo", "red");
      else if (soft > 0) el.setAttribute("data-halo", "amber");
      else               el.removeAttribute("data-halo");
    });
  }

  function injectFloorRows(rootEl) {
    const head = rootEl.querySelector(".chrx-row-head");
    if (!head) return;
    const periodCount = head.querySelectorAll(".chrx-h-period").length;
    const cells = repeat(
      `<div class="chrx-slot chrx-floor-slot"><span class="chrx-fd-tag">FD</span></div>`,
      periodCount);
    const frag = document.createDocumentFragment();
    for (const label of GEOMETRY.FLOOR_LABELS) {
      const row = document.createElement("div");
      row.className = "chrx-row chrx-floor-row";
      row.setAttribute("data-row", "floor:" + label);
      row.innerHTML =
        `<div class="chrx-rowlabel"><span class="chrx-rowlabel-main">${esc(label)}</span></div>` + cells;
      frag.appendChild(row);
    }
    head.after(frag);
    // Auto-fit injected floor labels using the grid's computed column width
    const grid = rootEl.querySelector(".chrx-grid");
    const colW = grid ? parseFloat(getComputedStyle(grid).getPropertyValue("--chrx-rowlabel-w")) || 52 : 52;
    const usable = colW - 8;
    rootEl.querySelectorAll(".chrx-floor-row .chrx-rowlabel-main").forEach(main => {
      main.style.transform = "none";
      const textW = main.scrollWidth;
      if (usable > 0 && textW > usable) {
        main.style.transform = "scaleX(" + Math.max(0.5, usable / textW).toFixed(3) + ")";
      }
    });
  }

  // ─────────── install (wrap Editor.render additively) ───────────

  function install() {
    const run = () => document.querySelectorAll(".chrx-editor").forEach(decorate);
    const wrap = () => {
      if (window.Editor && window.Editor.render && !window.Editor.__chrxGeomWrapped) {
        const orig = window.Editor.render;
        window.Editor.render = function (rootEl) {
          const r = orig.apply(this, arguments);
          try { decorate(rootEl); } catch {}
          return r;
        };
        window.Editor.__chrxGeomWrapped = true;
      }
    };
    if (window.Editor) wrap();
    else document.addEventListener("DOMContentLoaded", wrap, { once: true });
    document.addEventListener("editor:place",  run);
    document.addEventListener("editor:pickup", run);
    new MutationObserver(run).observe(document.documentElement,
      { attributes: true, attributeFilter: ["data-skin"] });
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
  }

  function repeat(s, n) { let o = ""; for (let i = 0; i < n; i++) o += s; return o; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g,
      c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  install();

  return { GEOMETRY, x_for_day_period, width_for_card, rowHeightFor, decorate };
})();
