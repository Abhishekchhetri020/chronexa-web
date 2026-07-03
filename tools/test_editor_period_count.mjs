// Regression test: editor grid period columns must follow the school's bell
// periods instead of padding every timetable to eight periods.
//
// Usage:  node tools/test_editor_period_count.mjs
// Exit:   0 on green, 1 on red.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "/private/tmp/chronexa_smoke/node_modules/jsdom/lib/api.js";

// [vite-esm] The 2026-07 Vite migration added ESM import/export lines to the
// classic UI modules. Strip them so vm.runInThisContext keeps working; the
// module BODIES are unchanged.
const stripVite = (s) => s
  .replace(/^import "[^"]+";$/gm, "")
  .replace(/^export const [A-Za-z_$][\w$]* = window\.[A-Za-z_$][\w$]*;$/gm, "");


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const dom = new JSDOM(`<!doctype html><html><body><div id="editor"></div></body></html>`, {
  url: "http://localhost/",
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.localStorage = dom.window.localStorage;

const school = {
  bell: {
    periods: Array.from({ length: 7 }, (_, i) => ({
      index: i + 1,
      label: String(i + 1) + (i === 0 ? "ST" : i === 1 ? "ND" : i === 2 ? "RD" : "TH"),
      isTeaching: true,
    })),
  },
  classes: [{ id: "C1", name: "I A" }],
  teachers: [],
  classrooms: [],
  subjects: [],
  lessons: [],
  cards: [],
  _idx: { lessonById: {} },
};

window.APP = { school, editor: { perspective: "class", colorBy: "subject" } };
globalThis.APP = window.APP;

const src = fs.readFileSync(path.join(repoRoot, "js/ui/editor/grid_canvas.js"), "utf8");
vm.runInThisContext(stripVite(src), { filename: "grid_canvas.js" });

const host = document.getElementById("editor");
window.Editor.render(host);

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else { console.log("  ✗ " + name + (detail ? " — " + detail : "")); fail++; }
}

const periodHeaders = Array.from(host.querySelectorAll('.chrx-day-head-group[data-day="0"] .chrx-h-period'));
const labels = periodHeaders.map(el => el.textContent.trim());

check("renders exactly 7 period headers for a 7-period bell", periodHeaders.length === 7, `got ${periodHeaders.length}`);
check("does not synthesize P8", !labels.includes("P8"), `labels=${labels.join(",")}`);
check("sets grid period CSS variable to 7", host.querySelector(".chrx-grid")?.style.getPropertyValue("--chrx-periods") === "7");

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
