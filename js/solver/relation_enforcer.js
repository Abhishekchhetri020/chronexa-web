/* Relation Enforcer — closes the #1 audit gap.
 *
 * The Classic audit identified the "30% done" trap: dialogs persist data
 * the solver ignores. All 18 n_* relations have a 3-step wizard at
 * /js/ui/entities/relations.js. This module exports:
 *
 *   TYPS — canonical relation type metadata (label, binary, hard, scope)
 *   check(school, lessonId, day, period) → { hard: [msg...], soft: [msg...] }
 *   explain(school, lessonId, day, period) → ["🚫 msg", "⚠️ msg", ...]
 *
 * Import by csp_solver.js for partner-set construction; imported by UI
 * for the constraint-explainer tooltip.
 *
 * Sourced from:
 *   /Users/abhishekchhetri/Downloads/Cloning CLASSIC/docs/ASC_CARDRELATIONSHIPS_DECODING_2026-04-20.md
 * Verbatim labels match Classic's wire.
 */

const TYPS = Object.freeze({
    n_0:  { label: "cannot follow",                                  binary: false, hard: true,  scope: "consecutive" },
    n_1:  { label: "cannot be the same day",                         binary: false, hard: true,  scope: "sameDay" },
    // §4.7 — n_2, n_3, n_15 typs are not documented in Classic source.
    // Adopting reasonable interpretations based on adjacency to the
    // documented typs and Slovak/EU timetable convention. These can be
    // tightened once a Classic XML with these typs is sighted in the wild.
    n_2:  { label: "must not be at the same time (same period)",     binary: false, hard: true,  scope: "sameTime" },
    n_3:  { label: "must alternate days (no two same-day)",          binary: false, hard: false, scope: "alternateDay" },
    n_4:  { label: "Card distribution over the week",                binary: false, hard: false, scope: "distribution" },
    n_5:  { label: "Two subjects must follow (arbitrary order)",     binary: true,  hard: true,  scope: "consecutive" },
    n_6:  { label: "Two subjects must follow",                       binary: true,  hard: true,  scope: "consecutiveOrdered" },
    n_7:  { label: "Break cannot be between group of lessons",       binary: false, hard: true,  scope: "betweenBreaks" },
    n_8:  { label: "Two subjects must be in one day (arbitrary)",    binary: true,  hard: true,  scope: "sameDay" },
    n_9:  { label: "Two subjects must be in one day (in order)",     binary: true,  hard: true,  scope: "sameDayOrdered" },
    n_10: { label: "Group of cards from different classes must be in one day", binary: false, hard: true, scope: "sameDay" },
    n_11: { label: "Divided cards from one subject must be in one day", binary: false, hard: false, scope: "sameDay" },
    n_12: { label: "These subjects for the groups of listed classes must start at the same time", binary: false, hard: true, scope: "simultaneous" },
    n_13: { label: "The selected subjects have to be at the same time in all selected classes", binary: false, hard: true, scope: "simultaneous" },
    n_14: { label: "This subject must be on the same period each day", binary: false, hard: false, scope: "samePeriodEachDay" },
    n_15: { label: "Cards must be evenly spaced across the week",    binary: false, hard: false, scope: "evenSpacing" },
    n_16: { label: "Subject must be first or last",                  binary: false, hard: true,  scope: "position" },
    n_17: { label: "The selected subjects can be in the afternoon",  binary: false, hard: false, scope: "afternoon" },
  });

  function namesOf(school, kind, ids) {
    if (!school || !ids) return [];
    const list = (kind === "subjects") ? school.subjects
              : (kind === "classes")   ? school.classes
              : (kind === "teachers")  ? school.teachers
              : [];
    const out = [];
    for (const id of (ids || [])) {
      const r = list.find(x => x.id === id);
      if (r) out.push(r.name || r.short || id);
    }
    return out;
  }

  function lessonMatches(lesson, rel) {
    if (!lesson || !rel) return false;
    const ss = rel.subjectids || [];
    if (ss.length && !ss.includes(lesson.subjectId)) return false;
    const cs = rel.classids || [];
    if (cs.length && !(lesson.classIds || []).some(c => cs.includes(c))) return false;
    return true;
  }

  function lessonMatchesSecond(lesson, rel) {
    if (!lesson || !rel) return false;
    const s2 = rel.subject2ids || [];
    if (s2.length && !s2.includes(lesson.subjectId)) return false;
    return true;
  }

  /** Find existing placements of any lesson matching this relation's primary scope */
  function placedMatching(school, rel, matcher) {
    matcher = matcher || lessonMatches;
    const lessonById = (school._idx && school._idx.lessonById) ||
      Object.fromEntries((school.lessons || []).map(l => [l.id, l]));
    const out = [];
    for (const c of (school.cards || [])) {
      const lesson = lessonById[c.lessonId];
      if (matcher(lesson, rel)) out.push({ card: c, lesson });
    }
    return out;
  }

  function check(school, lessonId, day, period) {
    const result = { hard: [], soft: [] };
    if (!school || !school.relations || !school.relations.length) return result;
    const lessonById = (school._idx && school._idx.lessonById) ||
      Object.fromEntries((school.lessons || []).map(l => [l.id, l]));
    const lesson = lessonById[lessonId];
    if (!lesson) return result;

    for (const rel of school.relations) {
      if (rel.disabled) continue;
      const meta = TYPS[rel.typ];
      if (!meta) continue;
      const bin = meta.binary;
      const primaryMatch = lessonMatches(lesson, rel);
      const secondaryMatch = bin && lessonMatchesSecond(lesson, rel);
      if (!primaryMatch && !secondaryMatch) continue;

      const sink = meta.hard ? result.hard : result.soft;

      switch (meta.scope) {
        // Item 9 — n_2 "must not be at same time" (no same-period for
        // any other matched lesson). Hard violation if any matched
        // lesson is at the SAME (day, period).
        case "sameTime": {
          const others = placedMatching(school, rel, lessonMatches);
          for (const o of others) {
            if (o.card.day === day && o.card.period === period &&
                o.card.lessonId !== lessonId) {
              sink.push(`${meta.label} — another matched lesson already at this period`);
              break;
            }
          }
          break;
        }
        // Item 9 — n_3 "alternate days". Soft. Penalise placement at a
        // day where any other matched lesson already sits.
        case "alternateDay": {
          const others = placedMatching(school, rel, lessonMatches);
          for (const o of others) {
            if (o.card.day === day && o.card.lessonId !== lessonId) {
              sink.push(`${meta.label} — already placed on this day`);
              break;
            }
          }
          break;
        }
        // Item 9 — n_15 "evenly spaced across the week". Soft. Penalise
        // when the placement creates back-to-back days for matched
        // lessons (variance proxy: any same-or-adjacent day with another
        // matched lesson).
        case "evenSpacing": {
          const others = placedMatching(school, rel, lessonMatches);
          for (const o of others) {
            if (o.card.lessonId === lessonId) continue;
            if (Math.abs(o.card.day - day) <= 1) {
              sink.push(`${meta.label} — spacing too tight (adjacent day)`);
              break;
            }
          }
          break;
        }
        case "consecutive": {
          // n_0: cannot follow.  Means: A then B (or vice-versa) cannot be consecutive periods.
          // Check existing placements at (day, period±1) for the "other side" of the relation.
          const others = placedMatching(school, rel,
            primaryMatch ? (bin ? (l => lessonMatchesSecond(l, rel)) : lessonMatches)
                         : lessonMatches);
          for (const o of others) {
            if (o.card.day !== day) continue;
            if (Math.abs(o.card.period - period) === 1) {
              sink.push(`${meta.label} — already placed in the adjacent period`);
              break;
            }
          }
          break;
        }
        case "consecutiveOrdered": {
          // n_6: A must immediately precede B on the same day. Incremental
          // check against already-placed cards only (a missing partner is
          // not a violation — it may simply not be placed yet):
          //   placing A: if any B is on this day, one must sit at period+1;
          //   placing B: if any A is on this day, one must sit at period-1.
          // The old code only caught the reversed order (B at period-1) and
          // never enforced the positive "B must follow A" direction.
          if (primaryMatch) {
            const bs = placedMatching(school, rel, l => lessonMatchesSecond(l, rel))
              .filter(o => o.card.lessonId !== lessonId && o.card.day === day);
            if (bs.length && !bs.some(o => o.card.period === period + 1)) {
              sink.push(`${meta.label} — follower must be in the next period`);
            }
          }
          if (secondaryMatch) {
            const as = placedMatching(school, rel, lessonMatches)
              .filter(o => o.card.lessonId !== lessonId && o.card.day === day);
            if (as.length && !as.some(o => o.card.period === period - 1)) {
              sink.push(`${meta.label} — leader must be in the previous period`);
            }
          }
          break;
        }
        case "sameDay": {
          // n_1: cannot be the same day.  n_8 / n_10: must be same day.
          // Exclude the candidate's own cards (same filter every other case
          // uses) — without it a placed card evaluated in-place always found
          // itself on `day`, so n_1 fired on every check and the must-same-day
          // typs were masked. For binary typs match the OTHER side of the
          // relation (subject2 when placing the primary, primary when placing
          // the secondary), mirroring the consecutive case.
          const others = placedMatching(school, rel,
            bin ? (primaryMatch ? (l => lessonMatchesSecond(l, rel)) : lessonMatches)
                : lessonMatches)
            .filter(o => o.card.lessonId !== lessonId);
          const sameDay = others.some(o => o.card.day === day);
          const otherDayPresent = others.some(o => o.card.day !== day);
          if (rel.typ === "n_1") {
            if (sameDay) sink.push(`${meta.label} — already placed on this day`);
          } else {
            // must be same day (n_8/n_10/n_11)
            if (!sameDay && otherDayPresent) sink.push(`${meta.label} — sibling lesson is on a different day`);
          }
          break;
        }
        case "sameDayOrdered": {
          // n_9: A then B both on same day, A first.
          const others = placedMatching(school, rel,
            primaryMatch ? (l => lessonMatchesSecond(l, rel)) : lessonMatches);
          const sameDay = others.find(o => o.card.day === day);
          if (sameDay) {
            // We placed A; B is at sameDay.period. Order violation if our (period) > sameDay.period
            if (primaryMatch && period > sameDay.card.period)
              sink.push(`${meta.label} — order would be reversed (B is earlier than A)`);
          }
          break;
        }
        case "betweenBreaks": {
          // n_7: a break-period cannot fall between the lessons in this set.
          // Simplified: warn if placement separates other matched cards by a break period.
          const bell = school.bell && school.bell.periods;
          if (!bell) break;
          const others = placedMatching(school, rel, lessonMatches)
            .filter(o => o.card.day === day);
          if (others.length) {
            const ps = others.map(o => o.card.period).concat(period).sort((a, b) => a - b);
            for (let i = 1; i < ps.length; i++) {
              // Select by period INDEX values (1-based, possibly sparse) —
              // slicing by array position was off by one and even included
              // the sibling's own slot.
              const between = bell.filter(p => p.index > ps[i - 1] && p.index < ps[i]);
              if (between.some(p => p.isTeaching === false)) {
                sink.push(`${meta.label} — a break falls between sibling lessons`);
                break;
              }
            }
          }
          break;
        }
        case "simultaneous": {
          // n_12/n_13: subjects must start at same time across classes/groups.
          // Hard violation if another matched lesson is placed at the same day but DIFFERENT period.
          // Only same-day siblings can be judged incrementally: a matched
          // card on ANOTHER day may be a different weekly occurrence, so
          // flagging cross-day period mismatches produced phantom conflicts
          // for multi-occurrence lessons. Periods are 1-based — print as-is.
          const others = placedMatching(school, rel, lessonMatches);
          for (const o of others) {
            if (o.card.lessonId === lessonId) continue;
            if (o.card.day === day && o.card.period !== period) {
              sink.push(`${meta.label} — sibling lesson is at period ${o.card.period}, this is ${period}`);
              break;
            }
          }
          break;
        }
        case "samePeriodEachDay": {
          // n_14: subject must be on the same period each day it's taught.
          const others = placedMatching(school, rel, lessonMatches);
          for (const o of others) {
            if (o.card.lessonId === lessonId) continue;
            if (o.card.day !== day && o.card.period !== period) {
              sink.push(`${meta.label} — placed at period ${o.card.period + 1} on day ${o.card.day + 1}; this is period ${period + 1}`);
              break;
            }
          }
          break;
        }
        case "position": {
          // n_16: subject must be first or last period of the day.
          // Bell periods carry 1-based (possibly sparse) `index` values —
          // comparing against 0 / length-1 flagged every legitimate first
          // period and accepted the second-to-last as "last".
          const periods = (school.bell && school.bell.periods) || [];
          const teaching = periods.filter(p => p.isTeaching !== false);
          const firstIdx = teaching.length ? teaching[0].index : 1;
          const lastIdx  = teaching.length ? teaching[teaching.length - 1].index : 8;
          const wantFirst = rel.positions === "first";
          const wantLast  = rel.positions === "last";
          if (wantFirst && period !== firstIdx)
            sink.push(`${meta.label} — should be at period ${firstIdx}, this is ${period}`);
          if (wantLast && period !== lastIdx)
            sink.push(`${meta.label} — should be at last period (${lastIdx}), this is ${period}`);
          break;
        }
        case "afternoon": {
          // n_17: subjects must be in the afternoon. Use the school's
          // configured cutoff (same setting csp_solver reads), falling back
          // to the middle period's INDEX (1-based), not the array midpoint.
          const periods = (school.bell && school.bell.periods) || [];
          const cutoff = (school.settings && school.settings.afternoonStartsAt != null)
            ? (school.settings.afternoonStartsAt | 0)
            : (periods.length ? periods[Math.floor(periods.length / 2)].index : 5);
          if (period < cutoff)
            sink.push(`${meta.label} — must be in the afternoon (later periods)`);
          break;
        }
        case "distribution": {
          // n_4: card distribution — soft pressure on uneven placement (placeholder).
          // Hint only when THE CANDIDATE'S day already piles up matched cards;
          // flagging any heavy day anywhere penalised unrelated placements.
          let onThisDay = 0;
          for (const o of placedMatching(school, rel, lessonMatches)) {
            if (o.card.lessonId !== lessonId && o.card.day === day) onThisDay++;
          }
          if (onThisDay >= 2) {
            sink.push(`${meta.label} — already ${onThisDay} on this day`);
          }
          break;
        }
      }
    }
    return result;
  }

  /** Return an array of human-readable enforcement summaries for the UI. */
  function explain(school, lessonId, day, period) {
    const r = check(school, lessonId, day, period);
  return [...r.hard.map(s => `🚫 ${s}`), ...r.soft.map(s => `⚠️ ${s}`)];
}

export { TYPS, check, explain };

// Backward compat: UI code still uses window.RelationEnforcer
if (typeof globalThis !== "undefined") {
  globalThis.RelationEnforcer = { check, explain, TYPS };
}
