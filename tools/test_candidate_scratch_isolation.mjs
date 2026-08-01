// Phase 1.1 regression test — audit finding #1 (candidateScratch alias).
// Before fix: ctx.candidateScratch is a single Int32Array shared across ALL
// backtrack() recursion frames. A recursive call while the parent is still
// iterating over `candidates` overwrites the parent's working buffer. The
// solver then reads a candidate index the parent never vetted (different
// room, wrong lesson's pool) and may apply a placement that violates the
// lesson's allowed-room invariant.
//
// Repro: 16 lessons share one teacher (forces a daily-tight chain so
// backtracking recurses deep enough) and each lesson has exactly one allowed
// room (room-by-id matching its own index). Any solver that leaks a room
// other than the lesson's own room exhibits the overwrite bug.
//
// Run: node tools/test_candidate_scratch_isolation.mjs
// Exit 0 = bug not exhibited. Exit 1 = overwrite observed (or crash).

import { solve } from "../js/solver/csp_solver.js";

const N = 16;          // lessons
const DAYS = 6;
const PERIODS = 4;     // teaching periods per day → 24 slots total

function buildSchool() {
  const subjects = [{ id: "s", name: "S", short: "S" }];
  const teachers = [{ id: "t", name: "T", abbr: "T" }];
  const classes  = [{ id: "c", name: "C", short: "C" }];
  const rooms    = [];
  for (let r = 0; r < N; r++) rooms.push({ id: `r${r}`, name: `R${r}`, short: `R${r}` });

  const bell = { periods: [] };
  for (let p = 1; p <= PERIODS; p++) {
    bell.periods.push({ index: p, name: `P${p}`, short: `${p}`, starttime: "", endtime: "", isTeaching: true });
  }

  const lessons = [];
  for (let i = 0; i < N; i++) {
    lessons.push({
      id: `l${i}`,
      subjectId: "s",
      periodsPerWeek: 1,
      periodsPerDay: 1,
      classIds: ["c"],
      teacherIds: ["t"],
      // each lesson is restricted to its own matching room
      preferredRoomId: `r${i}`,
    });
  }

  return {
    schoolName: "candidate-scratch-isolation",
    daysPerWeek: DAYS,
    periodsPerDay: PERIODS,
    bell, bells: [],
    subjects, teachers, classes, classrooms: rooms, lessons,
    relations: [],
    cards: [],
    settings: {},
  };
}

const school = buildSchool();
const result = solve(school, { timeLimitSec: 5, seed: 1234 });

const bad = [];
for (const a of result.assignment || []) {
  const lid = String(a.lessonId).replace(/#\d+$/, "");
  const idx = Number(lid.replace(/^l/, ""));
  const expectedRoom = `r${idx}`;
  if (a.classroomId !== expectedRoom && a.classroomId !== null) {
    bad.push({ lessonId: lid, gotRoom: a.classroomId, expectedRoom, day: a.day, period: a.period });
  }
}

// Also assert classroomId is never null when a preferredRoomId was set —
// the leak manifests as a null/undefined room on an otherwise placed card.
for (const a of result.assignment || []) {
  if (a.classroomId == null) bad.push({ lessonId: a.lessonId, gotRoom: null, expectedRoom: "<any>", day: a.day, period: a.period, note: "missing room" });
}

console.log(`status=${result.status} placed=${result.stats.placed}/${result.stats.placed + result.stats.unplaced} hard=${result.stats.hardConflicts}`);

if (bad.length > 0) {
  console.error(`FAIL: ${bad.length} assignment(s) used a non-permitted room (candidateScratch alias leak).`);
  for (const b of bad.slice(0, 5)) console.error(" ", b);
  process.exit(1);
}

console.log("PASS: every emitted room belongs to the lesson's permitted set.");
process.exit(0);
