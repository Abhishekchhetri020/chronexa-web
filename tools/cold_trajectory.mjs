// Discriminator: does LNS improve cold-start (where there's lots of slack)?
// Warm-start is too tight on sample-school.xml to show LNS gains.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

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
vm.runInThisContext(parserSrc, { filename: "parse_timetable_xml.js" });
const parseTimetableXml = globalThis.window.parseTimetableXml;

const { solve } = await import(pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href);

const xmlText = fs.readFileSync(path.join(repoRoot, "sample-school.xml"), "utf8");
const school  = parseTimetableXml.parseText(xmlText, "sample-school.xml");

for (const useLNS of [false, true]) {
  console.log(`\n# Cold-path, useLNS=${useLNS}`);
  console.log("");
  console.log("| Seed | Placed | Conflicts | Soft | Wall (ms) |");
  console.log("|-----:|-------:|----------:|-----:|----------:|");
  for (const seed of [1, 2, 3, 4, 5]) {
    const t0 = Date.now();
    const res = solve(school, { warmStart: false, timeLimitSec: 15, useIterativeRepair: true, useLNS, seed });
    const s = res.stats;
    console.log(`| ${seed} | ${s.placed} | ${s.hardConflicts} | ${s.softScore} | ${Date.now() - t0} |`);
  }
}
