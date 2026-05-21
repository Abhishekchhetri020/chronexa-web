// Discriminating check for the soft-rel hookup: does the penalty actually
// bias placement, or is it inert on the existing fixtures?
//
// Construct a tiny school with deliberate slack:
//   1 teacher, 1 class, 1 room, 5 days × 6 periods.
//   12 lessons (8 Art + 4 PE), enough to fill 40 % of the grid.
//   1 n_17 relation on subject "Art" — every Art card should prefer afternoon.
//
// Solve twice: once with `soft_relation_violation` weight 0 (no bias),
// once with weight 10 (the new default). Compare:
//   * SOFT_n_17_afternoon violation count in result.violations[]
//   * Average period index of Art placements (lower = more morning).
//
// If the weighted run lands fewer Art cards in morning periods, the
// penalty is actually steering placement, not just being measured.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");
const solverUrl  = pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href;
const { solve }  = await import(solverUrl);

function makeSchool() {
  const periods = [];
  for (let i = 1; i <= 6; i++) {
    periods.push({ index: i, label: "P" + i, startMin: 480 + (i - 1) * 40, endMin: 480 + i * 40, isTeaching: true });
  }
  const lessons = [];
  for (let i = 0; i < 8; i++) {
    lessons.push({ id: `Art_${i}`, classIds: ["C1"], teacherIds: ["T1"], subjectId: "S_ART", periodsPerWeek: 1 });
  }
  for (let i = 0; i < 4; i++) {
    lessons.push({ id: `PE_${i}`, classIds: ["C1"], teacherIds: ["T1"], subjectId: "S_PE", periodsPerWeek: 1 });
  }
  return {
    schoolName: "BiasTest",
    daysPerWeek: 5,
    bell: { periods },
    teachers:   [{ id: "T1", name: "T1" }],
    classes:    [{ id: "C1", name: "C1" }],
    classrooms: [{ id: "R1", name: "R1" }],
    subjects:   [{ id: "S_ART", name: "Art" }, { id: "S_PE", name: "PE" }],
    lessons,
    relations:  [{ id: "rel_art_afternoon", typ: "n_17", subjectids: ["S_ART"], classids: [] }],
    cards: [],
  };
}

function summarize(result) {
  const arts = result.assignment.filter(a => a.lessonId.startsWith("Art_"));
  const morningCount = arts.filter(a => a.period <= 3).length; // P1..P3 = morning
  const afternoonCount = arts.filter(a => a.period >= 4).length;
  const avgPeriod = arts.reduce((s, a) => s + a.period, 0) / arts.length;
  const violSoftN17 = (result.violations || []).filter(v => v.ruleId === "SOFT_n_17_afternoon").length;
  return { placed: result.stats.placed, hardConflicts: result.stats.hardConflicts, softScore: result.stats.softScore, artsInMorning: morningCount, artsInAfternoon: afternoonCount, avgArtPeriod: avgPeriod.toFixed(2), violSoftN17 };
}

const school = makeSchool();

// Run A: weight at default (10).
console.log("# Bias test — weight=10 (current default)");
const seeds = [1, 2, 3, 4, 5];
const a = [];
for (const seed of seeds) {
  const r = solve(school, { seed, warmStart: false, timeLimitSec: 5, useIterativeRepair: true });
  a.push(summarize(r));
}
console.table(a);

// Run B: weight zeroed by patching the bundled DEFAULT_SOFT_WEIGHTS — we
// can't mutate the frozen const, so we monkey-patch model.weights via a
// solve() wrapper using globalThis. Cleanest path: build the school with
// the relation absent, which is the equivalent of weight=0 for our typ.
const noRelSchool = { ...school, relations: [] };
console.log("\n# Bias test — weight effectively 0 (relation removed)");
const b = [];
for (const seed of seeds) {
  const r = solve(noRelSchool, { seed, warmStart: false, timeLimitSec: 5, useIterativeRepair: true });
  b.push(summarize(r));
}
console.table(b);

// --- Conclusion ------------------------------------------------------------
const avgWithRel    = a.reduce((s, r) => s + parseFloat(r.avgArtPeriod), 0) / a.length;
const avgWithoutRel = b.reduce((s, r) => s + parseFloat(r.avgArtPeriod), 0) / b.length;
console.log(`\nAverage Art-card period — with n_17 (weight=10): ${avgWithRel.toFixed(2)}`);
console.log(`Average Art-card period — no n_17    (weight=0):  ${avgWithoutRel.toFixed(2)}`);
console.log(`Delta:                                            ${(avgWithRel - avgWithoutRel).toFixed(2)} (positive = later periods, i.e. biased toward afternoon)`);
