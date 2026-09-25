import { describe, it, expect } from "vitest";
import {
  getSupervisions,
  detectSupervisionConflicts,
  buildSupervisionLookup,
  rowsFor,
  supervisionChipHtml,
  supervisionSummary,
  teacherInitials,
} from "../supervision_view.js";

/* Fixture: two teachers with placed teaching cards, one of them a lab double
 * that occupies two periods; five supervision slots over three known rooms,
 * one room that needs supervision but has none, one unknown room id, and one
 * draft row without a day/period. */
function fixture() {
  return {
    classes: [
      { id: "C1", name: "VI A" },
      { id: "C2", name: "VII B" },
    ],
    subjects: [{ id: "S1", name: "Mathematics", abbr: "Math" }],
    teachers: [
      { id: "T1", name: "Mr. Aamir", abbr: "AAM", color: "#5b6cff" },
      { id: "T2", name: "Ms. Beauty", abbr: "BTY", color: "#d9466b" },
      { id: "T3", name: "Mr. Chetan", abbr: "CHE", color: "#22a06b" },
    ],
    classrooms: [
      { id: "R1", name: "MP Hall", needsSupervision: true },
      { id: "R2", name: "Science Lab" },
      { id: "R3", name: "Library", needsSupervision: true },
    ],
    lessons: [
      { id: "L1", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], periodsPerWeek: 1 },
      { id: "L2", subjectId: "S1", teacherIds: ["T2"], classIds: ["C2"], periodsPerWeek: 1,
        isLabDouble: true, lessonLength: 2 },
    ],
    cards: [
      { lessonId: "L1", day: 1, period: 2 },
      { lessonId: "L2", day: 2, period: 3 },
    ],
    classroomsupervisions: [
      { id: "SUP1", classroomid: "R1", teacherid: "T1", day: 1, period: 2 }, // supervising while teaching
      { id: "SUP2", classroomid: "R2", teacherid: "T2", day: 2, period: 4 }, // 2nd half of the lab double
      { id: "SUP3", classroomid: "R1", teacherid: "T3", day: 4, period: 1 }, // same teacher, two areas
      { id: "SUP8", classroomid: "R2", teacherid: "T3", day: 4, period: 1 }, //  ^ partner of SUP3
      { id: "SUP4", classroomid: "R2", teacherid: "T2", day: 0, period: 1 }, // clean
      { id: "SUP5", classroomid: "R1", teacherid: "T3", day: 0, period: 1, break: 1 }, // break duty
      { id: "SUP6", classroomid: "R9", teacherid: "T3", day: 0, period: 2 }, // area not in classrooms
      { id: "SUP7", classroomid: "R1", teacherid: "T3" },                    // draft: no day/period
      { id: "SUP9", classroomid: "R1", teacherid: "", day: 3, period: 2 },   // draft: no teacher yet
      { id: "SUP10", classroomid: "R2", teacherid: "", day: 3, period: 2 },  //  ^ same slot, still no clash
    ],
  };
}

describe("supervision_view", () => {
  it("unit — flags a teacher supervising while teaching, including the second half of a lab double", () => {
    const school = fixture();
    const conflicts = detectSupervisionConflicts(school);
    const typesFor = (supId) =>
      conflicts.filter(c => c.supId === supId).map(c => c.type).sort();

    expect(typesFor("SUP1")).toEqual(["teaching"]);
    // T2's lab double starts at day 2 period 3, so it also occupies period 4.
    expect(typesFor("SUP2")).toEqual(["teaching"]);
    // T3 is booked in two areas at day 4 period 1 — double-booked, but not teaching.
    expect(typesFor("SUP3")).toEqual(["double"]);
    expect(typesFor("SUP8")).toEqual(["double"]);
    expect(typesFor("SUP4")).toEqual([]);
    expect(typesFor("SUP5")).toEqual([]);
    // Two rows without a teacher do not "double-book" anyone.
    expect(typesFor("SUP9")).toEqual([]);
    expect(typesFor("SUP10")).toEqual([]);
    expect(conflicts).toHaveLength(4);

    const sup1 = conflicts.find(c => c.supId === "SUP1");
    expect(sup1.teacherId).toBe("T1");
    expect(sup1.day).toBe(1);
    expect(sup1.period).toBe(2);
    expect(sup1.detail).toMatch(/Mathematics/);
    expect(sup1.detail).toMatch(/VI A/);

    const sup3Double = conflicts.find(c => c.supId === "SUP3" && c.type === "double");
    expect(sup3Double.detail).toMatch(/Science Lab/);
  });

  it("unit — builds a per-area card lookup: supervisors per day/period, conflicts attached, gaps absent", () => {
    const school = fixture();
    const lookup = buildSupervisionLookup(school, new Set([1, 2, 3, 4]), 6);

    expect(lookup.R1["1_2"]).toHaveLength(1);
    expect(lookup.R1["1_2"][0].teacherName).toBe("Mr. Aamir");
    expect(lookup.R1["1_2"][0].conflicts.map(c => c.type)).toEqual(["teaching"]);
    expect(lookup.R1["1_2"][0].areaName).toBe("MP Hall");

    // Day 2 period 3: the lab double occupies 3-4 for teaching, but no supervision sits at P3.
    expect(lookup.R2["2_3"]).toBeUndefined();
    expect(lookup.R2["2_4"]).toHaveLength(1);
    expect(lookup.R2["2_4"][0].conflicts.map(c => c.type)).toEqual(["teaching"]);

    // Day 4 period 1: the same teacher holds two areas at once — both chips flag it.
    expect(lookup.R1["4_1"][0].conflicts.map(c => c.type)).toEqual(["double"]);
    expect(lookup.R2["4_1"][0].conflicts[0].detail).toMatch(/MP Hall/);

    // A break duty is still placed by its period column and carries the tag.
    expect(lookup.R1["0_1"][0].teacherName).toBe("Mr. Chetan");
    expect(lookup.R1["0_1"][0].break).toBe(true);

    // Draft row without a day/period never reaches the grid.
    const all = Object.values(lookup).flatMap(b => Object.values(b)).flat();
    expect(all.some(c => c.supId === "SUP7")).toBe(false);

    // Periods outside the visible set are dropped.
    const narrow = buildSupervisionLookup(school, new Set([1]), 6);
    expect(narrow.R1["0_1"]).toHaveLength(1);
    expect(narrow.R1["1_2"]).toBeUndefined();
  });

  it("unit — rows are the supervised areas, plus areas flagged as needing supervision but unassigned", () => {
    const school = fixture();
    const rows = rowsFor(school);
    expect(rows.map(r => r.key)).toEqual(["R1", "R2", "R3", "R9"]);

    expect(rows[0].label).toBe("MP Hall");
    expect(rows[0].sub).toMatch(/4 duties/);
    expect(rows[0].sub).toMatch(/2 conflicts/);
    expect(rows[0].sub).toMatch(/1 at break/);
    expect(rows[0].needsSupervision).toBe(true);

    // Science Lab: 4 duties, two of them conflicting (one teaching, one doubled).
    expect(rows[1].label).toBe("Science Lab");
    expect(rows[1].sub).toMatch(/4 duties/);
    expect(rows[1].sub).toMatch(/2 conflicts/);

    // Library requires supervision per the classroom record but has no slot at all.
    expect(rows[2].key).toBe("R3");
    expect(rows[2].duties).toBe(0);
    expect(rows[2].needsSupervision).toBe(true);
    expect(rows[2].sub).toMatch(/needs supervision/i);

    // An area id with no classroom record still shows up rather than vanishing.
    expect(rows[3].key).toBe("R9");
    expect(rows[3].label).toBe("R9");

    expect(getSupervisions(school)).toHaveLength(10);
  });

  it("unit — summary counts duties, conflicts and unassigned supervised areas, skipping drafts", () => {
    const school = fixture();
    const s = supervisionSummary(school);
    expect(s.areas).toBe(4);       // rows: MP Hall, Science Lab, Library, R9
    expect(s.duties).toBe(9);      // 10 rows minus the SUP7 draft
    expect(s.conflicts).toBe(4);   // SUP1, SUP2, SUP3, SUP8
    expect(s.breakDuties).toBe(1);
    expect(s.unassigned).toBe(1);  // Library
    expect(s.withoutSlot).toBe(1); // SUP7 (draft with no day/period)
  });

  it("unit — the chip shows the supervisor by name and marks a conflict in text and class", () => {
    const school = fixture();
    const lookup = buildSupervisionLookup(school, new Set([1, 2, 3, 4]), 6);
    const conflicted = supervisionChipHtml(lookup.R1["1_2"][0]);
    expect(conflicted).toContain("Mr. Aamir");
    expect(conflicted).toContain("chrx-sup-chip--conflict");
    expect(conflicted).toContain("chrx-sup-chip--teaching");
    expect(conflicted).toMatch(/⚠/);
    expect(conflicted).toMatch(/Teaching Mathematics VI A/);
    expect(conflicted).toContain('data-conflict');
    // The chip must never be a draggable timetable card.
    expect(conflicted).not.toContain("chrx-vkarta");

    const clean = supervisionChipHtml(lookup.R2["0_1"][0]);
    expect(clean).toContain("Ms. Beauty");
    expect(clean).not.toContain("chrx-sup-chip--conflict");
  });

  it("unit — a narrow overview cell shows the teacher's initials, keeping the full name in title and aria-label", () => {
    const school = fixture();
    const lookup = buildSupervisionLookup(school, new Set([1, 2, 3, 4]), 6);
    const chip = lookup.R2["4_1"][0]; // T3 = "Mr. Chetan"

    const wide = supervisionChipHtml(chip, school);
    expect(wide).toContain(">Mr. Chetan<");
    expect(wide).not.toContain("chrx-sup-chip--compact");

    const narrow = supervisionChipHtml(chip, school, { compact: true });
    expect(narrow).toContain(">CH<");
    expect(narrow).toContain("chrx-sup-chip--compact");
    expect(narrow).toContain('data-teacher-name="Mr. Chetan"');
    expect(narrow).toContain('aria-label="Mr. Chetan supervising Science Lab');
    expect(narrow).not.toContain(">Mr. Chetan<");

    expect(teacherInitials("Ms. Anita Sharma")).toBe("AS");
    expect(teacherInitials("Ankita")).toBe("AN");
    expect(teacherInitials("")).toBe("?");
  });
});
