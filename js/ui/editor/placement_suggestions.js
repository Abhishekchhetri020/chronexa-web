/**
 * PlacementSuggestions — "Best slot" recommender for unplaced cards (Lane D).
 *
 * When a card from the pending strip is picked up (drag or click mode), every
 * rendered empty slot in the card's target row(s) is classified with the
 * existing hard-constraint validator (`window.Placement.classify` — the same
 * classifier the hover heatmap, click highlights and commit guard use, so
 * validation semantics are unchanged), all valid slots are lit via the
 * existing `data-validity` channel, and exactly one slot is marked Best.
 *
 * Best ranking (lexicographic, deterministic):
 *   1. hard validity — green before amber; red is excluded, never suggested;
 *   2. soft pressure — fewer amber reasons first;
 *   3. teacher timetable balance — fewer day gaps, then shorter max
 *      consecutive run, then lighter day load (bottleneck teacher wins);
 *   4. deterministic ties — day, period, then String(rowKey).
 *
 * The marker is visual only (`chrx-slot--suggest-best` + `data-suggest`).
 * It carries no tooltip and no explanation, and it never changes commit,
 * swap, ghost, touch or keyboard behaviour — the Best slot keeps whatever
 * highlight/commit path it already had, so clicking it flows through the
 * existing `onPointerDown` intercept unchanged.
 *
 * Performance: runs once per from-pending pickup over rendered slots only
 * (≤ dozens per row), never per-pointermove — the drag hot path is untouched.
 */
(function () {
  "use strict";

  var BEST_CLASS = "chrx-slot--suggest-best";
  var BEST_ATTR = "data-suggest";
  var BEST_VALUE = "best";

  // ---------------------------------------------------------------- pure ---

  /** Periods a teacher already teaches on a day (integer period indices). */
  function teacherDayPeriods(cards, lessonsById, teacherId, day) {
    var out = new Set();
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.day !== day) continue;
      var lesson = lessonsById[c.lessonId];
      if (!lesson) continue;
      if ((lesson.teacherIds || []).indexOf(teacherId) === -1) continue;
      out.add(c.period | 0);
    }
    return out;
  }

  /**
   * Balance cost of placing a block (period..period+len-1) for one teacher.
   * Gaps = teaching periods strictly inside the day's span that stay empty;
   * run = longest integer-consecutive run in the union; load = day total.
   */
  function teacherCost(existing, day, period, blockLen, teaching) {
    var union = new Set(existing);
    for (var k = 0; k < blockLen; k++) union.add((period | 0) + k);
    var list = Array.from(union).sort(function (a, b) { return a - b; });
    if (!list.length) return { gaps: 0, run: 0, load: 0 };
    var lo = list[0], hi = list[list.length - 1];
    var hasTeaching = teaching && teaching.size > 0;
    var span = 0, inSpan = 0, run = 0, best = 0, prev = -Infinity;
    for (var p = lo; p <= hi; p++) {
      if (hasTeaching && !teaching.has(p)) continue;
      span++;
      var on = union.has(p);
      if (on) {
        inSpan++;
        run = (p === prev + 1) ? run + 1 : 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
      prev = p;
    }
    return { gaps: span - inSpan, run: best, load: union.size };
  }

  /** Bottleneck aggregation across the lesson's teachers (worst wins). */
  function balanceCost(cards, lessonsById, teacherIds, day, period, blockLen, teaching) {
    var tids = teacherIds && teacherIds.length ? teacherIds : [null];
    var gaps = 0, run = 0, load = 0;
    for (var i = 0; i < tids.length; i++) {
      var existing = tids[i] == null
        ? new Set()
        : teacherDayPeriods(cards, lessonsById, tids[i], day);
      var c = teacherCost(existing, day, period, blockLen, teaching);
      if (c.gaps > gaps) gaps = c.gaps;
      if (c.run > run) run = c.run;
      if (c.load > load) load = c.load;
    }
    return { gaps: gaps, run: run, load: load };
  }

  function cmpStr(a, b) {
    var sa = String(a == null ? "" : a), sb = String(b == null ? "" : b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  /**
   * Deterministic rank over classified candidates.
   * Each item: {rowKey, day, period, validity, amber, gaps, run, load}.
   * Returns a new sorted array; ties break by day, period, rowKey.
   */
  function rankCandidates(items) {
    return (items || []).slice().sort(function (a, b) {
      var ar = a.validity === "green" ? 0 : 1;
      var br = b.validity === "green" ? 0 : 1;
      if (ar !== br) return ar - br;
      if (a.amber !== b.amber) return a.amber - b.amber;
      if (a.gaps !== b.gaps) return a.gaps - b.gaps;
      if (a.run !== b.run) return a.run - b.run;
      if (a.load !== b.load) return a.load - b.load;
      if (a.day !== b.day) return a.day - b.day;
      if (a.period !== b.period) return a.period - b.period;
      return cmpStr(a.rowKey, b.rowKey);
    });
  }

  function pickBest(ranked) {
    return ranked && ranked.length ? ranked[0] : null;
  }

  // ------------------------------------------------------------ adapters ---

  function school() { return (window.APP && window.APP.school) || null; }

  function perspective() {
    return (window.APP && window.APP.editor && window.APP.editor.perspective) || "class";
  }

  // Same row mapping as card_in_hand.rowKeysForCard (kept in sync by hand;
  // both mirror grid_canvas.rowsFor). Room view: drop reassigns the room, so
  // every rendered row is a target (null = all rows).
  function targetRowSet(lesson, persp) {
    if (!lesson || persp === "room") return null;
    var keys = null;
    if (persp === "class") keys = lesson.classIds;
    else if (persp === "teacher") keys = lesson.teacherIds;
    else if (persp === "subject") keys = lesson.subjectId ? [lesson.subjectId] : [];
    if (!keys || !keys.length) return new Set();
    return new Set(keys);
  }

  function rowKeysForLesson(lesson, persp, card) {
    if (persp === "class") return lesson.classIds || [];
    if (persp === "teacher") return lesson.teacherIds || [];
    if (persp === "subject") return lesson.subjectId ? [lesson.subjectId] : [];
    if (persp === "room") {
      var rid = (card && card.classroomId) || lesson.preferredRoomId;
      return rid ? [rid] : [];
    }
    return [];
  }

  function escSel(s) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(s));
    return String(s).replace(/"/g, '\\"');
  }

  function teachingPeriods(S) {
    var set = new Set();
    var periods = (S && S.bell && Array.isArray(S.bell.periods)) ? S.bell.periods : null;
    if (periods && periods.length) {
      for (var i = 0; i < periods.length; i++) {
        var p = periods[i];
        var ix = p && Number.isFinite(p.index) ? p.index : parseInt(p && p.index, 10);
        if (!Number.isFinite(ix) || ix <= 0) continue;
        if (p.isTeaching === false) continue;
        set.add(ix | 0);
      }
      if (set.size) return set;
    }
    return null; // bell-agnostic fallback: integer adjacency
  }

  function slotEl(rowKey, day, period) {
    return document.querySelector(
      '.chrx-editor .chrx-slot[data-row="' + escSel(rowKey) + '"]' +
      '[data-day="' + day + '"][data-period="' + period + '"]');
  }

  function clearBest() {
    document.querySelectorAll("." + BEST_CLASS).forEach(function (el) {
      el.classList.remove(BEST_CLASS);
      el.removeAttribute(BEST_ATTR);
    });
  }

  /**
   * Classify + rank every rendered empty destination for the in-hand card.
   * Returns { ranked, best } with DOM elements attached (best.el when found).
   * Red slots are excluded; occupied slots are excluded (swaps keep their own
   * existing highlight path — Best is always a clean placement).
   */
  function suggestForInHand(hand) {
    var S = school();
    if (!S || !S._idx || !hand || !hand.lessonId) return { ranked: [], best: null };
    if (!window.Placement || typeof window.Placement.classify !== "function") {
      return { ranked: [], best: null };
    }
    var lesson = S._idx.lessonById[hand.lessonId];
    if (!lesson) return { ranked: [], best: null };
    var persp = perspective();
    var targets = targetRowSet(lesson, persp);
    var blockLen = Math.max(1, parseInt(hand.blockLen, 10) || 1);
    var teaching = teachingPeriods(S);
    var lessonsById = S._idx.lessonById;

    // Row-mapped occupancy from S.cards (source of truth, mirrors the grid).
    var rowTaken = new Set();
    for (var i = 0; i < (S.cards || []).length; i++) {
      (function (c) {
        var L = lessonsById[c.lessonId];
        if (!L) return;
        var keys = rowKeysForLesson(L, persp, c);
        for (var k = 0; k < keys.length; k++) {
          rowTaken.add(keys[k] + "|" + c.day + "|" + c.period);
        }
      })(S.cards[i]);
    }

    // Enumerate rendered slots only — guarantees every candidate maps to a
    // real element in overview, focus-board and single-day views alike.
    var seen = new Set();
    var cands = [];
    var slots = document.querySelectorAll(".chrx-editor .chrx-slot[data-day][data-period][data-row]:not(.out-of-bell)");
    for (var s = 0; s < slots.length; s++) {
      var el = slots[s];
      var rowKey = el.dataset.row;
      if (!rowKey || rowKey === "head") continue;
      if (targets && !targets.has(rowKey)) continue;
      var d = parseInt(el.dataset.day, 10), p = parseInt(el.dataset.period, 10);
      if (!Number.isFinite(d) || !Number.isFinite(p)) continue;
      var id = rowKey + "|" + d + "|" + p;
      if (seen.has(id)) continue;
      seen.add(id);
      if (rowTaken.has(id)) continue;               // occupied → swap path owns it
      if (el.querySelector(".chrx-vkarta")) continue;

      // Multi-period block needs the following cells free in this row —
      // same guard as commit(), scoped to the rendered row.
      var fits = true;
      for (var k = 1; k < blockLen; k++) {
        var ns = slotEl(rowKey, d, p + k);
        if (!ns || ns.classList.contains("out-of-bell") ||
            ns.querySelector(".chrx-vkarta") || rowTaken.has(rowKey + "|" + d + "|" + (p + k))) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;

      var rid = (persp === "room" && rowKey) ? rowKey : lesson.preferredRoomId;
      var sameSlot = (S.cards || []).filter(function (c) { return c.day === d && c.period === p; });
      var v;
      try {
        v = window.Placement.classify(hand.lessonId, d, p, rid, sameSlot);
      } catch (_e) { continue; }
      if (!v || v.validity === "red") continue;     // invalid stays unavailable
      var bal = balanceCost(S.cards || [], lessonsById, lesson.teacherIds, d, p, blockLen, teaching);
      cands.push({
        rowKey: rowKey, day: d, period: p,
        validity: v.validity, amber: v.validity === "amber" ? (v.reasons || []).length : 0,
        gaps: bal.gaps, run: bal.run, load: bal.load, el: el,
      });
    }

    var ranked = rankCandidates(cands);
    return { ranked: ranked, best: pickBest(ranked) };
  }

  /**
   * Paint all valid destinations (existing data-validity channel) and mark
   * exactly one Best. No-op unless a from-pending card is in hand. Never
   * throws — suggestion paint must not break pickup.
   */
  function paintForInHand(hand) {
    try {
      clearBest();
      if (!hand || !hand.fromPending) return { ranked: [], best: null };
      var out = suggestForInHand(hand);
      for (var i = 0; i < out.ranked.length; i++) {
        var c = out.ranked[i];
        if (c.el && !c.el.getAttribute("data-validity")) {
          c.el.setAttribute("data-validity", c.validity);
        }
      }
      if (out.best && out.best.el && document.contains(out.best.el)) {
        out.best.el.classList.add(BEST_CLASS);
        out.best.el.setAttribute(BEST_ATTR, BEST_VALUE);
      } else {
        out.best = null;
      }
      return out;
    } catch (_e) {
      return { ranked: [], best: null };
    }
  }

  var api = {
    paintForInHand: paintForInHand,
    suggestForInHand: suggestForInHand,
    clearBest: clearBest,
    // Pure ranking core (unit-tested without DOM or APP).
    rankCandidates: rankCandidates,
    pickBest: pickBest,
    teacherDayPeriods: teacherDayPeriods,
    teacherCost: teacherCost,
    balanceCost: balanceCost,
    BEST_CLASS: BEST_CLASS,
  };
  // window assignment guarded so the pure core stays importable in
  // non-browser unit runtimes (vitest node env).
  if (typeof window !== "undefined") window.PlacementSuggestions = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
