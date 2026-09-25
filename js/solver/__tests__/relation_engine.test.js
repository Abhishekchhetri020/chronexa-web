import { describe, test, expect, vi } from 'vitest';
import { solve, __test_internals } from '../csp_solver.js';
import { check } from '../relation_enforcer.js';
import { checkPlacement } from '../constraints.js';

function relationSchool(typ = 'n_9') {
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

describe('same day, in order (n_9)', () => {
  // Lane W2-7: these solver assertions used a wall-clock time limit
  // (timeLimitSec: 0.1), which made them load-sensitive — on a busy machine the
  // 30 ms backtracking slice (0.1 s x btShare 0.3) is spent inside buildModel,
  // the driver bails before its first run and solve() returns placed: 0. The
  // node cap keeps the same "solve this instance" assertion but bounds the
  // search by nodes, so a fixed seed is reproducible under any load.
  const SOLVER_NODE_CAP = 20000;

  test.each([false, true])('rejects reversed, overlapping and cross-day partners (leader placed first: %s)', leaderFirst => {
    const school = relationSchool();
    school.lessons[0].isLabDouble = true;
    school.lessons[0].periodsPerWeek = 2;
    const model = __test_internals.buildModel(school);
    for (const [aDay, aPeriod, bDay, bPeriod, allowed] of [
      [0, 1, 0, 3, true], [0, 1, 0, 5, true],
      [0, 1, 0, 2, false], [0, 3, 0, 1, false], [0, 1, 1, 3, false],
    ]) {
      const state = __test_internals.makeState(model);
      const aSlot = aDay * model.periodsPerDay + aPeriod - 1;
      const bSlot = bDay * model.periodsPerDay + bPeriod - 1;
      const placed = leaderFirst ? 0 : 1;
      state.lessonAssigned[placed] = 1;
      state.lessonAssignedSlot[placed] = leaderFirst ? aSlot : bSlot;
      const reason = __test_internals.canPlace(model, state, 1 - placed, leaderFirst ? bSlot : aSlot, -1);
      expect(reason === null).toBe(allowed);
      school.cards = [{ lessonId: leaderFirst ? 'A' : 'B', day: leaderFirst ? aDay : bDay, period: leaderFirst ? aPeriod : bPeriod }];
      expect(check(school, leaderFirst ? 'B' : 'A', leaderFirst ? bDay : aDay, leaderFirst ? bPeriod : aPeriod).hard.length === 0).toBe(allowed);
    }
  });

  test('scopes both subject sets to the selected classes', () => {
    const school = relationSchool();
    school.relations[0].classids = ['ca'];
    school.cards = [{ lessonId: 'A', day: 0, period: 4 }];
    expect(check(school, 'B', 0, 1).hard).toEqual([]);
  });

  test('honours legacy two-subject encoding and includes partners in domain invalidation', () => {
    const school = relationSchool();
    school.relations = [{ typ: 'n_9', subjectids: ['a', 'b'] }];
    const model = __test_internals.buildModel(school);
    expect([...model.lessonNeighborFlat]).toEqual([1, 0]);
    school.cards = [{ lessonId: 'A', day: 0, period: 4 }];
    expect(check(school, 'B', 0, 1).hard.length).toBeGreaterThan(0);
  });

  test('never returns two fixed cards that contradict the order', () => {
    const school = relationSchool();
    Object.assign(school.lessons[0], { fixedDay: 0, fixedPeriod: 4 });
    Object.assign(school.lessons[1], { fixedDay: 0, fixedPeriod: 1 });
    const result = solve(school, { maxNodes: SOLVER_NODE_CAP, useLNS: false });
    expect(result.stats.placed).toBe(1);
  });

  test('places a complete timetable even when the clock is already past any time budget', () => {
    // Loaded-machine failure, reproduced without load: every clock read reports
    // a moment far beyond any timeLimitSec, so a wall-clock-bounded solver bails
    // before its first run and answers placed: 0. Node-capped mode never reads
    // the clock for its budget, so the answer is the same as on an idle machine.
    let ticks = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (ticks += 1) * 60_000);
    try {
      const school = relationSchool();
      const result = solve(school, { seed: 42, maxNodes: SOLVER_NODE_CAP });
      expect(result.stats.placed).toBe(2);
      school.cards = result.assignment;
      for (const card of school.cards) expect(check(school, card.lessonId, card.day, card.period).hard).toEqual([]);
    } finally {
      clock.mockRestore();
    }
    expect(ticks).toBeGreaterThan(0);
  });

  test.each([1, 7, 42, 9881])('finds a complete ordered timetable with seed %s', seed => {
    const school = relationSchool();
    const result = solve(school, { seed, maxNodes: SOLVER_NODE_CAP });
    expect(result.stats.placed).toBe(2);
    school.cards = result.assignment;
    for (const card of school.cards) expect(check(school, card.lessonId, card.day, card.period).hard).toEqual([]);
  });
});

describe('first/last teaching period (n_16)', () => {
  test.each([
    ['first', false, [2]], ['last', false, [5]], [undefined, false, [2, 5]],
    ['first', true, [2]], ['last', true, [4]], [undefined, true, [2, 4]],
  ])('respects sparse class bells: %s, double=%s', (positions, double, expected) => {
    const school = relationSchool('n_16');
    school.bells = [{ id: 'short', periods: [2, 3, 4, 5].map(index => ({ index, isTeaching: true })) }];
    school.classes[0].bellId = 'short';
    school.relations = [{ typ: 'n_16', subjectids: ['a'], positions }];
    Object.assign(school.lessons[0], { isLabDouble: double, periodsPerWeek: double ? 2 : 1 });
    const model = __test_internals.buildModel(school);
    const state = __test_internals.makeState(model);
    const accepted = [];
    for (let period = 1; period <= 5; period++) {
      if (__test_internals.canPlace(model, state, 0, period - 1, -1) === null) accepted.push(period);
      if (period >= 2 && period + (double ? 1 : 0) <= 5) {
        expect(check(school, 'A', 0, period).hard.length === 0).toBe(expected.includes(period));
      }
    }
    expect(accepted).toEqual(expected);
  });

  test('intersects conflicting first-only and last-only requirements', () => {
    const school = relationSchool('n_16');
    school.relations = ['first', 'last'].map(positions => ({ typ: 'n_16', subjectids: ['a'], positions }));
    const model = __test_internals.buildModel(school);
    const state = __test_internals.makeState(model);
    for (let p = 0; p < 5; p++) expect(__test_internals.canPlace(model, state, 0, p, -1)).not.toBeNull();
  });
});

describe('editor placement verification', () => {
  test('checks plain SchoolData and rejects non-teaching slots as hard constraints', () => {
    const school = relationSchool();
    school.bell.periods[1].isTeaching = false;
    expect(checkPlacement(school, 'A', 0, 2).hard.length).toBeGreaterThan(0);
    expect(checkPlacement(school, 'missing', 0, 1).hard).toContain('Unknown lesson');
  });

  test('checks the full lab span against class bells and teacher time off', () => {
    const school = relationSchool();
    Object.assign(school.lessons[0], { isLabDouble: true, periodsPerWeek: 2 });
    school.teachers[0].timeOff = { '0_2': 'unavailable' };
    expect(checkPlacement(school, 'A', 0, 1).hard.some(h => /unavailable/.test(h))).toBe(true);
    school.teachers[0].timeOff = { '0_2': 'preferred' };
    expect(checkPlacement(school, 'A', 0, 1).soft.some(h => /prefers/.test(h))).toBe(true);
    school.bells = [{ id: 'short', periods: [{ index: 1, isTeaching: true }] }];
    school.classes[0].bellId = 'short';
    expect(checkPlacement(school, 'A', 0, 1).hard.length).toBeGreaterThan(0);
  });
});
