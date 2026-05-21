// Smoke test for the WASM solver adapter — verifies the fallback path
// to the JS solver works end-to-end even before any WASM module ships.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

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
vm.runInThisContext(parserSrc);
const parseTimetableXml = globalThis.window.parseTimetableXml;

const adapterUrl = pathToFileURL(path.join(repoRoot, "js/solver/wasm/adapter.js")).href;
const { solve, VERSION } = await import(adapterUrl);

const xml = fs.readFileSync(path.join(repoRoot, "sample-school.xml"), "utf8");
const school = parseTimetableXml.parseText(xml, "sample-school.xml");

console.log("Adapter VERSION:", VERSION);
console.log("Lessons:", (school.lessons || []).length, "Cards:", (school.cards || []).length);
console.log("");

const t0 = Date.now();
const res = await solve(school, { warmStart: true, timeLimitSec: 1, useIterativeRepair: true, seed: 11 });
const wallMs = Date.now() - t0;
const s = res.stats;
console.log(`Result: status=${res.status} placed=${s.placed} conflicts=${s.hardConflicts} soft=${s.softScore} wall=${wallMs}ms`);

if (res.status !== "FEASIBLE" || s.placed < 946 || s.hardConflicts !== 0) {
  console.error("FAIL: expected FEASIBLE 946/0 from adapter fallback path");
  process.exit(1);
}
console.log("OK: adapter falls through to JS solver and produces the same result.");
