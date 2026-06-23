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
      const dk = occ[0];
      const gk = occ[1] === 'W' ? 'W' : `${dk}|${occ[1]}|${occ[2]}`;
      if (!byDiv.has(dk)) byDiv.set(dk, []);
      byDiv.get(dk).push(v);
      if (!byDivGroup.has(gk)) byDivGroup.set(gk, []);
      byDivGroup.get(gk).push(v);
    }
    for (const vs of byDivGroup.values()) if (vs.length > 1) atMost(m, sum(vs), 1);
    if (byDiv.size > 1) {
      // PAIRWISE formulation: for each (W entry, D entry) pair, at most 1 is true.
      // This is logically equivalent to "at most 1 active division" but avoids
      // using addMaxEquality, which the WASM solver cannot combine with a
      // subsequent sum<=1 constraint over its result (CP-SAT finds 0 solutions
      // on the 951-card demo when the addMaxEquality+sum<=1 form is used).
      // The Python version uses addMaxEquality+sum<=1 and works fine — this is
      // a WASM-specific work-around. (See /Users/abhishekchhetri/.claude/.../
      // /debug-chronexa-wasm-2026-06-19.md for the bisect evidence.)
      const wEntries = byDiv.get('W') || [];
      const dEntries = [];
      for (const [dk, vs] of byDiv) if (dk !== 'W') dEntries.push(...vs);
      for (const vw of wEntries) for (const vd of dEntries) atMost(m, sum([vw, vd]), 1);
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
  // CP-SAT now MODELS most hard n_* relations directly, so it can optimise
  // within them instead of just preserving them. Matching + pairing mirror the
  // JS solver (gatherMatched / pairCrossSubject). Types we don't encode yet
  // (n_5 follow-any, n_6 ordered-follow, n_7 break-between, n_9 same-day-ordered)
  // — and any relation whose encoding would exceed the constraint budget — fall
  // back to LOCKING the bound cards to their warm-start slot (Improve mode only).
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
  const breakVals = (school.bell.periods || []).filter((p) => p.isTeaching === false).map((p) => p.index);

  const ENCODE_TYPS = new Set(['n_0','n_1','n_2','n_8','n_10','n_12','n_13','n_16']);
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
    if (!ENCODE_TYPS.has(typ) || relCons + est > REL_BUDGET) { lockMatched(matched); continue; }
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
    } else if (typ === 'n_8' || typ === 'n_10') { // cross-subject, must same day
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        if (A[a].subjectId === A[b].subjectId) continue;
        for (const d1 of days) for (const d2 of days) { if (d1 === d2) continue;
          const bA = dayBool(A[a].id, d1), bB = dayBool(A[b].id, d2);
          if (bA && bB) { atMost(m, LinearExpr.sum([bA, bB]), 1); relCons++; } }
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
  void breakVals; // reserved for n_7 (break-between) — currently locked

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
        m.addHint(assign[cis[i]].get(s), 1);
        hintedCards++;
        // Hard relation the model can't express -> pin the card to its draft slot.
        if (lock) { m.addEquality(assign[cis[i]].get(s), 1); lockedCards++; }
        const rm = starts[i].classroomId;
        if (rm) {
          const yv = yroom.get(`${cis[i]}|${s}|${rm}`);
          if (yv) m.addHint(yv, 1);
        }
      }
    }
  }
  if (improve && lockedCards) console.error('IMPROVE mode: relation-locked cards =', lockedCards);

  // Improve mode: lock placement at the warm-start level so the solver keeps
  // the given timetable and only improves it (places more / better soft),
  // instead of searching from scratch and possibly landing on fewer cards.
  if (improve && hintedCards > 0) {
    atLeast(m, sum(placed), Math.min(hintedCards, cards.length));
    console.error('IMPROVE mode: placement floor =', hintedCards);
  }

  const softTerms = [];
  if (soft) {
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
  }

  const totalCards = cards.length;
  console.error('MODEL BUILD: cards=', cards.length, 'placed_vars=', placed.length, 'slot_vars=', assign.reduce((acc, m) => acc + m.size, 0), 'soft_terms=', softTerms.length);
  const doQuality = soft && softTerms.length > 0;
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
  const solver1 = new CpSolver();
  solver1.parameters.maxTimeInSeconds = Math.max(5, timeLimitSec * (doQuality ? 0.6 : 1.0));
  solver1.parameters.numSearchWorkers = numWorkers;
  solver1.parameters.randomSeed = seed;
  const status1 = await solver1.solve(m);
  console.error('PHASE 1 status:', status1);
  const pstar = (status1 === 'OPTIMAL' || status1 === 'FEASIBLE')
    ? Math.round(solver1.objectiveValue()) : 0;
  console.error('PHASE 1 pstar:', pstar, 'wall:', solver1.wallTime);
  elapsed += solver1.wallTime;

  let solver = solver1, status = status1;
  if (doQuality && pstar > 0 && !cancelled()) {
    atLeast(m, sum(placed), pstar);
    const weightedTerms = softTerms.map(([w, v]) => LinearExpr.term(v, w));
    const softSum = weightedTerms.length ? LinearExpr.sum(weightedTerms) : 0;
    m.minimize(softSum);
    const solver2 = new CpSolver();
    solver2.parameters.maxTimeInSeconds = Math.max(5, (timeLimitSec - elapsed) * 0.6);
    solver2.parameters.numSearchWorkers = numWorkers;
    solver2.parameters.randomSeed = seed;
    const st2 = await solver2.solve(m);
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
