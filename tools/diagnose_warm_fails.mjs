// Capture canPlace failure reasons for each warm-start move that fails.
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
globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.DOMParser=dom.window.DOMParser;

const parserSrc = fs.readFileSync(path.join(repoRoot, "js/xml/parse_timetable_xml.js"), "utf8");
vm.runInThisContext(parserSrc);
const parseTimetableXml = globalThis.window.parseTimetableXml;
const { solve } = await import(pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href);
const { FAIL_NAME } = await import(pathToFileURL(path.join(repoRoot, "js/solver/constraints.js")).href);

const xml = fs.readFileSync(path.join(repoRoot, "sample-school.xml"), "utf8");
const school = parseTimetableXml.parseText(xml, "sample-school.xml");

solve(school, { warmStart: true, timeLimitSec: 0.1, useIterativeRepair: false, useLNS: false, seed: 1, _debugWarmStartFailures: true });
const failures = globalThis.__chronexa_lastWsFailures || [];
console.log("Warm-start canPlace failures:", failures.length);
console.log("");
const counts = new Map();
for (const f of failures) {
  const name = FAIL_NAME[f.reason] || `FAIL_${f.reason}`;
  counts.set(name, (counts.get(name) || 0) + 1);
}
console.log("| Reason | Count |");
console.log("|--------|------:|");
for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`| ${k} | ${v} |`);
}
console.log("\nFirst 8 raw failures:");
for (const f of failures.slice(0, 8)) {
  console.log(JSON.stringify({ ...f, reasonName: FAIL_NAME[f.reason] }));
}

const model = globalThis.__chronexa_lastModel;
if (model) {
  console.log("\n=== Inspecting URDU lesson model entry ===");
  // Find expanded lesson for AA08F1D868F792E4 #1
  for (let i = 0; i < model.lessonCount; i++) {
    const l = model.lessons[i];
    if (l.srcId === "AA08F1D868F792E4") {
      const start = model.lessonClassStart[i];
      const count = model.lessonClassCount[i];
      const cIdx = model.lessonClassFlat[start];
      const gMask = model.lessonClassGroupMask[start];
      console.log(`  expanded lesson idx=${i} id=${l.id} classIdx=${cIdx} gMask=${gMask} (${gMask.toString(2)}) groupIds=${JSON.stringify(l.groupIds)}`);
      break;
    }
  }
  console.log("\n=== Inspecting SANSKRIT lesson model entry (same class) ===");
  for (let i = 0; i < model.lessonCount; i++) {
    const l = model.lessons[i];
    if (l.srcId === "7B996421036291A6") {
      const start = model.lessonClassStart[i];
      const cIdx = model.lessonClassFlat[start];
      const gMask = model.lessonClassGroupMask[start];
      console.log(`  expanded lesson idx=${i} id=${l.id} classIdx=${cIdx} gMask=${gMask} (${gMask.toString(2)}) groupIds=${JSON.stringify(l.groupIds)}`);
      break;
    }
  }
}

