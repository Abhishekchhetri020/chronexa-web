#!/usr/bin/env node
// Side-effect-free benchmark runner + semantic checker.
// Prints to stdout only. Does NOT write benchmarks/results.json.
// Usage: npm run bench            (quick: small + medium + relations_micro)
//        npm run bench -- --large (also dense realistic + real-school XML)
// Exit 0 on pass, 1 on any failure.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { solve } from '../js/solver/csp_solver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const large = process.argv.includes('--large');

function loadBench(name) {
  const p = path.join(root, 'benchmarks', name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function summarize(result) {
  return {
    status: result.status,
    placed: result.stats.placed,
    unplaced: result.stats.unplaced,
    total: result.stats.placed + result.stats.unplaced,
    hardConflicts: result.stats.hardConflicts,
    softScore: result.stats.softScore,
    durationMs: result.stats.durationMs,
  };
}

const rows = [];
let failures = 0;

function check(label, cond, detail) {
  if (cond) rows.push(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
  else { rows.push(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); failures++; }
}

// ── small ──────────────────────────────────────────────────────────────
{
  const t = performance.now();
  const s = loadBench('small_school.json');
  const r = solve(s, { timeLimitSec: 10 });
  const wallMs = Math.round(performance.now() - t);
  const m = summarize(r);
  rows.push(`small_school: ${m.status} ${m.placed}/${m.total} hard=${m.hardConflicts} soft=${m.softScore} solver=${m.durationMs}ms wall=${wallMs}ms`);
  check('small: 100% placed & FEASIBLE', m.status === 'FEASIBLE' && m.unplaced === 0, `${m.placed}/${m.total}`);
}

// ── medium ─────────────────────────────────────────────────────────────
{
  const t = performance.now();
  const s = loadBench('medium_school.json');
  const r = solve(s, { timeLimitSec: 5 });
  const wallMs = Math.round(performance.now() - t);
  const m = summarize(r);
  rows.push(`medium_school: ${m.status} ${m.placed}/${m.total} hard=${m.hardConflicts} soft=${m.softScore} solver=${m.durationMs}ms wall=${wallMs}ms`);
  check('medium: 100% placed & FEASIBLE & <5s', m.status === 'FEASIBLE' && m.unplaced === 0 && wallMs < 5000, `${wallMs}ms`);
}

// ── relations micro + semantic assertions ─────────────────────────────
{
  const t = performance.now();
  const school = loadBench('relations_micro.json');
  const r = solve(school, { timeLimitSec: 2, seed: 9881 });
  const wallMs = Math.round(performance.now() - t);
  const m = summarize(r);
  rows.push(`relations_micro: ${m.status} ${m.placed}/${m.total} hard=${m.hardConflicts} soft=${m.softScore} solver=${m.durationMs}ms wall=${wallMs}ms`);

  const A = r.assignment;
  const byLesson = new Map();
  for (const a of A) {
    const id = String(a.lessonId).replace(/#\d+$/, '');
    if (!byLesson.has(id)) byLesson.set(id, []);
    byLesson.get(id).push(a);
  }
  const lessonById = Object.fromEntries(school.lessons.map(l => [l.id, l]));
  const isLab = id => !!(lessonById[id] && (lessonById[id].isLabDouble || lessonById[id].doubleLesson));

  check('micro: FEASIBLE & fully placed', m.status === 'FEASIBLE' && m.unplaced === 0, `${m.placed}/${m.total}`);
  check('micro: <2s wall', wallMs < 2000, `${wallMs}ms`);
  check('micro: zero scrubbedConflicts', (r.stats.scrubbedConflicts || 0) === 0, `scrubbed=${r.stats.scrubbedConflicts || 0}`);
  check('micro: zero hardConflicts', m.hardConflicts === 0, `hard=${m.hardConflicts}`);

  // n_7 — no non-teaching period strictly between s_n7a and s_n7b on a day
  {
    const bell = school.bell.periods;
    const breaks = new Set(bell.filter(p => p.isTeaching === false).map(p => p.index));
    let ok = true;
    for (const d of [0,1,2,3,4,5]) {
      const ps = [];
      for (const a of A) {
        const id = String(a.lessonId).replace(/#\d+$/, '');
        if ((lessonById[id]?.subjectId === 's_n7a' || lessonById[id]?.subjectId === 's_n7b') && a.day === d) ps.push(a.period);
      }
      if (ps.length >= 2) {
        const lo = Math.min(...ps), hi = Math.max(...ps);
        for (const b of breaks) if (b > lo && b < hi) ok = false;
      }
    }
    check('micro n_7: no non-teaching period between s_n7a/s_n7b', ok);
  }

  // bell design — c3 must never occupy the non-dense gap (index 3) or a period its bell lacks (6,7,8)
  {
    const c3Ids = new Set(school.lessons.filter(l => (l.classIds||[]).includes('c3')).map(l => l.id));
    const bad = A.filter(a => c3Ids.has(String(a.lessonId).replace(/#\d+$/, '')) && ![1,2,4,5].includes(a.period));
    check('micro bell: c3 cards only in short-sparse bell periods {1,2,4,5}', bad.length === 0, bad.length ? `bad=${bad.length}` : 'ok');
  }

  // lab doubles — span is [p, p+1)
  {
    let ok = true, count = 0;
    for (const a of A) {
      const id = String(a.lessonId).replace(/#\d+$/, '');
      if (isLab(id)) {
        count++;
        const l = lessonById[id];
        const span = l.isLabDouble ? 2 : (l.lessonLength || 1);
        if (span === 2 && a.period + 1 > 8) ok = false;   // tail must fit
      }
    }
    check(`micro lab: ${count} lab cards, tails within day`, ok && count === 3, `count=${count}`);
  }

  // n_16 — every s_n16 card touches a day edge (start period 1, or end == last teaching)
  {
    const teaching = school.bell.periods.filter(p => p.isTeaching !== false).map(p => p.index);
    const firstT = Math.min(...teaching), lastT = Math.max(...teaching);
    const cards = A.filter(a => {
      const id = String(a.lessonId).replace(/#\d+$/, '');
      return lessonById[id]?.subjectId === 's_n16';
    });
    const ok = cards.length === 2 && cards.every(a => a.period === firstT || a.period === lastT);
    check(`micro n_16: cards touch day-edge`, ok, cards.map(c => `d${c.day}p${c.period}`).join(' '));
  }

  // n_5 — s_n5a and s_n5b on the SAME day, in ADJACENT periods (either order).
  // This is the positive-direction guarantee that was broken by the pre-fix
  // inverted scope (audit finding #4 / Phase 2.1). Skips silently when the
  // lessons weren't both placed.
  {
    const a5 = A.filter(a => lessonById[String(a.lessonId).replace(/#\d+$/,"")]?.subjectId === 's_n5a');
    const b5 = A.filter(a => lessonById[String(a.lessonId).replace(/#\d+$/,"")]?.subjectId === 's_n5b');
    if (a5.length && b5.length) {
      const ok = a5.some(x => b5.some(y => x.day === y.day && Math.abs(x.period - y.period) === 1));
      check('micro n_5: A and B adjacent on the same day', ok,
        `A=${a5.map(c=>`d${c.day}p${c.period}`)}  B=${b5.map(c=>`d${c.day}p${c.period}`)}`);
    }
  }
}

// ── large realistic (opt-in) ────────────────────────────────────────────
if (large) {
  const t = performance.now();
  const s = loadBench('large_school_realistic.json');
  const r = solve(s, { timeLimitSec: 60 });
  const wallMs = Math.round(performance.now() - t);
  const m = summarize(r);
  rows.push(`large_school_realistic: ${m.status} ${m.placed}/${m.total} hard=${m.hardConflicts} soft=${m.softScore} solver=${m.durationMs}ms wall=${wallMs}ms`);
  check('large: FEASIBLE or TIMEOUT; no crash', m.status === 'FEASIBLE' || m.status === 'TIMEOUT');
}

// ── dense real school (opt-in) ──────────────────────────────────────────
if (large) {
  const p = path.join(root, 'benchmarks', 'real_school.json');
  if (fs.existsSync(p)) {
    const s = loadBench('real_school.json');
    const expected = s.lessons.reduce((x, l) => x + (l.periodsPerWeek | 0), 0);

    const t0 = performance.now();
    const cold = solve(s, { timeLimitSec: 20, warmStart: false });
    const coldMs = Math.round(performance.now() - t0);
    const coldM = summarize(cold);
    rows.push(`real_school COLD: ${coldM.status} ${coldM.placed}/${coldM.total} (expect ${expected}) hard=${coldM.hardConflicts} soft=${coldM.softScore} wall=${coldMs}ms`);

    const t1 = performance.now();
    const warm = solve(s, { timeLimitSec: 20, warmStart: true });
    const warmMs = Math.round(performance.now() - t1);
    const warmM = summarize(warm);
    rows.push(`real_school WARM: ${warmM.status} ${warmM.placed}/${warmM.total} hard=${warmM.hardConflicts} soft=${warmM.softScore} wall=${warmMs}ms`);

    const coldPct = coldM.placed / expected, warmPct = warmM.placed / expected;
    check('real: cold ≥85%', coldPct >= 0.85, `${(coldPct*100).toFixed(1)}%`);
    check('real: warm ≥90%', warmPct >= 0.90, `${(warmPct*100).toFixed(1)}%`);
  }
}

console.log(rows.join('\n'));
console.log();
console.log(failures === 0 ? `BENCH PASS (${rows.length} checks, 0 failures)` : `BENCH FAIL (${failures} failing checks)`);
process.exit(failures === 0 ? 0 : 1);
