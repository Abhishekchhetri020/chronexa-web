// A/B probe — audit #15 fail-before / pass-after.
// Imports BOTH the pre-fix (baseline, filter disabled) and post-fix copies of
// constraints.js, runs the same split-class student scenario, and asserts:
//   baseline → 2 phantom conflicts (Boys sees Music, Girls sees Art)
//   fixed    → 0 conflicts (each student only sees their group)

import { studentScheduleConflicts } from "../js/solver/constraints.js";
import { studentScheduleConflicts as preFix } from "/tmp/constraints_pre15.js";

function fixture() {
  return {
    students: [
      { id: "S1", firstName: "Boys",  classId: "c1" },
      { id: "S2", firstName: "Girls", classId: "c1" },
    ],
    groups: [
      { id: "g1", classId: "c1", name: "Boys",  studentIds: ["S1"] },
      { id: "g2", classId: "c1", name: "Girls", studentIds: ["S2"] },
    ],
    lessons: [
      { id: "LART",   subjectId: "sArt",   classIds: ["c1"], groupIds: ["g1"] },
      { id: "LMUSIC", subjectId: "sMusic", classIds: ["c1"], groupIds: ["g2"] },
    ],
    cards: [
      { id: "cardA", lessonId: "LART",   day: 0, period: 1, classroomId: "r1" },
      { id: "cardB", lessonId: "LMUSIC", day: 0, period: 1, classroomId: "r2" },
    ],
    studentSubjects: [],
    subjects: [{ id: "sArt", name: "Art" }, { id: "sMusic", name: "Music" }],
    _idx: {
      lessonById: {
        LART:   { id: "LART",   subjectId: "sArt",   classIds: ["c1"], groupIds: ["g1"] },
        LMUSIC: { id: "LMUSIC", subjectId: "sMusic", classIds: ["c1"], groupIds: ["g2"] },
      },
      subjectById: { sArt: { id: "sArt", name: "Art" }, sMusic: { id: "sMusic", name: "Music" } },
    },
    cards_plain: [],
  };
}

function buildCardsByClass(school) {
  school._idx.cardsByClass = {};
  for (const c of school.cards) {
    const l = school._idx.lessonById[c.lessonId];
    for (const cid of (l.classIds || [])) {
      (school._idx.cardsByClass[cid] = school._idx.cardsByClass[cid] || []).push(c);
    }
  }
}

const schoolPre = fixture();  buildCardsByClass(schoolPre);
const schoolPost = fixture(); buildCardsByClass(schoolPost);
const p = preFix(schoolPre).length;
const q = studentScheduleConflicts(schoolPost).length;
console.log(`baseline conflicts: ${p}`);
console.log(`fixed    conflicts: ${q}`);

if (p === 2 && q === 0) {
  console.log("PASS audit #15: pre-fix double-books, post-fix filters by group");
  process.exit(0);
}
console.log(`FAIL audit #15 A/B: pre=${p} (want 2), post=${q} (want 0)`);
process.exit(1);
