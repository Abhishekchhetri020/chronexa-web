// Discriminate "Chronexa improves aSc's placement" vs "Chronexa is stuck
// at the warm-start state." Both produce 916/35/-4950 at t=15s. Only the
// onProgress trajectory tells them apart.

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
const { solve } = await import(solverUrl);

const xmlText = fs.readFileSync(path.join(repoRoot, "sample-school.xml"), "utf8");
const school  = parseTimetableXml.parseText(xmlText, "sample-school.xml");

const trajectory = [];
const res = solve(school, {
  warmStart: true,
  timeLimitSec: 15,
  useIterativeRepair: true,
  seed: 11,
  // Pass debug:true through ctx; the LNS path picks it up via ctx.debug.
  // Hacky but enough for trajectory diagnostics.
  onProgress: (p) => trajectory.push({ ms: p.durationMs, iter: p.iter, soft: p.softScore, hard: p.hardConflicts, bt: p.backtracks, phase: p.phase }),
});

console.log("# Warm-start trajectory — seed 11, 15s budget");
console.log("");
console.log("| t (ms) |    iter | hardConflicts | softScore | backtracks |");
console.log("|-------:|--------:|--------------:|----------:|-----------:|");
// Sample at ~1s intervals
let lastBucket = -1;
for (const e of trajectory) {
  const bucket = Math.floor(e.ms / 1000);
  if (bucket !== lastBucket) {
    console.log(`| ${String(e.ms).padStart(6)} | ${String(e.iter).padStart(7)} | ${String(e.hard).padStart(13)} | ${String(e.soft).padStart(9)} | ${String(e.bt).padStart(10)} |`);
    lastBucket = bucket;
  }
}
console.log("");
console.log(`Final: placed=${res.stats.placed}, conflicts=${res.stats.hardConflicts}, soft=${res.stats.softScore}, wall=${res.stats.durationMs}ms`);
console.log(`Total progress events: ${trajectory.length}`);
if (trajectory.length >= 2) {
  const first = trajectory[0];
  const last  = trajectory[trajectory.length - 1];
  console.log(`Soft-score delta first→last: ${first.soft} → ${last.soft}  (Δ=${last.soft - first.soft})`);
  console.log(`Hard-conflict delta:         ${first.hard} → ${last.hard}  (Δ=${last.hard - first.hard})`);
}
