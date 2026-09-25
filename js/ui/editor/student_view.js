// [vite-esm] student_view.js — Student timetable resolution logic for Chronexa editor.
import "../state.js";

/**
 * Normalizes and returns the student list for a school.
 * If school.students is not yet populated (e.g. demo school), seeds realistic
 * demo students across classes, especially for split classes (e.g. Urdu vs Sanskrit in VI A).
 */
export function getStudents(school) {
  if (!school) return [];
  if (Array.isArray(school.students) && school.students.length > 0) {
    return school.students;
  }
  return ensureDemoStudents(school);
}

/**
 * Returns student elective / subject enrollments for a given student.
 */
export function getStudentEnrollments(school, studentId) {
  if (!school || !studentId) return [];
  const list = school.studentSubjects || school.studentsubjects || [];
  return list.filter(e => e.studentId === studentId);
}

/**
 * Determines whether a given lesson applies to a specific student:
 * - Whole-class lessons of the student's class (no groupIds or entireClass group)
 * - Split lessons belonging to the student's division group (via group.studentIds or studentsubjects)
 * - Course-group / elective lessons enrolled by the student via studentsubjects
 */
export function doesLessonApplyToStudent(school, student, lesson) {
  if (!school || !student || !lesson) return false;

  const studentClassId = student.classId;
  const lessonClassIds = lesson.classIds || [];
  const inStudentClass = studentClassId ? lessonClassIds.includes(studentClassId) : false;

  const groups = school.groups || [];
  const groupIds = lesson.groupIds || [];
  const lessonGroups = groupIds.map(gid => groups.find(g => g.id === gid)).filter(Boolean);

  // If the lesson is specifically assigned to classes, and student's class is NOT one of them:
  if (lessonClassIds.length > 0 && !inStudentClass) {
    // Only applies if the lesson's groups explicitly list this specific student
    const explicitlyEnrolled = lessonGroups.some(g =>
      Array.isArray(g.studentIds) && g.studentIds.includes(student.id)
    );
    return explicitlyEnrolled;
  }

  const enrollments = getStudentEnrollments(school, student.id);

  // If lessonClassIds is empty (e.g. cross-class course group), check if student is enrolled
  if (lessonClassIds.length === 0) {
    if (lessonGroups.some(g => Array.isArray(g.studentIds) && g.studentIds.includes(student.id))) {
      return true;
    }
    const coursegroups = school.coursegroups || [];
    for (const cg of coursegroups) {
      if ((cg.subjectids || []).includes(lesson.subjectId)) {
        if (enrollments.some(e => e.group === cg.name || e.group === cg.id || e.subjectId === lesson.subjectId)) {
          return true;
        }
      }
    }
    return false;
  }

  // inStudentClass is true:
  if (groupIds.length === 0) {
    // Whole class lesson
    return true;
  }

  // If any group in the lesson is an entireClass group
  if (lessonGroups.some(g => g.entireClass === true || g.entireclass === "1" || g.divisionTag === 0)) {
    return true;
  }

  // Check explicit group studentIds
  for (const g of lessonGroups) {
    if (Array.isArray(g.studentIds) && g.studentIds.includes(student.id)) {
      return true;
    }
  }

  // Check enrollments via studentsubjects
  for (const e of enrollments) {
    // Match by subjectId
    if (e.subjectId && e.subjectId === lesson.subjectId) {
      if (!e.group) return true;
      const eg = String(e.group).toLowerCase().trim();
      const matchesGroup = lessonGroups.some(g =>
        g.id === e.group ||
        String(g.name || "").toLowerCase().trim() === eg ||
        String(g.name || "").toLowerCase().trim().startsWith(eg) ||
        eg.startsWith(String(g.name || "").toLowerCase().trim())
      );
      if (matchesGroup) return true;
    }

    // Match by group name / id directly
    if (e.group) {
      const eg = String(e.group).toLowerCase().trim();
      const matchesGroup = lessonGroups.some(g =>
        g.id === e.group ||
        String(g.name || "").toLowerCase().trim() === eg ||
        String(g.name || "").toLowerCase().trim().startsWith(eg) ||
        eg.startsWith(String(g.name || "").toLowerCase().trim())
      );
      if (matchesGroup) return true;
    }
  }

  // Check if student object itself specifies division group
  if (student.group) {
    const sg = String(student.group).toLowerCase().trim();
    const matchesGroup = lessonGroups.some(g =>
      g.id === student.group ||
      String(g.name || "").toLowerCase().trim() === sg
    );
    if (matchesGroup) return true;
  }

  // Check course groups if any
  const coursegroups = school.coursegroups || [];
  for (const cg of coursegroups) {
    if ((cg.subjectids || []).includes(lesson.subjectId)) {
      if (enrollments.some(e => e.group === cg.name || e.group === cg.id || e.subjectId === lesson.subjectId)) {
        return true;
      }
    }
  }

  // Group-split lesson does not apply to this student
  return false;
}

/**
 * Returns all lessons applicable to a student.
 */
export function getLessonsForStudent(school, student) {
  if (!school || !student) return [];
  const lessons = school.lessons || [];
  return lessons.filter(l => doesLessonApplyToStudent(school, student, l));
}

/**
 * Returns all placed cards applicable to a student.
 */
export function getCardsForStudent(school, student) {
  if (!school || !student) return [];
  const lessons = getLessonsForStudent(school, student);
  const lessonIdSet = new Set(lessons.map(l => l.id));
  return (school.cards || []).filter(c => lessonIdSet.has(c.lessonId));
}

/**
 * Builds the per-render index { studentId -> { "d_p" -> [card] } } for the editor grid.
 * Only includes cards that apply to each student, leaving gaps where their group is elsewhere.
 */
export function buildStudentCardLookup(school, visiblePeriodSet, numDays) {
  const lookup = Object.create(null);
  if (!school) return lookup;

  const students = getStudents(school);
  for (const st of students) {
    lookup[st.id] = Object.create(null);
  }

  const lessonById = school._idx?.lessonById ||
    Object.fromEntries((school.lessons || []).map(l => [l.id, l]));

  const maxDays = Number.isFinite(numDays) ? numDays : 6;
  const cards = school.cards || [];

  // Group students by classId for rapid lookup
  const studentsByClass = Object.create(null);
  const electiveStudents = [];

  for (const st of students) {
    if (st.classId) {
      if (!studentsByClass[st.classId]) studentsByClass[st.classId] = [];
      studentsByClass[st.classId].push(st);
    }
    const enrollments = getStudentEnrollments(school, st.id);
    if (enrollments.length > 0) {
      electiveStudents.push({ student: st, enrollments });
    }
  }

  for (const c of cards) {
    const day = parseInt(c.day, 10);
    const period = parseInt(c.period, 10);
    if (!Number.isFinite(day) || day < 0 || day >= maxDays) continue;
    if (visiblePeriodSet && !visiblePeriodSet.has(period | 0)) continue;

    const lesson = lessonById[c.lessonId];
    if (!lesson) continue;

    const key = day + "_" + period;
    const candidates = new Set();

    // Check class members
    for (const cid of (lesson.classIds || [])) {
      const clsStudents = studentsByClass[cid];
      if (clsStudents) {
        for (const st of clsStudents) candidates.add(st);
      }
    }

    // Check elective enrolled students
    for (const item of electiveStudents) {
      if (item.enrollments.some(e => e.subjectId === lesson.subjectId)) {
        candidates.add(item.student);
      }
    }

    for (const st of candidates) {
      if (doesLessonApplyToStudent(school, st, lesson)) {
        const studentBucket = lookup[st.id];
        if (studentBucket) {
          if (!studentBucket[key]) studentBucket[key] = [];
          studentBucket[key].push(c);
        }
      }
    }
  }

  return lookup;
}

/**
 * Returns rows for the editor grid when perspective is "student".
 */
export function rowsFor(school) {
  if (!school) return [];
  const students = getStudents(school);
  const classById = school._idx?.classById ||
    Object.fromEntries((school.classes || []).map(c => [c.id, c]));

  return students.map(st => {
    const fullName = ((st.firstName || "") + " " + (st.lastName || "")).trim() || st.name || st.id;
    const cls = st.classId ? classById[st.classId] : null;
    const classLabel = cls ? (cls.name || cls.short || cls.id) : "";
    return {
      key: st.id,
      label: fullName,
      sub: classLabel,
    };
  });
}

/**
 * Seeds realistic demo students into school.students and school.studentSubjects.
 * Preserves split classes (like VI A with Urdu vs Sanskrit) so demo is immediately testable.
 */
export function ensureDemoStudents(school) {
  if (!school) return [];
  if (Array.isArray(school.students) && school.students.length > 0) {
    return school.students;
  }

  const students = [];
  const studentSubjects = [];

  const classes = school.classes || [];
  const groups = school.groups || [];
  const subjects = school.subjects || [];

  // Find class VI A if present, or any class with split groups
  const viAClass = classes.find(c => c.name === "VI A" || c.id === "B3D5B254A7F660DD") || classes[0];

  if (viAClass) {
    const viAGroups = groups.filter(g => g.classId === viAClass.id);
    const urduGroup = viAGroups.find(g => /urdu/i.test(g.name));
    const sansGroup = viAGroups.find(g => /sans/i.test(g.name));
    const urduSubj = subjects.find(s => /urdu/i.test(s.name) || /urdu/i.test(s.abbr) || s.id === "9572B76A3D3C3F7B");
    const sansSubj = subjects.find(s => /sans/i.test(s.name) || /sans/i.test(s.abbr) || s.id === "0CDE33E622351018");

    // Student 1: Tariq Ahmad in Urdu group
    const stUrduId = "ST_VI_A_URDU";
    students.push({
      id: stUrduId,
      firstName: "Tariq",
      lastName: "Ahmad",
      name: "Tariq Ahmad",
      classId: viAClass.id,
      gender: "M",
      email: "tariq.ahmad@example.com",
    });
    studentSubjects.push({
      id: "ss_urdu_1",
      studentId: stUrduId,
      subjectId: urduSubj ? urduSubj.id : "S_URDU",
      group: urduGroup ? urduGroup.name : "Urdu",
    });

    // Student 2: Aarav Sharma in Sanskrit group
    const stSansId = "ST_VI_A_SANS";
    students.push({
      id: stSansId,
      firstName: "Aarav",
      lastName: "Sharma",
      name: "Aarav Sharma",
      classId: viAClass.id,
      gender: "M",
      email: "aarav.sharma@example.com",
    });
    studentSubjects.push({
      id: "ss_sans_1",
      studentId: stSansId,
      subjectId: sansSubj ? sansSubj.id : "S_SANS",
      group: sansGroup ? sansGroup.name : "Sans ",
    });
  }

  // Populate representative students for other classes
  const firstNames = ["Ananya", "Rohan", "Priya", "Kabir", "Meera", "Arjun", "Diya", "Reyansh"];
  const lastNames = ["Iyer", "Verma", "Patel", "Singh", "Das", "Chopra", "Gupta", "Malhotra"];

  classes.forEach((cls, idx) => {
    if (viAClass && cls.id === viAClass.id) return; // already added above
    const fn = firstNames[idx % firstNames.length];
    const ln = lastNames[idx % lastNames.length];
    students.push({
      id: "st_demo_" + cls.id,
      firstName: fn,
      lastName: ln,
      name: `${fn} ${ln}`,
      classId: cls.id,
      gender: idx % 2 === 0 ? "F" : "M",
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
    });
  });

  school.students = students;
  school.studentSubjects = studentSubjects;
  school.studentsubjects = studentSubjects;

  return students;
}

// Global exposure for non-ESM / legacy caller paths
if (typeof window !== "undefined") {
  window.StudentView = {
    getStudents,
    getStudentEnrollments,
    doesLessonApplyToStudent,
    getLessonsForStudent,
    getCardsForStudent,
    buildStudentCardLookup,
    rowsFor,
    ensureDemoStudents,
  };
}
