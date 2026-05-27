// Benchmark Runner for Chronexa CSP Solver
// Measures: time-to-first-solution, time-to-best, placed/total, soft score
// Run: node tools/benchmark_solver.mjs

import { readFileSync, writeFileSync } from "fs";
import { pathToFileURL } from "url";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

async function loadSolver() {
  const solverPath = join(rootDir, "js", "solver", "csp_solver.js");
  const solverModule = await import(pathToFileURL(solverPath).href);
  return solverModule;
}

function loadBenchmark(filename) {
  const filepath = join(rootDir, "benchmarks", filename);
  const data = JSON.parse(readFileSync(filepath, "utf-8"));
  return data;
}

async function runBenchmark(name, schoolData, options = {}) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`BENCHMARK: ${name}`);
  console.log(`${"=".repeat(80)}`);
  
  const expectedCards = schoolData.lessons.reduce((sum, l) => sum + l.periodsPerWeek, 0);
  console.log(`  Classes: ${schoolData.classes.length}`);
  console.log(`  Teachers: ${schoolData.teachers.length}`);
  console.log(`  Subjects: ${schoolData.subjects.length}`);
  console.log(`  Lessons: ${schoolData.lessons.length}`);
  console.log(`  Expected cards: ${expectedCards}`);
  console.log(`  Classrooms: ${schoolData.classrooms.length}`);
  console.log(`\nRunning solver...`);
  
  const solver = await loadSolver();
  const startTime = performance.now();
  
  let result;
  try {
    result = solver.solve(schoolData, {
      timeLimit: options.timeLimit || 30000,  // 30s default
      branchCount: options.branchCount || 8,
      ...options
    });
  } catch (err) {
    console.error(`  ❌ Solver error: ${err.message}`);
    console.error(err.stack);
    return { error: err.message };
  }
  
  const endTime = performance.now();
  const duration = (endTime - startTime) / 1000;
  
  console.log(`\n  ✓ Solver completed in ${duration.toFixed(3)}s`);
  console.log(`\nRESULTS:`);
  console.log(`  Status: ${result.status}`);
  const stats = result.stats || {};
  const statsPlaced = stats.placed || 0;
  const statsSoft = stats.softScore || 0;
  const statsDuration = stats.durationMs || 0;
  const statsHard = stats.hardConflicts || 0;
  console.log(`  Placed: ${statsPlaced} / ${expectedCards} (${expectedCards ? ((statsPlaced/expectedCards)*100).toFixed(1) : 0}%)`);
  console.log(`  Hard conflicts: ${statsHard}`);
  console.log(`  Soft score: ${statsSoft}`);
  console.log(`  Solver time: ${(statsDuration/1000).toFixed(3)}s`);
  console.log(`  Backtracks: ${stats.backtracks || "N/A"}`);
  
  if (result.violations && result.violations.length > 0) {
    console.log(`\n  Violations (${result.violations.length}):`);
    result.violations.slice(0, 5).forEach(v => {
      console.log(`    - ${v.ruleId || v.rule || 'unknown'}: ${v.description || v.message || JSON.stringify(v)}`);
    });
    if (result.violations.length > 5) {
      console.log(`    ... and ${result.violations.length - 5} more`);
    }
  }
  
  return {
    name,
    duration,
    status: result.status,
    placed: statsPlaced,
    expected: expectedCards,
    softScore: statsSoft,
    hardConflicts: statsHard,
    durationMs: statsDuration,
    violations: result.violations ? result.violations.length : 0
  };
}

async function main() {
  console.log("Chronexa CSP Solver Benchmark Suite");
  console.log("====================================\n");
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);
  console.log(`Node: ${process.version}`);
  
  // Load WASM exports
  const cspWasmUrl = pathToFileURL(join(rootDir, "js", "solver", "wasm", "csp_wasm.js")).href;
  const { wasmExports } = await import(cspWasmUrl);
  const exports = await wasmExports();
  if (exports) {
    globalThis.__chronexaWasmExports = exports;
    console.log("✓ Loaded __chronexaWasmExports successfully for benchmark.");
  } else {
    console.warn("⚠️ WASM exports not available; benchmarks will fall back to JS.");
  }

  const benchmarks = [
    { name: "Small School (50 cards)", file: "small_school.json", timeLimit: 10000 },
    { name: "Medium School (300 cards)", file: "medium_school.json", timeLimit: 30000 },
    { name: "Large School (800 cards)", file: "large_school.json", timeLimit: 60000 }
  ];
  
  const results = [];
  
  for (const bench of benchmarks) {
    console.log(`\nLoading ${bench.file}...`);
    const school = loadBenchmark(bench.file);
    
    console.log(`--- Running JS Baseline for ${bench.name} ---`);
    const resJS = await runBenchmark(`${bench.name} [JS]`, school, { timeLimit: bench.timeLimit, useWasm: false });
    
    console.log(`--- Running WASM Zero-Copy for ${bench.name} ---`);
    const resWasm = await runBenchmark(`${bench.name} [WASM]`, school, { timeLimit: bench.timeLimit, useWasm: true });
    
    results.push({
      name: bench.name,
      js: resJS,
      wasm: resWasm
    });
  }
  
  // Summary table
  console.log(`\n${"=".repeat(95)}`);
  console.log("SUMMARY: JS vs WASM ZERO-COPY");
  console.log(`${"=".repeat(95)}\n`);
  console.log("Test Case".padEnd(30) + "JS Time".padEnd(12) + "WASM Time".padEnd(12) + "Speedup".padEnd(10) + "JS Placed".padEnd(12) + "WASM Placed".padEnd(12) + "Status");
  console.log("-".repeat(95));
  
  for (const r of results) {
    if (r.js.error || r.wasm.error) {
      console.log(`${r.name.padEnd(30)}ERROR: ${r.js.error || r.wasm.error}`);
    } else {
      const jsTimeVal = r.js.durationMs / 1000;
      const wasmTimeVal = r.wasm.durationMs / 1000;
      const jsTime = jsTimeVal.toFixed(2) + "s";
      const wasmTime = wasmTimeVal.toFixed(2) + "s";
      
      const speedupVal = wasmTimeVal > 0 ? (jsTimeVal / wasmTimeVal) : 1;
      const speedup = speedupVal.toFixed(2) + "x";
      
      const jsPlaced = `${r.js.placed}/${r.js.expected}`;
      const wasmPlaced = `${r.wasm.placed}/${r.wasm.expected}`;
      
      const status = r.wasm.status + (r.wasm.hardConflicts ? ` (${r.wasm.hardConflicts}HC)` : "");
      console.log(`${r.name.padEnd(30)}${jsTime.padEnd(12)}${wasmTime.padEnd(12)}${speedup.padEnd(10)}${jsPlaced.padEnd(12)}${wasmPlaced.padEnd(12)}${status}`);
    }
  }
  
  // Save results to JSON
  const resultsPath = join(rootDir, "benchmarks", "results.json");
  const resultsData = {
    timestamp: new Date().toISOString(),
    platform: `${process.platform} ${process.arch}`,
    nodeVersion: process.version,
    results
  };
  writeFileSync(resultsPath, JSON.stringify(resultsData, null, 2));
  console.log(`\n✓ Results saved to ${resultsPath}`);
}

main().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
