// Diagnose WHY the 35 unplaceable lessons can't be placed by Chronexa.
// For each unplaced expanded lesson, walk its candidate (slot, room) pairs,
// run canPlace, and tally the failure reasons. The dominant FAIL_NAME is
// the rule Chronexa would need to relax / fix to match aSc.

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
const solverMod = await import(solverUrl);
const constraintsUrl = pathToFileURL(path.join(repoRoot, "js/solver/constraints.js")).href;
const { FAIL_NAME } = await import(constraintsUrl);

const xmlText = fs.readFileSync(path.join(repoRoot, "sample-school.xml"), "utf8");
const school  = parseTimetableXml.parseText(xmlText, "sample-school.xml");

// Run a warm-start solve, then inspect the unplaced lessons + their candidate
// failure reasons. We need access to internal model + canPlace, so we use a
// hook: solve() with an onProgress that captures the state. Simpler: rebuild
// the model + state ourselves using solver internals.
//
// The solver doesn't currently export buildModel / makeState / canPlace; for
// this diagnostic we call solve() with a tiny budget and inspect the
// returned violations list, which already classifies each unplaced lesson.

const res = solverMod.solve(school, {
  warmStart: true,
  timeLimitSec: 0.5,
  useIterativeRepair: false,
  useLNS: false,
  seed: 1,
});

const stats = res.stats;
console.log(`# Warm-start diagnosis — ${path.basename(path.resolve(repoRoot, "sample-school.xml"))}`);
console.log("");
console.log(`Placed:           ${stats.placed}/${(school.cards || []).length}`);
console.log(`Hard conflicts:   ${stats.hardConflicts}`);
console.log(`Soft score:       ${stats.softScore}`);
console.log("");

// Bucket violations by ruleId.
const buckets = new Map();
for (const v of res.violations || []) {
  const k = v.ruleId || v.rule || "UNKNOWN";
  if (!buckets.has(k)) buckets.set(k, { count: 0, samples: [] });
  const b = buckets.get(k);
  b.count++;
  if (b.samples.length < 5) b.samples.push(v.description || JSON.stringify(v));
}
console.log("## Violation buckets");
console.log("");
console.log("| Rule | Count |");
console.log("|------|------:|");
const sorted = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [k, v] of sorted) {
  console.log(`| ${k} | ${v.count} |`);
}

console.log("");
console.log("## Sample violations (up to 5 per rule)");
console.log("");
for (const [k, v] of sorted) {
  console.log(`### ${k} (${v.count})`);
  for (const s of v.samples) console.log("- " + s);
  console.log("");
}

// For HARD_unplaced_lesson, dump the source lesson IDs so we can see which
// expanded lessons they are and look at their candidates.
const unplacedIds = new Set();
for (const v of res.violations || []) {
  if (v.ruleId === "HARD_unplaced_lesson") {
    const desc = String(v.description || "");
    const m = desc.match(/lesson\s+([A-Za-z0-9_#]+)/i) ||
              desc.match(/^([A-Za-z0-9_#]+)/);
    if (m) unplacedIds.add(m[1]);
  }
}
console.log(`## Unplaced lesson IDs (${unplacedIds.size} unique)`);
console.log("");
const arr = [...unplacedIds].slice(0, 50);
for (const id of arr) console.log("- " + id);
