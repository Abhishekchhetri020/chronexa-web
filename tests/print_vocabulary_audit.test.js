// Vocabulary audit — guards the class of bug that printed "INFORMATION
// TECHNOLOGY" instead of "I.T": a consumer reading `abbreviation`/`shortName`
// when the importer writes `abbr`/`short`.
//
// Two layers:
//   1. source scan — the broken fallback chain must not come back anywhere
//   2. behaviour — every lesson-drawing report must print the short form when
//      the file only carries `abbr`/`short`
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import "../js/ui/print_preview/print_report_schema.js";
import "../js/ui/print_preview/print_presets.js";
import "../js/ui/print_preview/pivot_engine.js";

const ROOT = resolve(import.meta.dirname, "..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (/node_modules|__tests__|\.git/.test(p)) continue;
      walk(p, out);
    } else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

describe("source scan: nobody re-invents the short-form lookup", () => {
  it("no file besides the resolver chains abbreviation || shortName", () => {
    const offenders = [];
    for (const file of walk(resolve(ROOT, "js"))) {
      if (/util\/entity_label\.js$/.test(file)) continue;
      const src = readFileSync(file, "utf8");
      if (/\.abbreviation\s*(\?\.)?\s*\|\|\s*[\w$?!.]+\.shortName/.test(src)) {
        offenders.push(file.replace(ROOT + "/", ""));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("print code reads short forms through the resolver", () => {
    const printFiles = walk(resolve(ROOT, "js/ui/print_preview")).filter((f) => !/entity_label/.test(f));
    const bad = printFiles.filter((f) => /\.abbreviation/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(ROOT + "/", ""));
    expect(bad).toEqual([]);
  });
});

const FULL = "INFORMATION TECHNOLOGY";
const ABBR = "I.T";

function importerShapedSchool() {
  return {
    schoolName: "Vocab audit", daysPerWeek: 2,
    bell: { periods: [
      { index: 1, startMin: 480, endMin: 520, isTeaching: true },
      { index: 2, startMin: 520, endMin: 560, isTeaching: true },
    ] },
    days: [{ id: "d1", name: "Monday", short: "Mo" }, { id: "d2", name: "Tuesday", short: "Tu" }],
    subjects: [{ id: "s1", name: FULL, abbr: ABBR }],
    teachers: [{ id: "t1", name: "Ms. Rao", abbr: "RAO" }],
    classes: [{ id: "c1", name: "IX A", short: "IXA" }],
    classrooms: [{ id: "r1", name: "Computer Lab", short: "LAB" }],
    breaks: [],
    lessons: [{ id: "l1", subjectId: "s1", teacherIds: ["t1"], classIds: ["c1"], periodsPerWeek: 2 }],
    cards: [
      { lessonId: "l1", day: 0, period: 1, classroomId: "r1" },
      { lessonId: "l1", day: 1, period: 2, classroomId: "r1" },
    ],
    _idx: {},
  };
}

beforeAll(() => {
  window.APP = window.APP || {};
  window.APP.printSettings = { marginMM: 0 };
});

describe("behaviour: every lesson-drawing report prints the short form", () => {
  const presets = () => window.APP.PrintPresets.list();
  const lessonPresets = () => presets().filter((p) => (p.cells || "draw-lessons") === "draw-lessons");

  it("at least a handful of reports are covered", () => {
    expect(lessonPresets().length).toBeGreaterThan(3);
  });

  for (const preset of [
    "class", "teacher", "room", "summary", "poster", "classwise_with_table",
    "teacherwise_with_table", "teacherwise_extra", "lesson_grid", "custom_slots",
  ]) {
    it(`${preset}: abbr printed, long name absent`, () => {
      const s = importerShapedSchool();
      const Schema = window.APP.PrintReportSchema;
      const p = window.APP.PrintPresets.get(preset);
      if (!p) return;                       // preset not in this build
      const r = Schema.create({ context: p.context });
      Schema.applyPreset(r, p);
      const text = window.APP.PrintPivot.renderReport(r, s, s.bell.periods)
        .map((pg) => pg.textContent).join(" ");
      expect(text).not.toContain(FULL);
      expect(text).toContain(ABBR);
    });
  }
});
