// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { loadSampleSchool } from "./helpers/load_school.js";
import { listObjects, subSchoolFor, testObject } from "../spec_check.js";

describe("specification check (each object solved alone)", () => {
  const school = loadSampleSchool();
  const cls = school.classes.find((c) => school.lessons.some((l) => (l.classIds || []).includes(c.id)));

  it("lists only objects that have lessons, classes first", () => {
    const objs = listObjects(school);
    expect(objs.length).toBeGreaterThan(0);
    expect(objs[0].part).toBe("classes");
    expect(objs.every((o) => o.lessons > 0)).toBe(true);
  });

  it("the sub-school keeps only that object's lessons and locked cards", () => {
    const sub = subSchoolFor(school, "classes", cls.id);
    expect(sub.lessons.every((l) => l.classIds.includes(cls.id))).toBe(true);
    expect(sub.cards.every((c) => c.locked)).toBe(true);
  });

  it("a real class passes on its own", () => {
    const r = testObject(school, { part: "classes", id: cls.id, name: cls.name }, { timeLimitSec: 2 });
    expect(r.status).toBe("passed");
    expect(r.unplaced).toBe(0);
  });

  it("a class with more lessons than the week has periods fails", () => {
    const base = school.lessons.find((l) => (l.classIds || []).includes(cls.id));
    const overloaded = {
      ...school,
      lessons: [...school.lessons, { ...base, id: "OVERLOAD", periodsPerWeek: 60, periodsPerCard: 1 }],
    };
    const r = testObject(overloaded, { part: "classes", id: cls.id, name: cls.name }, { timeLimitSec: 1 });
    expect(r.status).toBe("failed");
    expect(r.unplaced).toBeGreaterThan(0);
  });
});

import { capacity } from "../spec_check.js";

describe("capacity figures for a failing object", () => {
  const BELL = { periods: [1, 2, 3].map((i) => ({ index: i, isTeaching: true })) };
  const s = {
    daysPerWeek: 2, bell: BELL,
    teachers: [{ id: "t", timeOff: [[2, 0, 0], [0, 0, 0]] }],
    classes: [{ id: "c" }],
    groups: [{ id: "whole", entireClass: true }, { id: "half", entireClass: false }],
    lessons: [{ id: "a", teacherIds: ["t"], classIds: ["c"], periodsPerWeek: 4 }, { id: "b", teacherIds: ["t"], classIds: ["c"], periodsPerWeek: 3 }],
  };
  it("teacher: needs 7, has 6 minus one blocked = 5", () => {
    expect(capacity(s, { part: "teachers", id: "t" })).toEqual({ need: 7, have: 5 });
  });
  it("class with whole-class lessons only gets a figure", () => {
    expect(capacity(s, { part: "classes", id: "c" })).toEqual({ need: 7, have: 6 });
  });
  it("class with a group lesson: no figure (groups can run in parallel)", () => {
    const g = { ...s, lessons: [...s.lessons, { id: "g", classIds: ["c"], teacherIds: [], groupIds: ["half"], periodsPerWeek: 1 }] };
    expect(capacity(g, { part: "classes", id: "c" })).toBe(null);
  });
});
