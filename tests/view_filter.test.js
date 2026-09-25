/**
 * Lane W3b-7 — week / term filters in the grid.
 *
 * The grid drew every lesson regardless of the week pattern or term pattern the
 * lesson carries. These tests pin the behaviour the filter must have: a lesson
 * restricted to Week A is hidden under "Week B", shown under "All weeks" and
 * under "Week A" — plus the same for terms, the fail-open rules for missing /
 * unknown data, and the unplaced counts following the filter.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ALL,
  defsFor,
  bitsOf,
  isAllDef,
  normalizeFilter,
  describeFilter,
  lessonMatchesFilter,
  visibleCardIds,
  hiddenCardCount,
  currentFilter,
} from "../js/ui/editor/view_filter.js";
import { computeUnplacedCountsByClass } from "../js/ui/editor/unplaced_counts.js";
import { SavedViews } from "../js/ui/components/saved_views.js";

function fixture() {
  const school = {
    id: "sch_vf",
    daysPerWeek: 6,
    weeksDefs: [
      { id: "wk_all", name: "All weeks", short: "All", bits: "1" },
      { id: "wk_a", name: "Week A", short: "A", bits: "10" },
      { id: "wk_b", name: "Week B", short: "B", bits: "01" },
    ],
    termsDefs: [
      { id: "tm_all", name: "Whole year", short: "YR", bits: "1" },
      { id: "tm_1", name: "Term 1", short: "T1", bits: "10" },
      { id: "tm_2", name: "Term 2", short: "T2", bits: "01" },
    ],
    subjects: [{ id: "s1", name: "Maths", abbr: "Maths" }],
    classes: [{ id: "c1", name: "VI A" }],
    teachers: [{ id: "t1", name: "Mr. Zaid", abbr: "Mr. Zaid" }],
    lessons: [
      // A lesson that runs every week of the year (placed in full).
      { id: "l_all", classIds: ["c1"], teacherIds: ["t1"], subjectId: "s1", weeksDefId: "wk_all", termsDefId: "tm_all", periodsPerWeek: 2, lessonLength: 1 },
      // The lane's case: restricted to Week A, one card short.
      { id: "l_a", classIds: ["c1"], teacherIds: ["t1"], subjectId: "s1", weeksDefId: "wk_a", termsDefId: "tm_all", periodsPerWeek: 2, lessonLength: 1 },
      // Restricted to Week B, one card short.
      { id: "l_b", classIds: ["c1"], teacherIds: ["t1"], subjectId: "s1", weeksDefId: "wk_b", termsDefId: "tm_all", periodsPerWeek: 2, lessonLength: 1 },
      // Restricted to Term 1, placed in full.
      { id: "l_t1", classIds: ["c1"], teacherIds: ["t1"], subjectId: "s1", weeksDefId: "wk_all", termsDefId: "tm_1", periodsPerWeek: 1, lessonLength: 1 },
      // No patterns at all — must never be hidden by a filter, and unplaced.
      { id: "l_bare", classIds: ["c1"], teacherIds: ["t1"], subjectId: "s1", periodsPerWeek: 1, lessonLength: 1 },
    ],
    cards: [
      { id: "cd_all_1", lessonId: "l_all", day: 0, period: 0 },
      { id: "cd_all_2", lessonId: "l_all", day: 1, period: 0 },
      { id: "cd_a", lessonId: "l_a", day: 0, period: 1 },
      { id: "cd_b", lessonId: "l_b", day: 0, period: 2 },
      { id: "cd_t1", lessonId: "l_t1", day: 0, period: 3 },
      // l_a and l_b are a card short each, l_bare has no card at all → 3 unplaced.
    ],
  };
  school._idx = {
    lessonById: Object.fromEntries(school.lessons.map((l) => [l.id, l])),
  };
  return school;
}

function filterOf(week, term) {
  return { weekFilter: week || ALL, termFilter: term || ALL };
}

describe("Lane W3b-7: week / term view filter", () => {
  let school;
  beforeEach(() => {
    school = fixture();
    window.APP = {
      school,
      editor: {},
      mutate: (label, fn) => fn(school),
    };
  });

  describe("pattern definitions", () => {
    it("lists only the definitions that actually restrict something", () => {
      expect(defsFor(school, "week").map((d) => d.id)).toEqual(["wk_all", "wk_a", "wk_b"]);
      expect(defsFor(school, "term").map((d) => d.id)).toEqual(["tm_all", "tm_1", "tm_2"]);
    });

    it("reads the bitmask from either the parsed (bits) or entity-dialog (weeks/terms) shape", () => {
      expect(bitsOf({ id: "x", bits: "10" }, "week")).toBe("10");
      expect(bitsOf({ id: "x", weeks: "01" }, "week")).toBe("01");
      expect(bitsOf({ id: "x", terms: "01" }, "term")).toBe("01");
      expect(bitsOf({ id: "x" }, "week")).toBe("");
    });

    it("treats 'All weeks' / 'Whole year' definitions as covering every week and term", () => {
      expect(isAllDef({ id: "wk_all", name: "All weeks", bits: "1" }, "week")).toBe(true);
      expect(isAllDef({ id: "tm_all", name: "Whole year", bits: "1" }, "term")).toBe(true);
      expect(isAllDef({ id: "wk_ab", name: "A and B", bits: "11" }, "week")).toBe(true);
      expect(isAllDef({ id: "wk_a", name: "Week A", bits: "10" }, "week")).toBe(false);
      expect(isAllDef({ id: "tm_1", name: "Term 1", bits: "10" }, "term")).toBe(false);
    });
  });

  describe("matching a lesson against the filter", () => {
    const lesson = (id) => school._idx.lessonById[id];

    it("hides a Week-A lesson under 'Week B' and shows it under 'All weeks' and 'Week A'", () => {
      expect(lessonMatchesFilter(lesson("l_a"), filterOf(ALL), school)).toBe(true);
      expect(lessonMatchesFilter(lesson("l_a"), filterOf("wk_a"), school)).toBe(true);
      expect(lessonMatchesFilter(lesson("l_a"), filterOf("wk_b"), school)).toBe(false);
    });

    it("hides a Week-B lesson under 'Week A'", () => {
      expect(lessonMatchesFilter(lesson("l_b"), filterOf("wk_b"), school)).toBe(true);
      expect(lessonMatchesFilter(lesson("l_b"), filterOf("wk_a"), school)).toBe(false);
    });

    it("does the same on the term axis", () => {
      expect(lessonMatchesFilter(lesson("l_t1"), filterOf(ALL, "tm_1"), school)).toBe(true);
      expect(lessonMatchesFilter(lesson("l_t1"), filterOf(ALL, "tm_2"), school)).toBe(false);
      expect(lessonMatchesFilter(lesson("l_t1"), filterOf(ALL, "tm_all"), school)).toBe(true);
    });

    it("never hides an unrestricted lesson, and fails open on unknown ids", () => {
      expect(lessonMatchesFilter(lesson("l_bare"), filterOf("wk_b"), school)).toBe(true);
      expect(lessonMatchesFilter(lesson("l_bare"), filterOf(ALL, "tm_2"), school)).toBe(true);
      // A filter id with no definition must not blank the grid.
      expect(lessonMatchesFilter(lesson("l_a"), filterOf("wk_missing"), school)).toBe(true);
      // A lesson pointing at a definition that no longer exists must stay visible.
      expect(lessonMatchesFilter({ id: "lx", weeksDefId: "gone" }, filterOf("wk_b"), school)).toBe(true);
    });

    it("combines the two axes (week AND term)", () => {
      expect(lessonMatchesFilter(lesson("l_a"), filterOf("wk_a", "tm_1"), school)).toBe(true);
      expect(lessonMatchesFilter(lesson("l_t1"), filterOf("wk_a", "tm_2"), school)).toBe(false);
    });
  });

  describe("the grid's visible card set", () => {
    it("keeps every card under 'All weeks' and drops the others' cards when filtered", () => {
      expect(visibleCardIds(school, filterOf(ALL)).sort())
        .toEqual(["cd_a", "cd_all_1", "cd_all_2", "cd_b", "cd_t1"]);
      expect(visibleCardIds(school, filterOf("wk_a")).sort())
        .toEqual(["cd_a", "cd_all_1", "cd_all_2", "cd_t1"]);
      expect(visibleCardIds(school, filterOf("wk_b")).sort())
        .toEqual(["cd_all_1", "cd_all_2", "cd_b", "cd_t1"]);
      expect(visibleCardIds(school, filterOf(ALL, "tm_2")).sort())
        .toEqual(["cd_a", "cd_all_1", "cd_all_2", "cd_b"]);
    });

    it("counts what a filter hides so the UI can say so out loud", () => {
      expect(hiddenCardCount(school, filterOf(ALL))).toBe(0);
      expect(hiddenCardCount(school, filterOf("wk_a"))).toBe(1);
      expect(hiddenCardCount(school, filterOf(ALL, "tm_2"))).toBe(1);
    });

    it("describes the active filter for the toolbar label and the panel summary", () => {
      expect(describeFilter(school, filterOf(ALL)).label).toBe("All weeks");
      expect(describeFilter(school, filterOf(ALL)).active).toBe(false);
      expect(describeFilter(school, filterOf(ALL)).summary).toMatch(/all 5 cards/i);
      const weekA = describeFilter(school, filterOf("wk_a"));
      expect(weekA.active).toBe(true);
      expect(weekA.label).toMatch(/week a/i);
      expect(weekA.summary).toMatch(/4 of 5 cards/i);
      expect(weekA.summary).toMatch(/1 hidden/i);
      expect(describeFilter(school, filterOf("wk_a", "tm_2")).label).toMatch(/term 2/i);
    });
  });

  describe("unplaced counts respect the filter", () => {
    it("does not count the unplaced cards of a lesson that is filtered out", () => {
      const all = computeUnplacedCountsByClass(school);
      expect(all).toEqual({ c1: 3 }); // l_a 1 + l_b 1 + l_bare 1

      const onlyWeekA = computeUnplacedCountsByClass(school, {
        lessonFilter: (l) => lessonMatchesFilter(l, filterOf("wk_a"), school),
      });
      expect(onlyWeekA).toEqual({ c1: 2 }); // l_b drops out, l_bare stays

      const onlyWeekB = computeUnplacedCountsByClass(school, {
        lessonFilter: (l) => lessonMatchesFilter(l, filterOf("wk_b"), school),
      });
      expect(onlyWeekB).toEqual({ c1: 2 }); // l_a drops out, l_bare stays

      const weekAFilterAway = computeUnplacedCountsByClass(school, {
        lessonFilter: (l) => lessonMatchesFilter(l, filterOf("wk_a", "tm_2"), school),
      });
      // l_a is Week A and carries no term restriction → still counted.
      expect(weekAFilterAway).toEqual({ c1: 2 });
    });

    it("counts nothing when the filter hides every lesson", () => {
      expect(computeUnplacedCountsByClass(school, { lessonFilter: () => false })).toEqual({});
    });
  });

  describe("filters are view state captured by saved views", () => {
    it("captures the two filter fields and restores them on apply", () => {
      window.APP.editor.weekFilter = "wk_a";
      window.APP.editor.termFilter = "tm_1";
      const snapshot = SavedViews.capture();
      expect(snapshot.weekFilter).toBe("wk_a");
      expect(snapshot.termFilter).toBe("tm_1");

      const saved = SavedViews.save("Week A / Term 1");
      expect(saved.weekFilter).toBe("wk_a");
      expect(saved.termFilter).toBe("tm_1");

      // Move the view somewhere else, then apply the saved view back.
      window.APP.editor.weekFilter = ALL;
      window.APP.editor.termFilter = ALL;
      expect(SavedViews.apply(saved)).toBe(true);
      expect(window.APP.editor.weekFilter).toBe("wk_a");
      expect(window.APP.editor.termFilter).toBe("tm_1");
    });

    it("keeps views saved before this feature working — they restore 'All weeks' / 'All terms'", () => {
      // A pre-W3b-7 view: no weekFilter / termFilter fields at all.
      window.APP.school.savedViews = [{ id: "old_1", name: "Legacy view", perspective: "class" }];
      window.APP.editor.weekFilter = "wk_b";
      window.APP.editor.termFilter = "tm_2";

      expect(SavedViews.apply("Legacy view")).toBe(true);
      expect(window.APP.editor.weekFilter).toBe(ALL);
      expect(window.APP.editor.termFilter).toBe(ALL);
      // And the toolbar/panel label follows.
      expect(currentFilter().week).toBe(ALL);
    });

    it("normalises a missing or partial editor state to 'all'", () => {
      expect(normalizeFilter(undefined)).toEqual({ week: ALL, term: ALL });
      expect(normalizeFilter({ weekFilter: "wk_a" })).toEqual({ week: "wk_a", term: ALL });
    });

    it("is idempotent, so a normalized filter can be handed straight back in", () => {
      const once = normalizeFilter({ weekFilter: "wk_a", termFilter: "tm_2" });
      expect(normalizeFilter(once)).toEqual(once);
      // …and the editor's own filter actually filters when fed back through it.
      expect(hiddenCardCount(school, once)).toBe(2);
      expect(lessonMatchesFilter(school.lessons[0], once, school)).toBe(true);
    });
  });
});
