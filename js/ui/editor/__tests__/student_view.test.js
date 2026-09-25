import { describe, it, expect } from "vitest";
import {
  doesLessonApplyToStudent,
  getLessonsForStudent,
  getCardsForStudent,
  buildStudentCardLookup,
  rowsFor,
  getStudents
} from "../student_view.js";

describe("student_view", () => {
  const schoolFixture = {
    classes: [
      { id: "C_VI_A", name: "VI A" },
      { id: "C_VI_B", name: "VI B" },
    ],
    subjects: [
      { id: "S_MATH", name: "Mathematics", abbr: "Math" },
      { id: "S_URDU", name: "URDU", abbr: "Urdu" },
      { id: "S_SANS", name: "SANSKRIT", abbr: "Sans" },
    ],
    groups: [
      { id: "G_ENTIRE", classId: "C_VI_A", name: "Entire class", entireClass: true },
      { id: "G_URDU", classId: "C_VI_A", name: "Urdu", entireClass: false, divisionTag: 2 },
      { id: "G_SANS", classId: "C_VI_A", name: "Sans ", entireClass: false, divisionTag: 2 },
    ],
    lessons: [
      { id: "L_MATH", classIds: ["C_VI_A"], subjectId: "S_MATH", groupIds: ["G_ENTIRE"] },
      { id: "L_URDU", classIds: ["C_VI_A"], subjectId: "S_URDU", groupIds: ["G_URDU"] },
      { id: "L_SANS", classIds: ["C_VI_A"], subjectId: "S_SANS", groupIds: ["G_SANS"] },
    ],
    students: [
      { id: "ST_URDU", classId: "C_VI_A", firstName: "Tariq", lastName: "Ahmad" },
      { id: "ST_SANS", classId: "C_VI_A", firstName: "Aarav", lastName: "Sharma" },
    ],
    studentSubjects: [
      { id: "ss_1", studentId: "ST_URDU", subjectId: "S_URDU", group: "Urdu" },
      { id: "ss_2", studentId: "ST_SANS", subjectId: "S_SANS", group: "Sans " },
    ],
    cards: [
      { lessonId: "L_MATH", day: 0, period: 1 },
      { lessonId: "L_URDU", day: 1, period: 2 },
      { lessonId: "L_SANS", day: 1, period: 2 },
      { lessonId: "L_SANS", day: 2, period: 3 }, // Sanskrit-only period (gap for Urdu)
    ],
  };

  it("unit — for a demo student in a split class (e.g. URDU vs SANSKRIT group), their lessons include their group and exclude the other group", () => {
    const studentUrdu = schoolFixture.students[0];
    const studentSans = schoolFixture.students[1];

    const lessonMath = schoolFixture.lessons[0];
    const lessonUrdu = schoolFixture.lessons[1];
    const lessonSans = schoolFixture.lessons[2];

    // Check doesLessonApplyToStudent for Urdu student
    expect(doesLessonApplyToStudent(schoolFixture, studentUrdu, lessonMath)).toBe(true);
    expect(doesLessonApplyToStudent(schoolFixture, studentUrdu, lessonUrdu)).toBe(true);
    expect(doesLessonApplyToStudent(schoolFixture, studentUrdu, lessonSans)).toBe(false);

    // Check doesLessonApplyToStudent for Sanskrit student
    expect(doesLessonApplyToStudent(schoolFixture, studentSans, lessonMath)).toBe(true);
    expect(doesLessonApplyToStudent(schoolFixture, studentSans, lessonSans)).toBe(true);
    expect(doesLessonApplyToStudent(schoolFixture, studentSans, lessonUrdu)).toBe(false);

    // Check getLessonsForStudent includes group and excludes other group
    const urduLessons = getLessonsForStudent(schoolFixture, studentUrdu);
    const urduLessonIds = urduLessons.map(l => l.id);
    expect(urduLessonIds).toContain("L_MATH");
    expect(urduLessonIds).toContain("L_URDU");
    expect(urduLessonIds).not.toContain("L_SANS");

    const sansLessons = getLessonsForStudent(schoolFixture, studentSans);
    const sansLessonIds = sansLessons.map(l => l.id);
    expect(sansLessonIds).toContain("L_MATH");
    expect(sansLessonIds).toContain("L_SANS");
    expect(sansLessonIds).not.toContain("L_URDU");

    // Check that a Sanskrit lesson for another class (e.g. C_VI_B) does NOT apply to VI A Sanskrit student
    const lessonSansOtherClass = { id: "L_SANS_VI_B", classIds: ["C_VI_B"], subjectId: "S_SANS", groupIds: [] };
    expect(doesLessonApplyToStudent(schoolFixture, studentSans, lessonSansOtherClass)).toBe(false);
  });

  it("builds student card lookup with gaps where their group is elsewhere", () => {
    const studentUrdu = schoolFixture.students[0];
    const visiblePeriods = new Set([1, 2, 3]);

    const lookup = buildStudentCardLookup(schoolFixture, visiblePeriods, 6);
    expect(lookup["ST_URDU"]).toBeDefined();
    expect(lookup["ST_SANS"]).toBeDefined();

    // Day 0, Period 1: Math (both have it)
    expect(lookup["ST_URDU"]["0_1"]).toHaveLength(1);
    expect(lookup["ST_URDU"]["0_1"][0].lessonId).toBe("L_MATH");
    expect(lookup["ST_SANS"]["0_1"]).toHaveLength(1);
    expect(lookup["ST_SANS"]["0_1"][0].lessonId).toBe("L_MATH");

    // Day 1, Period 2: Split slot (Urdu student gets Urdu, Sans student gets Sans, no split card)
    expect(lookup["ST_URDU"]["1_2"]).toHaveLength(1);
    expect(lookup["ST_URDU"]["1_2"][0].lessonId).toBe("L_URDU");
    expect(lookup["ST_SANS"]["1_2"]).toHaveLength(1);
    expect(lookup["ST_SANS"]["1_2"][0].lessonId).toBe("L_SANS");

    // Day 2, Period 3: Sanskrit runs, Urdu does NOT -> gap for Urdu student
    expect(lookup["ST_URDU"]["2_3"]).toBeUndefined();
    expect(lookup["ST_SANS"]["2_3"]).toHaveLength(1);
    expect(lookup["ST_SANS"]["2_3"][0].lessonId).toBe("L_SANS");
  });

  it("returns student rows for editor with label and class subtitle", () => {
    const rows = rowsFor(schoolFixture);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      key: "ST_URDU",
      label: "Tariq Ahmad",
      sub: "VI A",
    });
    expect(rows[1]).toEqual({
      key: "ST_SANS",
      label: "Aarav Sharma",
      sub: "VI A",
    });
  });
});
