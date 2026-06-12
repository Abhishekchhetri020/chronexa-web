/**
 * ConstraintExplainer — why is this card flagged?
 *
 * Hovering a red/yellow card in the editor grid pops a tooltip explaining
 * which hard or soft constraints are broken at that (lessonId, day, period).
 * Classic's "conflict" gives one generic word; Chronexa names the rule and
 * the offending neighbour ("Mr. Sharma already teaches IX-A → Maths here").
 *
 * Data sources (in priority order):
 *   1. window.APP.lastSolverResult.violations  — solver-level, lesson-keyed.
 *      Coarse (only emitted for UNPLACED lessons during Generate). Surfaces
 *      "this lesson was infeasible globally" annotations.
 *   2. window.SolverConstraints.checkPlacement — live recheck of the cell
 *      against current S.cards. Cell-level. Returns {hard:[], soft:[]}.
 *      Loaded via the module shim in index.html.
 *   3. window.Placement.classify — fallback when SolverConstraints hasn't
 *      finished its module import yet. Same hard checks; sparser reasons.
 *
 * Tooltip is a single fixed-position element, recycled across hovers. Plain
 * JS + tailwind. No deps. pointer-events:none so it never blocks clicks.
 * 60ms debounce on show, 80ms on hide prevents flicker on hover-out-then-back.
 */
window.ConstraintExplainer = (function () {
  "use strict";

  const SHOW_DELAY_MS = 60;
  const HIDE_DELAY_MS = 80;

  let tooltipEl = null;
  let showTimer = null;
  let hideTimer = null;
  let currentTarget = null;

  /** Public: explain why one (cardId, day, period) is flagged. */
  function explainCell(cardId, day, period) {
    const out = { severity: "ok", reasons: [] };
    const S = window.APP && window.APP.school;
    if (!S) return out;
    const lessonId = lessonIdFromCardId(cardId);
    if (!lessonId) return out;
    const card = (S.cards || []).find(c =>
      c.lessonId === lessonId && c.day === day && c.period === period
    );
    const roomId = (card && card.classroomId) || (S._idx.lessonById[lessonId] || {}).preferredRoomId;

    // 2. Live cell-level recheck — primary source.
    const live = livecheck(S, lessonId, day, period, roomId);

    // 1. Solver-emitted violations for this lesson (supplementary).
    const solverNote = solverNoteFor(lessonId);

    const hard = [...live.hard];
    const soft = [...live.soft];
    if (solverNote && hard.indexOf(solverNote) === -1 && soft.indexOf(solverNote) === -1) {
      // Solver-level notes attach as soft annotations (the generator told us
      // this lesson was hard to place; not necessarily a conflict in the
      // current cell). They appear after live reasons.
      soft.push(solverNote);
    }

    if (hard.length) {
      out.severity = "hard";
      out.reasons = hard.slice(0, 3);
      if (hard.length < 3 && soft.length) {
        out.reasons.push(...soft.slice(0, 3 - hard.length));
      }
    } else if (soft.length) {
      out.severity = "soft";
      out.reasons = soft.slice(0, 3);
    }
    return out;
  }

  function livecheck(S, lessonId, day, period, roomId) {
    if (window.SolverConstraints && typeof window.SolverConstraints.checkPlacement === "function") {
      try { return window.SolverConstraints.checkPlacement(S, lessonId, day, period, roomId); }
      catch (e) { /* fall through */ }
    }
    // Fallback: Placement.classify (already loaded as classic script).
    if (window.Placement && typeof window.Placement.classify === "function") {
      try {
        const r = window.Placement.classify(lessonId, day, period, roomId);
        if (r.validity === "red") return { hard: r.reasons || [], soft: [] };
        if (r.validity === "amber") return { hard: [], soft: r.reasons || [] };
        return { hard: [], soft: [] };
      } catch (e) { /* ignore */ }
    }
    return { hard: [], soft: [] };
  }

  function solverNoteFor(lessonId) {
    const res = window.APP && window.APP.lastSolverResult;
    const list = res && res.violations;
    if (!list || !list.length) return null;
    // Solver violations carry a structured lessonId (source id). Older
    // results used "Lesson <id> …" descriptions — keep that as a fallback.
    let count = 0;
    for (const v of list) {
      if (!v) continue;
      if (v.lessonId === lessonId) { count++; continue; }
      const d = v.description;
      if (d && (d.indexOf(`Lesson ${lessonId} `) === 0 ||
                d.indexOf(`Lesson ${lessonId}#`) === 0)) {
        count++;
      }
    }
    if (!count) return null;
    return count === 1
      ? "Solver couldn't place this lesson globally — try freeing a slot"
      : `Solver couldn't place ${count} repetitions of this lesson — try freeing slots`;
  }

  /** Card-id is `placed_${lessonId}_${day}_${period}`; parse out the lessonId. */
  function lessonIdFromCardId(cardId /* , S */) {
    if (!cardId) return null;
    if (cardId.indexOf("placed_") !== 0) return cardId;
    // lessonId may itself contain underscores — strip the "placed_" prefix
    // and the trailing "_<day>_<period>" suffix. We use the vk dataset
    // (data-lesson-id) instead in practice via the caller, but support the
    // legacy cardId-only path for backward compat with explainCell()'s API.
    const rest = cardId.slice("placed_".length);
    const lastUnderscore = rest.lastIndexOf("_");
    if (lastUnderscore <= 0) return rest;
    const middle = rest.slice(0, lastUnderscore);
    const lastUnderscore2 = middle.lastIndexOf("_");
    if (lastUnderscore2 <= 0) return middle;
    return middle.slice(0, lastUnderscore2);
  }

  /** Public: wire hover handlers to all .chrx-vkarta cells inside root. */
  function attachTooltip(rootEl) {
    if (!rootEl) return;
    ensureTooltipEl();
    // One delegated listener per root. Avoid double-wiring across re-renders.
    if (rootEl.__chrxExplainerWired) return;
    rootEl.__chrxExplainerWired = true;
    rootEl.addEventListener("mouseover", onMouseOver, true);
    rootEl.addEventListener("mousemove", onMouseMove, true);
    rootEl.addEventListener("mouseout", onMouseOut, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
  }

  function ensureTooltipEl() {
    if (tooltipEl && document.body.contains(tooltipEl)) return;
    tooltipEl = document.createElement("div");
    tooltipEl.className = "chrx-explainer-tooltip";
    tooltipEl.setAttribute("role", "tooltip");
    tooltipEl.style.cssText = [
      "position:fixed",
      "z-index:120",
      "pointer-events:none",
      "max-width:280px",
      "min-width:180px",
      "background:#1e293b",
      "color:#f8fafc",
      "border-radius:6px",
      "box-shadow:0 6px 20px rgba(0,0,0,.25)",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "font-size:11.5px",
      "line-height:1.35",
      "padding:0",
      "opacity:0",
      "transition:opacity 120ms ease",
      "display:none",
    ].join(";");
    document.body.appendChild(tooltipEl);
  }

  function onMouseOver(ev) {
    if (window.APP && window.APP.editor && window.APP.editor.cardInHand) return;
    const vk = ev.target.closest && ev.target.closest(".chrx-vkarta");
    if (!vk) return;
    currentTarget = vk;
    clearTimeout(hideTimer); hideTimer = null;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => showFor(vk, ev.clientX, ev.clientY), SHOW_DELAY_MS);
  }

  function onMouseMove(ev) {
    if (window.APP && window.APP.editor && window.APP.editor.cardInHand) {
      hideTooltip();
      return;
    }
    if (!tooltipEl || tooltipEl.style.display === "none") return;
    const vk = ev.target.closest && ev.target.closest(".chrx-vkarta");
    if (vk && vk === currentTarget) {
      positionTooltip(ev.clientX, ev.clientY);
    }
  }

  function onMouseOut(ev) {
    const vk = ev.target.closest && ev.target.closest(".chrx-vkarta");
    if (!vk) return;
    // Only hide when the relatedTarget is NOT inside the same vkarta or our tooltip.
    const to = ev.relatedTarget;
    if (to && (vk.contains(to) || (tooltipEl && tooltipEl.contains(to)))) return;
    clearTimeout(showTimer); showTimer = null;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideTooltip, HIDE_DELAY_MS);
    currentTarget = null;
  }

  function onKeyDown(ev) {
    if (ev.key === "Escape") hideTooltip();
  }
  function onKeyUp() { /* Shift toggle obsolete — tooltip always shows */ }

  function showFor(vk, mouseX, mouseY) {
    if (!vk || !document.body.contains(vk)) { hideTooltip(); return; }
    ensureTooltipEl();
    // The cell carries the canonical lessonId on data-lesson-id; the cardId
    // (data-card-id, e.g. "placed_l1_0_3") is kept as the public API arg for
    // explainCell so external callers can still reason about a card by id.
    const cardId = vk.dataset.cardId || `placed_${vk.dataset.lessonId}_${vk.dataset.day}_${vk.dataset.period}`;
    const day = parseInt(vk.dataset.day, 10);
    const period = parseInt(vk.dataset.period, 10);
    const data = explainCell(cardId, day, period);

    // This tooltip is now the ONLY hover surface for a card (the native
    // title attribute was removed — it overlapped this one with the same
    // text). So always show, with a card-info header; the violations
    // section appears only when the cell is actually flagged.
    data.info = cardInfoFor(vk.dataset.lessonId || lessonIdFromCardId(cardId));

    tooltipEl.innerHTML = renderTooltipHtml(data);

    // Position near cursor (or near vk if no mouse coords).
    let x, y;
    if (mouseX != null && mouseY != null) {
      x = mouseX; y = mouseY;
    } else {
      const r = vk.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.bottom;
    }
    tooltipEl.style.display = "block";
    positionTooltip(x, y);
    // Wire the Fix-it button (rebuilt on every show).
    const btn = tooltipEl.querySelector(".chrx-explainer-fix-btn");
    if (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        document.dispatchEvent(new CustomEvent("app:suggest-fix", {
          detail: { cardId, day, period, severity: data.severity, reasons: data.reasons },
        }));
      });
      // Ensure the button is clickable even though the tooltip is pointer-events:none.
      btn.style.pointerEvents = "auto";
    }
    requestAnimationFrame(() => { tooltipEl.style.opacity = "1"; });
  }

  function positionTooltip(x, y) {
    if (!tooltipEl) return;
    const margin = 12;
    const w = tooltipEl.offsetWidth || 240;
    const h = tooltipEl.offsetHeight || 80;
    let nx = x + margin;
    let ny = y + margin;
    if (nx + w + 4 > window.innerWidth) nx = Math.max(4, x - w - margin);
    if (ny + h + 4 > window.innerHeight) ny = Math.max(4, y - h - margin);
    tooltipEl.style.left = nx + "px";
    tooltipEl.style.top  = ny + "px";
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.style.opacity = "0";
    tooltipEl.style.display = "none";
  }

  /** Subject / class / teacher / room facts for the tooltip header. */
  function cardInfoFor(lessonId) {
    const S = window.APP && window.APP.school;
    const L = S && S._idx ? S._idx.lessonById[lessonId] : null;
    if (!L) return null;
    const subj = S._idx.subjectById[L.subjectId];
    return {
      subject: subj ? (subj.name || subj.abbr) : "?",
      classes: (L.classIds || []).map(id => S._idx.classById[id])
        .filter(Boolean).map(c => c.name || c.id).join(", "),
      teachers: (L.teacherIds || []).map(id => S._idx.teacherById[id])
        .filter(Boolean).map(t => t.abbr || t.name).join(", "),
      room: (() => {
        const r = L.preferredRoomId ? S._idx.classroomById[L.preferredRoomId] : null;
        return r ? r.name : "";
      })(),
    };
  }

  function renderTooltipHtml(data) {
    const sev = data.severity;
    const badge = sev === "hard"
      ? { label: "Hard conflict", bg: "#dc2626" }
      : sev === "soft"
      ? { label: "Soft penalty",  bg: "#d97706" }
      : null;

    // Card-info header — always present (this is the only hover tooltip).
    const info = data.info;
    const infoHtml = info ? [
      `<div style="padding:8px 10px 7px;${sev !== "ok" ? "border-bottom:1px solid rgba(255,255,255,.1);" : ""}">`,
        `<div style="font-weight:700;font-size:12.5px;margin-bottom:3px;">${escHtml(info.subject)}</div>`,
        `<div style="display:flex;flex-wrap:wrap;gap:4px 10px;color:#cbd5e1;font-size:10.5px;">`,
          info.classes  ? `<span>🏫 ${escHtml(info.classes)}</span>`  : ``,
          info.teachers ? `<span>👤 ${escHtml(info.teachers)}</span>` : ``,
          info.room     ? `<span>📍 ${escHtml(info.room)}</span>`     : ``,
        `</div>`,
      `</div>`,
    ].join("") : "";

    if (sev === "ok") return infoHtml || `<div style="padding:8px 10px;">—</div>`;

    const reasons = (data.reasons && data.reasons.length)
      ? data.reasons
      : ["No violations detected at this cell."];
    const bullets = reasons.map(r =>
      `<li style="margin:0;padding:3px 0 3px 14px;position:relative;">
         <span style="position:absolute;left:0;top:7px;width:5px;height:5px;border-radius:50%;background:${badge.bg};"></span>
         ${escHtml(r)}
       </li>`
    ).join("");
    return [
      infoHtml,
      `<div style="display:flex;align-items:center;gap:6px;padding:7px 10px 6px;">`,
        `<span style="display:inline-block;padding:2px 6px;border-radius:3px;background:${badge.bg};color:#fff;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.3px;">${escHtml(badge.label)}</span>`,
        `<span style="color:#cbd5e1;font-size:10.5px;">${escHtml(reasons.length + " reason" + (reasons.length === 1 ? "" : "s"))}</span>`,
      `</div>`,
      `<ul style="list-style:none;margin:0;padding:0 10px 4px;">${bullets}</ul>`,
      `<div style="padding:4px 10px 8px;border-top:1px solid rgba(255,255,255,.08);">
         <button type="button" class="chrx-explainer-fix-btn"
                 style="background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.3);border-radius:4px;padding:3px 8px;font-size:10.5px;font-weight:600;cursor:pointer;">
           🛠 Fix automatically (beta)
         </button>
       </div>`,
    ].join("");
  }

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g,
      c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  return { explainCell, attachTooltip };
})();
