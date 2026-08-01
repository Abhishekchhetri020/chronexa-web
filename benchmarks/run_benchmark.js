import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { solve } from '../js/solver/csp_solver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get benchmark file from command line or default to small
const benchmarkFile = process.argv[2];
if (!benchmarkFile) {
    console.log('Usage: node benchmarks/run_benchmark.js <benchmark_file>');
    console.log('Available benchmarks:');
    console.log('  - benchmarks/small_school.json (10 lessons)');
    console.log('  - benchmarks/medium_school.json (80 lessons)');
    console.log('  - benchmarks/large_school_realistic.json (realistic large dense school)');
    process.exit(1);
}

const benchmarkPath = path.join(__dirname, '..', benchmarkFile);
console.log(`Running benchmark: ${benchmarkPath}\n`);

// Load and validate the benchmark data
const schoolData = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));

console.log(`School: ${schoolData.schoolName || benchmarkFile}`);
console.log(`Lessons: ${schoolData.lessons.length}`);
console.log(`Teachers: ${schoolData.teachers.length}`);
console.log(`Classes: ${schoolData.classes.length}`);
console.log(`Rooms: ${schoolData.classrooms.length}`);
console.log(`Days/Week: ${schoolData.daysPerWeek || 5}`);
console.log(`Periods/Day: ${schoolData.periodsPerDay || 6}`);
console.log();

// Run the solver
console.log('Solving...');
const result = solve(schoolData);

console.log('\nResult:');
console.log(`  Status: ${result.status}`);
console.log(`  Time: ${result.stats.durationMs}ms`);
console.log(`  Soft Score: ${result.stats.softScore}`);
console.log(`  Placements: ${result.assignment.length}`);
console.log(`  Placed: ${result.stats.placed}/${result.stats.placed + result.stats.unplaced}`);
console.log(`  Hard Conflicts: ${result.stats.hardConflicts}`);

// Check if we have violations
if (result.violations && result.violations.length > 0) {
    console.log(`  Violations: ${result.violations.length}`);
    result.violations.slice(0, 5).forEach(v => {
        console.log(`    - ${v.type || v.ruleId}: ${v.message || v.description}`);
    });
}

// Show placement sample
if (result.assignment.length > 0) {
    console.log('\nSample placements (first 5):');
    result.assignment.slice(0, 5).forEach(p => {
        const lesson = schoolData.lessons.find(l => l.id === p.lessonId);
        console.log(`  ${lesson ? lesson.subjectId : p.lessonId} (${(p.classIds && p.classIds[0]) || ''}) with ${p.teacherId} on day ${p.day} period ${p.period}`);
    });
}
