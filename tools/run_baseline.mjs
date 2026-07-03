// Node-based Chronexa solver harness.
//
// Loads sample-school.xml via jsdom, runs solve() for N seeds in cold and
// warm-start modes, prints a Markdown-ready table of placed / conflicts /
// soft-score / wall-time, plus per-relation SOFT_n_* violation counts.
//
// Usage:
//   NODE_PATH=/private/tmp/chronexa_smoke/node_modules node tools/run_baseline.mjs
//   # or, if you've added jsdom locally:
//   node tools/run_baseline.mjs
//
// Optional flags:
//   --xml PATH        Override sample-school.xml path
//   --seeds N         Number of seeds per mode (default 5)
//   --time-sec N      timeLimitSec passed to solve() (default 15)
//   --label TEXT      Tag the run (printed in the heading)

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

// --- CLI args --------------------------------------------------------------
function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}
const xmlPath   = path.resolve(repoRoot, arg("--xml", "sample-school.xml"));
const seedCount = Number(arg("--seeds", "5"));
const timeSec   = Number(arg("--time-sec", "15"));
const runLabel  = arg("--label", "current HEAD");
const injectRel = process.argv.includes("--inject-test-relations");

// --- Resolve jsdom: project-local first, then chronexa_smoke fallback -------
let JSDOM;
try {
  ({ JSDOM } = require_("jsdom"));
} catch {
  try {
    ({ JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom"));
  } catch {
    console.error("jsdom not found. Install locally (npm i jsdom in tools/) or run with NODE_PATH=/private/tmp/chronexa_smoke/node_modules");
    process.exit(2);
  }
}

// --- Shim browser globals so we can run the XML parser as a script ----------
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window    = dom.window;
globalThis.document  = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;

const parserSrc  = fs.readFileSync(path.join(repoRoot, "js/xml/parse_timetable_xml.js"), "utf8");
// The parser is a browser script that assigns `window.parseTimetableXml = …`.
// vm.runInThisContext executes it with our shimmed globals; equivalent to a
// <script> tag but contained to this Node process.
vm.runInThisContext(stripVite(parserSrc), { filename: "parse_timetable_xml.js" });
const parseTimetableXml = globalThis.window.parseTimetableXml;
if (!parseTimetableXml || typeof parseTimetableXml.parseText !== "function") {
  console.error("parse_timetable_xml.js did not register window.parseTimetableXml.parseText");
  process.exit(2);
}

// --- Dynamic-import the solver (ES module, no shim needed) ------------------
const solverUrl = pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href;
const { solve, VERSION } = await import(solverUrl);

// --- Load + parse the XML ---------------------------------------------------
const xmlText = fs.readFileSync(xmlPath, "utf8");
const school  = parseTimetableXml.parseText(xmlText, path.basename(xmlPath));

if (injectRel) {
  // Three synthetic relations that exercise the new soft-score hookup.
  // Targeting common subjects keeps the matched-lesson sets non-empty
  // without depending on which XML was loaded.
  const subjId = (...names) => {
    const wanted = new Set(names.map(n => n.toLowerCase()));
    return (school.subjects || [])
      .filter(s => wanted.has((s.name || "").toLowerCase()) || wanted.has((s.shortName || "").toLowerCase()))
      .map(s => s.id);
  };
  const peLike   = subjId("pe", "PE", "Physical Education", "Phy Ed", "Games", "Sports");
  const mathLike = subjId("Math", "Mathematics", "Maths");
  const artLike  = subjId("Art", "Drawing", "Painting");
  school.relations = school.relations || [];
  if (peLike.length)   school.relations.push({ id: "TEST_n17_pe",   typ: "n_17", subjectids: peLike,   classids: [] });
  if (mathLike.length) school.relations.push({ id: "TEST_n4_math",  typ: "n_4",  subjectids: mathLike, classids: [] });
  if (artLike.length)  school.relations.push({ id: "TEST_n14_art",  typ: "n_14", subjectids: artLike,  classids: [] });
  if (!school.relations.length) {
    // Fallback: pick any non-empty subject so n_17 has something to match.
    const any = (school.subjects || [])[0];
    if (any) school.relations.push({ id: "TEST_n17_any", typ: "n_17", subjectids: [any.id], classids: [] });
  }
}

const lessonCount = (school.lessons || []).length;
const cardCount   = (school.cards   || []).length;
const relCount    = (school.relations || []).length;
console.log(`# Chronexa solver baseline — ${runLabel}`);
console.log("");
console.log(`solver: ${VERSION}`);
console.log(`xml:    ${path.relative(repoRoot, xmlPath)}`);
console.log(`lessons: ${lessonCount} | seed cards: ${cardCount} | relations: ${relCount}`);
console.log(`time budget: ${timeSec}s | seeds per mode: ${seedCount}`);
console.log("");

// --- Run helper -------------------------------------------------------------
function summarizeViolations(violations) {
  const buckets = Object.create(null);
  for (const v of violations || []) {
    const k = String(v.ruleId || v.rule || "OTHER");
    buckets[k] = (buckets[k] || 0) + 1;
  }
  return buckets;
}

function runOne(seed, warmStart) {
  const t0 = Date.now();
  const res = solve(school, { seed, warmStart, timeLimitSec: timeSec, useIterativeRepair: true });
  const wallMs = Date.now() - t0;
  return { seed, warmStart, res, wallMs };
}

const modes = [
  { label: "cold", warmStart: false, seedStart: 1  },
  { label: "warm", warmStart: true,  seedStart: 11 },
];

const all = [];
for (const m of modes) {
  console.log(`## ${m.label === "cold" ? "Cold path (warmStart=false)" : "Warm-start (warmStart=true)"}`);
  console.log("");
  console.log("| Seed | Status   | Placed | Conflicts | Soft score | Wall (ms) |");
  console.log("|-----:|----------|-------:|----------:|-----------:|----------:|");
  for (let i = 0; i < seedCount; i++) {
    const seed = m.seedStart + i;
    const out  = runOne(seed, m.warmStart);
    const s    = out.res.stats || {};
    console.log(`| ${String(seed).padStart(4)} | ${String(out.res.status).padEnd(8)} | ${String(s.placed ?? 0).padStart(6)} | ${String(s.hardConflicts ?? 0).padStart(9)} | ${String(s.softScore ?? 0).padStart(10)} | ${String(out.wallMs).padStart(9)} |`);
    all.push({ mode: m.label, ...out });
  }
  console.log("");
}

console.log("## SOFT_n_* violation breakdown (first seed of each mode)");
console.log("");
console.log("| Mode | SOFT_n_4 | SOFT_n_11 | SOFT_n_14 | SOFT_n_17 | total violations |");
console.log("|------|---------:|----------:|----------:|----------:|-----------------:|");
for (const m of modes) {
  const first = all.find(r => r.mode === m.label);
  const b = summarizeViolations(first.res.violations);
  const n4  = b["SOFT_n_4_distribution"]      || 0;
  const n11 = b["SOFT_n_11_divided_same_day"] || 0;
  const n14 = b["SOFT_n_14_same_period_each_day"] || 0;
  const n17 = b["SOFT_n_17_afternoon"]        || 0;
  const total = (first.res.violations || []).length;
  console.log(`| ${m.label} | ${String(n4).padStart(8)} | ${String(n11).padStart(9)} | ${String(n14).padStart(9)} | ${String(n17).padStart(9)} | ${String(total).padStart(16)} |`);
}
console.log("");
