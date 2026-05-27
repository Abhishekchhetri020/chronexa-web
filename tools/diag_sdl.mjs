// Diagnostic: parse the actual sample-school.xml and run solver,
// then check subject distribution per class (I A).
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");

const solverUrl = pathToFileURL(path.join(repoRoot, "js/solver/csp_solver.js")).href;
const { solve } = await import(solverUrl);

const xmlText = fs.readFileSync(path.join(repoRoot, "sample-school.xml"), "utf-8");

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
  const cids = l.classids.split(",").filter(Boolean);
  const realCids = cids.filter(id => classesRaw.some(c => c.id === id));
  if (realCids.length === 0) return null;
  const tids = (l.teacherids || "").split(",").filter(Boolean);
  const gids = (l.groupids || "").split(",").filter(Boolean);
  const rids = (l.classroomids || "").split(",").filter(Boolean);
  const ppc = parseInt(l.periodspercard, 10) || 1;
  return {
    id: l.id,
    classIds: realCids,
    teacherIds: tids,
    subjectId: l.subjectid,
    groupIds: gids,
    periodsPerWeek: parseFloat(l.periodsperweek) || 0,
    isLabDouble: ppc > 1 || undefined,
    lessonLength: ppc > 1 ? ppc : undefined,
    preferredRoomId: rids[0] || undefined,
    _lessonRoomIds: rids,
  };
}).filter(Boolean);

const periods = periodsRaw.map(p => ({
  index: parseInt(p.period, 10),
  label: p.name || `P${p.period}`,
  isTeaching: true,
})).sort((a, b) => a.index - b.index);

const school = {
  schoolName: "Classic Timetable 2012 XML",
  daysPerWeek: 6,
  bell: { periods },
  teachers, classes, classrooms, subjects, lessons, groups,
  cards: [],
};

console.log(`Parsed: ${teachers.length} teachers, ${classes.length} classes, ${subjects.length} subjects, ${lessons.length} lessons, ${groups.length} groups, ${periods.length} periods`);

// Find I A
const iaClass = classes.find(c => c.name === "I A");
if (!iaClass) { console.log("Class I A not found!"); process.exit(1); }

// Show I A lessons
const iaLessons = lessons.filter(l => l.classIds.includes(iaClass.id));
console.log(`\nI A has ${iaLessons.length} lessons, total periods = ${iaLessons.reduce((s,l) => s + l.periodsPerWeek, 0)}:`);
for (const l of iaLessons) {
  const subj = subjects.find(s => s.id === l.subjectId);
  const ppw = l.periodsPerWeek;
  const ideal = Math.ceil(ppw / 6);
  console.log(`  ${(subj?.name||"?").padEnd(25)} ppw=${ppw} ideal/day=${ideal}`);
}

// Run solver
console.log("\n=== Solving (30s budget)... ===");
const t0 = Date.now();
const res = solve(school, { warmStart: false, timeLimitSec: 30, seed: 42 });
console.log(`Result: status=${res.status} placed=${res.stats.placed} unplaced=${res.stats.unplaced} time=${Date.now()-t0}ms`);

if (res.stats.placed === 0) {
  console.log("No placements! Checking violations...");
  for (const v of (res.violations || []).slice(0, 5)) {
    console.log(`  ${v.description}`);
  }
  process.exit(1);
}

// Build lessonId → subjectName map
const lessonSubjMap = {};
for (const l of lessons) {
  const subj = subjects.find(s => s.id === l.subjectId);
  lessonSubjMap[l.id] = subj?.name || l.subjectId;
}

// Filter to I A assignments
const iaLessonIds = new Set(iaLessons.map(l => l.id));
const iaAssignments = res.assignment.filter(a => iaLessonIds.has(a.lessonId));

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const subjectDayMap = {};
for (const a of iaAssignments) {
  const subj = lessonSubjMap[a.lessonId] || "?";
  if (!subjectDayMap[subj]) subjectDayMap[subj] = {};
  subjectDayMap[subj][a.day] = (subjectDayMap[subj][a.day] || 0) + 1;
}

console.log("\n=== I A: Subject × Day distribution ===");
console.log("Subject".padEnd(25) + dayNames.map(d => d.padStart(5)).join("") + "  Total  Ideal  Issue?");
let issueCount = 0;
for (const [subj, dayMap] of Object.entries(subjectDayMap).sort()) {
  const total = Object.values(dayMap).reduce((s, v) => s + v, 0);
  const idealMax = Math.ceil(total / 6);
  const maxPerDay = Math.max(0, ...Object.values(dayMap));
  const row = Array.from({length: 6}, (_, d) => (dayMap[d] || 0));
  const issue = maxPerDay > idealMax ? `⚠️  ${maxPerDay}>${idealMax}` : "✅";
  if (maxPerDay > idealMax) issueCount++;
  console.log(
    subj.padEnd(25) +
    row.map(v => String(v).padStart(5)).join("") +
    String(total).padStart(7) +
    String(idealMax).padStart(7) +
    "  " + issue
  );
}
console.log(`\n${issueCount} subjects with uneven distribution`);
process.exit(issueCount > 0 ? 1 : 0);
