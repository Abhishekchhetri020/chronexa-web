// Regression tests for the 2026-06-11 solver hardening pass.
// Node-runnable: `node js/solver/__tests__/fixes_2026-06-11.test.js`.
//
//   MC13 csp_solver.js  cards[].locked was set by the UI ("Lock", "AI → Lock
//                       all placed cells") but never read by the solver —
//                       locked cards silently moved on re-solve. Now each
//                       locked card pins one session of its lesson.
//   M8   csp_solver.js  parseWindow ran its NaN check after `|0` coercion
//                       (NaN|0 === 0), so non-numeric window bounds became
//                       "window starts at period 1" instead of "no window".
//   INC  csp_solver.js  totalSiblingDeficit / totalTeacherConsecHeavy moved
//                       from full rescans in softScore to incremental
//                       maintenance in applySingle/removeSingle — verify the
//                       counters match a brute-force recompute.

const assert = require("node:assert");
const path = require("path");
const { solve, __test_internals } = require(path.join(__dirname, "..", "csp_solver.js"));
const { buildModel, makeState, applySingle, removeSingle } = __test_internals;
const { checkPlacement } = require(path.join(__dirname, "..", "constraints.js"));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
    passed++;
  } catch (e) {
    console.log("  FAIL  " + name + "\n          " + e.message);
    failed++;
  }
}

function bell(n) {
  const periods = [];
  for (let i = 1; i <= n; i++) periods.push({ index: i, label: String(i), duration: 1 });
  return { id: "b", name: "b", periods };
}

function baseSchool() {
  return {
    schoolName: "fixes-2026-06-11",
    daysPerWeek: 5,
    bell: bell(4),
    bells: [bell(4)],
    subjects: [{ id: "sA", name: "A" }, { id: "sB", name: "B" }],
    teachers: [
      { id: "tA", name: "TA", subjects: ["sA"], timeOff: {} },
      { id: "tB", name: "TB", subjects: ["sB"], timeOff: {} },
    ],
    classes: [{ id: "cA", name: "CA", bellId: "b" }],
    classrooms: [{ id: "r1", name: "R1", tags: [] }],
    lessons: [],
    relations: [],
  };
}

// --- EMPTY_BELL_MASK: one structured warning per school ---------------------
test("EMPTY_BELL_MASK: one warning is recorded when a class bell mask is empty", () => {
  const school = baseSchool();
  school.bells = [{ id: "empty", name: "Empty", periods: [] }];
  school.classes = [{ id: "cA", name: "CA", bellId: "empty" }];
  school.lessons = [
    { id: "lA", subjectId: "sA", periodsPerWeek: 1, classIds: ["cA"], teacherIds: ["tA"] },
  ];

  const res = solve(school, { seed: 1, timeLimitSec: 5 });

  assert.strictEqual(res.stats.placed, 1, "lesson must still place with ALL-period fallback");
  assert.strictEqual(res.warnings.length, 1, "expected exactly one structured warning");
  const warning = res.warnings[0];
  assert.strictEqual(warning.ruleId, "EMPTY_BELL_MASK");
  assert.strictEqual(warning.bellId, "empty");
  assert.ok(warning.message.includes("empty mask"), `warning message must mention empty mask: ${warning.message}`);
  assert.deepStrictEqual(warning.affectedClassIds, ["cA"]);
});

test("EMPTY_BELL_MASK: school-default-bell-empty path warns with bellId=null", () => {
  const school = baseSchool();
  // Empty school default bell, no per-class bell -> the default-bell branch.
  school.bell = { id: "b", name: "b", periods: [] };
  school.bells = [{ id: "b", name: "b", periods: [] }];
  school.classes = [{ id: "cA", name: "CA" }];
  school.lessons = [
    { id: "lA", subjectId: "sA", periodsPerWeek: 1, classIds: ["cA"], teacherIds: ["tA"] },
  ];

  const res = solve(school, { seed: 1, timeLimitSec: 5 });

  assert.strictEqual(res.warnings.length, 1, "expected exactly one structured warning");
  const warning = res.warnings[0];
  assert.strictEqual(warning.ruleId, "EMPTY_BELL_MASK");
  assert.strictEqual(warning.bellId, null, "default-bell path must report bellId=null, not 'default'");
  assert.deepStrictEqual(warning.affectedClassIds, ["cA"]);
});

// --- MC13: single locked card pins its lesson -------------------------------
test("MC13: a locked card pins the lesson to that exact (day, period)", () => {
  const school = baseSchool();
  school.lessons = [
    { id: "lA", subjectId: "sA", periodsPerWeek: 1, classIds: ["cA"], teacherIds: ["tA"] },
    { id: "lB", subjectId: "sB", periodsPerWeek: 3, classIds: ["cA"], teacherIds: ["tB"] },
  ];
  // Lock lA at day 3, period 2 (1-based period, matching card shape).
  school.cards = [{ lessonId: "lA", day: 3, period: 2, locked: true }];

  const res = solve(school, { seed: 1, timeLimitSec: 5 });
  const a = res.assignment.find(x => x.lessonId === "lA");
  assert.ok(a, "lA must be placed");
  assert.strictEqual(a.day, 3, `lA must stay on day 3, got day ${a.day}`);
  assert.strictEqual(a.period, 2, `lA must stay at period 2, got period ${a.period}`);
});

// --- MC13: multi-session lesson with two locked cards ------------------------
test("MC13: two locked cards pin two sessions of a multi-session lesson", () => {
  const school = baseSchool();
  school.lessons = [
    { id: "lA", subjectId: "sA", periodsPerWeek: 3, classIds: ["cA"], teacherIds: ["tA"] },
  ];
  school.cards = [
    { lessonId: "lA", day: 4, period: 3, locked: true },
    { lessonId: "lA", day: 1, period: 1, locked: true },
  ];

  const res = solve(school, { seed: 1, timeLimitSec: 5 });
  const placed = res.assignment.filter(x => x.lessonId === "lA").map(x => x.day + "_" + x.period);
  assert.ok(placed.includes("1_1"), `expected a session at day 1 period 1, got [${placed}]`);
  assert.ok(placed.includes("4_3"), `expected a session at day 4 period 3, got [${placed}]`);
  assert.strictEqual(placed.length, 3, `all 3 sessions should place, got ${placed.length}`);
});

// --- MC13: unlocked cards do NOT pin (cold solve may move them) --------------
test("MC13: an unlocked card does not pin its lesson", () => {
  const school = baseSchool();
  school.lessons = [
    { id: "lA", subjectId: "sA", periodsPerWeek: 1, classIds: ["cA"], teacherIds: ["tA"] },
  ];
  school.cards = [{ lessonId: "lA", day: 3, period: 2, locked: false }];
  const res = solve(school, { seed: 1, timeLimitSec: 5 });
  // Must place — and buildModel must not have produced a fixed-slot pin.
  assert.strictEqual(res.stats.placed, 1, "lA must be placed");
  const { model } = (() => {
    const m = buildModel(school);
    return { model: m };
  })();
  assert.strictEqual(model.lessonFixedSlot[0], -1,
    "unlocked card must not produce a fixed slot");
});

// --- M8: parseWindow rejects non-numeric bounds ------------------------------
test("M8: non-numeric lunch window bounds produce no window (not period-1)", () => {
  const school = baseSchool();
  school.lessons = [
    { id: "lA", subjectId: "sA", periodsPerWeek: 1, classIds: ["cA"], teacherIds: ["tA"] },
  ];
  school.classes[0].constraints = { lunch_periodfrom: "abc", lunch_periodto: "3" };
  const m1 = buildModel(school);
  assert.strictEqual(m1.classLunchMask[0], 0,
    `garbage lunch window must yield mask 0, got ${m1.classLunchMask[0]}`);

  // Sanity: a valid window still parses (periods 2..3, 1-based → bits 1,2).
  school.classes[0].constraints = { lunch_periodfrom: "2", lunch_periodto: "3" };
  const m2 = buildModel(school);
  assert.strictEqual(m2.classLunchMask[0], 0b110,
    `valid window 2..3 must yield mask 0b110, got ${m2.classLunchMask[0].toString(2)}`);
});

// --- INC: incremental scorer counters match brute-force recompute ------------
test("INC: totalSiblingDeficit and totalTeacherConsecHeavy stay exact through apply/remove", () => {
  const school = baseSchool();
  school.teachers.push({ id: "tC", name: "TC", subjects: ["sA"], timeOff: {} });
  school.lessons = [
    { id: "l1", subjectId: "sA", periodsPerWeek: 4, classIds: ["cA"], teacherIds: ["tA"] },
    { id: "l2", subjectId: "sB", periodsPerWeek: 3, classIds: ["cA"], teacherIds: ["tB"] },
  ];
  const model = buildModel(school);
  const state = makeState(model);

  function bruteSibling() {
    let deficit = 0;
    for (let cs = 0; cs < model.classSubjectTarget.length; cs++) {
      const tg = model.classSubjectTarget[cs];
      const placed = state.classSubjectTotalPlaced[cs];
      if (placed < tg) deficit += tg - placed;
    }
    return deficit;
  }
  function bruteHeavy() {
    let penalty = 0;
    const D = model.days;
    for (let t = 0; t < model.teacherCount; t++) {
      const cap = model.teacherMaxPerDay[t] | 0;
      const threshold = cap > 0 ? Math.max(2, Math.floor(cap / 2)) : 5;
      for (let d = 1; d < D; d++) {
        const prev = state.teacherDayLoad[t * D + d - 1];
        const cur = state.teacherDayLoad[t * D + d];
        if (prev > threshold && cur > threshold) penalty += (prev - threshold) + (cur - threshold);
      }
    }
    return penalty;
  }

  const check = (label) => {
    assert.strictEqual(state.totalSiblingDeficit, bruteSibling(),
      label + ": sibling deficit counter diverged");
    assert.strictEqual(state.totalTeacherConsecHeavy, bruteHeavy(),
      label + ": consec-heavy counter diverged");
  };

  check("initial");
  // Apply a few placements (lesson expansion: l1 → 4 sessions idx 0..3,
  // l2 → 3 sessions idx 4..6), then remove some, checking after each step.
  applySingle(model, state, 0, 0 * model.periodsPerDay + 0, -1); check("apply#1");
  applySingle(model, state, 1, 0 * model.periodsPerDay + 1, -1); check("apply#2");
  applySingle(model, state, 4, 1 * model.periodsPerDay + 0, -1); check("apply#3");
  applySingle(model, state, 2, 1 * model.periodsPerDay + 1, -1); check("apply#4");
  removeSingle(model, state, 1, 0 * model.periodsPerDay + 1, -1); check("remove#1");
  removeSingle(model, state, 4, 1 * model.periodsPerDay + 0, -1); check("remove#2");
});

// --- HALO: checkPlacement must not flag a card as conflicting with itself --
test("HALO: a placed card does not report a phantom self-conflict (room=null + preferredRoomId)", () => {
  // A homeroom lesson (no stored room) whose lesson defines a preferredRoomId.
  // Pre-fix, the self-exclusion compared the card's classroomId (null) to the
  // preferredRoomId fallback, failed to exclude the card, and reported the
  // card teacher/class-conflicting with itself.
  const idx = (arr) => Object.fromEntries(arr.map(x => [x.id, x]));
  const school = {
    bell: { periods: [{ index: 1, isTeaching: true }, { index: 2, isTeaching: true }] },
    subjects: [{ id: "s1", name: "Chem", abbr: "Ch" }],
    teachers: [{ id: "t1", name: "Gaurav" }],
    classes: [{ id: "c1", name: "X A" }],
    classrooms: [{ id: "lab1", name: "Lab 1", roomType: "lab" }],
    lessons: [{ id: "L1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], preferredRoomId: "lab1" }],
    // The placed card carries NO room (homeroom) even though the lesson has a
    // preferredRoomId — exactly the mismatch that broke self-exclusion.
    cards: [{ lessonId: "L1", day: 0, period: 1, classroomId: null }],
  };
  school._idx = {
    lessonById: idx(school.lessons), subjectById: idx(school.subjects),
    teacherById: idx(school.teachers), classById: idx(school.classes),
    classroomById: idx(school.classrooms),
  };
  const r = checkPlacement(school, "L1", 0, 1, null);
  assert.strictEqual((r.hard || []).length, 0,
    `card must not self-conflict; got: ${JSON.stringify(r.hard)}`);

  // Sanity: a genuine teacher conflict (two different lessons, same teacher,
  // same slot) IS still detected.
  school.lessons.push({ id: "L2", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"] });
  school._idx.lessonById = idx(school.lessons);
  school.cards.push({ lessonId: "L2", day: 0, period: 1, classroomId: null });
  const r2 = checkPlacement(school, "L1", 0, 1, null);
  assert.ok((r2.hard || []).length > 0, "a real same-teacher same-slot conflict must still flag");
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
