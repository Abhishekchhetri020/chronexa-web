// Regression test for pivot_engine.js entitiesFor() — two bugs:
//   1. daysPerWeek was ignored; 6-day rows always emitted (phantom
//      Saturday for 5-day schools unless `hideEmptyRows:true`).
//   2. periods was treated as a count; bell schedules with break-period
//      gaps (e.g. [{index:1},{index:3},{index:4}]) had their card-to-cell
//      matching silently mis-keyed.
//
// Loads pivot_engine.js into jsdom and asserts entitiesFor() output for
// both dims.
//
// Usage:  node tools/test_print_pivot_dims.mjs
// Exit:   0 on green, 1 on red.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");
const require_   = createRequire(import.meta.url);

const { JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window    = dom.window;
globalThis.document  = dom.window.document;

// Load schema (provides activeDims) — a minimal stub avoids dragging the
// real one in. pivot_engine reads APP.PrintReportSchema.activeDims.
window.APP = window.APP || {};
window.APP.PrintReportSchema = { activeDims: () => [] };

const src = fs.readFileSync(path.join(repoRoot, "js/ui/print_preview/pivot_engine.js"), "utf8");
vm.runInThisContext(src, { filename: "pivot_engine.js" });

const PivotPrivate = window.APP.PrintPivot;
// entitiesFor isn't exported; smoke-test via renderReport with a minimal
// preset, or replicate the function by loading & exposing it. Simpler:
// patch the source to expose `entitiesFor` for tests via a dev-only hook
// IF needed. For now, call renderReport with a tiny school and inspect
// the generated pages.

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); pass++; }
  else    { console.log("  ✗ " + name + " — " + (detail || "no detail")); fail++; }
}

// Minimal schema needed for renderReport.
window.APP.PrintReportSchema.activeDims = (dims) => Array.isArray(dims) ? dims.filter(Boolean) : [];

// Test 1 — 5-day school. Build a report with days as rows, periods as cols.
// Inspect the rendered DOM for the number of body rows.
const school5 = {
  schoolName: "5-day school",
  daysPerWeek: 5,
  classes: [{ id: "C1", name: "I" }],
  teachers: [{ id: "T1", name: "T1" }],
  subjects: [{ id: "S1", name: "Math" }],
  classrooms: [],
  cards: [],
  bell: { periods: [
    { index: 1, label: "P1", isTeaching: true },
    { index: 2, label: "P2", isTeaching: true },
  ]},
};
const report = {
  name: "Test",
  pages: [],
  rows: ["day"],
  cols: ["period"],
  filters: null,
  elementStyles: [],
};
const pages5 = PivotPrivate.renderReport(report, school5, school5.bell.periods);
const rowCount5 = pages5[0].querySelectorAll("tbody tr").length;
check("5-day school produces 5 day-rows (no phantom Saturday)", rowCount5 === 5, `got ${rowCount5} rows`);

// Test 2 — bell schedule with a break period gap. Verify that the column
// header includes the period labels we expect (P1, P3, P4 — not 1st, 2nd, 3rd).
const schoolGap = {
  schoolName: "Gap school",
  daysPerWeek: 5,
  classes: [{ id: "C1", name: "I" }],
  teachers: [], subjects: [], classrooms: [], cards: [],
  bell: { periods: [
    { index: 1, label: "P1", isTeaching: true },
    { index: 3, label: "P3", isTeaching: true },
    { index: 4, label: "P4", isTeaching: true },
  ]},
};
const pagesGap = PivotPrivate.renderReport(report, schoolGap, schoolGap.bell.periods);
const headerCells = pagesGap[0].querySelectorAll("thead th");
// First th is the corner cell; the rest are column headers
const colLabels = Array.from(headerCells).slice(1).map(th => th.textContent.trim());
check(
  "bell-gap school uses bell labels (P1, P3, P4) not sequential ordinals",
  colLabels.length === 3 && colLabels[0] === "P1" && colLabels[1] === "P3" && colLabels[2] === "P4",
  "got " + JSON.stringify(colLabels)
);

// Test 3 — default (no daysPerWeek set) falls back to 6 days.
const schoolDefault = { ...school5, daysPerWeek: undefined };
const pagesDefault = PivotPrivate.renderReport(report, schoolDefault, schoolDefault.bell.periods);
const rowCountDefault = pagesDefault[0].querySelectorAll("tbody tr").length;
check("missing daysPerWeek falls back to 6 days", rowCountDefault === 6, `got ${rowCountDefault} rows`);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
