import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import "../js/xml/parse_timetable_xml.js";
import "../js/ui/components/advisor.js";

describe("Advisor - Pre-generation Model Advisor & 1-Click Suggestions", () => {
  beforeEach(() => {
    delete window.APP;
  });

  it("finds 3 deliberate modelling faults with exact numbers on an unplaced school", () => {
    // School specification before/without generating (0 cards placed)
    // 5 days, 5 periods per day = 25 slots
    const school = {
      schoolName: "Model Test School",
      daysPerWeek: 5,
      bell: {
        periods: [
          { index: 1, label: "P1" },
          { index: 2, label: "P2" },
          { index: 3, label: "P3" },
          { index: 4, label: "P4" },
          { index: 5, label: "P5" },
        ],
      },
      teachers: [
        {
          id: "t1",
          name: "Dr. Overload",
          // 5 slots blocked out of 25 -> 20 available
          timeOff: [
            [2, 0, 0, 0, 0],
            [2, 0, 0, 0, 0],
            [2, 0, 0, 0, 0],
            [2, 0, 0, 0, 0],
            [2, 0, 0, 0, 0],
          ],
        },
        { id: "t2", name: "Normal Teacher", timeOff: [] },
      ],
      classes: [
        { id: "c1", name: "Class 10A" },
        { id: "c2", name: "Class 10B" },
      ],
      subjects: [
        { id: "s1", name: "Mathematics", constraints: { maxPerDay: 1 } },
        { id: "s2", name: "Physics" },
      ],
      classrooms: [
        { id: "r1", name: "Lab A" },
      ],
      lessons: [
        // Fault 1: Teacher t1 weekly load = 24 periods, exceeds 20 available (25 slots - 5 time-off)
        { id: "l1", subjectId: "s2", classIds: ["c2"], teacherIds: ["t1"], periodsPerWeek: 24 },

        // Fault 2: Class c1 weekly lessons = 28 periods, exceeds 25 slots
        // Also contains Fault 3: Subject s1 in Class c1 has 6 periods/week, but maxPerDay is 1 (max 5 across 5 days)
        { id: "l2", subjectId: "s1", classIds: ["c1"], teacherIds: ["t2"], periodsPerWeek: 6 },
        { id: "l3", subjectId: "s2", classIds: ["c1"], teacherIds: ["t2"], periodsPerWeek: 22 },
      ],
      cards: [],
      relations: [],
    };

    const suggestions = window.Advisor.collectSuggestions(school);

    // 1. Teacher weekly load > available periods
    const teacherFault = suggestions.find(s => s.kind === "teacher-overload");
    expect(teacherFault).toBeDefined();
    expect(teacherFault.severity).toBe("high");
    expect(teacherFault.text).toMatch(/24.*20/); // 24 periods exceeds 20 available
    expect(teacherFault.lessonIds).toContain("l1");

    // 2. Class weekly lessons > slots
    const classFault = suggestions.find(s => s.kind === "class-overload");
    expect(classFault).toBeDefined();
    expect(classFault.severity).toBe("high");
    expect(classFault.text).toMatch(/28.*25/); // 28 lessons exceeds 25 slots
    expect(classFault.lessonIds).toContain("l2");
    expect(classFault.lessonIds).toContain("l3");

    // 3. Subject daily cap makes placement impossible
    const capFault = suggestions.find(s => s.kind === "daily-cap");
    expect(capFault).toBeDefined();
    expect(capFault.severity).toBe("high");
    expect(capFault.text).toMatch(/6.*1.*5/); // 6 periods/week, daily cap 1, max 5 across 5 days
    expect(capFault.lessonIds).toContain("l2");
  });

  it("finds room demand > supply per period", () => {
    const school = {
      schoolName: "Room Test School",
      daysPerWeek: 5,
      bell: { periods: [{ index: 1 }, { index: 2 }, { index: 3 }, { index: 4 }] }, // 20 slots
      classrooms: [{ id: "r1", name: "Computer Lab" }],
      teachers: [{ id: "t1", name: "Teacher A" }],
      classes: [{ id: "c1", name: "Class 1" }, { id: "c2", name: "Class 2" }],
      subjects: [{ id: "s1", name: "IT" }],
      lessons: [
        { id: "l1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], classroomIds: ["r1"], periodsPerWeek: 15 },
        { id: "l2", subjectId: "s1", classIds: ["c2"], teacherIds: ["t1"], classroomIds: ["r1"], periodsPerWeek: 10 },
      ],
      cards: [],
    };
    // Demand for r1 = 25 periods > 20 available slots
    const suggestions = window.Advisor.collectSuggestions(school);
    const roomFault = suggestions.find(s => s.kind === "room-demand");
    expect(roomFault).toBeDefined();
    expect(roomFault.severity).toBe("high");
    expect(roomFault.text).toMatch(/25.*20/);
    expect(roomFault.lessonIds).toEqual(expect.arrayContaining(["l1", "l2"]));
  });

  it("detects lessons with no teacher and lessons with no room", () => {
    const school = {
      schoolName: "Missing Entities School",
      daysPerWeek: 5,
      bell: { periods: [{ index: 1 }, { index: 2 }, { index: 3 }] },
      classrooms: [{ id: "r1", name: "Room 1" }],
      teachers: [{ id: "t1", name: "Teacher 1" }],
      classes: [{ id: "c1", name: "Class 1" }],
      subjects: [{ id: "s1", name: "Art" }, { id: "s2", name: "Music", requiresLab: true }],
      lessons: [
        { id: "l_no_t", subjectId: "s1", classIds: ["c1"], teacherIds: [], classroomIds: ["r1"], periodsPerWeek: 2 },
        { id: "l_no_r", subjectId: "s2", classIds: ["c1"], teacherIds: ["t1"], classroomIds: [], periodsPerWeek: 2 },
      ],
      cards: [],
    };
    const suggestions = window.Advisor.collectSuggestions(school);
    const noTeacher = suggestions.find(s => s.kind === "missing-teacher" && s.lessonIds.includes("l_no_t"));
    expect(noTeacher).toBeDefined();
    expect(noTeacher.text).toMatch(/no teacher/i);

    const noRoom = suggestions.find(s => s.kind === "missing-room" && s.lessonIds.includes("l_no_r"));
    expect(noRoom).toBeDefined();
    expect(noRoom.text).toMatch(/no classroom/i);
  });

  it("detects contradictory relations", () => {
    const school = {
      schoolName: "Relation School",
      daysPerWeek: 5,
      bell: { periods: [{ index: 1 }, { index: 2 }, { index: 3 }] },
      teachers: [{ id: "t1", name: "Teacher 1" }],
      classes: [{ id: "c1", name: "Class 1" }],
      subjects: [{ id: "s1", name: "History" }, { id: "s2", name: "Geography" }],
      lessons: [
        { id: "l1", subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"], periodsPerWeek: 2 },
        { id: "l2", subjectId: "s2", classIds: ["c1"], teacherIds: ["t1"], periodsPerWeek: 2 },
      ],
      cards: [],
      relations: [
        { id: "rel1", typ: "n_1", subjectids: ["s1", "s2"], classids: ["c1"] }, // cannot be the same day
        { id: "rel2", typ: "n_8", subjectids: ["s1", "s2"], classids: ["c1"] }, // must be on the same day
      ],
    };
    const suggestions = window.Advisor.collectSuggestions(school);
    const relConflict = suggestions.find(s => s.kind === "relation-contradiction");
    expect(relConflict).toBeDefined();
    expect(relConflict.severity).toBe("high");
    expect(relConflict.text).toMatch(/cannot be the same day.*must be.*same day/i);
  });

  it("supports reversible Ignore persisted per finding id", () => {
    const school = {
      schoolName: "Ignore Test School",
      daysPerWeek: 5,
      bell: { periods: [{ index: 1 }, { index: 2 }] },
      teachers: [{ id: "t1", name: "Teacher 1" }],
      classes: [{ id: "c1", name: "Class 1" }],
      subjects: [{ id: "s1", name: "Art" }],
      lessons: [
        { id: "l_no_t", subjectId: "s1", classIds: ["c1"], teacherIds: [], periodsPerWeek: 1 },
      ],
      cards: [],
      ignoredAdvisorFindings: [],
    };

    let suggestions = window.Advisor.collectSuggestions(school);
    const finding = suggestions.find(s => s.kind === "missing-teacher");
    expect(finding).toBeDefined();

    // Ignore this finding
    window.Advisor.toggleIgnore(school, finding.id);
    expect(school.ignoredAdvisorFindings).toContain(finding.id);

    // Default collect suggestions should filter out ignored findings
    suggestions = window.Advisor.collectSuggestions(school);
    expect(suggestions.find(s => s.id === finding.id)).toBeUndefined();

    // If requested with includeIgnored, it should be marked as ignored
    const all = window.Advisor.collectSuggestions(school, { includeIgnored: true });
    const ignoredFinding = all.find(s => s.id === finding.id);
    expect(ignoredFinding).toBeDefined();
    expect(ignoredFinding.ignored).toBe(true);

    // Reversible: unignore
    window.Advisor.toggleIgnore(school, finding.id);
    expect(school.ignoredAdvisorFindings).not.toContain(finding.id);
    suggestions = window.Advisor.collectSuggestions(school);
    expect(suggestions.find(s => s.id === finding.id)).toBeDefined();
  });

  it("restores 1-click apply suggestions on the demo school (ImproveMode and ColorTaxonomy)", () => {
    const xml = fs.readFileSync(path.resolve(process.cwd(), "sample-school.xml"), "utf8");
    const school = window.parseTimetableXml.parseText(xml, "sample-school.xml");

    const allItems = window.Advisor.collectSuggestions(school);

    // 1. Improve-mode suggestion appears in Suggestions section
    const improveSugg = allItems.find(s => s.kind === "improvement");
    expect(improveSugg).toBeDefined();
    expect(improveSugg.section).toBe("suggestions");
    expect(typeof improveSugg.apply).toBe("function");

    // Test working apply() calls window.ImproveMode.run
    let improveCalledWith = null;
    window.ImproveMode = {
      run: (sch, opts) => {
        improveCalledWith = { sch, opts };
      },
    };
    improveSugg.apply();
    expect(improveCalledWith).toBeDefined();
    expect(improveCalledWith.sch).toBe(school);
    expect(improveCalledWith.opts).toEqual({ timeLimitSec: 30 });

    // 2. Auto-color suggestion appears in Suggestions section
    const colorSugg = allItems.find(s => s.kind === "polish" && /color/i.test(s.text));
    expect(colorSugg).toBeDefined();
    expect(colorSugg.section).toBe("suggestions");
    expect(typeof colorSugg.apply).toBe("function");

    // Test working apply() calls window.ColorTaxonomy.autoColor
    let autoColorCalledWith = null;
    window.ColorTaxonomy = {
      autoColor: (sch) => {
        autoColorCalledWith = sch;
      },
    };
    colorSugg.apply();
    expect(autoColorCalledWith).toBe(school);
  });

  it("stock demo (which solves fully) reports ZERO 'exceeds available slots' findings, ZERO high findings, <=20 total findings, and no 16-hex ids", () => {
    const xml = fs.readFileSync(path.resolve(process.cwd(), "sample-school.xml"), "utf8");
    const school = window.parseTimetableXml.parseText(xml, "sample-school.xml");

    const suggestions = window.Advisor.collectSuggestions(school);

    // Hard rule: ZERO "exceeds available slots" findings for any class or teacher
    const slotOverloadFindings = suggestions.filter(s =>
      /exceeds.*(available|slot)/i.test(s.text) ||
      s.kind === "class-overload" ||
      s.kind === "teacher-overload"
    );
    expect(slotOverloadFindings).toHaveLength(0);

    // Acceptance: stock demo -> Advisor shows 0 HIGH findings
    const highFindings = suggestions.filter(s => s.severity === "high");
    expect(highFindings).toHaveLength(0);

    // Acceptance: total findings <= ~20 grouped rows
    expect(suggestions.length).toBeLessThanOrEqual(20);

    // Acceptance: no 16-hex ids anywhere in the dialog text
    for (const s of suggestions) {
      expect(s.text).not.toMatch(/\b[0-9A-Fa-f]{16}\b/);
    }
  });
});
