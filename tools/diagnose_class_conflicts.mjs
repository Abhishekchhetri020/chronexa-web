// Diagnose II-B Mon-P7 hypothesis: after solve() with warmStart=true on
// sample-school.xml, does the assignment contain ANY (class, day, period)
// with two lessons whose group masks intersect? Prints offending cells.

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

const solverUrl = pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href;
const { solve } = await import(solverUrl);

const xmlPath = process.argv[2] || path.join(repoRoot, "sample-school.xml");
const xml = fs.readFileSync(xmlPath, "utf8");
const school = parseTimetableXml.parseText(xml, path.basename(xmlPath));

console.log("teachers:", school.teachers.length,
  "classes:", school.classes.length,
  "lessons:", school.lessons.length,
  "cards:", school.cards.length);

// Build lookup maps
const lessonById = Object.fromEntries(school.lessons.map(l => [l.id, l]));
const classById  = Object.fromEntries(school.classes.map(c => [c.id, c]));
const groupById  = Object.fromEntries((school.groups || []).map(g => [g.id, g]));

const t0 = performance.now();
const res = await solve(school, { warmStart: true, timeBudgetMs: 5000 });
const dt = (performance.now() - t0) | 0;
console.log(`solve(): status=${res.status} placed=${res.stats.placed}/${res.stats.placed + res.stats.unplaced} dur=${dt}ms hardConflicts=${res.stats.hardConflicts}`);

// Walk assignment[]: each entry has { lessonId, day, period, classroomId? }.
// For each placement, expand to (classId, groupBits) tuples.
// Two placements at the same (classId, day, period) conflict iff their
// group bitmasks intersect.

const cellMap = new Map(); // key = `${classId}|${day}|${period}` → [{lesson, mask}]
const conflicts = [];

// Helper: compute the group-mask used by the solver for a given lesson+class.
function groupMaskFor(lesson, classId) {
  const gids = lesson.groupIds || [];
  // Determine bit per group in that class
  const allClassGroups = (school.groups || []).filter(g => g.classId === classId);
  let mask = 0;
  let sawEntire = false;
  for (const gid of gids) {
    const g = groupById[gid];
    if (!g || g.classId !== classId) continue;
    if (g.entireClass) { sawEntire = true; break; }
    const bit = allClassGroups.findIndex(cg => cg.id === gid);
    if (bit >= 0) mask = (mask | (1 << bit)) >>> 0;
  }
  if (sawEntire || mask === 0) {
    const n = allClassGroups.length;
    mask = (n === 0) ? 1 : (n >= 32 ? 0xffffffff : ((1 << n) - 1) >>> 0);
  }
  return mask >>> 0;
}

for (const a of res.assignment) {
  const lesson = lessonById[a.lessonId];
  if (!lesson) continue;
  for (const cid of (lesson.classIds || [])) {
    const mask = groupMaskFor(lesson, cid);
    const key = `${cid}|${a.day}|${a.period}`;
    let bucket = cellMap.get(key);
    if (!bucket) { bucket = []; cellMap.set(key, bucket); }
    // Check intersect with prior placements at this cell
    for (const prev of bucket) {
      if ((prev.mask & mask) !== 0) {
        conflicts.push({
          classId: cid,
          className: classById[cid]?.name || cid,
          day: a.day,
          period: a.period,
          lesson1: prev.lesson.id,
          lesson2: lesson.id,
          mask1: prev.mask,
          mask2: mask,
        });
      }
    }
    bucket.push({ lesson, mask });
  }
}

console.log(`\nclass-conflict cells: ${conflicts.length}`);
for (const c of conflicts.slice(0, 20)) {
  console.log(`  ${c.className} day=${c.day} P${c.period+1}  L1=${c.lesson1}(mask=0x${c.mask1.toString(16)})  L2=${c.lesson2}(mask=0x${c.mask2.toString(16)})`);
}

// Specifically look at II B Mon P7
const iiB = school.classes.find(c => c.name && c.name.trim() === "II B");
if (iiB) {
  const placedAtIIB_MonP7 = res.assignment.filter(a => {
    if (a.day !== 0 || a.period !== 6) return false; // period is 0-based here
    const l = lessonById[a.lessonId];
    return l && (l.classIds || []).includes(iiB.id);
  });
  console.log(`\nII B (id=${iiB.id}) Mon P7 (0-idx day=0 period=6) placements: ${placedAtIIB_MonP7.length}`);
  for (const a of placedAtIIB_MonP7) {
    const l = lessonById[a.lessonId];
    console.log(`  lesson=${a.lessonId} subject=${l.subjectId} groups=${(l.groupIds||[]).join(',')}`);
  }
  // Also try period=7 (1-based-from-XML) and day=0
  const placed_p7 = res.assignment.filter(a => {
    const l = lessonById[a.lessonId];
    return l && (l.classIds || []).includes(iiB.id) && a.day === 0 && a.period === 7;
  });
  console.log(`II B Mon period-index=7 placements: ${placed_p7.length}`);
}
