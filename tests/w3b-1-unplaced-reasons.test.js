/**
 * W3b-1 · "why is this unplaced" — unit tests for the pending-strip reason
 * sweep. The tray must explain a blocked card with counts of the slots each
 * reason blocks (teacher busy / class busy / room busy / time-off / daily cap
 * / relation), and the per-slot verdict must come from the same classifier as
 * the drag guard (window.Placement.classify).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../js/ui/state.js";
import "../js/ui/editor/placement_validator.js";
import "../js/ui/editor/pending_strip.js";

const P = () => window.PendingStrip;

/** 2 days × 4 teaching periods = 8 candidate slots. */
function mkSchool({ lessons, cards, teachers = [], classes = [], subjects = [], globals }) {
  const S = {
    schoolName: "Reason Test School",
    daysPerWeek: 2,
    bell: {
      periods: [1, 2, 3, 4].map(i => ({ index: i, label: "P" + i })),
    },
    classes,
    teachers,
    subjects,
    lessons,
    cards,
    globals,
    _idx: {
      lessonById: Object.fromEntries(lessons.map(l => [l.id, l])),
      teacherById: Object.fromEntries(teachers.map(t => [t.id, t])),
      classById: Object.fromEntries(classes.map(c => [c.id, c])),
      subjectById: Object.fromEntries(subjects.map(s => [s.id, s])),
      classroomById: Object.fromEntries([{ id: "r1", name: "Room 1" }].map(r => [r.id, r])),
    },
  };
  window.APP = window.APP || {};
  window.APP.school = S;
  return S;
}

const CLASSES = [{ id: "c1", name: "I A" }];
const TEACHERS = [{ id: "t1", name: "Ms. A" }, { id: "t2", name: "Mr. B" }];
const SUBJECTS = [{ id: "s1", name: "Maths", abbr: "MAT" }, { id: "s2", name: "English", abbr: "ENG" }];

beforeEach(() => {
  delete window.RelationEnforcer;
});
afterEach(() => {
  delete window.RelationEnforcer;
});

describe("W3b-1 unplaced reasons — slot sweep", () => {
  it("reports 'No free slot' with per-reason slot counts when the class owns every slot", () => {
    // c1 is booked in all 8 slots by ENG → MAT can never be placed.
    const cards = [];
    for (let d = 0; d < 2; d++) for (let p = 1; p <= 4; p++) cards.push({ lessonId: "L2", day: d, period: p });
    mkSchool({
      classes: CLASSES, teachers: TEACHERS, subjects: SUBJECTS,
      lessons: [
        { id: "L1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], periodsPerWeek: 4 },
        { id: "L2", subjectId: "s2", classIds: ["c1"], teacherIds: ["t2"], periodsPerWeek: 8 },
      ],
      cards,
    });

    const why = P().explainLesson(window.APP.school, "L1");
    expect(why.total).toBe(8);
    expect(why.free).toBe(0);
    expect(why.blocked).toBe(8);
    expect(why.counts.class).toBe(8);
    expect(why.counts.teacher).toBeUndefined(); // t1 is free all week
    expect(why.summary).toContain("No free slot");
    expect(why.summary).toContain("class busy in 8");
  });

  it("counts teacher busy separately from class busy", () => {
    // t1 is busy in every slot with another class; c1 is only busy on day 0.
    const cards = [{ lessonId: "L2", day: 0, period: 1 }, { lessonId: "L2", day: 0, period: 2 }];
    mkSchool({
      classes: CLASSES, teachers: TEACHERS, subjects: SUBJECTS,
      lessons: [
        { id: "L1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], periodsPerWeek: 2 },
        { id: "L2", subjectId: "s2", classIds: ["c1"], teacherIds: ["t1"], periodsPerWeek: 2 },
      ],
      cards,
    });

    const why = P().explainLesson(window.APP.school, "L1");
    expect(why.blocked).toBe(2);
    expect(why.counts.class).toBe(2);
    expect(why.counts.teacher).toBe(2); // same teacher on both blockers
    expect(why.free).toBe(6);
    // Ties break towards the REASONS declaration order (teacher, class, room…).
    expect(why.summary).toBe("Free in 6 of 8 · blocked: teacher busy in 2, class busy in 2");
  });

  it("reports a placeable lesson as free with no blocker counts", () => {
    mkSchool({
      classes: CLASSES, teachers: TEACHERS, subjects: SUBJECTS,
      lessons: [{ id: "L1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], periodsPerWeek: 2 }],
      cards: [],
    });
    const why = P().explainLesson(window.APP.school, "L1");
    expect(why.free).toBe(8);
    expect(why.blocked).toBe(0);
    expect(why.reasons).toEqual([]);
    expect(why.summary).toBe("Free in 8 of 8");
  });
});

describe("W3b-1 unplaced reasons — supplementary reasons", () => {
  it("counts teacher daily caps exactly like csp_solver's TEACHER_MAX_PER_DAY", () => {
    // t1 may teach 1 period/day. Day 0 is used up, so day 0 is capped;
    // day 1 stays free.
    const teachers = [{ id: "t1", name: "Ms. A", maxPerDay: 1 }, { id: "t2", name: "Mr. B" }];
    const cards = [{ lessonId: "L2", day: 0, period: 1 }];
    mkSchool({
      classes: CLASSES, teachers, subjects: SUBJECTS,
      lessons: [
        { id: "L1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], periodsPerWeek: 1 },
        { id: "L2", subjectId: "s2", classIds: ["c1"], teacherIds: ["t1"], periodsPerWeek: 1 },
      ],
      cards,
    });
    const why = P().explainLesson(window.APP.school, "L1");
    expect(why.counts.dailycap).toBe(4); // every period of day 0 is over t1's cap
    expect(why.counts.class).toBe(1);    // period 1 of day 0 is ALSO class-busy
    expect(why.free).toBe(4);            // day 1 untouched
    expect(why.summary).toContain("daily cap in 4");
  });

  it("falls back to the school-wide global cap when the entity has none", () => {
    mkSchool({
      classes: CLASSES, teachers: TEACHERS, subjects: SUBJECTS,
      globals: { constraints: { classMaxPerDay: 0 } },
      lessons: [{ id: "L1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], periodsPerWeek: 1 }],
      cards: [],
    });
    const why = P().explainLesson(window.APP.school, "L1");
    expect(why.counts.dailycap).toBe(8);
    expect(why.free).toBe(0);
    expect(why.summary).toContain("No free slot");
  });

  it("counts a relation veto from RelationEnforcer.check as a 'relation' block", () => {
    // Stub the shared relation enforcer (solver_shims.js attaches the real
    // one to window in the app); only the wiring is under test here.
    window.RelationEnforcer = { check: () => ({ hard: ["cannot follow — already placed in the adjacent period"], soft: [] }) };
    mkSchool({
      classes: CLASSES, teachers: TEACHERS, subjects: SUBJECTS,
      lessons: [{ id: "L1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], periodsPerWeek: 1 }],
      cards: [],
    });
    const why = P().explainLesson(window.APP.school, "L1");
    expect(why.counts.relation).toBe(8);
    expect(why.counts.class).toBeUndefined();
    expect(why.summary).toContain("relation in 8");
  });

  it("degrades to the classifier alone when no relation module is loaded", () => {
    mkSchool({
      classes: CLASSES, teachers: TEACHERS, subjects: SUBJECTS,
      lessons: [{ id: "L1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], periodsPerWeek: 1 }],
      cards: [],
    });
    expect(window.RelationEnforcer).toBeUndefined();
    const why = P().explainLesson(window.APP.school, "L1");
    expect(why.free).toBe(8);
    expect(why.counts.relation).toBeUndefined();
  });

  it("buckets classifier messages, folding a lab's P+1 conflict into its class/teacher/room bucket", () => {
    const B = P().bucketOf;
    expect(B("class I A busy")).toBe("class");
    expect(B("teacher Ms. A busy")).toBe("teacher");
    expect(B("room Room 1 busy")).toBe("room");
    expect(B("teacher Ms. A unavailable")).toBe("timeoff");
    expect(B("room type LAB required")).toBe("roomtype");
    expect(B("I A bell has no period 5")).toBe("bell");
    expect(B("fixed day Mon")).toBe("fixed");
    expect(B("lab needs consecutive period")).toBe("lab");
    expect(B("lab P+1: class I A busy")).toBe("class");
    expect(B("lab P+1: teacher Ms. A busy")).toBe("teacher");
    expect(B("lab P+1: room Room 1 busy")).toBe("room");
    expect(B("daily cap (teacher Ms. A)")).toBe("dailycap");
    expect(B("relation: cannot follow — already placed in the adjacent period")).toBe("relation");
    expect(B("")).toBeNull();
  });
});
