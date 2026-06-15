// N-seed benchmark for the Chronexa JS and WASM solver paths.
// Run: node benchmarks/run_nseed.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const benchmarkDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(benchmarkDir, "..");
const outputPath = join(benchmarkDir, "baseline_nseed.json");

const seeds = [1, 2, 3, 4, 5];
const timeLimitSec = 30;
const fixtures = [
  { name: "Small School", file: "small_school.json" },
  { name: "Medium School", file: "medium_school.json" },
  { name: "Large School", file: "large_school.json" },
  { name: "Real School", file: "real_school.json" },
];

const moduleUrl = (...parts) => pathToFileURL(join(rootDir, ...parts)).href;
const { solve: jsSolve } = await import(moduleUrl("js", "solver", "csp_solver.js"));
const { solve: wasmSolve } = await import(moduleUrl("js", "solver", "wasm", "adapter.js"));
const { wasmExports } = await import(moduleUrl("js", "solver", "wasm", "csp_wasm.js"));

const loadedWasmExports = await wasmExports();
if (!loadedWasmExports) {
  throw new Error("WASM exports are unavailable; refusing to label adapter runs as WASM.");
}
globalThis.__chronexaWasmExports = loadedWasmExports;

const solvers = [
  {
    key: "js",
    name: "JS",
    source: "js/solver/csp_solver.js",
    solve: jsSolve,
    options: { useWasm: false },
  },
  {
    key: "wasm",
    name: "WASM",
    source: "js/solver/wasm/adapter.js",
    solve: wasmSolve,
    options: { useWasm: true },
  },
];

function loadFixture(file) {
  return JSON.parse(readFileSync(join(benchmarkDir, file), "utf8"));
}

function collectRun(seed, result) {
  const stats = result?.stats;
  if (!stats) throw new Error(`Seed ${seed} returned no solver stats.`);

  return {
    seed,
    status: result.status,
    placed: stats.placed,
    expected: stats.placed + stats.unplaced,
    softScore: stats.softScore,
    hardConflicts: stats.hardConflicts,
    durationMs: stats.durationMs,
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function aggregate(runs) {
  const metrics = ["placed", "expected", "softScore", "hardConflicts", "durationMs"];
  const average = {};
  const min = {};
  const max = {};

  for (const metric of metrics) {
    const values = runs.map((run) => run[metric]);
    average[metric] = round(values.reduce((sum, value) => sum + value, 0) / values.length);
    min[metric] = Math.min(...values);
    max[metric] = Math.max(...values);
  }

  return { runs, average, min, max };
}

function range(min, max) {
  return min === max ? String(min) : `${min}..${max}`;
}

function printSummary(results) {
  const rows = [];
  for (const fixture of results) {
    for (const solver of solvers) {
      const summary = fixture.solvers[solver.key];
      rows.push({
        Fixture: fixture.name,
        Solver: solver.name,
        Seeds: summary.runs.length,
        "Avg placed": `${summary.average.placed}/${summary.average.expected}`,
        "Placed min..max": range(summary.min.placed, summary.max.placed),
        "Avg softScore": summary.average.softScore,
        "Soft min..max": range(summary.min.softScore, summary.max.softScore),
        "Avg hard": summary.average.hardConflicts,
        "Hard min..max": range(summary.min.hardConflicts, summary.max.hardConflicts),
        "Avg durationMs": summary.average.durationMs,
        "Duration min..max": range(summary.min.durationMs, summary.max.durationMs),
      });
    }
  }
  console.table(rows);
}

console.log("Chronexa N-seed solver baseline");
console.log(`Seeds: ${seeds.join(", ")} | per-solve cap: ${timeLimitSec}s | WASM preloaded: yes\n`);

const results = [];
for (const fixture of fixtures) {
  const school = loadFixture(fixture.file);
  const solverRuns = Object.fromEntries(solvers.map((solver) => [solver.key, []]));

  console.log(`${fixture.name} (${fixture.file})`);
  for (const seed of seeds) {
    for (const solver of solvers) {
      const result = await solver.solve(school, {
        seed,
        timeLimitSec,
        disableLearning: true,
        ...solver.options,
      });
      const run = collectRun(seed, result);
      solverRuns[solver.key].push(run);
      console.log(
        `  ${solver.name.padEnd(4)} seed=${seed} ${run.status.padEnd(10)} ` +
        `placed=${run.placed}/${run.expected} soft=${run.softScore} ` +
        `hard=${run.hardConflicts} duration=${run.durationMs}ms`
      );
    }
  }
  console.log();

  results.push({
    name: fixture.name,
    file: fixture.file,
    solvers: Object.fromEntries(
      solvers.map((solver) => [solver.key, aggregate(solverRuns[solver.key])])
    ),
  });
}

const baseline = {
  timestamp: new Date().toISOString(),
  platform: `${process.platform} ${process.arch}`,
  nodeVersion: process.version,
  config: {
    seeds,
    timeLimitSec,
    disableLearning: true,
    wasmPreloaded: true,
    solverPaths: Object.fromEntries(solvers.map((solver) => [solver.key, solver.source])),
    solverOptions: Object.fromEntries(solvers.map((solver) => [solver.key, solver.options])),
    note: "All four fixtures use five seeds and an explicit 30-second per-solve cap. The WASM adapter runs with its shipped WASM hot path enabled.",
  },
  results,
};

writeFileSync(outputPath, `${JSON.stringify(baseline, null, 2)}\n`);
printSummary(results);
console.log(`\nBaseline written to ${outputPath}`);
