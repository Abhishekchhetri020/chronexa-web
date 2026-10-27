import { describe, it, expect } from "vitest";
import { listFamilies, applyRunConditions } from "../run_conditions.js";

const school = (off) => ({
  globals: off ? { runConditions: { off } } : {},
  relations: [{ id: "r1", typ: "n_1" }, { id: "r2", typ: "n_1" }, { id: "r3", typ: "n_5" }, { id: "r4", typ: "n_0", disabled: true }],
  teachers: [{ id: "t1", maxGapsPerDay: 1, constraints: { maxDaysPerWeek: 4, other: 1 } }, { id: "t2" }],
  classes: [{ id: "c1", constraints: { lunch_periodfrom: 4 } }, { id: "c2" }],
});

describe("conditions for this run", () => {
  it("lists families present, with counts, skipping disabled relations", () => {
    const f = listFamilies(school(), { n_1: "cannot be the same day" });
    expect(f.map((x) => [x.id, x.count])).toEqual([["rel:n_1", 2], ["rel:n_5", 1], ["teacher-limits", 1], ["class-limits", 1]]);
    expect(f[0].label).toBe("cannot be the same day");
  });

  it("nothing off → the same object", () => {
    const s = school();
    expect(applyRunConditions(s)).toBe(s);
  });

  it("off families leave the copy only", () => {
    const s = school(["rel:n_1", "teacher-limits", "class-limits"]);
    const out = applyRunConditions(s);
    expect(out.relations.filter((r) => r.disabled).map((r) => r.id)).toEqual(["r1", "r2", "r4"]);
    expect(out.teachers[0].maxGapsPerDay).toBeUndefined();
    expect(out.teachers[0].constraints).toEqual({ other: 1 });
    expect(out.classes[0].constraints).toEqual({});
    // the file itself is untouched
    expect(s.relations[0].disabled).toBeUndefined();
    expect(s.teachers[0].maxGapsPerDay).toBe(1);
    expect(s.classes[0].constraints.lunch_periodfrom).toBe(4);
  });
});
