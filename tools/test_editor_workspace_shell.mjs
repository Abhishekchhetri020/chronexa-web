// Regression tests for ASC-style editor workspace shell behavior.
// The sidebar Editor action should route to step 6 and entering step 6
// should activate the focused fullscreen/classic editor workspace.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "/private/tmp/chronexa_smoke/node_modules/jsdom/lib/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const html = `<!doctype html><html><body>
  <nav><button class="step-btn" data-step="6"></button><button class="step-btn" data-step="2"></button></nav>
  <main><section id="step-6"></section></main>
</body></html>`;
const dom = new JSDOM(html, { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.localStorage = dom.window.localStorage;
window.APP = { school: { cards: [] } };
globalThis.APP = window.APP;

let clickedStep = null;
document.querySelectorAll(".step-btn").forEach(btn => {
  btn.addEventListener("click", () => { clickedStep = btn.dataset.step; });
});

const src = fs.readFileSync(path.join(repoRoot, "js/ui/shell_v3.js"), "utf8");
vm.runInThisContext(src, { filename: "shell_v3.js" });
window.ChrxShell.mount();

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else { console.log("  ✗ " + name + (detail ? " — " + detail : "")); fail++; }
}

window.ChrxShell.focusEditor();
check("focusEditor routes to step 6", clickedStep === "6", "clicked " + clickedStep);

document.dispatchEvent(new CustomEvent("step:changed", { detail: { step: 6 } }));
const shell = document.getElementById("chrx-shell");
check("step 6 enters fullscreen shell", shell.classList.contains("is-fullscreen"));
check("step 6 hides side rail", shell.classList.contains("is-side-hidden") && shell.classList.contains("is-rail-hidden"));
check("step 6 applies classic skin", document.documentElement.getAttribute("data-skin") === "classic");

document.dispatchEvent(new CustomEvent("step:changed", { detail: { step: 2 } }));
check("leaving editor exits auto fullscreen", !shell.classList.contains("is-fullscreen"));

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
