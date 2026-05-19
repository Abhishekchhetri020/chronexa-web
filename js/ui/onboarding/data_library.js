/* Data library — curated seed data for onboarding templates.
 *
 * Provides subject lists / teacher name pools / class naming patterns /
 * standard bell schedules for each school-type template. The W14
 * onboarding agent (school_templates.js) can consume these to keep
 * its file readable.
 *
 * All data is hand-curated — no random generation, no Latin filler.
 * Schools in India / IB / IGCSE / Montessori / Govt see realistic
 * names that look like a real timetable, not a Lorem-ipsum demo.
 */
(function (global) {
  "use strict";

  /* ── Subjects ── */
  const SUBJECTS = {
    cbse: [
      { name: "Mathematics", short: "Math",  color: "#e11d48", weight: 1.0 },
      { name: "Hindi",       short: "Hin",   color: "#f97316", weight: 1.0 },
      { name: "English",     short: "Eng",   color: "#3b82f6", weight: 1.0 },
      { name: "Science",     short: "Sci",   color: "#22c55e", weight: 1.2 },
      { name: "Social Studies", short: "SST", color: "#8b5cf6", weight: 1.0 },
      { name: "Sanskrit",    short: "Sans",  color: "#ec4899", weight: 0.8 },
      { name: "Computer",    short: "Comp",  color: "#06b6d4", weight: 1.0 },
      { name: "Physical Education", short: "PE", color: "#84cc16", weight: 0.5 },
      { name: "Art",         short: "Art",   color: "#fbbf24", weight: 0.6 },
      { name: "Music",       short: "Mus",   color: "#a78bfa", weight: 0.6 },
      { name: "Library",     short: "Lib",   color: "#64748b", weight: 0.5 },
      { name: "Assembly",    short: "Asm",   color: "#475569", weight: 0.3 },
    ],
    ib_myp: [
      { name: "Language A — English Literature", short: "EngLit", color: "#3b82f6", weight: 1.0 },
      { name: "Language B — Hindi", short: "HinB", color: "#f97316", weight: 1.0 },
      { name: "Mathematics", short: "Math", color: "#e11d48", weight: 1.0 },
      { name: "Sciences", short: "Sci", color: "#22c55e", weight: 1.2 },
      { name: "Individuals & Societies", short: "I&S", color: "#8b5cf6", weight: 1.0 },
      { name: "Arts", short: "Arts", color: "#fbbf24", weight: 0.7 },
      { name: "Physical & Health Education", short: "PHE", color: "#84cc16", weight: 0.5 },
      { name: "Design", short: "Des", color: "#06b6d4", weight: 0.8 },
      { name: "Personal Project", short: "PP", color: "#ec4899", weight: 0.5 },
    ],
    igcse: [
      { name: "English Language", short: "EngLg", color: "#3b82f6", weight: 1.0 },
      { name: "Mathematics", short: "Math", color: "#e11d48", weight: 1.0 },
      { name: "Combined Science", short: "ComSci", color: "#22c55e", weight: 1.2 },
      { name: "Business Studies", short: "Biz", color: "#8b5cf6", weight: 0.8 },
      { name: "Economics", short: "Eco", color: "#f97316", weight: 0.8 },
      { name: "Computer Science", short: "CS", color: "#06b6d4", weight: 1.0 },
      { name: "Geography", short: "Geo", color: "#84cc16", weight: 0.8 },
      { name: "History", short: "Hist", color: "#a78bfa", weight: 0.8 },
      { name: "Foreign Language", short: "FL", color: "#ec4899", weight: 0.8 },
      { name: "Physical Education", short: "PE", color: "#fbbf24", weight: 0.4 },
    ],
    us_k12: [
      { name: "English Language Arts", short: "ELA", color: "#3b82f6", weight: 1.0 },
      { name: "Mathematics", short: "Math", color: "#e11d48", weight: 1.0 },
      { name: "Science", short: "Sci", color: "#22c55e", weight: 1.0 },
      { name: "Social Studies", short: "SocSt", color: "#8b5cf6", weight: 1.0 },
      { name: "World Language", short: "WL", color: "#f97316", weight: 0.8 },
      { name: "Health & PE", short: "PE", color: "#84cc16", weight: 0.5 },
      { name: "Art", short: "Art", color: "#fbbf24", weight: 0.6 },
      { name: "Technology", short: "Tech", color: "#06b6d4", weight: 0.8 },
    ],
    montessori_primary: [
      { name: "Practical Life", short: "PL",  color: "#84cc16", weight: 0.8 },
      { name: "Sensorial",      short: "Sen", color: "#fbbf24", weight: 0.8 },
      { name: "Language",       short: "Lng", color: "#3b82f6", weight: 1.0 },
      { name: "Mathematics",    short: "Math", color: "#e11d48", weight: 1.0 },
      { name: "Cultural — Geography", short: "Geo", color: "#22c55e", weight: 0.7 },
      { name: "Cultural — Biology",   short: "Bio", color: "#10b981", weight: 0.7 },
      { name: "Cultural — History",   short: "Hst", color: "#a78bfa", weight: 0.7 },
      { name: "Music",          short: "Mus", color: "#ec4899", weight: 0.5 },
      { name: "Art",            short: "Art", color: "#f97316", weight: 0.5 },
      { name: "Circle Time",    short: "CT",  color: "#06b6d4", weight: 0.3 },
    ],
    india_govt: [
      { name: "Hindi", short: "Hin", color: "#f97316", weight: 1.0 },
      { name: "English", short: "Eng", color: "#3b82f6", weight: 1.0 },
      { name: "Mathematics", short: "Math", color: "#e11d48", weight: 1.0 },
      { name: "EVS / Science", short: "EVS", color: "#22c55e", weight: 1.0 },
      { name: "Social Studies", short: "SST", color: "#8b5cf6", weight: 1.0 },
      { name: "Regional Language", short: "RL", color: "#ec4899", weight: 0.8 },
      { name: "Physical Education", short: "PE", color: "#84cc16", weight: 0.4 },
      { name: "Art / Craft", short: "AC", color: "#fbbf24", weight: 0.5 },
    ],
  };

  /* ── Teacher honorific + sample names (one set of 12 per region) ── */
  const TEACHER_NAMES = {
    indian: [
      "Mr. Rahul Sharma", "Mrs. Priya Mehta", "Ms. Anjali Verma",
      "Mr. Aditya Nair", "Ms. Sneha Iyer", "Mr. Karan Singh",
      "Mrs. Kavita Bose", "Mr. Vikram Patel", "Ms. Ritu Joshi",
      "Mr. Sanjay Kumar", "Mrs. Meera Kapoor", "Ms. Pooja Reddy",
    ],
    western: [
      "Mr. James Wright", "Ms. Emily Carter", "Mrs. Sarah Brown",
      "Mr. David Wilson", "Ms. Olivia Davis", "Mr. Michael Lee",
      "Mrs. Sophia Taylor", "Mr. Daniel Clark", "Ms. Mia Garcia",
      "Mr. Christopher Hall", "Mrs. Charlotte Moore", "Ms. Amelia Jackson",
    ],
    asian: [
      "Ms. Li Wei", "Mr. Tanaka Hiroshi", "Mrs. Park Min-Jung",
      "Ms. Cheng Yi", "Mr. Sato Daisuke", "Mrs. Yamamoto Sakura",
      "Ms. Kim Hye-Jin", "Mr. Zhang Jun", "Ms. Suzuki Aiko",
      "Mr. Lee Joon", "Mrs. Wang Xin", "Ms. Choi Min-Ji",
    ],
  };

  /* ── Class naming patterns ── */
  const CLASS_PATTERNS = {
    "Indian primary": ["I A", "I B", "II A", "II B", "III A", "III B", "IV A", "IV B", "V A", "V B"],
    "Indian secondary": ["VI A", "VI B", "VII A", "VII B", "VIII A", "VIII B", "IX A", "IX B", "X A", "X B"],
    "Indian sr secondary": ["XI Science", "XI Commerce", "XI Humanities", "XII Science", "XII Commerce", "XII Humanities"],
    "Western K-5": ["Kindergarten A", "Grade 1A", "Grade 2A", "Grade 3A", "Grade 4A", "Grade 5A"],
    "Montessori": ["Cycle 1 (3-6)", "Cycle 2 (6-9)", "Cycle 3 (9-12)"],
  };

  /* ── Standard bell schedules ── */
  const BELLS = {
    "Indian 6-day 8-period": {
      daysPerWeek: 6,
      periods: [
        { label: "P1", startMin: 7*60+30, endMin: 8*60+10 },
        { label: "P2", startMin: 8*60+10, endMin: 8*60+50 },
        { label: "P3", startMin: 8*60+50, endMin: 9*60+30 },
        { label: "P4", startMin: 9*60+50, endMin: 10*60+30 },  // after recess
        { label: "P5", startMin: 10*60+30, endMin: 11*60+10 },
        { label: "P6", startMin: 11*60+10, endMin: 11*60+50 },
        { label: "P7", startMin: 11*60+50, endMin: 12*60+30 },
        { label: "P8", startMin: 12*60+30, endMin: 13*60+10 },
      ],
      breaks: [
        { name: "Recess", afterPeriod: 3, startMin: 9*60+30, endMin: 9*60+50 },
      ],
    },
    "Western 5-day 7-period": {
      daysPerWeek: 5,
      periods: [
        { label: "P1", startMin: 8*60, endMin: 8*60+45 },
        { label: "P2", startMin: 8*60+50, endMin: 9*60+35 },
        { label: "P3", startMin: 9*60+40, endMin: 10*60+25 },
        { label: "P4", startMin: 10*60+45, endMin: 11*60+30 },  // after morning break
        { label: "P5", startMin: 11*60+35, endMin: 12*60+20 },
        { label: "P6", startMin: 13*60, endMin: 13*60+45 },  // after lunch
        { label: "P7", startMin: 13*60+50, endMin: 14*60+35 },
      ],
      breaks: [
        { name: "Morning break", afterPeriod: 3, startMin: 10*60+25, endMin: 10*60+45 },
        { name: "Lunch", afterPeriod: 5, startMin: 12*60+20, endMin: 13*60 },
      ],
    },
    "Montessori 5-day 4-cycle": {
      daysPerWeek: 5,
      periods: [
        { label: "Morning Work Cycle", startMin: 8*60+30, endMin: 11*60 },
        { label: "Group Activity",     startMin: 11*60, endMin: 11*60+45 },
        { label: "Afternoon Cycle",    startMin: 12*60+30, endMin: 14*60+30 },
        { label: "Reflection",         startMin: 14*60+30, endMin: 15*60 },
      ],
      breaks: [
        { name: "Lunch", afterPeriod: 2, startMin: 11*60+45, endMin: 12*60+30 },
      ],
    },
  };

  /* ── Classroom naming ── */
  const ROOM_PATTERNS = {
    "Numbered": ["Room 101", "Room 102", "Room 103", "Room 201", "Room 202", "Lab 1", "Lab 2", "Library", "Music Room", "Art Studio"],
    "Named": ["Lotus", "Lily", "Rose", "Tulip", "Marigold", "Daisy", "Sunflower", "Jasmine", "Orchid", "Lavender"],
  };

  global.OnboardingData = {
    SUBJECTS, TEACHER_NAMES, CLASS_PATTERNS, BELLS, ROOM_PATTERNS,
    listSchoolTypes: () => Object.keys(SUBJECTS),
  };
})(window);
