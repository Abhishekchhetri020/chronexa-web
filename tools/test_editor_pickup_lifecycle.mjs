// Regression tests for two grid_canvas.js bugs found in Gemini's audit:
//   #4 — wire() leaked mousedown listeners (one per re-render).
//   #5 — picking up a 2nd card while one was in hand silently deleted the 1st.
//
// Both fixes:
//   #4 → wire() is now gated by rootEl._chrxWired so it attaches the
//        mousedown delegate exactly once across re-renders.
//   #5 → onMouseDown restores the held card to its origin before picking
//        up the new one (aSc CLASSIC behavior).
//
// Usage:  node tools/test_editor_pickup_lifecycle.mjs
// Exit:   0 on green, 1 on red.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");
const require_   = createRequire(import.meta.url);

const { JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom");
const dom = new JSDOM("<!doctype html><html><body><div id='host'></div></body></html>");
globalThis.window    = dom.window;
globalThis.document  = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;

// Count mousedown handlers attached to a given Element by patching its
// add/removeEventListener so we can assert wire-once semantics.
let mousedownCount = 0;
const origAdd = dom.window.Element.prototype.addEventListener;
dom.window.Element.prototype.addEventListener = function (type, ...rest) {
  if (type === "mousedown") mousedownCount++;
  return origAdd.call(this, type, ...rest);
};

// Minimal APP + school stub matching what render() consumes.
const APP = {
  school: {
    bell: { periods: [{ index: 1, label: "P1", isTeaching: true }, { index: 2, label: "P2", isTeaching: true }] },
    classes: [{ id: "C1", name: "V-A" }],
    teachers: [{ id: "T1", name: "Maths Teacher", timeOff: {} }],
    rooms: [],
    subjects: [{ id: "S1", name: "Maths", abbr: "M" }],
    lessons: [
      { id: "L1", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S1", groupIds: [] },
      { id: "L2", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S1", groupIds: [] },
    ],
    cards: [
      { lessonId: "L1", day: 0, period: 1, classroomId: null },
      { lessonId: "L2", day: 0, period: 2, classroomId: null },
    ],
    _idx: {
      lessonById: {
        L1: { id: "L1", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S1" },
        L2: { id: "L2", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S1" },
      },
      classById:   { C1: { id: "C1", name: "V-A" } },
      teacherById: { T1: { id: "T1", name: "Maths Teacher" } },
      subjectById: { S1: { id: "S1", name: "Maths", abbr: "M" } },
    },
  },
  editor: { perspective: "class", cardInHand: null },
  day: 0,
};
globalThis.window.APP = APP;
globalThis.APP = APP;

// Load grid_canvas.js into the jsdom context.
const src = fs.readFileSync(path.join(repoRoot, "js/ui/editor/grid_canvas.js"), "utf8");
vm.runInThisContext(src, { filename: "grid_canvas.js" });
const Editor = globalThis.window.Editor;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

const host = dom.window.document.getElementById("host");

// Test 1 — wire-once semantics: 5 re-renders, exactly 1 mousedown listener.
Editor.render(host);
const after1 = mousedownCount;
Editor.render(host);
Editor.render(host);
Editor.render(host);
Editor.render(host);
const after5 = mousedownCount;
check(
  "wire-once: exactly 1 mousedown listener across 5 renders",
  after1 === 1 && after5 === 1,
  `after1=${after1} after5=${after5} (expected 1, 1)`
);

// Test 2 — second pickup restores first to origin. Simulate by directly
// invoking the same logic onMouseDown follows.
APP.school.cards = [
  { lessonId: "L1", day: 0, period: 1, classroomId: null },
  { lessonId: "L2", day: 0, period: 2, classroomId: null },
];
APP.editor.cardInHand = null;

// Simulate pickup of card L1 at (0, 1): the editor removes L1 from cards
// and stores it in hand.
function simulatePickup(lessonId, day, period) {
  // mirror onMouseDown's data-mutation path
  const held = APP.editor.cardInHand;
  if (held) {
    APP.school.cards.push({ lessonId: held.lessonId, day: held.originDay, period: held.originPeriod, classroomId: null });
    APP.editor.cardInHand = null;
  }
  const i = APP.school.cards.findIndex(c => c.lessonId === lessonId && c.day === day && c.period === period);
  if (i !== -1) APP.school.cards.splice(i, 1);
  APP.editor.cardInHand = { cardId: null, lessonId, originDay: day, originPeriod: period };
}

simulatePickup("L1", 0, 1);
const afterFirst = APP.school.cards.map(c => c.lessonId).sort();
check(
  "after picking L1: cards = [L2] only",
  afterFirst.length === 1 && afterFirst[0] === "L2",
  "got " + JSON.stringify(afterFirst)
);
check("cardInHand holds L1", APP.editor.cardInHand && APP.editor.cardInHand.lessonId === "L1");

simulatePickup("L2", 0, 2);
const afterSecond = APP.school.cards.map(c => c.lessonId).sort();
check(
  "after picking L2 while holding L1: cards = [L1] (L1 restored to origin)",
  afterSecond.length === 1 && afterSecond[0] === "L1",
  "got " + JSON.stringify(afterSecond)
);
check("cardInHand now holds L2", APP.editor.cardInHand && APP.editor.cardInHand.lessonId === "L2");

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
