// Focused regression tests for ASC-style editor ergonomics:
// - day headers align as Monday-Saturday groups
// - clicking a class row filters the pending strip to that class
// - empty-slot mousedown does not mutate cards before CardInHand validates

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
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const require_ = createRequire(import.meta.url);

const { JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom");
const dom = new JSDOM("<!doctype html><html><body><div id='editor'></div><div id='pending'></div></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.MutationObserver = dom.window.MutationObserver;
document.documentElement.setAttribute("data-skin", "classic");

const APP = {
  school: {
    bell: {
      periods: Array.from({ length: 7 }, (_, i) => ({
        index: i + 1,
        label: "P" + (i + 1),
        isTeaching: true,
      })),
    },
    classes: [{ id: "C1", name: "V-A" }, { id: "C2", name: "VI-B" }],
    teachers: [{ id: "T1", name: "Teacher One", abbr: "T1", timeOff: {} }],
    classrooms: [{ id: "R1", name: "Room 1" }],
    subjects: [{ id: "S1", name: "Maths", abbr: "M" }, { id: "S2", name: "Science", abbr: "S" }],
    lessons: [
      { id: "L1", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S1", preferredRoomId: "R1", periodsPerWeek: 1 },
      { id: "L2", classIds: ["C2"], teacherIds: ["T1"], subjectId: "S2", preferredRoomId: "R1", periodsPerWeek: 1 },
      { id: "L3", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S2", preferredRoomId: "R1", periodsPerWeek: 1 },
    ],
    cards: [],
    _idx: {
      lessonById: {
        L1: { id: "L1", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S1", preferredRoomId: "R1", periodsPerWeek: 1 },
        L2: { id: "L2", classIds: ["C2"], teacherIds: ["T1"], subjectId: "S2", preferredRoomId: "R1", periodsPerWeek: 1 },
        L3: { id: "L3", classIds: ["C1"], teacherIds: ["T1"], subjectId: "S2", preferredRoomId: "R1", periodsPerWeek: 1 },
      },
      classById: { C1: { id: "C1", name: "V-A" }, C2: { id: "C2", name: "VI-B" } },
      teacherById: { T1: { id: "T1", name: "Teacher One", abbr: "T1" } },
      subjectById: { S1: { id: "S1", name: "Maths", abbr: "M" }, S2: { id: "S2", name: "Science", abbr: "S" } },
      classroomById: { R1: { id: "R1", name: "Room 1" } },
    },
  },
  editor: { perspective: "class", cardInHand: null },
  day: 0,
};
globalThis.window.APP = APP;
globalThis.APP = APP;

for (const rel of ["js/ui/editor/grid_canvas.js", "js/ui/editor/pending_strip.js", "js/ui/editor/card_in_hand.js", "js/ui/editor/canvas_geometry.js"]) {
  vm.runInThisContext(stripVite(fs.readFileSync(path.join(repoRoot, rel), "utf8")), { filename: rel });
}

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else { console.log("  ✗ " + name + (detail ? " — " + detail : "")); fail++; }
}

const editor = document.getElementById("editor");
const pending = document.getElementById("pending");
window.Editor.render(editor);
window.PendingStrip.render(pending);

check("in-canvas editor tools are visible", editor.querySelectorAll(".chrx-editor-tool").length === 3);
check("in-canvas tools show unplaced count", /unplaced/.test(editor.querySelector(".chrx-editor-tool__count")?.textContent || ""));
editor.querySelector('[data-editor-tool="color"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
check("in-canvas color tool cycles color axis", APP.editor.colorBy === "teacher");

check(
  "header renders six day groups",
  editor.querySelectorAll(".chrx-day-head-group").length === 6
);
check(
  "each body row renders six day groups",
  Array.from(editor.querySelectorAll(".chrx-row:not(.chrx-row-head):not(.chrx-floor-row)"))
    .every(r => r.querySelectorAll(":scope > .chrx-day-body-group").length === 6)
);
check(
  "each day group has one period header per bell period",
  Array.from(editor.querySelectorAll(".chrx-day-head-group"))
    .every(g => g.querySelectorAll(".chrx-h-period").length === 7)
);
check(
  "each body day group has one slot per bell period",
  Array.from(editor.querySelectorAll(".chrx-day-body-group"))
    .every(g => g.querySelectorAll(".chrx-slot").length === 7)
);
check("editor does not synthesize missing period 8", editor.querySelectorAll('.chrx-h-period[data-period="8"]').length === 0);
check("editor CSS period count follows the bell", editor.querySelector(".chrx-grid")?.style.getPropertyValue("--chrx-periods") === "7");
check("classic empty slots do not show FD placeholders", editor.querySelectorAll(".chrx-row:not(.chrx-floor-row) .chrx-slot.empty .chrx-fd-tag").length === 0);
APP.school.cards = [{ lessonId: "L1", day: 0, period: 8, classroomId: "R1" }];
window.Editor.render(editor);
check("cards outside configured bell periods are not rendered beyond Saturday", editor.querySelectorAll('.chrx-vkarta[data-period="8"]').length === 0);
APP.school.cards = [];
window.Editor.render(editor);
window.PendingStrip.render(pending);

const c1Label = editor.querySelector('.chrx-row[data-row="C1"] .chrx-rowlabel');
c1Label.dispatchEvent(new MouseEvent("click", { bubbles: true }));
check("class row click stores selected class", APP.editor.selectedClassId === "C1");
check("class row click opens class detail panel", !!document.querySelector("#chrx-class-panel"));
check("pending strip shows selected class chip", !!pending.querySelector(".chrx-pending-class-filter"));
check("pending strip filters out other class cards", pending.textContent.includes("V-A") && !pending.textContent.includes("VI-B"));
const pendingCard = pending.querySelector(".chrx-vk-pending");
pendingCard.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
check("pending card hover opens card detail panel", !!document.querySelector("#chrx-card-panel"));
check("card detail panel shows pending card subject", document.querySelector("#chrx-card-panel")?.textContent.includes("Maths"));

const resize = pending.querySelector(".chrx-pending-resize");
resize.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientY: 200 }));
window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientY: 120 }));
window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientY: 120 }));
check("pending tray drag handle stores resized height", APP.editor.pendingTrayHeight > 96);

APP.editor.cardInHand = { cardId: "pending_L1_0", lessonId: "L1", fromPending: true };
const before = APP.school.cards.length;
const slot = editor.querySelector('.chrx-row[data-row="C1"] .chrx-slot.empty[data-day="0"][data-period="1"]');
slot.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
check("empty-slot mousedown does not mutate cards", APP.school.cards.length === before);

window.Placement = { classify: () => ({ validity: "green", reasons: [] }) };
const badSlot = editor.querySelector('.chrx-row[data-row="C2"] .chrx-slot.empty[data-day="0"][data-period="1"]');
document.elementFromPoint = () => badSlot;
document.dispatchEvent(new CustomEvent("editor:pickup", {
  detail: { cardId: "pending_L1_collision", lessonId: "L1", fromPending: true, sourceX: 20, sourceY: 20 },
}));
document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 30, clientY: 30 }));
check("invalid class-row drop opens collision options", !!document.querySelector(".chrx-collision-menu"));
check("collision menu keeps card in hand for user choice", !!APP.editor.cardInHand);

window.CardInHand._cleanup();
APP.editor.cardInHand = null;
APP.school.cards = [{ lessonId: "L3", day: 0, period: 1, classroomId: "R1" }];
window.Editor.render(editor);
const occupiedSlot = editor.querySelector('.chrx-row[data-row="C1"] .chrx-slot[data-day="0"][data-period="1"]');
document.elementFromPoint = () => occupiedSlot;
document.dispatchEvent(new CustomEvent("editor:pickup", {
  detail: { cardId: "pending_L1_occupied", lessonId: "L1", fromPending: true, sourceX: 20, sourceY: 20 },
}));
document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 30, clientY: 30 }));
check("occupied-slot drop opens collision options", !!document.querySelector('.chrx-collision-menu [data-act="replace"]'));
document.querySelector('.chrx-collision-menu [data-act="replace"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
check("replace option removes existing slot card", !APP.school.cards.some(c => c.lessonId === "L3"));
check("replace option places held card into occupied slot", APP.school.cards.some(c => c.lessonId === "L1" && c.day === 0 && c.period === 1));

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
