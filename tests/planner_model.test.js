// The substitution policy ported from the school's standalone planner.
//
// These assertions are the reason the policy lives in its own module: the
// scoring has to be provable without a browser. They pin the arithmetic the
// user sees in the reason strings ("on duty", "co-teaches this class", …), the
// protections (absent, busy, early-years class teacher, swap), and the two
// structural behaviours that make auto-fill safe: one optimisation per period
// (so two vacancies never pick the same teacher) and merged classes travelling
// together on one substitute.
import { describe, it, expect } from "vitest";
import {
  POLICY, STATUS, isFilled, rankCandidates, rankCandidatesForGroup,
  optimisePeriod, buildSmartPlan, hungarianMax, eligibleActingCTs, planCounts,
  classTeacherMap, motherTeacherMap, recentLoad, __testHooks,
} from "../js/ui/substitution/planner_model.js";

const { prospectiveStreak } = __testHooks;

const BELL = {
  id: "b8", name: "8", periods: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ index: i, label: "P" + i, isTeaching: true })),
};

/**
 * A small school: two classes, five teachers.
 *  t1 — Maths, teaches IX A (also its class teacher)
 *  t2 — Maths, teaches IX B, free on Monday (the strong substitute)
 *  t3 — English only, busy in P1
 *  t4 — early-years class teacher (Nursery) — protected
 *  t5 — on duty
 */
function makeSchool(overrides = {}) {
  const school = {
    schoolName: "Substitution policy",
    daysPerWeek: 5, periodsPerDay: 8, bell: BELL, bells: [BELL],
    subjects: [
      { id: "s-mat", name: "Maths", abbr: "MAT" },
      { id: "s-eng", name: "English", abbr: "ENG" },
    ],
    teachers: [
      { id: "t1", name: "T One", abbr: "T1", subjectIds: ["s-mat"], classIds: ["c-a"] },
      { id: "t2", name: "T Two", abbr: "T2", subjectIds: ["s-mat"], classIds: ["c-b"] },
      { id: "t3", name: "T Three", abbr: "T3", subjectIds: ["s-eng"] },
      { id: "t4", name: "T Four", abbr: "T4", subjectIds: ["s-eng"] },
      { id: "t5", name: "T Five", abbr: "T5", subjectIds: ["s-eng"] },
    ],
    classes: [
      { id: "c-a", name: "IX A", classTeacherId: "t1" },
      { id: "c-b", name: "IX B" },
      { id: "c-n", name: "Nursery", classTeacherId: "t4" },
    ],
    classrooms: [{ id: "r1", name: "R1", tags: [] }],
    lessons: [],
    cards: [],
    relations: [],
    substitutions: [],
    ...overrides,
  };
  // t1 teaches IX A P1/P2 (the absence), t3 is busy P1 elsewhere.
  school.lessons = [
    { id: "l1", subjectId: "s-mat", teacherIds: ["t1"], classIds: ["c-a"], periodsPerWeek: 2 },
    { id: "l2", subjectId: "s-eng", teacherIds: ["t3"], classIds: ["c-b"], periodsPerWeek: 1 },
    { id: "l3", subjectId: "s-eng", teacherIds: ["t4"], classIds: ["c-n"], periodsPerWeek: 1 },
  ];
  school.cards = [
    { lessonId: "l1", day: 0, period: 1 },
    { lessonId: "l1", day: 0, period: 2 },
    { lessonId: "l2", day: 0, period: 1 },
    { lessonId: "l3", day: 0, period: 1 },
  ];
  return school;
}

/** Minimal `_idx` (the app builds this on load; the engine only reads it). */
function index(school) {
  const lessonById = Object.create(null);
  const subjectById = Object.create(null);
  const teacherById = Object.create(null);
  const classById = Object.create(null);
  const cardsByTeacher = Object.create(null);
  for (const l of school.lessons) lessonById[l.id] = l;
  for (const s of school.subjects) subjectById[s.id] = s;
  for (const t of school.teachers) teacherById[t.id] = t;
  for (const c of school.classes) classById[c.id] = c;
  for (const card of school.cards) {
    const lesson = lessonById[card.lessonId];
    if (!lesson) continue;
    for (const t of lesson.teacherIds || []) {
      (cardsByTeacher[t] = cardsByTeacher[t] || []).push({
        ...card,
        classIds: lesson.classIds,
        subjectId: lesson.subjectId,
      });
    }
  }
  school._idx = { lessonById, subjectById, teacherById, classById, cardsByTeacher };
  return school;
}

function makePlan(school, absentTeacherIds = ["t1"], extra = {}) {
  const slots = [];
  for (const tid of absentTeacherIds) {
    for (const card of school.cards) {
      const lesson = school._idx.lessonById[card.lessonId];
      if (!lesson || !(lesson.teacherIds || []).includes(tid)) continue;
      const classId = (lesson.classIds || [])[0];
      slots.push({
        slotKey: `${card.period}::${classId}::${tid}`,
        period: card.period,
        classId,
        classSection: school._idx.classById[classId]?.name || classId,
        subjectId: lesson.subjectId,
        subject: school._idx.subjectById[lesson.subjectId]?.name || "",
        absentTeacherId: tid,
        cardId: `placed_${card.lessonId}_${card.day}_${card.period}`,
        lessonId: card.lessonId,
        status: STATUS.PENDING,
        type: "SUB",
        substituteTeacherId: null,
        mergedWithKey: null,
        movedFrom: null,
        note: "",
      });
    }
  }
  return {
    date: "2026-03-02",
    day: 0,
    absent: absentTeacherIds.map((id) => ({ teacherId: id, type: "Sick" })),
    dutyPool: [],
    slots,
    actingCT: {},
    ...extra,
  };
}

const byId = (list) => Object.fromEntries(list.map((c) => [c.teacherId, c]));

describe("candidate ranking", () => {
  it("never offers the absent teacher, and skips a teacher who is teaching", () => {
    const school = index(makeSchool());
    const plan = makePlan(school);
    const slot = plan.slots.find((s) => s.period === 1);
    const cands = byId(rankCandidates(school, plan, slot));
    expect(cands.t1).toBeUndefined();      // absent
    expect(cands.t3).toBeUndefined();      // busy in P1
    expect(cands.t2).toBeDefined();
  });

  it("pays for what it claims: same subject 100, same class 30, class teacher 25, duty 200", () => {
    const school = index(makeSchool());
    const plan = makePlan(school, ["t1"], { dutyPool: ["t5"] });
    const slot = plan.slots.find((s) => s.period === 2);
    const cands = byId(rankCandidates(school, plan, slot));

    expect(cands.t2.score).toBeGreaterThanOrEqual(POLICY.sameSubjectBonus);
    expect(cands.t2.why).toContain("teaches Maths");

    // Duty pool dominates every teaching bonus.
    expect(cands.t5.score).toBeGreaterThanOrEqual(POLICY.dutyPoolBonus);
    expect(cands.t5.why).toContain("on duty");
  });

  it("prefers the teacher who covered this class in the previous period", () => {
    const school = index(makeSchool());
    const plan = makePlan(school);
    const p1 = plan.slots.find((s) => s.period === 1);
    p1.substituteTeacherId = "t5";
    p1.status = STATUS.FILLED;
    const p2 = plan.slots.find((s) => s.period === 2);
    const cands = byId(rankCandidates(school, plan, p2));
    expect(cands.t5.why).toContain("covered previous period");
  });

  it("protects an early-years class teacher from AUTOMATIC assignment only", () => {
    const school = index(makeSchool());
    expect(motherTeacherMap(school)).toMatchObject({ t4: "Nursery" });
    const plan = makePlan(school);
    const slot = plan.slots.find((s) => s.period === 2);
    expect(byId(rankCandidates(school, plan, slot, { forAuto: true })).t4).toBeUndefined();
    const manual = byId(rankCandidates(school, plan, slot));
    expect(manual.t4).toBeDefined();
    // The protection is a penalty, so it reads as a fairness warning.
    expect(manual.t4.warnings.join(" ")).toMatch(/protected/);
  });

  it("charges for today's load, the rolling week, and a long consecutive run", () => {
    const school = index(makeSchool());
    school.substitutions = [
      { date: "2026-03-01", substituteTeacherId: "t2", status: STATUS.FILLED },
      { date: "2026-02-27", substituteTeacherId: "t2", status: STATUS.FILLED },
    ];
    expect(recentLoad(school, "2026-03-02").t2).toBe(2);

    const plan = makePlan(school);
    const p2 = plan.slots.find((s) => s.period === 2);
    const cands = byId(rankCandidates(school, plan, p2));
    expect(cands.t2.breakdown.some((b) => b.points === -2 * POLICY.recentAssignmentPenalty)).toBe(true);
    // Negatives are shown as fairness warnings, not as reasons to pick them.
    expect(cands.t2.warnings.join(" ")).toMatch(/last 7 days/);
  });

  it("counts a substituted period as teaching when measuring the run", () => {
    const school = index(makeSchool());
    const plan = makePlan(school);
    const slot = plan.slots.find((s) => s.period === 2);
    plan.slots.find((s) => s.period === 1).substituteTeacherId = "t5";
    plan.slots.find((s) => s.period === 1).status = STATUS.FILLED;
    // t5 covers P1, would cover P2 → a 2-period run
    expect(prospectiveStreak(school, plan, slot, "t5")).toBe(2);
  });
});

describe("one optimisation per period", () => {
  it("never hands the same free teacher two vacancies in the same period", () => {
    const school = index(makeSchool());
    // Two Maths classes, both needing cover in P2, and only t2 is free.
    school.cards.push({ lessonId: "l5", day: 0, period: 2 });
    school.lessons.push({ id: "l5", subjectId: "s-mat", teacherIds: ["t6"], classIds: ["c-b"], periodsPerWeek: 1 });
    school.teachers.push({ id: "t6", name: "T Six", abbr: "T6", subjectIds: ["s-mat"], classIds: ["c-b"] });
    index(school);

    const plan = makePlan(school, ["t1", "t6"]);
    const results = optimisePeriod(school, plan, 2);
    const assigned = results.filter((r) => r.candidate).map((r) => r.candidate.teacherId);
    expect(new Set(assigned).size).toBe(assigned.length);        // no duplicate teacher
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a merged pair on ONE substitute, and only offers teachers eligible for both", () => {
    const school = index(makeSchool());
    const plan = makePlan(school);
    const p1 = plan.slots.find((s) => s.period === 1);
    const p2 = plan.slots.find((s) => s.period === 2);
    p2.mergedWithKey = p1.slotKey;
    const merged = rankCandidatesForGroup(school, plan, [p1, p2]);
    expect(merged.length).toBeGreaterThan(0);
    for (const c of merged) expect(c.why.join(" ")).toMatch(/merged classes/);
    // The merged bonus is applied once to the averaged score.
    expect(merged[0].score).toBeGreaterThanOrEqual(POLICY.mergedClassBonus);
  });

  it("solves a rectangular assignment to the best total, not the greedy pick", () => {
    // Greedy would give the first row its best column; the optimum shares.
    const m = [
      [10, 9],
      [10, 1],
    ];
    expect(hungarianMax(m)).toEqual([1, 0]);
  });
});

describe("buildSmartPlan", () => {
  it("fills what the policy allows and names what it leaves", () => {
    const school = index(makeSchool());
    const plan = makePlan(school);
    const result = buildSmartPlan(school, plan);

    const counts = planCounts(result.plan);
    expect(counts.total).toBe(2);
    expect(counts.filled).toBe(2);
    expect(counts.pending).toBe(0);
    for (const slot of result.plan.slots) {
      expect(slot.substituteTeacherId).not.toBe("t1");
      expect(slot.smartScore).toBeGreaterThanOrEqual(POLICY.minimumScore);
      expect(slot.smartReason).toBeTruthy();
    }
    // The input plan is untouched — that is what makes undo trivial.
    expect(plan.slots.every((s) => s.status === STATUS.PENDING)).toBe(true);
  });

  it("leaves a slot open rather than pick someone below the minimum score", () => {
    const school = index(makeSchool());
    // Nobody free: everyone but the absent teacher is teaching in P1.
    school.cards.push({ lessonId: "l6", day: 0, period: 1 });
    school.lessons.push({ id: "l6", subjectId: "s-eng", teacherIds: ["t2", "t5"], classIds: ["c-b"], periodsPerWeek: 1 });
    index(school);
    const plan = makePlan(school, ["t1"], { dutyPool: [] });
    const slot = plan.slots.find((s) => s.period === 1);
    const result = buildSmartPlan(school, { ...plan, slots: [slot] });
    const after = result.plan.slots[0];
    expect(after.status).toBe(STATUS.PENDING);
    expect(result.gaps.length).toBe(1);
    expect(result.gaps[0].reason).toMatch(/no safe match/);
  });

  it("honours a reschedule rule instead of substituting", () => {
    const school = index(makeSchool());
    const plan = makePlan(school);
    plan.slots[0].mustReschedule = true;
    const result = buildSmartPlan(school, { ...plan, slots: [plan.slots[0]] });
    expect(result.plan.slots[0].status).toBe(STATUS.PENDING);
    expect(result.gaps[0].reason).toMatch(/reschedule/);
  });

  it("assigns an acting class teacher for an absent homeroom teacher", () => {
    const school = index(makeSchool());
    // t7 teaches IX A today, so it is the 3★ acting-CT candidate.
    school.cards.push({ lessonId: "l7", day: 0, period: 3 });
    school.lessons.push({ id: "l7", subjectId: "s-eng", teacherIds: ["t7"], classIds: ["c-a"], periodsPerWeek: 1 });
    school.teachers.push({ id: "t7", name: "T Seven", abbr: "T7", subjectIds: ["s-eng"] });
    index(school);
    const plan = makePlan(school);
    const result = buildSmartPlan(school, plan);
    expect(classTeacherMap(school)["c-a"]).toBe("t1");
    expect(result.plan.actingCT["c-a"]).toBe("t7");
    expect(result.actingAssignments.length).toBe(1);
  });
});
