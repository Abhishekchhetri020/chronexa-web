// Specification check — the aSc "Test the timetable" idea.
//
// Verification asks "is the CURRENT placement valid?". This asks a different
// question: "can this FILE be solved at all?". Each class, each teacher and
// each single-room set is solved ON ITS OWN, with every other object removed.
// If one object cannot be completed even alone, no complete timetable exists,
// and that object is where the file must change. Per-card IMPOSSIBLE verdicts
// miss this: every card of a class can fit somewhere while the class as a set
// cannot (e.g. 48 lessons, 46 usable periods).
//
// Pure + synchronous per object so it runs the same in node tests and in
// spec_check_worker.js.

import { solve } from "./csp_solver.js";

export const PARTS = ["classes", "teachers", "classrooms"];

const PICK = {
  classes:    (id) => (l) => (l.classIds || []).includes(id),
  teachers:   (id) => (l) => (l.teacherIds || []).includes(id),
  // A room is tested on the lessons that can ONLY go there.
  classrooms: (id) => (l) => {
    const rooms = l._lessonRoomIds || l.roomIds || [];
    return rooms.length === 1 && rooms[0] === id;
  },
};

/** The school with only `id`'s lessons; locked cards of those lessons stay. */
export function subSchoolFor(school, part, id, { dropRelations = false } = {}) {
  const lessons = (school.lessons || []).filter(PICK[part](id));
  const ids = new Set(lessons.map((l) => l.id));
  const cards = (school.cards || []).filter((c) => c.locked && ids.has(c.lessonId));
  return { ...school, lessons, cards, relations: dropRelations ? [] : (school.relations || []) };
}

/** Objects to test, in aSc order, skipping objects that have no lessons. */
export function listObjects(school, parts = PARTS) {
  const out = [];
  for (const part of parts) {
    for (const o of school[part] || []) {
      const n = (school.lessons || []).filter(PICK[part](o.id)).length;
      if (n) out.push({ part, id: o.id, name: o.name || o.short || o.abbr || o.id, lessons: n });
    }
  }
  return out;
}

/** Solve one object alone. status: "passed" | "failed". */
export function testObject(school, obj, { timeLimitSec = 2, seed = 1, dropRelations = false } = {}) {
  const sub = subSchoolFor(school, obj.part, obj.id, { dropRelations });
  const r = solve(sub, { timeLimitSec, seed });
  const st = r.stats || {};
  const unplaced = st.unplaced | 0;
  return {
    ...obj,
    status: unplaced > 0 ? "failed" : "passed",
    relaxed: dropRelations,
    placed: st.placed | 0,
    unplaced,
    diagnostics: (r.diagnostics || []).slice(0, 8).map((d) => ({
      lessonId: d.lessonId, subjectId: d.subjectId, reason: d.reason || "", verdict: d.verdict || "",
    })),
  };
}
