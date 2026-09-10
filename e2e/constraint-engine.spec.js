import { test, expect } from '@playwright/test';
import { check } from '../js/solver/relation_enforcer.js';
import { checkPlacement } from '../js/solver/constraints.js';
import { loadDemoSchool } from './helpers.js';

function schoolFor(typ) {
  return {
    daysPerWeek: 2,
    bell: { periods: [1, 2, 3, 4, 5].map(index => ({ index, isTeaching: true })) },
    bells: [], teachers: [{ id: 'ta' }, { id: 'tb' }],
    classes: [{ id: 'ca' }, { id: 'cb' }], classrooms: [],
    subjects: [{ id: 'a' }, { id: 'b' }],
    lessons: [
      { id: 'A', subjectId: 'a', teacherIds: ['ta'], classIds: ['ca'], periodsPerWeek: 1 },
      { id: 'B', subjectId: 'b', teacherIds: ['tb'], classIds: ['cb'], periodsPerWeek: 1 },
    ],
    relations: [{ typ, subjectids: ['a'], subject2ids: ['b'] }],
    cards: [], settings: {},
  };
}

async function solveInBrowser(page, school) {
  return page.evaluate(school => new Promise((resolve, reject) => {
    const worker = new Worker('/js/solver/wasm/cp_sat_worker.js', { type: 'module' });
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('solver did not finish')); }, 30_000);
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onerror = e => { finish(); reject(new Error(e.message)); };
    worker.onmessage = ({ data }) => {
      if (data.type === 'done') { finish(); resolve(data.result); }
      if (data.type === 'error') { finish(); reject(new Error(data.message)); }
    };
    worker.postMessage({ type: 'solve', school, options: { timeLimitSec: 5, soft: false, seed: 9881 } });
  }), school);
}

test('browser CP-SAT respects subject order, spans, and optional placements', async ({ page }) => {
  await page.goto('/');
  const school = schoolFor('n_9');
  Object.assign(school.lessons[0], { isLabDouble: true, periodsPerWeek: 2 });
  const result = await solveInBrowser(page, school);
  expect(result.assignment).toHaveLength(2);
  school.cards = result.assignment;
  const a = school.cards.find(c => c.lessonId === 'A');
  const b = school.cards.find(c => c.lessonId === 'B');
  expect(a.day).toBe(b.day);
  expect(a.period + 2).toBeLessThanOrEqual(b.period);
  for (const c of school.cards) {
    expect(check(school, c.lessonId, c.day, c.period).hard).toEqual([]);
    expect(checkPlacement(school, c.lessonId, c.day, c.period, c.classroomId).hard).toEqual([]);
  }
  school.cards = [];
  Object.assign(school.lessons[0], { fixedDay: 0, fixedPeriod: 4 });
  Object.assign(school.lessons[1], { fixedDay: 0, fixedPeriod: 1 });
  const partial = await solveInBrowser(page, school);
  expect(partial.assignment).toHaveLength(1);
});

test('browser CP-SAT anchors doubles to class-bell edges without jumping breaks', async ({ page }) => {
  await page.goto('/');
  const school = schoolFor('n_16');
  school.lessons = [school.lessons[0]];
  Object.assign(school.lessons[0], { isLabDouble: true, periodsPerWeek: 2 });
  school.relations = [{ typ: 'n_16', subjectids: ['a'], positions: 'last' }];
  school.bells = [{ id: 'short', periods: [2, 3, 4].map(index => ({ index, isTeaching: true })) }];
  school.classes[0].bellId = 'short';
  const result = await solveInBrowser(page, school);
  expect(result.assignment).toHaveLength(1);
  expect(result.assignment[0].period).toBe(3);
  school.cards = result.assignment;
  expect(check(school, 'A', school.cards[0].day, 3).hard).toEqual([]);
  expect(checkPlacement(school, 'A', school.cards[0].day, 3).hard).toEqual([]);

  // With no adjacent teaching periods, even an unconstrained lab cannot fit.
  school.cards = [];
  school.relations = [];
  school.bells = [];
  school.classes[0].bellId = undefined;
  school.bell.periods = [1, 3, 5].map(index => ({ index, isTeaching: true }));
  const partial = await solveInBrowser(page, school);
  expect(partial.assignment).toHaveLength(0);
});

test('Best timetable pipeline solves the bundled demo through its worker API', async ({ page }) => {
  await loadDemoSchool(page);
  const stats = await page.evaluate(() => new Promise((resolve, reject) => {
    const source = window.SolverUI.run({
      school: window.APP.school, algorithm: 'auto', options: { timeLimitSec: 30 },
    });
    const timeout = setTimeout(() => { source.cancel(); reject(new Error('demo pipeline timed out')); }, 90_000);
    source.subscribe(event => {
      if (event.type === 'done') {
        clearTimeout(timeout);
        resolve({ ...event.result.stats, assignmentCount: event.result.assignment.length });
      } else if (event.type === 'error') {
        clearTimeout(timeout);
        source.cancel();
        reject(new Error(event.message));
      }
    });
  }));
  expect(stats.placed).toBeGreaterThan(900);
  expect(stats.assignmentCount).toBe(stats.placed);
  expect(stats.scrubbedConflicts || 0).toBe(0);
  console.log('Demo pipeline:', JSON.stringify(stats));
});
