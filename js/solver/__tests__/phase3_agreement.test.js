// Phase 3 acceptance invariant: for every solver-produced FEASIBLE timetable,
// checkPlacement MUST agree that every card is legal.

import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { solve } from '../csp_solver.js';
import { checkPlacement } from '../constraints.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

function loadBench(name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'benchmarks', name), 'utf8'));
}

describe('Phase 3: verification agrees with solver', () => {
  test('relations_micro: every card passes checkPlacement with no hard issues', () => {
    const school = loadBench('relations_micro.json');
    const r = solve(school, { timeLimitSec: 2, seed: 9881 });
    expect(r.status).toBe('FEASIBLE');
    expect(r.stats.placed).toBeGreaterThan(0);
    const bad = [];
    for (const a of r.assignment) {
      const srcId = String(a.lessonId).replace(/#\d+$/, '');
      const v = checkPlacement(school, srcId, a.day, a.period, a.classroomId);
      if (v.hard.length > 0) bad.push({ srcId, day: a.day, period: a.period, hard: v.hard });
    }
    expect(bad).toEqual([]);
  });

  test('small_school: same agreement', () => {
    const school = loadBench('small_school.json');
    const r = solve(school, { timeLimitSec: 5, seed: 9881 });
    expect(r.status).toBe('FEASIBLE');
    const bad = [];
    for (const a of r.assignment) {
      const srcId = String(a.lessonId).replace(/#\d+$/, '');
      const v = checkPlacement(school, srcId, a.day, a.period, a.classroomId);
      if (v.hard.length > 0) bad.push({ srcId, hard: v.hard });
    }
    expect(bad).toEqual([]);
  });

  test('lab-tail span-aware: checkPlacement flags the tail slot as a class conflict', () => {
    const school = {
      schoolName: 'lab-tail-flag',
      daysPerWeek: 1, periodsPerDay: 3,
      bell: { periods: [1,2,3].map(i => ({ index: i, name: `P${i}`, short: `${i}`, isTeaching: true })) },
      bells: [],
      teachers:  [ { id: 't' } ],
      classes:   [ { id: 'c1' } ],
      classrooms:[ { id: 'r1' }, { id: 'r2' } ],
      subjects:  [ { id: 'sA' }, { id: 'sB' } ],
      lessons: [
        // A: lab double uses teacher t at P1-P2 (start card at P1, tail at P2).
        { id: 'A', subjectId: 'sA', periodsPerWeek: 2, periodsPerDay: 2, isLabDouble: true, classIds: ['c1'], teacherIds: ['t'], preferredRoomId: 'r1' },
        // B: separate lesson, SAME teacher t (teacher conflict, not class conflict).
        { id: 'B', subjectId: 'sB', periodsPerWeek: 1, periodsPerDay: 1, classIds: ['c1'], teacherIds: ['t'], preferredRoomId: 'r2' },
      ],
      cards: [
        { id: 'cardA', lessonId: 'A', day: 0, period: 1, classroomId: 'r1' },
      ],
      relations: [], settings: {}, groups: [],
    };
    // checkPlacement requires school._idx (lessonById, teacherById, etc.).
    school._idx = {
      lessonById:    Object.fromEntries(school.lessons.map(l => [l.id, l])),
      teacherById:  Object.fromEntries(school.teachers.map(t => [t.id, t])),
      classById:    Object.fromEntries(school.classes.map(c => [c.id, c])),
      classroomById:Object.fromEntries(school.classrooms.map(r => [r.id, r])),
      subjectById:  Object.fromEntries(school.subjects.map(s => [s.id, s])),
    };
    // The BUG: B at P2 (a lab tail) should be flagged "teacher already teaches"
    // (audit #3 — start-slot-only collision discovery missed the tail).
    const vTail = checkPlacement(school, 'B', 0, 2, 'r2');
    expect(vTail.hard.some(h => /already teaches/i.test(h))).toBe(true);
    // Sanity: B at P3 (outside A's span) → no teacher-conflict hard.
    const vOk = checkPlacement(school, 'B', 0, 3, 'r2');
    expect(vOk.hard.some(h => /already teaches/i.test(h))).toBe(false);
  });
});
