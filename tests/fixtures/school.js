/**
 * Shared W2-3 unit-test fixture: a miniature 6-day Indian school with 7 periods
 * and 2 breaks (mirrors docs/demo_sample-school.xml's shape, tiny on purpose).
 * Plain data only — imported by tests/publish.test.js and
 * tests/published_viewer.test.js. Not a test file (no *.test.js suffix).
 */
export function fixtureSchool() {
  return {
    schoolName: "G.D. Goenka School, Darbhanga",
    settings: { year: "2026/27" },
    daysPerWeek: 6,
    daysDefs: [
      { id: "dd0", name: "Monday", short: "Mo", bits: "100000" },
      { id: "dd1", name: "Tuesday", short: "Tu", bits: "010000" },
      { id: "dd2", name: "Wednesday", short: "We", bits: "001000" },
      { id: "dd3", name: "Thursday", short: "Th", bits: "000100" },
      { id: "dd4", name: "Friday", short: "Fr", bits: "000010" },
      { id: "dd5", name: "Saturday", short: "Sa", bits: "000001" },
      { id: "ddAny", name: "Any day", short: "X", bits: "100000,010000,001000,000100,000010,000001" },
    ],
    bell: {
      periods: [
        { index: 1, label: "1st", startMin: 480, endMin: 530 },
        { index: 2, label: "2nd", startMin: 530, endMin: 575 },
        { index: 3, label: "3rd", startMin: 575, endMin: 620 },
        { index: 4, label: "4th", startMin: 645, endMin: 695 },
        { index: 5, label: "5th", startMin: 695, endMin: 740 },
        { index: 6, label: "6th", startMin: 740, endMin: 785 },
        { index: 7, label: "7th", startMin: 795, endMin: 840 },
      ],
    },
    breaks: [
      { name: "Recess", printtext: "BREAK", starttime: "10:20", endtime: "10:45" },
      { name: "Short break", printtext: "BREAK", starttime: "13:05", endtime: "13:15" },
    ],
    classes: [
      { id: "c1", name: "I A" },
      { id: "c2", name: "I B" },
    ],
    teachers: [
      { id: "t1", name: "Ms. Sushmita" },
      { id: "t2", name: "Mr. Anil" },
    ],
    classrooms: [{ id: "r1", name: "Science Lab" }],
    subjects: [
      { id: "s1", name: "Maths", abbr: "MAT" },
      { id: "s2", name: "Science", abbr: "Sci", color: "#123456" },
    ],
    lessons: [
      { id: "l1", classIds: ["c1"], teacherIds: ["t1"], subjectId: "s1", periodsPerCard: 1 },
      { id: "l2", classIds: ["c1", "c2"], teacherIds: ["t2"], subjectId: "s2", periodsPerCard: 2 },
      { id: "l3", classIds: ["ghost"], teacherIds: ["t2"], subjectId: "s2", periodsPerCard: 1 },
    ],
    cards: [
      { lessonId: "l1", day: 0, period: 1, classroomId: "r1" },
      { lessonId: "l2", day: 0, period: 4, classroomId: null },
      { lessonId: "l3", day: 0, period: 7 },
      { lessonId: "l1", day: 1, period: 1, classroomId: "r1" },
      { lessonId: "l1", day: 1, period: 1, classroomId: "r1" }, // duplicate card
    ],
  };
}
