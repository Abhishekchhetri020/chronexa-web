// Diagnostic: parse an aSc XML and run solver, check ALL classes for distribution issues.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");

const solverUrl = pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href;
const { solve } = await import(solverUrl);

// Use the latest XML
const xmlPath = process.argv[2] || "/Users/abhishekchhetri/Downloads/asctt2012 (4).xml";
const xmlText = fs.readFileSync(xmlPath, "utf-8");

// Generic attribute parser
function parseAttrs(tag) {
  const attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

function parseElements(xmlText, tagName) {
  const re = new RegExp(`<${tagName}\\s+([^>]+?)\\s*/>`, "g");
  const results = [];
  let m;
  while ((m = re.exec(xmlText)) !== null) results.push(parseAttrs(m[1]));
  return results;
}

const subjectsRaw = parseElements(xmlText, "subject");
const teachersRaw = parseElements(xmlText, "teacher");
const classesRaw = parseElements(xmlText, "class").filter(c => !c.name?.includes("Floor"));
const roomsRaw = parseElements(xmlText, "classroom");
const groupsRaw = parseElements(xmlText, "group");
const lessonsRaw = parseElements(xmlText, "lesson");
const periodsRaw = parseElements(xmlText, "period");

const subjects = subjectsRaw.map(s => ({ id: s.id, name: s.name, abbr: s.short || s.name }));
const teachers = teachersRaw.map(t => ({ id: t.id, name: t.name, abbr: t.short || t.name, timeOff: {} }));
const classes = classesRaw.map(c => ({ id: c.id, name: c.name, short: c.short || c.name }));
const classrooms = roomsRaw.map(r => ({ id: r.id, name: r.name }));
const groups = groupsRaw.map(g => ({
  id: g.id, name: g.name || "", classId: g.classid || "",
  entireClass: g.entireclass === "1",
  divisionTag: parseInt(g.divisiontag, 10) || 0,
}));
const lessons = lessonsRaw.filter(l => l.classids).map(l => {
  const classIds = l.classids.split(",").filter(Boolean);
  const realCids = classIds.filter(id => classesRaw.some(c => c.id === id));
  if (realCids.length === 0) return null;
  const tids = (l.teacherids || "").split(",").filter(Boolean);
  const gids = (l.groupids || "").split(",").filter(Boolean);
  const rids = (l.classroomids || "").split(",").filter(Boolean);
  const ppc = parseInt(l.periodspercard, 10) || 1;
  return {
    id: l.id, classIds: realCids, teacherIds: tids, subjectId: l.subjectid,
    groupIds: gids, periodsPerWeek: parseFloat(l.periodsperweek) || 0,
    isLabDouble: ppc > 1 || undefined, lessonLength: ppc > 1 ? ppc : undefined,
    preferredRoomId: rids[0] || undefined, _lessonRoomIds: rids,
  };
}).filter(Boolean);

const periods = periodsRaw.map(p => ({
  index: parseInt(p.period, 10), label: p.name || `P${p.period}`, isTeaching: true,
})).sort((a, b) => a.index - b.index);

const school = {
  schoolName: "aSc Timetables 2012 XML (diagnostic)",
  daysPerWeek: 6, bell: { periods },
  teachers, classes, classrooms, subjects, lessons, groups, cards: [],
};

console.log(`Parsed: ${teachers.length} teachers, ${classes.length} classes, ${subjects.length} subjects, ${lessons.length} lessons, ${groups.length} groups, ${periods.length} periods`);

// Solve
console.log("\n=== Solving (45s budget)... ===");
const t0 = Date.now();
const res = solve(school, { warmStart: false, timeLimitSec: 45, seed: 42 });
console.log(`Result: status=${res.status} placed=${res.stats.placed} unplaced=${res.stats.unplaced} time=${((Date.now()-t0)/1000).toFixed(1)}s`);

if (res.stats.placed === 0) {
  console.log("No placements!");
  for (const v of (res.violations || []).slice(0, 5)) console.log(`  ${v.description}`);
  process.exit(1);
}

// Check distribution for EVERY class
const lessonSubjMap = {};
for (const l of lessons) {
  const subj = subjects.find(s => s.id === l.subjectId);
  lessonSubjMap[l.id] = subj?.name || l.subjectId;
}
const lessonClassMap = {};
for (const l of lessons) lessonClassMap[l.id] = l.classIds;

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
let totalIssues = 0;

for (const cls of classes) {
  const clsLessons = lessons.filter(l => l.classIds.includes(cls.id));
  const clsLessonIds = new Set(clsLessons.map(l => l.id));
  const clsAssignments = res.assignment.filter(a => clsLessonIds.has(a.lessonId));
  
  if (clsAssignments.length === 0) continue;
  
  const subjectDayMap = {};
  for (const a of clsAssignments) {
    const subj = lessonSubjMap[a.lessonId] || "?";
    if (!subjectDayMap[subj]) subjectDayMap[subj] = {};
    subjectDayMap[subj][a.day] = (subjectDayMap[subj][a.day] || 0) + 1;
  }
  
  let clsIssues = 0;
  for (const [subj, dayMap] of Object.entries(subjectDayMap)) {
    const total = Object.values(dayMap).reduce((s, v) => s + v, 0);
    const idealMax = Math.ceil(total / 6);
    const maxPerDay = Math.max(0, ...Object.values(dayMap));
    if (maxPerDay > idealMax) clsIssues++;
  }
  
  if (clsIssues > 0) {
    totalIssues += clsIssues;
    console.log(`\n⚠️  ${cls.name}: ${clsIssues} subjects with uneven distribution`);
    console.log("  Subject".padEnd(27) + dayNames.map(d => d.padStart(5)).join("") + " Total Ideal");
    for (const [subj, dayMap] of Object.entries(subjectDayMap).sort()) {
      const total = Object.values(dayMap).reduce((s, v) => s + v, 0);
      const idealMax = Math.ceil(total / 6);
      const maxPerDay = Math.max(0, ...Object.values(dayMap));
      if (maxPerDay > idealMax) {
        const row = Array.from({length: 6}, (_, d) => (dayMap[d] || 0));
        console.log(
          "  " + subj.padEnd(25) +
          row.map(v => String(v).padStart(5)).join("") +
          String(total).padStart(6) +
          String(idealMax).padStart(6) +
          `  ⚠️ max=${maxPerDay}`
        );
      }
    }
  }
}

if (totalIssues === 0) {
  console.log("\n✅ ALL classes have perfect subject distribution!");
} else {
  console.log(`\n⚠️  ${totalIssues} total distribution issues across all classes`);
}
process.exit(totalIssues > 0 ? 1 : 0);
