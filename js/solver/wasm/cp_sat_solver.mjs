// Chronexa OR-Tools CP-SAT solver — TypeScript port of backend/solver_cpsat.py
// for use via the or-tools-wasm WASM build (Axelwickm/or-tools-wasm@0.9.1).
//
// Same model as the Python backend: lesson cards, hard (no-overlap, lab-double,
// subject per-day cap = ideal), and 2-phase (max placement -> lock + min
// spread+back-to-back). Mirrors the Python to keep the two backends equivalent.
//
// Usage:
//   import { buildAndSolve } from './cp_sat_solver.mjs';
//   const r = await buildAndSolve(school, { timeLimitSec: 90 });

// Browser build, committed in ./dist (so it works as a served Web Worker with
// no bundler/import-map). For Node CLI testing use the standalone scripts
// (logcheck.mjs etc.) which import the bare 'or-tools-wasm/cp-sat' specifier.
import { CpModel, CpSolver, CpSolverSolutionCallback, LinearExpr } from './dist/browser/cp-sat.js';
// The JS solver's model builder is the single source of truth for all
// school-data parsing (time-off masks, windows, tags, caps, homerooms…).
// The extended soft-constraint section reuses it so the two backends can
// never drift on data interpretation.
import { __test_internals as __jsInternals } from '../csp_solver.js';
const jsBuildModel = __jsInternals.buildModel;

function teachingPeriods(school) {
  return school.bell.periods
    .filter((p) => p.isTeaching !== false)
    .map((p) => p.index);
}

// The WASM CP-SAT API does NOT support JS native +/- on IntVars. All
// arithmetic on LinearExprs must go through LinearExpr.sum / weightedSum /
// .plus / .term, and addEquality/addLinearConstraint accept LinearExprLike
// (raw numbers are fine as one side of bounds).
const sum = (vars) => {
  if (!vars || vars.length === 0) return 0;
  return LinearExpr.sum(vars);
};
const sumEq = (vars, _m) => {
  if (!vars || vars.length === 0) return 0;
  return LinearExpr.sum(vars);
};
const term = (v, c) => LinearExpr.term(v, c);
// Constraint shortcuts. addLinearConstraint(expression, lb, ub) requires both
// bounds to be JS numbers; the expression side can be a LinearExpr. Native
// comparison operators on IntVars/LinearExprs throw NotImplementedError, so
// we rewrite each shape to expression form.
const atMost = (m, expr, ub) => m.addLinearConstraint(expr, -1e18, ub);
const atLeast = (m, expr, lb) => m.addLinearConstraint(expr.minus(lb), 0, 1e18);
const lt = (m, a, b) => m.addLinearConstraint(a.minus(b), -1e18, -1);

export async function buildAndSolve(school, options = {}) {
  const timeLimitSec = options.timeLimitSec ?? 90;
  const numWorkers = options.numWorkers ?? 8;
  const seed = options.seed ?? 1;
  const soft = options.soft !== false;
  // Symmetry-breaking (slotidx IntVars + strict ordering between a lesson's
  // cards) helps native OR-Tools but makes first-solution finding much harder
  // for the slower asyncify WASM build — callers can disable it.
  const symBreak = options.symBreak !== false;
  // Improve mode: trust the existing timetable (school.cards) as a warm-start.
  // Soft hints alone don't make CP-SAT keep them — we also lock a placement
  // floor so the solver starts from the given solution and only improves it.
  const improve = options.improve === true || options.mode === "improve";
  const progressFn = options.progressFn ?? null;
  const cancelCheck = options.cancelCheck ?? null;

  const days = [...Array(school.daysPerWeek).keys()];
  const ndays = days.length;
  const periods = teachingPeriods(school);
  const pidx = new Map(periods.map((p, i) => [p, i]));
  const slots = days.flatMap((d) => periods.map((p) => [d, p]));
  const slotIndex = new Map(slots.map((s, i) => [s.join(','), i]));

  const groupsById = new Map((school.groups || []).map((g) => [g.id, g]));

  const cards = [];
  for (const L of school.lessons) {
    const length = L.isLabDouble ? 2 : 1;
    const ppw = Number(L.periodsPerWeek) || 0;
    const ncards = ppw > 0 ? Math.max(1, Math.round(ppw / length)) : 0;
    const teachers = L.teacherIds || [];
    const classes = L.classIds || [];
    const subject = L.subjectId;
    const clsOcc = new Map();
    const gids = (L.groupIds || []).filter((g) => groupsById.has(g));
    for (const c of classes) {
      const mine = gids
        .map((g) => groupsById.get(g))
        .filter((g) => g.classId === c);
      const whole = !mine.length || mine.some((g) => g.entireClass);
      if (whole) clsOcc.set(c, ['W', 'W']);
      else {
        const div = mine[0].divisionTag ?? 0;
        const gkey = mine
          .filter((g) => (g.divisionTag ?? 0) === div)
          .map((g) => g.id)
          .sort()
          .join('|');
        clsOcc.set(c, ['D', div, gkey]);
      }
    }
    const rooms = L._lessonRoomIds || [];
    for (let k = 0; k < ncards; k++) {
      cards.push({
        lesson_id: L.id, subject, length, teachers, classes, clsOcc, rooms,
        fixed_day: L.fixedDay ?? null, fixed_period: L.fixedPeriod ?? null,
      });
    }
  }

  const m = new CpModel();

  const validStarts = (card) => {
    const out = [];
    for (const [d, p] of slots) {
      if (card.fixed_day != null && d !== card.fixed_day) continue;
      if (card.fixed_period != null && p !== card.fixed_period) continue;
      if (card.length === 2 && pidx.get(p) + 1 >= periods.length) continue;
      out.push([d, p]);
    }
    return out;
  };
  const cover = (card, start) => {
    const [d, p] = start;
    if (card.length === 1) return [[d, p]];
    return [[d, p], [d, periods[pidx.get(p) + 1]]];
  };

  const assign = [];
  const placed = [];
  const yroom = new Map();
  for (let ci = 0; ci < cards.length; ci++) {
    const card = cards[ci];
    const vs = validStarts(card);
    const avars = new Map();
    if (card.rooms.length) {
      for (const s of vs) {
        const rs = [];
        for (const r of card.rooms) {
          const v = m.newBoolVar(`y_${ci}_${slotIndex.get(s.join(','))}_${r}`);
          yroom.set(`${ci}|${s.join(',')}|${r}`, v);
          rs.push(v);
        }
        const a = m.newBoolVar(`a_${ci}_${slotIndex.get(s.join(','))}`);
        m.addEquality(a, sumEq(rs, m));
        avars.set(s.join(','), a);
      }
    } else {
      for (const s of vs) {
        avars.set(s.join(','), m.newBoolVar(`a_${ci}_${slotIndex.get(s.join(','))}`));
      }
    }
    assign.push(avars);
    const pl = m.newBoolVar(`p_${ci}`);
    m.addEquality(sumEq(avars.values(), m), pl);
    placed.push(pl);
  }

  const tOcc = new Map();
  const roomOcc = new Map();
  const clsAt = new Map();
  for (let ci = 0; ci < cards.length; ci++) {
    const card = cards[ci];
    for (const [skey, avar] of assign[ci]) {
      const s = skey.split(',').map(Number);
      const covered = cover(card, s);
      for (const ps of covered) {
        for (const t of card.teachers) {
          const k = `t|${t}|${ps.join(',')}`;
          if (!tOcc.has(k)) tOcc.set(k, []);
          tOcc.get(k).push(avar);
        }
        for (const [c, occ] of card.clsOcc) {
          const k = `c|${c}|${ps.join(',')}`;
          if (!clsAt.has(k)) clsAt.set(k, []);
          clsAt.get(k).push([occ, avar]);
        }
      }
      if (card.rooms.length) {
        for (const r of card.rooms) {
          const yv = yroom.get(`${ci}|${skey}|${r}`);
          for (const ps of covered) {
            const k = `r|${r}|${ps.join(',')}`;
            if (!roomOcc.has(k)) roomOcc.set(k, []);
            roomOcc.get(k).push(yv);
          }
        }
      }
    }
  }

  for (const vs of tOcc.values()) if (vs.length > 1) atMost(m, sum(vs), 1);
  for (const vs of roomOcc.values()) if (vs.length > 1) atMost(m, sum(vs), 1);

  for (const [k, entries] of clsAt) {
    const byDiv = new Map();
    const byDivGroup = new Map();
    for (const [occ, v] of entries) {
      // Per-scheme division key, matching Python's ("D", div) tuple. The port
      // originally used the literal 'D' (occ[0]), which collapsed every
      // division scheme of a class into ONE bucket — so two different schemes
      // could co-occur in the same slot, splitting the class two ways at once.
      const dk = occ[0] === 'W' ? 'W' : `D${occ[1]}`;
      const gk = occ[1] === 'W' ? 'W' : `${dk}|${occ[1]}|${occ[2]}`;
      if (!byDiv.has(dk)) byDiv.set(dk, []);
      byDiv.get(dk).push(v);
      if (!byDivGroup.has(gk)) byDivGroup.set(gk, []);
      byDivGroup.get(gk).push(v);
    }
    for (const vs of byDivGroup.values()) if (vs.length > 1) atMost(m, sum(vs), 1);
    if (byDiv.size > 1 && options.divisionForm === "maxeq") {
      // Python-reference formulation (backend/solver_cpsat.py): one aux bool
      // per division key (including W), addMaxEquality, then sum(active) <= 1.
      // Stronger than the pairwise form below — it also forbids two DIFFERENT
      // division schemes from co-occurring in the same class-slot. Behind an
      // option while we re-validate it against the WASM build (the 2026-06-19
      // bisect blamed addMaxEquality+sum<=1 for "0 solutions" here).
      const divActive = [];
      for (const [dk, vs] of byDiv) {
        const da = m.newBoolVar(`divact_${String(k).replace(/[^A-Za-z0-9]/g, "_")}_${String(dk).replace(/[^A-Za-z0-9]/g, "_")}`);
        m.addMaxEquality(da, vs);
        divActive.push(da);
      }
      atMost(m, sum(divActive), 1);
    } else if (byDiv.size > 1) {
      // PAIRWISE formulation: at most one of any two entries from DIFFERENT
      // buckets (W vs each division scheme, and scheme vs scheme). Same
      // semantics as Python's addMaxEquality+sum<=1, but encoded as plain
      // 2-literal at-most-ones, which CP-SAT's presolve folds into its
      // dedicated at_most_one structures.
      //
      // History: the 2026-06-19 bisect blamed "addMaxEquality+sum<=1 finds 0
      // solutions" and this was believed to be a WASM presolve bug. The
      // 2026-07-02 re-validation (toy + 500-slot synthetic + full-school A/B
      // on the JSPI build) shows linMax is CORRECT on this build — the maxeq
      // form is just slower to search (880 vs 913 placed in the same 60s
      // budget), so pairwise stays the default. maxeq remains available via
      // options.divisionForm = "maxeq" for A/B runs.
      const buckets = [...byDiv.values()];
      for (let a = 0; a < buckets.length; a++) {
        for (let b = a + 1; b < buckets.length; b++) {
          for (const va of buckets[a]) for (const vb of buckets[b]) atMost(m, sum([va, vb]), 1);
        }
      }
    }
  }

  const ncardsCs = new Map();
  for (const card of cards) {
    for (const c of card.classes) {
      const k = `${c}|${card.subject}`;
      ncardsCs.set(k, (ncardsCs.get(k) || 0) + 1);
    }
  }
  const capCs = new Map();
  for (const [k, v] of ncardsCs) capCs.set(k, Math.max(1, Math.ceil(v / ndays)));
  const csd = new Map();
  for (let ci = 0; ci < cards.length; ci++) {
    const card = cards[ci];
    for (const c of card.classes) {
      for (const skey of assign[ci].keys()) {
        const d = Number(skey.split(',')[0]);
        const k = `${c}|${card.subject}|${d}`;
        if (!csd.has(k)) csd.set(k, []);
        csd.get(k).push(assign[ci].get(skey));
      }
    }
  }
  for (const [k, vs] of csd) {
    const c = k.split('|')[0];
    const subj = k.split('|')[1];
    // HARD cap = ideal = ceil(v / ndays). For v<=ndays this is 1 (strict
    // 1-per-day); for v>ndays this is ceil(v/ndays) (e.g. 7/6 -> 2). Matches
    // the JS CSP solver's subjectDailyLimit so Best mode (JS draft -> WASM
    // polish) can't relax the spread that the draft just enforced. Was +1
    // historically: that slack let the polish stage consolidate two same-
    // subject cards on one day (e.g. English II B on Tue), producing a
    // visible block that the renderer then hid. With cap=ideal, the solver
    // either spreads or leaves cards unplaced — the latter surfaces the
    // true bottleneck (teacher availability, room cap) instead of masking
    // it behind a spread violation.
    const hard = capCs.get(`${c}|${subj}`);
    if (vs.length > hard) atMost(m, sum(vs), hard);
  }

  const lessonCards = new Map();
  for (let ci = 0; ci < cards.length; ci++) {
    const lid = cards[ci].lesson_id;
    if (!lessonCards.has(lid)) lessonCards.set(lid, []);
    lessonCards.get(lid).push(ci);
  }
  if (symBreak) {
    const NOSLOT = slots.length + 1;
    const slotidxVar = [];
    for (let ci = 0; ci < cards.length; ci++) {
      const sv = m.newIntVar(0, NOSLOT, `si_${ci}`);
      const terms = [];
      for (const [skey, v] of assign[ci]) terms.push(LinearExpr.term(v, slotIndex.get(skey)));
      const leftExpr = terms.length
        ? LinearExpr.sum(terms).plus(LinearExpr.term(placed[ci], -NOSLOT)).plus(NOSLOT)
        : NOSLOT * (1 - 0); // unreachable: every card has >= 1 start
      m.addEquality(sv, leftExpr);
      slotidxVar.push(sv);
    }
    for (const cis of lessonCards.values()) {
      for (let i = 0; i < cis.length - 1; i++) lt(m, slotidxVar[cis[i]], slotidxVar[cis[i + 1]]);
    }
  }

  const saved = new Map();
  for (const c of school.cards || []) {
    if (c.day != null && c.period != null) {
      if (!saved.has(c.lessonId)) saved.set(c.lessonId, []);
      saved.get(c.lessonId).push(c);
    }
  }
  // --- Hard card-relations -------------------------------------------------
  // CP-SAT MODELS every hard n_* relation directly (n_0,n_1,n_2,n_5,n_6,n_7,
  // n_8,n_9,n_10,n_12,n_13,n_16), so it can optimise within them instead of
  // just preserving them. Matching + pairing mirror the JS solver (gatherMatched
  // / pairCrossSubject). Only relations whose encoding would exceed the
  // constraint budget fall back to LOCKING the bound cards to their warm-start
  // slot (Improve mode only). Soft types (n_3/n_4/n_11/n_14/n_15/n_17) are not
  // hard-enforced here (the JS draft biases toward them).
  const matchRel = (rel) => {
    const subjSet = new Set([...(rel.subjectids || []), ...(rel.subject2ids || [])]);
    const classSet = new Set(rel.classids || []);
    if (!subjSet.size && !classSet.size) return [];
    return school.lessons.filter((L) =>
      (!subjSet.size || subjSet.has(L.subjectId)) &&
      (!classSet.size || (L.classIds || []).some((c) => classSet.has(c))));
  };
  // Per-lesson occupancy: occ(lid,d,p) = assign vars of lid covering (d,p), or null.
  const lessonAt = new Map();
  for (let ci = 0; ci < cards.length; ci++) {
    const card = cards[ci];
    for (const [skey, avar] of assign[ci]) {
      const s = skey.split(',').map(Number);
      for (const ps of cover(card, s)) {
        const k = `${card.lesson_id}|${ps.join(',')}`;
        if (!lessonAt.has(k)) lessonAt.set(k, []);
        lessonAt.get(k).push(avar);
      }
    }
  }
  const occ = (lid, d, p) => { const v = lessonAt.get(`${lid}|${d},${p}`); return (v && v.length) ? v : null; };
  // dayBool(lid,d) = 1 iff lid has any card on day d (lazy, reified).
  const dayBoolCache = new Map();
  const dayBool = (lid, d) => {
    const k = `${lid}|${d}`;
    if (dayBoolCache.has(k)) return dayBoolCache.get(k);
    const vars = [];
    for (const p of periods) { const v = occ(lid, d, p); if (v) vars.push(...v); }
    const b = vars.length ? m.newBoolVar(`dl_${lid}_${d}`) : null;
    if (b) m.addMaxEquality(b, vars);
    dayBoolCache.set(k, b);
    return b;
  };
  const firstP = periods[0], lastP = periods[periods.length - 1];
  const nextP = new Map(periods.map((p, i) => [p, periods[i + 1] ?? null]));
  const prevP = new Map(periods.map((p, i) => [p, periods[i - 1] ?? null]));
  const breakVals = (school.bell.periods || []).filter((p) => p.isTeaching === false).map((p) => p.index);
  // negated occupancy term helper (for "A <= B"-shaped constraints)
  const neg = (vars) => (vars || []).map((v) => LinearExpr.term(v, -1));

  const ENCODE_TYPS = new Set(['n_0','n_1','n_2','n_5','n_6','n_7','n_8','n_9','n_10','n_12','n_13','n_16']);
  const REL_BUDGET = 60000;
  let relCons = 0;
  const relationLockedLessons = new Set();
  const lockMatched = (matched) => { if (improve) for (const L of matched) relationLockedLessons.add(L.id); };

  for (const rel of school.relations || []) {
    if (!rel || rel.disabled) continue;
    const matched = matchRel(rel);
    if (matched.length < (rel.typ === 'n_16' ? 1 : 2)) continue;
    const typ = rel.typ;
    const pairs = matched.length * (matched.length - 1) / 2;
    // Rough upper-bound estimate; lock instead of encoding if it would blow up.
    const est = (typ === 'n_16') ? matched.length * periods.length
      : pairs * days.length * periods.length * periods.length;
    if (!ENCODE_TYPS.has(typ)) continue;                                  // soft/unknown: not hard-enforced (no lock)
    if (relCons + est > REL_BUDGET) { lockMatched(matched); continue; }   // hard but too big: preserve via lock
    const A = matched, n = matched.length;
    if (typ === 'n_2') {                         // no two matched at same (d,p)
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++)
        for (const d of days) for (const p of periods) {
          const x = occ(A[a].id, d, p), y = occ(A[b].id, d, p);
          if (x && y) { atMost(m, sum([...x, ...y]), 1); relCons++; }
        }
    } else if (typ === 'n_12' || typ === 'n_13') { // simultaneous: same day => same period
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++)
        for (const d of days) for (const pA of periods) {
          const x = occ(A[a].id, d, pA); if (!x) continue;
          for (const pB of periods) { if (pB === pA) continue; const y = occ(A[b].id, d, pB);
            if (y) { atMost(m, sum([...x, ...y]), 1); relCons++; } }
        }
    } else if (typ === 'n_1') {                  // cross-subject, not same day
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        if (A[a].subjectId === A[b].subjectId) continue;
        for (const d of days) { const bA = dayBool(A[a].id, d), bB = dayBool(A[b].id, d);
          if (bA && bB) { atMost(m, LinearExpr.sum([bA, bB]), 1); relCons++; } }
      }
    } else if (typ === 'n_8' || typ === 'n_10' || typ === 'n_9') { // cross-subject, must same day (n_9: + in order, enforced same-day here)
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        if (A[a].subjectId === A[b].subjectId) continue;
        for (const d1 of days) for (const d2 of days) { if (d1 === d2) continue;
          const bA = dayBool(A[a].id, d1), bB = dayBool(A[b].id, d2);
          if (bA && bB) { atMost(m, LinearExpr.sum([bA, bB]), 1); relCons++; } }
      }
    } else if (typ === 'n_5') {                  // cross-subject must-follow (same day, adjacent)
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        if (A[a].subjectId === A[b].subjectId) continue;
        for (const d of days) for (const p of periods) {
          const pv = prevP.get(p), nx = nextP.get(p);
          const ax = occ(A[a].id, d, p);            // A@(d,p) => a B at p-1 or p+1
          if (ax) { const bn = [...(occ(A[b].id, d, pv) || []), ...(occ(A[b].id, d, nx) || [])];
            atMost(m, LinearExpr.sum([...ax, ...neg(bn)]), 0); relCons++; }
          const bx = occ(A[b].id, d, p);            // and symmetrically B => an adjacent A
          if (bx) { const an = [...(occ(A[a].id, d, pv) || []), ...(occ(A[a].id, d, nx) || [])];
            atMost(m, LinearExpr.sum([...bx, ...neg(an)]), 0); relCons++; }
        }
      }
    } else if (typ === 'n_6') {                  // ordered must-follow: A-side then B-side at p+1
      const Asub = (rel.subjectids || [])[0];
      const Bsub = (rel.subject2ids || [])[0] || (rel.subjectids || [])[1];
      if (Asub && Bsub) {
        const As = matched.filter((L) => L.subjectId === Asub);
        const Bs = matched.filter((L) => L.subjectId === Bsub);
        for (const AL of As) for (const d of days) {
          const al = occ(AL.id, d, lastP); if (al) { atMost(m, sum(al), 0); relCons++; } // A not at last
          for (const p of periods) { const np = nextP.get(p); if (np == null) continue;
            const ap = occ(AL.id, d, p); if (!ap) continue;
            const bnext = []; for (const BL of Bs) { const bb = occ(BL.id, d, np); if (bb) bnext.push(...bb); }
            atMost(m, LinearExpr.sum([...ap, ...neg(bnext)]), 0); relCons++; } // A@(d,p) <= B@(d,p+1)
        }
      }
    } else if (typ === 'n_7') {                  // cross-subject: no break strictly between, same day
      if (breakVals.length) {
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
          if (A[a].subjectId === A[b].subjectId) continue;
          for (const d of days) for (const pA of periods) for (const pB of periods) {
            if (pA >= pB || !breakVals.some((bp) => bp > pA && bp < pB)) continue;
            const x1 = occ(A[a].id, d, pA), y1 = occ(A[b].id, d, pB);
            if (x1 && y1) { atMost(m, sum([...x1, ...y1]), 1); relCons++; }
            const x2 = occ(A[a].id, d, pB), y2 = occ(A[b].id, d, pA);
            if (x2 && y2) { atMost(m, sum([...x2, ...y2]), 1); relCons++; }
          }
        }
      }
    } else if (typ === 'n_0') {                  // cross-subject, not adjacent same day
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        if (A[a].subjectId === A[b].subjectId) continue;
        for (const d of days) for (const p of periods) { const np = nextP.get(p); if (np == null) continue;
          const x1 = occ(A[a].id, d, p), y1 = occ(A[b].id, d, np);
          if (x1 && y1) { atMost(m, sum([...x1, ...y1]), 1); relCons++; }
          const x2 = occ(A[a].id, d, np), y2 = occ(A[b].id, d, p);
          if (x2 && y2) { atMost(m, sum([...x2, ...y2]), 1); relCons++; } }
      }
    } else if (typ === 'n_16') {                 // first or last period only
      const mset = new Set(matched.map((L) => L.id));
      for (let ci = 0; ci < cards.length; ci++) { if (!mset.has(cards[ci].lesson_id)) continue;
        for (const [skey, avar] of assign[ci]) { const p = Number(skey.split(',')[1]);
          if (p !== firstP && p !== lastP) { m.addEquality(avar, 0); relCons++; } } }
    }
  }
  console.error('RELATIONS: encoded constraints=', relCons, 'locked lessons=', relationLockedLessons.size);

  // CP-SAT invalidates the model if the solution hint repeats a variable
  // ("duplicate variables ... index #N"). Hints are added from two places
  // (warm-start cards below, phase-2 solution carry-over later), and a card
  // that phase 1 places at its warm-start slot would be hinted by both.
  const _hintedVars = new Set();
  const hintOnce = (v, val) => { if (!v || _hintedVars.has(v)) return; _hintedVars.add(v); m.addHint(v, val); };

  let hintedCards = 0, lockedCards = 0;
  for (const [lid, cis] of lessonCards) {
    const sc = (saved.get(lid) || []).sort((a, b) => a.day - b.day || a.period - b.period);
    if (!sc.length) continue;
    const length = cards[cis[0]].length;
    const starts = sc.filter((_, i) => i % length === 0);
    const lock = relationLockedLessons.has(lid);
    for (let i = 0; i < cis.length && i < starts.length; i++) {
      const s = `${starts[i].day},${starts[i].period}`;
      if (assign[cis[i]].has(s)) {
        hintOnce(assign[cis[i]].get(s), 1);
        hintedCards++;
        // Hard relation the model can't express -> pin the card to its draft slot.
        if (lock) { m.addEquality(assign[cis[i]].get(s), 1); lockedCards++; }
        const rm = starts[i].classroomId;
        if (rm) {
          const yv = yroom.get(`${cis[i]}|${s}|${rm}`);
          if (yv) hintOnce(yv, 1);
        }
      }
    }
  }
  if (improve && lockedCards) console.error('IMPROVE mode: relation-locked cards =', lockedCards);

  // Improve mode: lock placement at the warm-start level so the solver keeps
  // the given timetable and only improves it (places more / better soft),
  // instead of searching from scratch and possibly landing on fewer cards.
  // The placement floor protects a USER's real timetable in Improve mode.
  // For machine drafts (two-stage cold generate, mode "generate") the draft
  // may contain placements that are infeasible in THIS model (the JS solver
  // permits cross-scheme division overlaps this model forbids, and lab-double
  // cover rows can inflate the hint count) — a floor above the model optimum
  // makes the WHOLE model INFEASIBLE (placed=0). Drafts get a slack floor:
  // still anchors phase 1 near the draft, provably below the optimum.
  if (improve && hintedCards > 0) {
    const slack = options.mode === "generate" ? 10 : 0;
    const floorN = Math.min(hintedCards, cards.length) - slack;
    if (floorN > 0) atLeast(m, sum(placed), floorN);
    console.error('IMPROVE mode: placement floor =', floorN, '(hinted:', hintedCards + ')');
  }

  const softTerms = [];
  // Deferred: called AFTER phase 1. Phase 1 solves the pure-hard model (soft
  // aux vars/constraints only add propagation load without pruning placement);
  // phase 2 mutates the same model with the floor + soft objective.
  const buildSoftModel = () => {
    if (!soft) return;
    const W_SPREAD = 1000, W_B2B = 200;
    for (const [k, vs] of csd) {
      const [c, subj, d] = k.split('|');
      const cap = capCs.get(`${c}|${subj}`);
      if (vs.length > cap) {
        const over = m.newIntVar(0, periods.length, `sp_${c}_${subj}_${d}`);
        // over >= sum(vs) - cap  ==>  over + cap >= sum(vs)  ==>  -sum(vs) + over >= -cap
        atMost(m, LinearExpr.sum(vs).plus(LinearExpr.term(over, -1)), cap);
        softTerms.push([W_SPREAD, over]);
      }
    }
    const csAt = new Map();
    for (let ci = 0; ci < cards.length; ci++) {
      const card = cards[ci];
      if (card.length !== 1) continue;
      for (const c of card.classes) {
        for (const skey of assign[ci].keys()) {
          const [d, p] = skey.split(',').map(Number);
          const k = `${c}|${card.subject}|${d}|${p}`;
          if (!csAt.has(k)) csAt.set(k, []);
          csAt.get(k).push(assign[ci].get(skey));
        }
      }
    }
    for (const [k, vs] of csAt) {
      const [c, subj, d, p] = k.split('|');
      const pNum = Number(p);
      if (pidx.get(pNum) + 1 >= periods.length) continue;
      const nxt = periods[pidx.get(pNum) + 1];
      const k2 = `${c}|${subj}|${d}|${nxt}`;
      if (!csAt.has(k2)) continue;
      const vs2 = csAt.get(k2);
      // b2b >= here + there - 1   (where here = sum(vs), there = sum(vs2))
      const hereAndThere = LinearExpr.sum([...vs, ...vs2]);
      const b2b = m.newBoolVar(`b2b_${c}_${subj}_${d}_${p}`);
      atLeast(m, b2b, hereAndThere.minus(1));
      softTerms.push([W_B2B, b2b]);
    }

    // --- Soft card-relations (mirror the JS softRelationPenalty) -----------
    // Each soft relation nudges the objective so the polish honours user
    // preferences instead of trading them away. Weight sits ABOVE the generic
    // back-to-back nicety (an explicit user preference should beat it) but well
    // below spread (1000) and placement. Per source lesson (group = its cards).
    const W_SOFTREL = 250;
    const periodsPerDay = (school.bell.periods || []).length || periods.length;
    const halfPoint = Math.floor(periodsPerDay / 2);
    const SOFT_TYPS = new Set(['n_3', 'n_4', 'n_11', 'n_14', 'n_15', 'n_17']);
    // periodBool(lid,p) = 1 iff lid has a card at period p on any day.
    const periodBoolCache = new Map();
    const periodBool = (lid, p) => {
      const k = `${lid}|${p}`;
      if (periodBoolCache.has(k)) return periodBoolCache.get(k);
      const vars = []; for (const d of days) { const v = occ(lid, d, p); if (v) vars.push(...v); }
      const b = vars.length ? m.newBoolVar(`pl_${lid}_${p}`) : null;
      if (b) m.addMaxEquality(b, vars); periodBoolCache.set(k, b); return b;
    };
    let softRelCount = 0;
    for (const rel of school.relations || []) {
      if (!rel || rel.disabled || !SOFT_TYPS.has(rel.typ) || softRelCount > 4000) continue;
      const matched = matchRel(rel); if (!matched.length) continue;
      if (rel.typ === 'n_17') {                    // afternoon: penalise morning placements
        for (const L of matched) for (const ci of (lessonCards.get(L.id) || [])) {
          for (const [skey, avar] of assign[ci]) {
            if (Number(skey.split(',')[1]) < halfPoint) { softTerms.push([W_SOFTREL, avar]); softRelCount++; } }
        }
        continue;
      }
      for (const L of matched) {
        const cis = lessonCards.get(L.id) || []; const nc = cis.length; if (nc < 1) continue;
        const dayBools = []; for (const d of days) { const b = dayBool(L.id, d); if (b) dayBools.push(b); }
        if (rel.typ === 'n_14') {                  // same period each day: penalise extra distinct periods
          const pBools = []; for (const p of periods) { const b = periodBool(L.id, p); if (b) pBools.push(b); }
          if (pBools.length > 1) { const over = m.newIntVar(0, pBools.length, `n14_${L.id}`);
            atMost(m, LinearExpr.sum([...pBools, LinearExpr.term(over, -1)]), 1); softTerms.push([W_SOFTREL, over]); softRelCount++; }
        } else if (rel.typ === 'n_11') {           // divided same day: penalise extra distinct days
          if (dayBools.length > 1) { const over = m.newIntVar(0, dayBools.length, `n11_${L.id}`);
            atMost(m, LinearExpr.sum([...dayBools, LinearExpr.term(over, -1)]), 1); softTerms.push([W_SOFTREL, over]); softRelCount++; }
        } else if (rel.typ === 'n_4') {            // distribution: want >= ceil(nc/2) days
          const target = Math.max(1, Math.ceil(nc / 2));
          if (target > 1 && dayBools.length) { const under = m.newIntVar(0, target, `n4_${L.id}`);
            atLeast(m, LinearExpr.sum([...dayBools, under]), target); softTerms.push([W_SOFTREL, under]); softRelCount++; }
        } else if (rel.typ === 'n_3') {            // alternate days: want each placed card on a distinct day
          const over = m.newIntVar(0, nc, `n3_${L.id}`);
          atLeast(m, LinearExpr.sum([over, ...dayBools, ...neg(cis.map((ci) => placed[ci]))]), 0);
          softTerms.push([W_SOFTREL, over]); softRelCount++;
        } else if (rel.typ === 'n_15') {           // even spacing: penalise consecutive-day pairs
          for (let i = 0; i + 1 < days.length; i++) {
            const bA = dayBool(L.id, days[i]), bB = dayBool(L.id, days[i + 1]);
            if (bA && bB) { const adj = m.newBoolVar(`n15_${L.id}_${i}`);
              atLeast(m, adj, LinearExpr.sum([bA, bB]).minus(1)); softTerms.push([W_SOFTREL, adj]); softRelCount++; }
          }
        }
      }
    }
    if (softRelCount) console.error('SOFT RELATIONS: terms added=', softRelCount);

    // ══════════════════════════════════════════════════════════════════════
    // Extended soft constraints — port of the JS solver's softScore() family
    // (csp_solver.js ~2303). All school-data parsing is delegated to the JS
    // solver's buildModel() (imported via __test_internals) so masks, caps
    // and tags stay byte-identical between the two backends; here we only
    // translate each penalty into linear terms over the existing booleans.
    //
    // Weights = JS DEFAULT_SOFT_WEIGHTS ratios × 20 (anchored so JS
    // NEAR_HARD=50 → 1000 = W_SPREAD). JS per-hit multipliers (e.g.
    // afternoon-heavy ×2) are folded into the weight.
    //
    // Deliberately NOT ported:
    //  - sibling_subject_deficit: a search-order bias for greedy/backtracking
    //    solvers; under CP-SAT's global phase-1 placement maximization it has
    //    no equivalent decision to bias.
    //  - koncitNaraz ("classes end together"): cross-class variance of last
    //    periods — quadratic shape, poor linear fit; revisit if user demand.
    if (options.extSoft !== false) {
      const jm = jsBuildModel(school);
      const S = 20; // JS-weight → CP-SAT-weight scale
      const jw = jm.weights; // Int32Array, indexes match csp_solver softScore
      const W = {
        teacherGaps: (jw[0] || 50) * S,
        classGaps: (jw[1] || 10) * S,
        roomStab: (jw[3] || 5) * S,
        tConsec: (jw[4] || 50) * S,
        cConsec: (jw[5] || 50) * S,
        lastPeriod: (jw[6] || 25) * S,
        loadBal: (jw[7] || 20) * S,
        consecHeavy: (jw[9] || 10) * S,
        conditional: (jw[11] || 20) * S,
        teacherPos: (jw[12] || 20) * S,
        window: (jw[1] || 10) * S,     // lunch/teaching/block windows reuse w[1] in JS
        buildings: (jw[3] || 5) * S,
        tagCap: (jw[2] || 20) * S,
        resting: (jw[0] || 50) * S,
        roomTag: (jw[3] || 5) * S,
        afternoon: 2 * (jw[1] || 10) * S,
        blockPair: (jw[1] || 10) * S,
        interval: 3 * (jw[0] || 50) * S,
        supervision: (jw[0] || 50) * S,
        studentConf: (jw[1] || 10) * S,
      };
      const nExtBefore = softTerms.length;

      // ---- shared lookups ------------------------------------------------
      const ppdJS = jm.periodsPerDay;
      const bellPeriods = school.bell.periods || [];
      const bellPosOf = new Map(bellPeriods.map((bp, i) => [bp.index, i]));
      const tIdxOf = new Map(jm.teacherIds.map((id, i) => [id, i]));
      const cIdxOf = new Map(jm.classIds.map((id, i) => [id, i]));
      const rIdxOf = new Map(jm.roomIds.map((id, i) => [id, i]));
      const teacherIdsInUse = [...new Set(cards.flatMap((c) => c.teachers))];
      const classIdsInUse = [...new Set(cards.flatMap((c) => c.classes))];
      // tSum(t,d,P): linear 0/1 occupancy expr (hard ≤1 via tOcc at-most-one).
      const tVars = (t, d, P) => tOcc.get(`t|${t}|${d},${P}`) || null;
      // cBusy(c,d,P): BoolVar — 1 iff the class has ANY activity (group sums
      // can exceed 1, so a literal is required). b ≥ each v, b ≤ Σv.
      const cBusyCache = new Map();
      const cBusy = (c, d, P) => {
        const key = `${c}|${d},${P}`;
        if (cBusyCache.has(key)) return cBusyCache.get(key);
        const entries = clsAt.get(`c|${c}|${d},${P}`);
        if (!entries || !entries.length) { cBusyCache.set(key, null); return null; }
        const vs = entries.map(([, v]) => v);
        const b = m.newBoolVar(`cb_${c}_${d}_${P}`);
        for (const v of vs) atLeast(m, LinearExpr.sum([b, ...neg([v])]), 0); // b >= v
        atMost(m, LinearExpr.sum([b, ...neg(vs)]), 0);                       // b <= Σv
        cBusyCache.set(key, b);
        return b;
      };

      // ---- 1+2. teacher gaps / class gaps (island counting) --------------
      // gaps(day) = (#teaching islands) − (any teaching at all). starts_p is
      // forced up by starts_p ≥ busy_p − busy_{p−1}; `active` carries a
      // NEGATIVE weight and is capped by Σbusy, so the minimizer sets it to 1
      // exactly when the entity teaches that day.
      const addGapTerms = (busyExprAt, tag, weight) => {
        for (const d of days) {
          const seq = [];
          for (const P of periods) { seq.push(busyExprAt(d, P)); }
          if (!seq.some(Boolean)) continue;
          const active = m.newBoolVar(`gap_act_${tag}_${d}`);
          const allVars = [];
          let prev = null;
          for (let i = 0; i < seq.length; i++) {
            const cur = seq[i];
            if (!cur) { prev = cur; continue; }
            const curVars = Array.isArray(cur) ? cur : [cur];
            allVars.push(...curVars);
            const st = m.newBoolVar(`gap_st_${tag}_${d}_${i}`);
            const prevVars = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
            // st >= Σcur − Σprev
            atLeast(m, LinearExpr.sum([st, ...prevVars, ...neg(curVars)]), 0);
            softTerms.push([weight, st]);
            prev = cur;
          }
          atMost(m, LinearExpr.sum([active, ...neg(allVars)]), 0); // active ≤ Σbusy
          softTerms.push([-weight, active]);
        }
      };
      for (const t of teacherIdsInUse) {
        addGapTerms((d, P) => tVars(t, d, P), `t${t}`, W.teacherGaps);
      }
      for (const c of classIdsInUse) {
        addGapTerms((d, P) => cBusy(c, d, P), `c${c}`, W.classGaps);
      }

      // ---- 3. teacher room stability (distinct rooms per day − 1) --------
      // ---- 11. teacher building changes (distinct buildings per day − 1) -
      {
        const perTD = new Map(); // `${t}|${d}` -> Map(room -> yvars[])
        for (let ci = 0; ci < cards.length; ci++) {
          const card = cards[ci];
          if (!card.rooms.length) continue;
          for (const skey of assign[ci].keys()) {
            const d = Number(skey.split(',')[0]);
            for (const r of card.rooms) {
              const yv = yroom.get(`${ci}|${skey}|${r}`);
              if (!yv) continue;
              for (const t of card.teachers) {
                const k = `${t}|${d}`;
                if (!perTD.has(k)) perTD.set(k, new Map());
                const rm = perTD.get(k);
                if (!rm.has(r)) rm.set(r, []);
                rm.get(r).push(yv);
              }
            }
          }
        }
        const haveBuildings = jm.classroomBuilding && jm.buildingCount > 1;
        for (const [k, roomsMap] of perTD) {
          if (roomsMap.size < 2) continue;
          const used = [];
          const byBld = new Map();
          for (const [r, yvs] of roomsMap) {
            const u = m.newBoolVar(`ru_${k}_${r}`);
            for (const yv of yvs) atLeast(m, LinearExpr.sum([u, ...neg([yv])]), 0); // u ≥ yv
            used.push(u);
            if (haveBuildings) {
              const bi = jm.classroomBuilding[rIdxOf.get(r) ?? -1];
              if (bi >= 0) { if (!byBld.has(bi)) byBld.set(bi, []); byBld.get(bi).push(u); }
            }
          }
          const over = m.newIntVar(0, used.length, `ro_${k}`);
          atMost(m, LinearExpr.sum([...used, LinearExpr.term(over, -1)]), 1); // over ≥ Σused − 1
          softTerms.push([W.roomStab, over]);
          if (haveBuildings && byBld.size > 1) {
            const bldUsed = [];
            for (const [bi, us] of byBld) {
              const bu = m.newBoolVar(`bu_${k}_${bi}`);
              for (const u of us) atLeast(m, LinearExpr.sum([bu, ...neg([u])]), 0);
              bldUsed.push(bu);
            }
            const bover = m.newIntVar(0, bldUsed.length, `bo_${k}`);
            atMost(m, LinearExpr.sum([...bldUsed, LinearExpr.term(bover, -1)]), 1);
            softTerms.push([W.buildings, bover]);
          }
        }
      }

      // ---- 4+5. consecutive overload (sliding window over bell positions) -
      const addConsecTerms = (busyExprAt, maxConsec, tag, weight) => {
        if (maxConsec == null || maxConsec <= 0) return;
        for (const d of days) {
          for (let i = 0; i + maxConsec < periods.length; i++) {
            const windowVars = [];
            for (let j = i; j <= i + maxConsec; j++) {
              const b = busyExprAt(d, periods[j]);
              if (b) windowVars.push(...(Array.isArray(b) ? b : [b]));
            }
            if (windowVars.length <= maxConsec) continue;
            const over = m.newIntVar(0, periods.length, `cw_${tag}_${d}_${i}`);
            atMost(m, LinearExpr.sum([...windowVars, LinearExpr.term(over, -1)]), maxConsec);
            softTerms.push([weight, over]);
          }
        }
      };
      for (const t of teacherIdsInUse) {
        const ti = tIdxOf.get(t);
        const mc = ti != null && jm.teacherMaxConsec ? jm.teacherMaxConsec[ti] : -1;
        if (mc > 0) addConsecTerms((d, P) => tVars(t, d, P), mc, `t${t}`, W.tConsec);
      }
      for (const c of classIdsInUse) {
        const ci2 = cIdxOf.get(c);
        const mc = ci2 != null && jm.classMaxConsec ? jm.classMaxConsec[ci2] : -1;
        if (mc > 0) addConsecTerms((d, P) => cBusy(c, d, P), mc, `c${c}`, W.cConsec);
      }

      // ---- 6. teacher last-period overflow --------------------------------
      {
        const lastTeachingP = periods[periods.length - 1];
        if (bellPosOf.get(lastTeachingP) === ppdJS - 1) {
          for (const t of teacherIdsInUse) {
            const ti = tIdxOf.get(t);
            const cap = ti != null && jm.teacherLastPeriodCap ? jm.teacherLastPeriodCap[ti] : -1;
            if (cap == null || cap < 0) continue;
            const vs = [];
            for (const d of days) { const v = tVars(t, d, lastTeachingP); if (v) vs.push(...v); }
            if (vs.length <= cap) continue;
            const over = m.newIntVar(0, days.length, `lp_${t}`);
            atMost(m, LinearExpr.sum([...vs, LinearExpr.term(over, -1)]), cap);
            softTerms.push([W.lastPeriod, over]);
          }
        }
      }

      // ---- 7. period load balance (periodPref score per placement) --------
      // Mirrors JS exactly: every occupied (entity-agnostic) placement scores
      // periodPref[bellPos]. Weight folds jw[7] in; per-cover like teacherOcc.
      {
        const pref = jm.periodPref;
        for (let ci = 0; ci < cards.length; ci++) {
          for (const [skey, avar] of assign[ci]) {
            const s = skey.split(',').map(Number);
            let score = 0;
            for (const ps of cover(cards[ci], s)) {
              const pos = bellPosOf.get(ps[1]);
              if (pos != null) score += pref[pos] || 0;
            }
            if (score) softTerms.push([score * (jw[7] || 20), avar]);
          }
        }
      }

      // ---- 8. consecutive heavy days (CKritResty) --------------------------
      // heavy_d forced 1 when dayLoad > thr; pair penalty ≥ ex_d + ex_{d+1}
      // − M(2 − heavy_d − heavy_{d+1}) counts both days' excess only when
      // both are heavy (big-M relaxation, M = periods/day).
      for (const t of teacherIdsInUse) {
        const ti = tIdxOf.get(t);
        const cap = ti != null && jm.teacherMaxPerDay ? (jm.teacherMaxPerDay[ti] | 0) : 0;
        const thr = cap > 0 ? Math.max(2, Math.floor(cap / 2)) : 5;
        const M = periods.length;
        const exs = [], heavies = [];
        for (const d of days) {
          const vs = [];
          for (const P of periods) { const v = tVars(t, d, P); if (v) vs.push(...v); }
          if (!vs.length) { exs.push(null); heavies.push(null); continue; }
          const ex = m.newIntVar(0, M, `hx_${t}_${d}`);
          atMost(m, LinearExpr.sum([...vs, LinearExpr.term(ex, -1)]), thr); // ex ≥ Σ − thr
          const hv = m.newBoolVar(`hv_${t}_${d}`);
          atMost(m, LinearExpr.sum([...vs, LinearExpr.term(hv, -M)]), thr); // M·hv ≥ Σ − thr
          exs.push(ex); heavies.push(hv);
        }
        for (let d = 0; d + 1 < days.length; d++) {
          if (!exs[d] || !exs[d + 1]) continue;
          const pen = m.newIntVar(0, 2 * M, `hp_${t}_${d}`);
          // pen ≥ ex_d + ex_{d+1} − M(2 − hv_d − hv_{d+1})
          atMost(m, LinearExpr.sum([
            exs[d], exs[d + 1],
            LinearExpr.term(heavies[d], M), LinearExpr.term(heavies[d + 1], M),
            LinearExpr.term(pen, -1),
          ]), 2 * M);
          softTerms.push([W.consecHeavy, pen]);
        }
      }

      // ---- 9. teacher conditional time-off ('?' slots) ---------------------
      if (jm.teacherConditionalMask) {
        for (const t of teacherIdsInUse) {
          const ti = tIdxOf.get(t);
          if (ti == null) continue;
          for (const d of days) {
            const mask = jm.teacherConditionalMask[ti * days.length + d];
            if (!mask) continue;
            for (const P of periods) {
              const pos = bellPosOf.get(P);
              if (pos == null || ((mask >>> pos) & 1) !== 1) continue;
              const vs = tVars(t, d, P);
              if (vs) for (const v of vs) softTerms.push([W.conditional, v]);
            }
          }
        }
      }

      // ---- 10. lunch window / teaching window / block prefs (per class) ---
      // JS scores the START period of each assigned lesson (not covers).
      for (let ci = 0; ci < cards.length; ci++) {
        const card = cards[ci];
        const cIdxs = card.classes.map((c) => cIdxOf.get(c)).filter((x) => x != null);
        if (!cIdxs.length) continue;
        for (const [skey, avar] of assign[ci]) {
          const P = Number(skey.split(',')[1]);
          const pos = bellPosOf.get(P);
          if (pos == null) continue;
          const bit = (1 << pos) >>> 0;
          let w = 0;
          for (const cx of cIdxs) {
            if (jm.classLunchMask && (jm.classLunchMask[cx] & bit)) w += W.window;
            const tm = jm.classTeachingMask ? jm.classTeachingMask[cx] : 0;
            if (tm !== 0 && (tm & bit) === 0) w += W.window;
            if (jm.classDruheHodiny && jm.classDruheHodiny[cx] && pos === 0) w += W.window;
          }
          if (w) softTerms.push([w, avar]);
        }
      }
      // block window: penalise (class, day) that is active but has no
      // teaching inside the class's required block window.
      if (jm.classBlockMask) {
        for (const c of classIdsInUse) {
          const cx = cIdxOf.get(c);
          if (cx == null || !jm.classBlockMask[cx]) continue;
          const mask = jm.classBlockMask[cx];
          const wBlock = W.window * ((jm.classManualnyBlok && jm.classManualnyBlok[cx] === 2) ? 2 : 1);
          for (const d of days) {
            const inWin = [], allB = [];
            for (const P of periods) {
              const b = cBusy(c, d, P);
              if (!b) continue;
              allB.push(b);
              const pos = bellPosOf.get(P);
              if (pos != null && ((mask >>> pos) & 1)) inWin.push(b);
            }
            if (!allB.length) continue;
            // act is exact: ≥ every busy bool (forced up), ≤ their sum (0 when idle).
            const act = m.newBoolVar(`blk_act_${c}_${d}`);
            for (const b of allB) atLeast(m, LinearExpr.sum([act, ...neg([b])]), 0);
            atMost(m, LinearExpr.sum([act, ...neg(allB)]), 0);
            const hasWin = m.newBoolVar(`blk_win_${c}_${d}`);
            atMost(m, LinearExpr.sum([hasWin, ...neg(inWin)]), 0); // hasWin ≤ Σin-window
            const miss = m.newBoolVar(`blk_miss_${c}_${d}`);
            // miss ≥ act − hasWin
            atLeast(m, LinearExpr.sum([miss, hasWin, ...neg([act])]), 0);
            softTerms.push([wBlock, miss]);
          }
        }
      }

      // ---- 12. classTeacherPos (homeroom teacher at marked slots) ---------
      if (jm.classTeacherPosMask && jm.classHomeroomTeacher) {
        for (let ci = 0; ci < cards.length; ci++) {
          const card = cards[ci];
          for (const c of card.classes) {
            const cx = cIdxOf.get(c);
            if (cx == null) continue;
            const hrT = jm.classHomeroomTeacher[cx];
            if (hrT < 0) continue;
            const hrId = jm.teacherIds[hrT];
            if (card.teachers.includes(hrId)) continue;
            for (const [skey, avar] of assign[ci]) {
              const [d, P] = skey.split(',').map(Number);
              const pos = bellPosOf.get(P);
              if (pos == null) continue;
              if (jm.classTeacherPosMask[(cx * days.length + d) * ppdJS + pos]) {
                softTerms.push([W.teacherPos, avar]);
              }
            }
          }
        }
      }

      // ---- 13. min resting hours between days ------------------------------
      {
        const minRest = jm.minRestingPeriods | 0;
        if (minRest > 0) {
          for (const t of teacherIdsInUse) {
            for (let d = 0; d + 1 < days.length; d++) {
              for (const P1 of periods) {
                const pos1 = bellPosOf.get(P1);
                for (const P2 of periods) {
                  const pos2 = bellPosOf.get(P2);
                  const gap = (ppdJS - 1 - pos1) + pos2;
                  if (gap >= minRest) continue;
                  const v1 = tVars(t, days[d], P1), v2 = tVars(t, days[d + 1], P2);
                  if (!v1 || !v2) continue;
                  const viol = m.newBoolVar(`rest_${t}_${d}_${pos1}_${pos2}`);
                  // viol ≥ busy1 + busy2 − 1, weighted by shortfall
                  atLeast(m, LinearExpr.sum([viol, ...neg([...v1, ...v2])]), -1);
                  softTerms.push([W.resting * (minRest - gap), viol]);
                }
              }
            }
          }
        }
      }

      // ---- 14. supervision criteria (avoid first/last period) -------------
      {
        const crit = jm.supervisionCriteria;
        if (crit && (crit.avoidFirstPeriod || crit.avoidLastPeriod)) {
          for (let ci = 0; ci < cards.length; ci++) {
            for (const [skey, avar] of assign[ci]) {
              const pos = bellPosOf.get(Number(skey.split(',')[1]));
              if (pos == null) continue;
              if ((crit.avoidFirstPeriod && pos === 0) || (crit.avoidLastPeriod && pos === ppdJS - 1)) {
                softTerms.push([W.supervision, avar]);
              }
            }
          }
        }
      }

      // ---- 15. student subject conflicts -----------------------------------
      // jm.lessonStudentSets indexes jm.lessons (per-card expansion in the SAME
      // source order as our cards[] — both expand school.lessons sequentially);
      // map via source lesson id to stay order-independent.
      if (jm.studentElectiveSets && jm.studentElectiveSets.length && jm.lessonStudentSets) {
        const setsByLessonId = new Map();
        for (let i = 0; i < jm.lessons.length; i++) {
          const lid = jm.lessons[i].id;
          if (!setsByLessonId.has(lid) && jm.lessonStudentSets[i]) setsByLessonId.set(lid, jm.lessonStudentSets[i]);
        }
        const perStudentSlot = new Map(); // `${sidx}|${d},${P}` -> avars
        for (let ci = 0; ci < cards.length; ci++) {
          const tags = setsByLessonId.get(cards[ci].lesson_id);
          if (!tags || !tags.length) continue;
          for (const [skey, avar] of assign[ci]) {
            for (const sidx of tags) {
              const k = `${sidx}|${skey}`;
              if (!perStudentSlot.has(k)) perStudentSlot.set(k, []);
              perStudentSlot.get(k).push(avar);
            }
          }
        }
        for (const [k, vs] of perStudentSlot) {
          if (vs.length < 2) continue;
          const over = m.newIntVar(0, vs.length, `stc_${k.replace(/[^A-Za-z0-9]/g, '_')}`);
          atMost(m, LinearExpr.sum([...vs, LinearExpr.term(over, -1)]), 1);
          softTerms.push([W.studentConf, over]);
        }
      }

      // ---- 16+17. mode scorers (afternoon-heavy / block-pairing) ----------
      if (jm.schoolMode === 'morning-afternoon' || jm.schoolMode === 'block-planning') {
        const cutoff = jm.afternoonStartsAt | 0;
        const tagsByLessonId = new Map();
        for (let i = 0; i < jm.lessons.length; i++) {
          const lid = jm.lessons[i].id;
          if (!tagsByLessonId.has(lid) && jm.lessonTags && jm.lessonTags[i]) tagsByLessonId.set(lid, jm.lessonTags[i]);
        }
        for (let ci = 0; ci < cards.length; ci++) {
          const card = cards[ci];
          const t = tagsByLessonId.get(card.lesson_id);
          for (const [skey, avar] of assign[ci]) {
            const pos = bellPosOf.get(Number(skey.split(',')[1]));
            if (pos == null) continue;
            if (jm.schoolMode === 'morning-afternoon' && t && t.includes('HEAVY') && pos >= cutoff) {
              softTerms.push([W.afternoon, avar]);
            }
            if (jm.schoolMode === 'block-planning' && pos % 2 !== 0) {
              softTerms.push([W.blockPair * (card.length === 2 ? 2 : 1), avar]);
            }
          }
        }
      }

      // ---- 18. teacher interval-max-days -----------------------------------
      if (jm.teacherIntervalMaxDays) {
        for (const t of teacherIdsInUse) {
          const ti = tIdxOf.get(t);
          const iv = ti != null ? jm.teacherIntervalMaxDays[ti] : null;
          if (!iv) continue;
          const workedBools = [];
          const M = periods.length;
          for (const d of days) {
            const vs = [];
            for (const P of periods) {
              const pos = bellPosOf.get(P);
              if (pos == null || pos < iv.fromPeriod || pos > iv.toPeriod) continue;
              const v = tVars(t, d, P);
              if (v) vs.push(...v);
            }
            if (!vs.length) continue;
            const wk = m.newBoolVar(`ivw_${t}_${d}`);
            atMost(m, LinearExpr.sum([...vs, LinearExpr.term(wk, -M)]), 0); // M·wk ≥ Σ
            workedBools.push(wk);
          }
          if (workedBools.length > iv.maxDays) {
            const over = m.newIntVar(0, days.length, `ivo_${t}`);
            atMost(m, LinearExpr.sum([...workedBools, LinearExpr.term(over, -1)]), iv.maxDays);
            softTerms.push([W.interval, over]);
          }
        }
      }

      // ---- 19. lesson-tag daily caps ---------------------------------------
      if (jm.tagDailyCaps && jm.tagDailyCaps.length) {
        const tagsByLessonId = new Map();
        for (let i = 0; i < jm.lessons.length; i++) {
          const lid = jm.lessons[i].id;
          if (!tagsByLessonId.has(lid) && jm.lessonTags && jm.lessonTags[i]) tagsByLessonId.set(lid, jm.lessonTags[i]);
        }
        for (const cap of jm.tagDailyCaps) {
          const perKey = new Map(); // `${entity}|${d}` -> avars
          for (let ci = 0; ci < cards.length; ci++) {
            const card = cards[ci];
            const lt = tagsByLessonId.get(card.lesson_id);
            if (!lt || !lt.includes(cap.tag)) continue;
            const ents = cap.scope === 'teacher' ? card.teachers : card.classes;
            for (const [skey, avar] of assign[ci]) {
              const d = Number(skey.split(',')[0]);
              for (const e of ents) {
                const k = `${e}|${d}`;
                if (!perKey.has(k)) perKey.set(k, []);
                perKey.get(k).push(avar);
              }
            }
          }
          const w = W.tagCap * (cap.scope === 'teacher' ? 2 : 1);
          for (const [k, vs] of perKey) {
            if (vs.length <= cap.max) continue;
            const over = m.newIntVar(0, vs.length, `tgc_${cap.tag}_${k.replace(/[^A-Za-z0-9]/g, '_')}`);
            atMost(m, LinearExpr.sum([...vs, LinearExpr.term(over, -1)]), cap.max);
            softTerms.push([w, over]);
          }
        }
      }

      // ---- 20. subject-tag → room mismatch ---------------------------------
      if (jm.classroomAllowedTags && jm.lessonTags) {
        const tagsByLessonId = new Map();
        for (let i = 0; i < jm.lessons.length; i++) {
          const lid = jm.lessons[i].id;
          if (!tagsByLessonId.has(lid) && jm.lessonTags[i]) tagsByLessonId.set(lid, jm.lessonTags[i]);
        }
        for (let ci = 0; ci < cards.length; ci++) {
          const card = cards[ci];
          const lt = tagsByLessonId.get(card.lesson_id);
          if (!lt || !lt.length || !card.rooms.length) continue;
          for (const r of card.rooms) {
            const ri = rIdxOf.get(r);
            const ra = ri != null ? jm.classroomAllowedTags[ri] : null;
            if (!ra || !ra.length) continue;
            if (lt.some((tag) => ra.includes(tag))) continue;
            for (const skey of assign[ci].keys()) {
              const yv = yroom.get(`${ci}|${skey}|${r}`);
              if (yv) softTerms.push([W.roomTag, yv]);
            }
          }
        }
      }

      console.error('EXTENDED SOFT: terms added=', softTerms.length - nExtBefore);
    }
  };

  const totalCards = cards.length;
  console.error('MODEL BUILD: cards=', cards.length, 'placed_vars=', placed.length, 'slot_vars=', assign.reduce((acc, m) => acc + m.size, 0), 'soft_terms=', softTerms.length);
  const doQuality = soft;
  let elapsed = 0;
  const cancelled = () => cancelCheck && cancelCheck();

  class ProgressCb extends CpSolverSolutionCallback {
    constructor(report) { super(); this._report = report; }
    onSolutionCallback() {
      if (progressFn) {
        try {
          const ov = this.objectiveValue;
          progressFn(this._report ?? Math.round(ov), Math.round(this.wallTime * 1000));
        } catch {}
      }
      if (cancelled()) this.stopSearch();
    }
  }

  m.maximize(sum(placed));
  // Adaptive phase split (was a fixed 60/40). Phase 1 (placement) gets a
  // share that grows with problem size — small models prove placement
  // optimality in seconds and the quality phase deserves the remainder;
  // huge models need most of the budget just to place. Phase 2 then gets
  // whatever phase 1 didn't actually use (solvers stop early on OPTIMAL),
  // so a fast phase 1 automatically funds a longer polish.
  //   share = clamp(0.35 + cards/4000, 0.40, 0.75)
  //   improve mode: the placement floor makes phase 1 trivial — cap at 0.40.
  // Improve mode: the hints make phase 1 cheap per-solution but it is also
  // the placement CLIMBER (floor -> 100%), and the early-exit callback stops
  // it the moment every card is placed — so a generous share is safe: unused
  // time rolls over to phase 2 automatically.
  const p1Share = improve
    ? 0.60
    : Math.min(0.75, Math.max(0.40, 0.35 + cards.length / 4000));
  const solver1 = new CpSolver();
  solver1.parameters.maxTimeInSeconds = Math.max(5, timeLimitSec * (doQuality ? p1Share : 1.0));
  solver1.parameters.numSearchWorkers = numWorkers;
  solver1.parameters.randomSeed = seed;
  class Phase1Cb extends ProgressCb {
    onSolutionCallback() {
      super.onSolutionCallback();
      try { if (Math.round(this.objectiveValue) >= cards.length) this.stopSearch(); } catch {}
    }
  }
  const status1 = await solver1.solve(m, new Phase1Cb(null));
  console.error('PHASE 1 status:', status1);
  const pstar = (status1 === 'OPTIMAL' || status1 === 'FEASIBLE')
    ? Math.round(solver1.objectiveValue()) : 0;
  console.error('PHASE 1 pstar:', pstar, 'wall:', solver1.wallTime);
  elapsed += solver1.wallTime;

  let solver = solver1, status = status1;
  // Phase 2 (soft polish) adds tens of thousands of terms and its model
  // BUILD time is not governed by maxTimeInSeconds — with little budget
  // left the build alone can overrun the caller's watchdog, which kills
  // the worker and loses phase 1's placements entirely (observed: 1441-
  // card school, phase 1 FEASIBLE 1323, watchdog fired mid-build → the
  // caller fell back to a 924-card draft). Only polish with real room.
  const remainingAfterP1 = timeLimitSec - elapsed;
  const roomForPolish = remainingAfterP1 > 20;
  if (doQuality && pstar > 0 && !cancelled() && roomForPolish) buildSoftModel();
  if (doQuality && pstar > 0 && !cancelled() && roomForPolish && softTerms.length) {
    atLeast(m, sum(placed), pstar);
    // Seed phase 2 with phase 1's solution so it starts from an incumbent
    // instead of re-discovering placement from scratch. (Improve mode already
    // carries its own hints — don't double-hint.)
    if (!improve && options.phase2Hints !== false) {
      const val1 = (x) => { try { return solver1.value(x); } catch { return 0; } };
      let nh = 0, nhr = 0;
      for (let ci = 0; ci < cards.length; ci++) {
        for (const [skey, avar] of assign[ci]) {
          if (val1(avar) === 1) {
            hintOnce(avar, 1); nh++;
            for (const r of cards[ci].rooms) {
              const yv = yroom.get(`${ci}|${skey}|${r}`);
              if (yv && val1(yv) === 1) { hintOnce(yv, 1); nhr++; }
            }
          }
        }
      }
      console.error('PHASE 2 hints:', nh, 'card vars +', nhr, 'room vars');
    }
    const weightedTerms = softTerms.map(([w, v]) => LinearExpr.term(v, w));
    const softSum = weightedTerms.length ? LinearExpr.sum(weightedTerms) : 0;
    m.minimize(softSum);
    const solver2 = new CpSolver();
    // Phase 2 spends the REMAINING wall budget (phase 1 stopping early on
    // OPTIMAL leaves more polish time). 0.6 (was 0.9) leaves headroom for
    // the un-metered soft-model build + extraction so the caller's 1.3×
    // watchdog never fires mid-polish.
    solver2.parameters.maxTimeInSeconds = Math.max(5, (timeLimitSec - elapsed) * 0.6);
    solver2.parameters.numSearchWorkers = numWorkers;
    solver2.parameters.randomSeed = seed;
    let st2 = null;
    try {
      st2 = await solver2.solve(m);
    } catch (e) {
      console.error('PHASE 2 solve threw:', (e && e.message) || String(e));
    }
    console.error('PHASE 2 status:', st2, 'wall:', st2 ? solver2.wallTime : 'n/a', 'terms:', softTerms.length);
    if (st2 === 'MODEL_INVALID') {
      try { console.error('PHASE 2 validator:', solver2.solutionInfo()); } catch (e) { console.error('PHASE 2 validator read failed:', String(e).slice(0, 120)); }
    }
    if (st2 === 'OPTIMAL' || st2 === 'FEASIBLE') {
      solver = solver2; status = st2;
      elapsed += solver2.wallTime;
    }
  }

  // The WASM CpSolver.value() throws "missing numeric solution value" if asked
  // for a variable that presolve fixed/dropped from the solution vector (the
  // Python API tolerates this). Guard every read, and only extract when the
  // solver actually has a solution.
  const val = (x) => { try { return solver.value(x); } catch { return 0; } };
  const hasSolution = status === 'OPTIMAL' || status === 'FEASIBLE';
  const assignment = [];
  let nPlaced = 0;
  if (hasSolution) for (let ci = 0; ci < cards.length; ci++) {
    const card = cards[ci];
    if (val(placed[ci]) !== 1) continue;
    let chosen = null;
    for (const [skey, v] of assign[ci]) {
      if (val(v) === 1) { chosen = skey; break; }
    }
    if (!chosen) continue;
    const [d, p] = chosen.split(',').map(Number);
    let room = null;
    if (card.rooms.length) {
      for (const r of card.rooms) {
        if (val(yroom.get(`${ci}|${chosen}|${r}`)) === 1) { room = r; break; }
      }
    }
    for (const [dd, pp] of cover(card, [d, p])) {
      assignment.push({ lessonId: card.lesson_id, day: dd, period: pp, classroomId: room });
    }
    nPlaced++;
  }

  let softPenalty = 0;
  if (softTerms.length && hasSolution) {
    softPenalty = softTerms.reduce((acc, [w, v]) => acc + w * val(v), 0);
  }

  return {
    status: 'OK',
    assignment,
    stats: {
      placed: nPlaced,
      unplaced: totalCards - nPlaced,
      hardConflicts: 0,
      softScore: -softPenalty,
      cpStatus: status,
      objective: nPlaced,
      wallSec: Math.round(elapsed * 100) / 100,
    },
    violations: [],
  };
}

// CLI entry — Node only. Guarded so importing this module in a browser worker
// (where `process` is undefined) doesn't throw at load.
const isMain = typeof process !== "undefined" && process.argv
  && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { readFileSync } = await import('node:fs');
  const school = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const tl = Number(process.argv[3] || 90);
  const t0 = Date.now();
  const r = await buildAndSolve(school, { timeLimitSec: tl });
  const totalMs = Date.now() - t0;
  console.log(JSON.stringify(r.stats, null, 2));
  console.log('---');
  console.log('total wall (incl. JIT+import):', totalMs, 'ms');
  console.log('assignment rows:', r.assignment.length);

  const byLessonDay = new Map();
  for (const a of r.assignment) {
    const k = `${a.lessonId}|${a.day}`;
    if (!byLessonDay.has(k)) byLessonDay.set(k, []);
    byLessonDay.get(k).push(a.period);
  }
  const allCards = school.lessons.reduce((acc, L) => {
    const length = L.isLabDouble ? 2 : 1;
    const ppw = Number(L.periodsPerWeek) || 0;
    return acc + (ppw > 0 ? Math.max(1, Math.round(ppw / length)) : 0);
  }, 0);
  let doublesOk = 0, doublesBad = 0;
  for (const ps of byLessonDay.values()) {
    if (ps.length === 2) {
      ps.sort((a, b) => a - b);
      if (ps[1] === ps[0] + 1) doublesOk++;
      else doublesBad++;
    }
  }
  console.log('total cards (expanded):', allCards);
  console.log('doubles placed contiguously:', doublesOk, '/ non-contig:', doublesBad);

  const subjectsByDay = new Map();
  for (const a of r.assignment) {
    const lesson = school.lessons.find((L) => L.id === a.lessonId);
    if (!lesson) continue;
    for (const c of lesson.classIds || []) {
      const k = `${c}|${lesson.subjectId}|${a.day}`;
      subjectsByDay.set(k, (subjectsByDay.get(k) || 0) + 1);
    }
  }
  let overCap3 = 0;
  for (const count of subjectsByDay.values()) if (count >= 3) overCap3++;
  console.log('(class,subject,day) buckets with >=3 same subject:', overCap3);
}
