// Regression tests for the Codex audit fixes (2026-05-23):
//   Bug 1  required-room-type fallback to [-1] no longer silently bypassed.
//   Bug 2  inferPeriodsPerDay returns max p.index, not teaching count.
//   Bug 3  exportFromTemplate replaces all entity blocks, not just cards.
//   Bug 7  Two-subject relations honor subject2ids.
//   Bug 8  HTML export uses (period-1) as 0-based column.
//
// Usage:  node tools/test_codex_fixes.mjs
// Exit:   0 on green, 1 on red.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");
const require_   = createRequire(import.meta.url);

const { JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window    = dom.window;
globalThis.document  = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;

const solverUrl = pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href;
const { solve, __test_internals } = await import(solverUrl);
const { buildModel } = __test_internals;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

// ────────────────────────────────────────────────────────────────────
// Bug 1 — requiredRoomType with no matching rooms is HARD-infeasible,
// not silently placed in no-room.
// ────────────────────────────────────────────────────────────────────
{
  const school = {
    schoolName: "lab needs room",
    daysPerWeek: 1,
    bell: { periods: [{ index: 1, label: "P1", isTeaching: true }] },
    teachers:  [{ id: "T1", name: "T", timeOff: {} }],
    subjects:  [{ id: "S_LAB", name: "Lab" }],
    classes:   [{ id: "C1", name: "VII" }],
    classrooms: [], // NO rooms at all
    groups: [],
    lessons: [
      { id: "L_LAB", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S_LAB",
        groupIds: [], periodsPerWeek: 1, requiredRoomType: "lab" },
    ],
    cards: [],
  };
  const res = await solve(school, { warmStart: true, timeLimitSec: 1 });
  const placed = res.assignment.length;
  const hardRoom = res.violations.filter(v => v.ruleId === "HARD_required_room_type").length;
  check(
    "Bug 1 — lab lesson with no matching room is NOT placed",
    placed === 0,
    `placed=${placed}; expected 0`
  );
  check(
    "Bug 1 — violation surfaces as HARD_required_room_type",
    hardRoom === 1,
    `violations: ${JSON.stringify(res.violations.map(v => v.ruleId))}`
  );
}

// ────────────────────────────────────────────────────────────────────
// Bug 2 — bell schedule with a gap (break period). inferPeriodsPerDay
// must return max index (5), not teaching count (4). The largest valid
// period must be reachable.
// ────────────────────────────────────────────────────────────────────
{
  const school = {
    schoolName: "bell gap",
    daysPerWeek: 1,
    bell: { periods: [
      { index: 1, label: "P1", isTeaching: true },
      { index: 2, label: "P2", isTeaching: true },
      { index: 3, label: "BREAK", isTeaching: false },
      { index: 4, label: "P4", isTeaching: true },
      { index: 5, label: "P5", isTeaching: true },
    ]},
    teachers: [{ id: "T1", name: "T", timeOff: {} }],
    subjects: [{ id: "S1", name: "S" }],
    classes:  [{ id: "C1", name: "VII" }],
    classrooms: [],
    groups: [],
    lessons: [
      { id: "L1", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S1",
        groupIds: [], periodsPerWeek: 1 },
    ],
    cards: [
      // Pin to P5 — the last bell index, beyond the teaching count.
      { lessonId: "L1", day: 0, period: 5, classroomId: null },
    ],
  };
  const model = buildModel(school);
  check(
    "Bug 2 — periodsPerDay returns max p.index (5), not teaching count (4)",
    model.periodsPerDay === 5,
    `got ${model.periodsPerDay}`
  );
  const res = await solve(school, { warmStart: true, timeLimitSec: 1 });
  check(
    "Bug 2 — lesson at P5 (above teaching count) actually gets placed",
    res.assignment.length === 1 && res.assignment[0].period === 5,
    "got " + JSON.stringify(res.assignment)
  );
}

// ────────────────────────────────────────────────────────────────────
// Bug 7 — n_5 (must-follow) relation that lists subject2ids must couple
// the B-side lessons too. Previously subject2ids was silently ignored
// and the relation became one-sided.
// ────────────────────────────────────────────────────────────────────
{
  // Two subjects in the SAME class. n_5 says S_A must be followed by
  // S_B in the next period of the same day. With subject2ids honored,
  // both A and B participate; without, only A's matched set is used and
  // canPlace's RELATION_MUST_FOLLOW never fires when B is placed first.
  const school = {
    schoolName: "n_5 subject2ids",
    daysPerWeek: 1,
    bell: { periods: [
      { index: 1, label: "P1", isTeaching: true },
      { index: 2, label: "P2", isTeaching: true },
      { index: 3, label: "P3", isTeaching: true },
    ]},
    teachers: [
      { id: "T_A", name: "A", timeOff: {} },
      { id: "T_B", name: "B", timeOff: {} },
    ],
    subjects: [{ id: "S_A", name: "A" }, { id: "S_B", name: "B" }],
    classes: [{ id: "C1", name: "VII" }],
    classrooms: [],
    groups: [],
    lessons: [
      { id: "L_A", classIds: ["C1"], teacherIds: ["T_A"], subjectId: "S_A",
        groupIds: [], periodsPerWeek: 1 },
      { id: "L_B", classIds: ["C1"], teacherIds: ["T_B"], subjectId: "S_B",
        groupIds: [], periodsPerWeek: 1 },
    ],
    cards: [],
    relations: [
      // n_5: subject A must be adjacent to subject B. Use subject2ids
      // for the B-side (UI contract).
      {
        typ: "n_5",
        subjectids: ["S_A"],
        subject2ids: ["S_B"],
        classids: ["C1"],
        disabled: false,
      },
    ],
  };
  const model = buildModel(school);
  // After the fix, lessonMustFollowAny for L_A should include L_B's
  // index (and vice versa). Verify via the model field that holds them.
  const aIdx = model.lessons.findIndex(l => l.srcId === "L_A");
  const bIdx = model.lessons.findIndex(l => l.srcId === "L_B");
  const aPart = model.lessonMustFollowAny && model.lessonMustFollowAny[aIdx];
  const bPart = model.lessonMustFollowAny && model.lessonMustFollowAny[bIdx];
  check(
    "Bug 7 — subject2ids couples B-side lessons into n_5 partner set",
    aPart && aPart.has(bIdx) && bPart && bPart.has(aIdx),
    `aPart=${aPart ? [...aPart] : null} bPart=${bPart ? [...bPart] : null}`
  );
}

// ────────────────────────────────────────────────────────────────────
// Bug 8 — HTML export uses 0-based grid index, but card.period is
// 1-based. Without -1, period 1 lands in column index 1 (not 0), and
// the last period is dropped. We test the helper directly via the
// global APP exposed by loading the IIFE.
// ────────────────────────────────────────────────────────────────────
{
  globalThis.window.APP = { school: {
    schoolName: "html export",
    classes: [{ id: "C1", name: "VII A" }],
    teachers: [{ id: "T1", name: "T", short: "T" }],
    subjects: [{ id: "S1", name: "Math", short: "Math" }],
    classrooms: [],
    bell: { periods: [
      { index: 1, label: "P1", isTeaching: true },
      { index: 2, label: "P2", isTeaching: true },
      { index: 3, label: "P3", isTeaching: true },
    ]},
    lessons: [{ id: "L1", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S1" }],
    cards: [
      // P1 should land in column 0 (first body cell after the day th).
      // P3 in column 2. Before the fix, P1 → column 1, P3 → dropped.
      { lessonId: "L1", day: 0, period: 1, classroomId: null },
      { lessonId: "L1", day: 0, period: 3, classroomId: null },
    ],
  }};
  const src = fs.readFileSync(path.join(repoRoot, "js/ui/io/export_html.js"), "utf8");
  vm.runInThisContext(src, { filename: "export_html.js" });
  const html = globalThis.window.APP.io.buildHtmlExport(globalThis.window.APP.school);
  const monRow = html.match(/<th class="day">Mon<\/th>([\s\S]*?)<\/tr>/);
  if (!monRow) {
    check("Bug 8 — HTML export rendered a Monday row", false, "no Mon row found");
  } else {
    const row = monRow[1];
    const mathPos = row.indexOf("Math");
    const firstEmpty = row.indexOf('class="pp-cell-empty"');
    check(
      "Bug 8 — period 1 card lands in the FIRST column (not second)",
      mathPos >= 0 && (firstEmpty < 0 || mathPos < firstEmpty),
      `mathPos=${mathPos} firstEmpty=${firstEmpty}`
    );
    const mathCount = (row.match(/Math/g) || []).length;
    check(
      "Bug 8 — last-period card is not dropped",
      mathCount >= 2,
      `Math appearances in Mon row: ${mathCount} (expected 2)`
    );
  }
}

// ────────────────────────────────────────────────────────────────────
// Bug 3 — exportFromTemplate replaces teachers/lessons blocks too.
// ────────────────────────────────────────────────────────────────────
{
  // Tiny XML with one teacher; rename it in-memory; export; check that
  // the new name appears (and the old name doesn't).
  const sourceXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<timetable importtype="database" defaultexport="1" displayname="Test" displaycountries="">\n' +
    '  <teachers options="canadd,export:silent" columns="id,name,short,gender,color,email,mobile,partner_id,firstname,lastname">\n' +
    '    <teacher id="T1" name="Old Name" short="ON" gender="" color="" email="" mobile="" partner_id="" firstname="" lastname=""/>\n' +
    '  </teachers>\n' +
    '  <cards options="canadd,export:silent" columns="lessonid,period,days,weeks,terms,classroomids"/>\n' +
    '</timetable>\n';
  globalThis.window.APP = { school: {
    schoolName: "Test",
    teachers: [{ id: "T1", name: "New Name", short: "NN" }],
    subjects: [], classes: [], classrooms: [], lessons: [], cards: [],
    _meta: { sourceText: sourceXml, sourceFilename: "test.xml" },
  }};
  // Load the export module
  const exportSrc = fs.readFileSync(path.join(repoRoot, "js/ui/io/export_timetable_xml.js"), "utf8");
  vm.runInThisContext(exportSrc, { filename: "export_timetable_xml.js" });
  const APP = globalThis.window.APP;
  const out = APP.io.exportFromTemplate(APP.school);
  check(
    "Bug 3 — exportFromTemplate emits new teacher name",
    out.includes('name="New Name"') && !out.includes('name="Old Name"'),
    "out missing 'New Name' or still contains 'Old Name'"
  );
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
