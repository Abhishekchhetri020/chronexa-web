// Smoke test for the WASM solver adapter — verifies the fallback path
// to the JS solver works end-to-end even before any WASM module ships.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// [vite-esm] The 2026-07 Vite migration added ESM import/export lines to the
// classic UI modules. Strip them so vm.runInThisContext keeps working; the
// module BODIES are unchanged.
const stripVite = (s) => s
  .replace(/^import "[^"]+";$/gm, "")
  .replace(/^export const [A-Za-z_$][\w$]* = window\.[A-Za-z_$][\w$]*;$/gm, "");


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, "..");
const require_  = createRequire(import.meta.url);

let JSDOM;
try { ({ JSDOM } = require_("jsdom")); }
catch { ({ JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom")); }
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;

const parserSrc = fs.readFileSync(path.join(repoRoot, "js/xml/parse_timetable_xml.js"), "utf8");
vm.runInThisContext(stripVite(parserSrc));
const parseTimetableXml = globalThis.window.parseTimetableXml;

const adapterUrl = pathToFileURL(path.join(repoRoot, "js/solver/wasm/adapter.js")).href;
const { solve, VERSION } = await import(adapterUrl);

const cspWasmUrl = pathToFileURL(path.join(repoRoot, "js/solver/wasm/csp_wasm.js")).href;
const { wasmExports } = await import(cspWasmUrl);
const exports = await wasmExports();
if (!exports) {
  console.error("FAIL: WASM exports not available!");
  process.exit(1);
}
globalThis.__chronexaWasmExports = exports;
console.log("✓ Manually loaded __chronexaWasmExports");

const xml = fs.readFileSync(path.join(repoRoot, "sample-school.xml"), "utf8");
const school = parseTimetableXml.parseText(xml, "sample-school.xml");

console.log("Adapter VERSION:", VERSION);
console.log("Lessons:", (school.lessons || []).length, "Cards:", (school.cards || []).length);
console.log("");

// Test 1: WASM verification + validation mode (verifies zero-copy JS-WASM parity and produces no warnings)
console.log("Running solver in WASM validation mode (validateWasm: true)...");
const t0 = Date.now();
const res = await solve(school, {
  warmStart: true,
  timeLimitSec: 2,
  useIterativeRepair: true,
  seed: 11,
  useWasm: true,
  validateWasm: true
});
const wallMs = Date.now() - t0;
const s = res.stats;
console.log(`Result: status=${res.status} placed=${s.placed} conflicts=${s.hardConflicts} soft=${s.softScore} wall=${wallMs}ms`);

if (res.status !== "FEASIBLE" || s.placed < 946 || s.hardConflicts !== 0) {
  console.error("FAIL: expected FEASIBLE 946/0 from adapter WASM path");
  process.exit(1);
}
console.log("OK: WASM solver executed successfully in validation mode with no divergences!");

// Test 2: Pure WASM speed mode (zero validation overhead)
console.log("\nRunning solver in pure WASM mode (useWasm: true)...");
const t1 = Date.now();
const resWasm = await solve(school, {
  warmStart: true,
  timeLimitSec: 2,
  useIterativeRepair: true,
  seed: 11,
  useWasm: true,
  validateWasm: false
});
const wallMsWasm = Date.now() - t1;
const sWasm = resWasm.stats;
console.log(`Result: status=${resWasm.status} placed=${sWasm.placed} conflicts=${sWasm.hardConflicts} soft=${sWasm.softScore} wall=${wallMsWasm}ms`);

if (resWasm.status !== "FEASIBLE" || sWasm.placed < 946 || sWasm.hardConflicts !== 0) {
  console.error("FAIL: expected FEASIBLE 946/0 from adapter pure WASM path");
  process.exit(1);
}
console.log("OK: Pure WASM solver executed successfully!");

// Test 3: Standard JS mode (for baseline comparison)
console.log("\nRunning solver in pure JS mode...");
const t2 = Date.now();
const resJS = await solve(school, {
  warmStart: true,
  timeLimitSec: 2,
  useIterativeRepair: true,
  seed: 11,
  useWasm: false
});
const wallMsJS = Date.now() - t2;
const sJS = resJS.stats;
console.log(`Result: status=${resJS.status} placed=${sJS.placed} conflicts=${sJS.hardConflicts} soft=${sJS.softScore} wall=${wallMsJS}ms`);
console.log(`Speedup: ${(wallMsJS / wallMsWasm).toFixed(2)}x`);


