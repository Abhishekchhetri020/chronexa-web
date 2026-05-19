/* Improve mode — third solver mode alongside Test + Generate.
 *
 * "Test" validates constraints without moving cards.
 * "Generate" runs the solver from scratch.
 * "Improve" takes the CURRENT timetable and tries to LOWER soft penalties
 *   by local-search swaps. Does NOT unplace cards.
 *
 * The Min-Conflicts repair phase W7 added attacks unplaced lessons.
 * This module attacks soft-penalty improvements on a fully-placed schedule.
 *
 * Algorithm: pick a placed card with high local soft penalty; try swapping
 * with another card (same teacher/class/room family) that would lower
 * combined penalty. Accept any net-improving swap. Iterate up to N times
 * or timeBudget. Exposed as window.ImproveMode.run(school, opts).
 */
(function (global) {
  "use strict";

  const DEFAULTS = {
    timeLimitSec: 30,
    maxSwapsTried: 5000,
    targetImprovement: 0.05, // stop early if score improves by 5% over best
  };

  function cardScore(school, card) {
    // Lightweight per-card soft penalty via existing checkPlacement if available
    if (!window.SolverConstraints?.checkPlacement) return 0;
    const r = window.SolverConstraints.checkPlacement(
      school, card.lessonId, card.day, card.period, card.classroomId || null);
    let s = (r.hard || []).length * 100;
    s += (r.soft || []).length * 5;
    // Also include relation violations
    if (window.RelationEnforcer?.check) {
      const r2 = window.RelationEnforcer.check(school, card.lessonId, card.day, card.period);
      s += (r2.hard || []).length * 100;
      s += (r2.soft || []).length * 5;
    }
    return s;
  }

  function totalScore(school) {
    let s = 0;
    for (const c of (school.cards || [])) s += cardScore(school, c);
    return s;
  }

  function trySwap(school, a, b) {
    // Swap (day, period) of two cards; check if combined score improves
    const beforeA = cardScore(school, a);
    const beforeB = cardScore(school, b);
    const before = beforeA + beforeB;

    const tA = a.day, pA = a.period;
    const tB = b.day, pB = b.period;
    a.day = tB; a.period = pB;
    b.day = tA; b.period = pA;

    const afterA = cardScore(school, a);
    const afterB = cardScore(school, b);
    const after = afterA + afterB;

    if (after < before) return true; // keep swap
    // Revert
    a.day = tA; a.period = pA;
    b.day = tB; b.period = pB;
    return false;
  }

  function compatibleForSwap(school, a, b) {
    if (a === b) return false;
    if (!a || !b) return false;
    if (a.locked || b.locked) return false;
    const lessonById = (school._idx && school._idx.lessonById) ||
      Object.fromEntries((school.lessons || []).map(l => [l.id, l]));
    const la = lessonById[a.lessonId], lb = lessonById[b.lessonId];
    if (!la || !lb) return false;
    // Both must share at least one class OR one teacher (so the swap is "feasible-ish")
    const sharedClass = (la.classIds || []).some(c => (lb.classIds || []).includes(c));
    const sharedTeacher = (la.teacherIds || []).some(t => (lb.teacherIds || []).includes(t));
    return sharedClass || sharedTeacher;
  }

  function run(school, opts) {
    school = school || (window.APP && window.APP.school);
    opts = Object.assign({}, DEFAULTS, opts || {});
    if (!school || !school.cards || school.cards.length < 2) {
      return { status: "NOTHING_TO_IMPROVE", before: 0, after: 0, swaps: 0 };
    }
    const t0 = performance.now();
    const deadline = t0 + opts.timeLimitSec * 1000;
    const startScore = totalScore(school);
    let swapsMade = 0, attempts = 0;
    const cards = school.cards.slice();

    // Sort by descending per-card penalty
    cards.sort((a, b) => cardScore(school, b) - cardScore(school, a));

    for (let i = 0; i < cards.length && performance.now() < deadline; i++) {
      if (attempts >= opts.maxSwapsTried) break;
      const a = cards[i];
      // Try swapping a with up to 20 other cards
      const candidates = cards.slice(i + 1, i + 21);
      for (const b of candidates) {
        attempts++;
        if (!compatibleForSwap(school, a, b)) continue;
        if (trySwap(school, a, b)) {
          swapsMade++;
          if (opts.onSwap) try { opts.onSwap({ a, b, swapsMade }); } catch {}
          break;
        }
      }
    }

    const endScore = totalScore(school);
    const improved = startScore - endScore;
    if (window.APP?.audit?.append) {
      window.APP.audit.append({ entity: "cards", op: "improve",
        before: startScore, after: endScore, improved, swaps: swapsMade });
    }
    return {
      status: improved > 0 ? "IMPROVED" : "NO_IMPROVEMENT",
      before: startScore, after: endScore, improved, swaps: swapsMade,
      durationMs: Math.round(performance.now() - t0),
    };
  }

  // Wire to Timetable menu → "Improve" entry (if added)
  window.addEventListener("app:improve", () => {
    const r = run();
    const msg = r.status === "IMPROVED"
      ? `✓ Improved by ${r.improved} (${r.swaps} swaps in ${Math.round(r.durationMs/100)/10}s).`
      : `No improvement found after ${r.swaps} swap attempts.`;
    (window._chrxNotify || console.log)(msg);
  });

  global.ImproveMode = { run };
})(window);
