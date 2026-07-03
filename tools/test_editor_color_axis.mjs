// Regression test for the editor card color-axis control.

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

const dom = new JSDOM(`<!doctype html><html><body>
  <button id="editor-color-by">Color: Subject</button>
  <button id="editor-density"></button>
  <button id="editor-perspective"></button>
  <button id="editor-toggle-skin"></button>
  <button id="editor-lesson-grid"></button>
  <button id="cta-load-demo"></button>
  <input id="xml-file">
  <div id="xml-status"></div>
</body></html>`, { url: "http://localhost/" });

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.localStorage = dom.window.localStorage;
window.APP = { editor: {} };
globalThis.APP = window.APP;

let activated = 0;
window.EditorActivator = { activate: () => { activated++; } };

const src = fs.readFileSync(path.join(repoRoot, "js/ui/main.js"), "utf8");
vm.runInThisContext(stripVite(src), { filename: "main.js" });
document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else { console.log("  ✗ " + name + (detail ? " — " + detail : "")); fail++; }
}

const btn = document.getElementById("editor-color-by");
check("default color axis is subject", window.APP.editor.colorBy === "subject");
btn.click();
check("click cycles to teacher", window.APP.editor.colorBy === "teacher" && btn.textContent === "Color: Teacher");
btn.click();
check("second click cycles to class", window.APP.editor.colorBy === "class" && btn.textContent === "Color: Class");
check("color axis changes re-render editor", activated >= 2);
check("color axis persists", localStorage.getItem("chronexa.editor.colorBy") === "class");

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
