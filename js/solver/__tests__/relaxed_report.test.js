// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { loadSampleSchool } from "./helpers/load_school.js";
import { relaxedReport, limitViolations } from "../relaxed_report.js";

const tiny = (constraints, cards) => ({
  teachers: [{ id: "t1", name: "T1", constraints }],
  lessons: [{ id: "l1", teacherIds: ["t1"], classIds: ["c1"], periodsPerCard: 1 }],
  cards,
  relations: [],
});

describe("relaxed-conditions report", () => {
  it("runs on the sample school and groups by importance", () => {
    const s = loadSampleSchool();
    const t0 = Date.now();
    const rep = relaxedReport(s);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(Object.keys(rep.byImportance)).toEqual(["strict", "high", "normal", "low"]);
    expect(rep.total).toBe(rep.items.length);
  });

  it("flags a gap above the teacher's dialog cap", () => {
    const v = limitViolations(tiny({ teachers_maxgapsday: 0 }, [
      { lessonId: "l1", day: 0, period: 0 }, { lessonId: "l1", day: 0, period: 3 },
    ]));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: "Max gaps per day", limit: 0, actual: 2, where: 0 });
  });

  it("flags too many days and too many consecutive periods", () => {
    const cards = [0, 1, 2].map((d) => ({ lessonId: "l1", day: d, period: 0 }))
      .concat([1, 2].map((p) => ({ lessonId: "l1", day: 0, period: p })));
    const rules = limitViolations(tiny({ maxDaysPerWeek: 2, teachers_maxconsecutiveperiods: 2 }, cards)).map((v) => v.rule);
    expect(rules).toContain("Max days per week");
    expect(rules).toContain("Max consecutive periods");
  });

  it("no limits set → nothing reported", () => {
    expect(limitViolations(tiny({}, [{ lessonId: "l1", day: 0, period: 0 }, { lessonId: "l1", day: 0, period: 5 }]))).toHaveLength(0);
  });
});
