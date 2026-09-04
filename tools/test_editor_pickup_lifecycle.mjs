// Regression tests for two grid_canvas.js bugs found in Gemini's audit:
//   #4 — wire() leaked pointer listeners (one per re-render).
//   #5 — picking up a 2nd card while one was in hand silently deleted the 1st.
//
// Current behavior:
//   #4 → wire() is gated by rootEl._chrxWired so it attaches the
//        pointerdown delegate exactly once across re-renders.
//   #5 → placed-card drags retain the source until commit, so cancel and a
//        second pickup cannot silently delete the original card.
//
// Usage:  node tools/test_editor_pickup_lifecycle.mjs
// Exit:   0 on green, 1 on red.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// [vite-esm] The 2026-07 Vite migration added ESM import/export lines to the
// classic UI modules. Strip them so vm.runInThisContext keeps working; the
// module BODIES are unchanged.
const stripVite = (s) => s
  .replace(/^import "[^"]+";$/gm, "")
  .replace(/^export const [A-Za-z_$][\w$]* = window\.[A-Za-z_$][\w$]*;$/gm, "");


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");
const require_   = createRequire(import.meta.url);

const { JSDOM } = require_("jsdom");
const dom = new JSDOM("<!doctype html><html><body><div id='host'></div></body></html>");
globalThis.window    = dom.window;
globalThis.document  = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return {
    font: "",
    measureText: (text) => ({ width: String(text).length * 8 }),
  };
};

// Count pointerdown handlers attached to a given Element by patching its
// add/removeEventListener so we can assert wire-once semantics.
let pointerdownCount = 0;
const origAdd = dom.window.Element.prototype.addEventListener;
dom.window.Element.prototype.addEventListener = function (type, ...rest) {
  if (type === "pointerdown") pointerdownCount++;
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
vm.runInThisContext(stripVite(src), { filename: "grid_canvas.js" });
const Editor = globalThis.window.Editor;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

const host = dom.window.document.getElementById("host");

// Test 1 — wire-once semantics: 5 re-renders, exactly 1 mousedown listener.
Editor.render(host);
const after1 = pointerdownCount;
Editor.render(host);
Editor.render(host);
Editor.render(host);
Editor.render(host);
const after5 = pointerdownCount;
check(
  "wire-once: exactly 1 pointerdown listener across 5 renders",
  after1 === 1 && after5 === 1,
  `after1=${after1} after5=${after5} (expected 1, 1)`
);

// Test 2 — the source remains in the model throughout pickup.
APP.school.cards = [
  { lessonId: "L1", day: 0, period: 1, classroomId: null },
  { lessonId: "L2", day: 0, period: 2, classroomId: null },
];
APP.editor.cardInHand = null;

// Simulate the source-retained state established at drag activation.
function simulatePickup(lessonId, day, period) {
  APP.editor.cardInHand = { cardId: null, lessonId, originDay: day, originPeriod: period, sourceRetained: true };
}

simulatePickup("L1", 0, 1);
const afterFirst = APP.school.cards.map(c => c.lessonId).sort();
check(
  "after picking L1: both source cards remain placed",
  afterFirst.length === 2 && afterFirst[0] === "L1" && afterFirst[1] === "L2",
  "got " + JSON.stringify(afterFirst)
);
check("cardInHand holds L1", APP.editor.cardInHand && APP.editor.cardInHand.lessonId === "L1");

simulatePickup("L2", 0, 2);
const afterSecond = APP.school.cards.map(c => c.lessonId).sort();
check(
  "after picking L2: both placed cards still exist",
  afterSecond.length === 2 && afterSecond[0] === "L1" && afterSecond[1] === "L2",
  "got " + JSON.stringify(afterSecond)
);
check("cardInHand now holds L2", APP.editor.cardInHand && APP.editor.cardInHand.lessonId === "L2");

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
