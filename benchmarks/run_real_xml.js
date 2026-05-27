// Real-XML benchmark — runs the solver against the converted sample-school.xml
// Usage: node benchmarks/run_real_xml.js [timeLimitSec]
// Default time limit: 30s for CI, pass higher for manual testing.

const fs = require('fs');
const path = require('path');
const { solve } = require('../js/solver/csp_solver.js');

const DATA_PATH = path.join(__dirname, 'real_school.json');
if (!fs.existsSync(DATA_PATH)) {
    console.error('ERROR: real_school.json not found. Run the Python converter first.');
    process.exit(1);
}

const timeLimit = parseInt(process.argv[2]) || 30;
const schoolData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

console.log('=== Chronexa Real-XML Benchmark ===');
console.log(`School: ${schoolData.schoolName}`);
console.log(`Lessons: ${schoolData.lessons.length}`);
console.log(`Expected cards: ${sumPeriods(schoolData.lessons)}`);
console.log(`Pre-placed cards: ${(schoolData.cards || []).length}`);
console.log(`Teachers: ${schoolData.teachers.length}`);
console.log(`Classes: ${schoolData.classes.length}`);
console.log(`Classrooms: ${schoolData.classrooms.length}`);
console.log(`Days/Week: ${schoolData.daysPerWeek || 6}`);
console.log(`Periods/Day: ${(schoolData.bell?.periods || []).length || 8}`);
console.log(`Relations: ${(schoolData.relations || []).length}`);
console.log(`Time limit: ${timeLimit}s`);
console.log();

function sumPeriods(lessons) {
    return lessons.reduce((s, l) => s + (l.periodsPerWeek | 0), 0);
}

// Run cold-path first (no warm start)
console.log('--- Cold path (warmStart: false) ---');
const t0 = Date.now();
const coldResult = solve(schoolData, { timeLimitSec: timeLimit, warmStart: false });
const coldMs = Date.now() - t0;

console.log(`  Status: ${coldResult.status}`);
console.log(`  Wall: ${coldMs}ms (solver: ${coldResult.stats.durationMs}ms)`);
console.log(`  Placed: ${coldResult.stats.placed}/${coldResult.stats.placed + coldResult.stats.unplaced} ` +
            `(${pct(coldResult.stats.placed, coldResult.stats.placed + coldResult.stats.unplaced)})`);
console.log(`  Soft Score: ${coldResult.stats.softScore}`);

// Run warm-path
console.log();
console.log('--- Warm path (warmStart: true) ---');
const t1 = Date.now();
const warmResult = solve(schoolData, { timeLimitSec: timeLimit, warmStart: true });
const warmMs = Date.now() - t1;

console.log(`  Status: ${warmResult.status}`);
console.log(`  Wall: ${warmMs}ms (solver: ${warmResult.stats.durationMs}ms)`);
console.log(`  Placed: ${warmResult.stats.placed}/${warmResult.stats.placed + warmResult.stats.unplaced} ` +
            `(${pct(warmResult.stats.placed, warmResult.stats.placed + warmResult.stats.unplaced)})`);
console.log(`  Soft Score: ${warmResult.stats.softScore}`);

// Acceptance criteria
const totalExpected = sumPeriods(schoolData.lessons);
const coldPct = coldResult.stats.placed / Math.max(1, totalExpected);
const warmPct = warmResult.stats.placed / Math.max(1, totalExpected);

console.log();
console.log('--- Acceptance Criteria ---');
const coldPass = coldPct >= 0.85;
const warmPass = warmPct >= 0.90;
console.log(`  Cold path >= 85%: ${coldPass ? 'PASS ✓' : 'FAIL ✗'} (${(coldPct * 100).toFixed(1)}%)`);
console.log(`  Warm path >= 90%: ${warmPass ? 'PASS ✓' : 'FAIL ✗'} (${(warmPct * 100).toFixed(1)}%)`);

if (coldPass && warmPass) {
    console.log();
    console.log('BENCHMARK PASSED');
    process.exit(0);
} else {
    console.log();
    console.log('BENCHMARK FAILED');
    process.exit(1);
}

function pct(placed, total) {
    if (!total) return '0.0%';
    return (placed / total * 100).toFixed(1) + '%';
}
