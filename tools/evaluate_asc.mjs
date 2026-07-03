// Evaluate aSc TimeTables' placement (already in sample-school.xml's <cards>
// block) under Chronexa's metric, so the legacy column of SOLVER_VS_LEGACY.md
// can be filled with directly-comparable numbers — no Wine, no roz.exe.
//
// How it works: sample-school.xml carries 951 `<card>` entries which ARE aSc's
// solver output for this school. We run solve() with warmStart=true and a tiny
// time budget (0.1 s) — long enough to replay the XML cards as placements and
// have Chronexa's canPlace() filter cards that violate Chronexa's hard rules,
// but short enough that no further search happens. The post-warm-start stats
// are then "aSc's placement, evaluated by Chronexa's hard/soft rule lens."

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


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");
const require_   = createRequire(import.meta.url);

let JSDOM;
try { ({ JSDOM } = require_("jsdom")); }
catch { ({ JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom")); }

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window    = dom.window;
globalThis.document  = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;

const parserSrc = fs.readFileSync(path.join(repoRoot, "js/xml/parse_timetable_xml.js"), "utf8");
vm.runInThisContext(stripVite(parserSrc), { filename: "parse_timetable_xml.js" });
const parseTimetableXml = globalThis.window.parseTimetableXml;

const solverUrl = pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href;
const { solve, VERSION } = await import(solverUrl);

const xmlPath = path.resolve(repoRoot, process.argv[2] || "sample-school.xml");
const xmlText = fs.readFileSync(xmlPath, "utf8");
const school  = parseTimetableXml.parseText(xmlText, path.basename(xmlPath));

const cardsInXml = (school.cards || []).length;
const lessonsCount = (school.lessons || []).length;

console.log(`# aSc placement evaluated under Chronexa's metric`);
console.log("");
console.log(`solver:   ${VERSION}`);
console.log(`xml:      ${path.relative(repoRoot, xmlPath)}`);
console.log(`lessons:  ${lessonsCount}`);
console.log(`aSc cards in XML: ${cardsInXml}`);
console.log("");

// Warm-start with a tiny budget — we want post-warm-start state, not
// improved placement. useIterativeRepair: false so repair doesn't run.
const t0 = Date.now();
const res = solve(school, {
  warmStart: true,
  timeLimitSec: 0.1,
  useIterativeRepair: false,
  seed: 1,
});
const wallMs = Date.now() - t0;

const s = res.stats || {};
const violCounts = Object.create(null);
for (const v of res.violations || []) {
  const k = String(v.ruleId || v.rule || "OTHER");
  violCounts[k] = (violCounts[k] || 0) + 1;
}

console.log("## aSc's placement, evaluated by Chronexa");
console.log("");
console.log("| Metric                                           | Value       |");
console.log("|--------------------------------------------------|------------:|");
console.log(`| Cards in XML (aSc's output)                      | ${String(cardsInXml).padStart(10)} |`);
console.log(`| Chronexa-accepted (placed, no hard conflict)     | ${String(s.placed ?? 0).padStart(10)} |`);
console.log(`| Chronexa-rejected (hard conflict against rules)  | ${String(s.hardConflicts ?? 0).padStart(10)} |`);
console.log(`| Soft score (Chronexa's metric on aSc placement)  | ${String(s.softScore ?? 0).padStart(10)} |`);
console.log(`| Status                                           | ${String(res.status).padStart(10)} |`);
console.log(`| Wall (ms)                                        | ${String(wallMs).padStart(10)} |`);
console.log("");

if (Object.keys(violCounts).length) {
  console.log("## Violation breakdown");
  console.log("");
  console.log("| ruleId                          | count |");
  console.log("|---------------------------------|------:|");
  const keys = Object.keys(violCounts).sort();
  for (const k of keys) console.log(`| ${k.padEnd(31)} | ${String(violCounts[k]).padStart(5)} |`);
  console.log("");
}
