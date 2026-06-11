// Deterministic solver benchmark — measures wall time + placement quality
// across the benchmarks/*.json fixtures with fixed seeds and budgets.
//
// Run:  node tools/bench_baseline.mjs            (quick: medium+large)
//       node tools/bench_baseline.mjs --full     (all fixtures, 2 seeds)
//       node tools/bench_baseline.mjs --out results.json
//
// Pure JS path (no WASM), learning disabled — so before/after numbers
// compare the solver code itself, not cached ML state.

import { readFileSync, writeFileSync } from "fs";
import { pathToFileURL } from "url";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const { solve } = await import(pathToFileURL(join(rootDir, "js", "solver", "csp_solver.js")).href);

const FULL = process.argv.includes("--full");
const outIdx = process.argv.indexOf("--out");
const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : null;

const QUICK = [
  { file: "medium_school.json", timeLimitSec: 6 },
  { file: "large_school.json", timeLimitSec: 10 },
];
const ALL = [
  { file: "small_school.json", timeLimitSec: 3 },
  { file: "medium_school.json", timeLimitSec: 6 },
  { file: "large_school.json", timeLimitSec: 10 },
  { file: "large_school_realistic.json", timeLimitSec: 10 },
  { file: "real_school.json", timeLimitSec: 15 },
  // Warm-start + LNS exercises the repair/restore path on the real XML.
  { file: "real_school.json", timeLimitSec: 15, options: { warmStart: true, useLNS: true }, label: "real_school+warmLNS" },
];

const SEEDS = FULL ? [1, 42] : [1, 42];
const fixtures = FULL ? ALL : QUICK;

const rows = [];
for (const fx of fixtures) {
  const school = JSON.parse(readFileSync(join(rootDir, "benchmarks", fx.file), "utf-8"));
  for (const seed of SEEDS) {
    const opts = { timeLimitSec: fx.timeLimitSec, seed, disableLearning: true, ...(fx.options || {}) };
    const t0 = performance.now();
    const res = solve(school, opts);
    const wall = performance.now() - t0;
    const row = {
      fixture: fx.label || fx.file.replace(".json", ""),
      seed,
      budgetSec: fx.timeLimitSec,
      status: res.status,
      placed: res.stats.placed,
      unplaced: res.stats.unplaced,
      softScore: res.stats.softScore,
      scrubbed: res.stats.scrubbedConflicts || 0,
      wallMs: Math.round(wall),
    };
    rows.push(row);
    console.log(
      row.fixture.padEnd(22),
      ("seed=" + seed).padEnd(8),
      row.status.padEnd(10),
      ("placed=" + row.placed + "/" + (row.placed + row.unplaced)).padEnd(18),
      ("soft=" + row.softScore).padEnd(14),
      ("scrub=" + row.scrubbed).padEnd(9),
      ("wall=" + row.wallMs + "ms")
    );
  }
}

const totalPlaced = rows.reduce((s, r) => s + r.placed, 0);
const totalUnplaced = rows.reduce((s, r) => s + r.unplaced, 0);
const totalWall = rows.reduce((s, r) => s + r.wallMs, 0);
console.log("\nTOTAL placed=" + totalPlaced + "/" + (totalPlaced + totalUnplaced) + "  wall=" + (totalWall / 1000).toFixed(1) + "s");

if (outFile) {
  writeFileSync(outFile, JSON.stringify({ date: new Date().toISOString(), rows }, null, 2));
  console.log("wrote " + outFile);
}
