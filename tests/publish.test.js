/**
 * W2-3 · publish snapshot (C2 writer) unit tests.
 *
 * These pin the *content rules* of the three editions — not just the presence
 * of keys. The headline rule is the public edition: no teacher name (or id)
 * may appear ANYWHERE in the serialized JSON.
 */
import { describe, it, expect } from "vitest";
import {
  buildSnapshot,
  buildViewerHtml,
  snapshotCounts,
  breakAfterPeriod,
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  EDITIONS,
} from "../js/ui/io/publish.js";
import { fixtureSchool } from "./fixtures/school.js";

const OPTS = { now: "2026-09-25T00:00:00.000Z", appVer: "test" };

describe("C2 schema shape", () => {
  it("emits exactly the contract keys with the contract types", () => {
    const snap = buildSnapshot(fixtureSchool(), "staff", OPTS);
    expect(Object.keys(snap).sort()).toEqual(
      ["breaks", "classes", "classrooms", "days", "edition", "format", "lessons",
       "periods", "school", "subjects", "teachers", "version"].sort()
    );
    expect(snap.format).toBe(SNAPSHOT_FORMAT);
    expect(snap.version).toBe(SNAPSHOT_VERSION);
    expect(snap.edition).toBe("staff");
    expect(snap.school).toEqual({
      name: "G.D. Goenka School, Darbhanga",
      year: "2026/27",
      generatedAt: "2026-09-25T00:00:00.000Z",
      appVer: "test",
    });
    expect(snap.days[0]).toEqual({ index: 0, name: "Monday", short: "Mon" });
    expect(snap.days).toHaveLength(6);
    expect(snap.periods[0]).toEqual({ index: 1, label: "1st", start: "08:00", end: "08:50" });
    expect(snap.classes).toEqual([{ id: "c1", name: "I A" }, { id: "c2", name: "I B" }]);
    expect(snap.teachers).toEqual([
      { id: "t1", name: "Ms. Sushmita" },
      { id: "t2", name: "Mr. Anil" },
    ]);
    expect(snap.classrooms).toEqual([{ id: "r1", name: "Science Lab" }]);
    expect(snap.subjects[1]).toEqual({ id: "s2", name: "Science", short: "Sci", color: "#123456" });
    // every lesson row carries the full C2 field set
    const l = snap.lessons.find(x => x.day === 0 && x.period === 1);
    expect(Object.keys(l).sort()).toEqual(
      ["classIds", "classroomIds", "day", "period", "span", "subjectId", "teacherIds"].sort()
    );
    expect(l).toMatchObject({ classIds: ["c1"], teacherIds: ["t1"], classroomIds: ["r1"], span: 1 });
  });

  it("serializes to JSON without loss (round-trip through JSON.parse)", () => {
    const snap = buildSnapshot(fixtureSchool(), "staff", OPTS);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });

  it("rejects an unknown edition instead of guessing", () => {
    expect(() => buildSnapshot(fixtureSchool(), "parents", OPTS)).toThrow(/edition/i);
    expect(() => buildSnapshot(null, "staff", OPTS)).toThrow(/school/i);
    expect(EDITIONS).toEqual(["staff", "students", "public"]);
  });
});

describe("edition content rules", () => {
  it("public edition leaks NO teacher name and NO teacher id anywhere in the JSON", () => {
    const text = JSON.stringify(buildSnapshot(fixtureSchool(), "public", OPTS));
    for (const needle of ["Sushmita", "Anil", "t1", "t2", "teachers"]) {
      expect(text, `public snapshot must not contain "${needle}"`).not.toContain(needle);
    }
  });

  it("staff edition keeps teacher names and ids in the lessons", () => {
    const snap = buildSnapshot(fixtureSchool(), "staff", OPTS);
    expect(snap.teachers).toHaveLength(2);
    expect(snap.lessons.some(l => l.teacherIds.includes("t1"))).toBe(true);
  });

  it("students edition shows teacher names by default and drops them on request", () => {
    const withNames = buildSnapshot(fixtureSchool(), "students", OPTS);
    expect(withNames.teachers).toHaveLength(2);
    expect(withNames.lessons.every(l => Array.isArray(l.teacherIds))).toBe(true);
    expect(withNames.lessons.some(l => l.teacherIds.length > 0)).toBe(true);

    const noNames = buildSnapshot(fixtureSchool(), "students", { ...OPTS, teacherNames: false });
    expect(noNames.teachers).toBeUndefined();
    expect(noNames.lessons.every(l => l.teacherIds.length === 0)).toBe(true);
    expect(JSON.stringify(noNames)).not.toContain("Sushmita");
  });

  it("public edition never includes the teachers array", () => {
    const snap = buildSnapshot(fixtureSchool(), "public", OPTS);
    expect(snap.teachers).toBeUndefined();
    expect(snap.lessons.every(l => l.teacherIds.length === 0)).toBe(true);
  });
});

describe("period / break / lesson mapping", () => {
  it("maps each break to the period it follows (afterPeriod)", () => {
    const periods = fixtureSchool().bell.periods;
    expect(breakAfterPeriod(periods, { starttime: "10:20", endtime: "10:45" })).toBe(3);
    expect(breakAfterPeriod(periods, { starttime: "13:05", endtime: "13:15" })).toBe(6);
  });

  it("publishes breaks with label, times and afterPeriod", () => {
    const snap = buildSnapshot(fixtureSchool(), "staff", OPTS);
    expect(snap.breaks).toEqual([
      { afterPeriod: 3, label: "Recess", start: "10:20", end: "10:45" },
      { afterPeriod: 6, label: "Short break", start: "13:05", end: "13:15" },
    ]);
  });

  it("derives span from the lesson's periodsPerCard", () => {
    const snap = buildSnapshot(fixtureSchool(), "staff", OPTS);
    const double = snap.lessons.find(l => l.subjectId === "s2" && l.day === 0 && l.period === 4);
    expect(double.span).toBe(2);
  });

  it("drops lessons whose classes are not in the published class list, and de-duplicates cards", () => {
    const snap = buildSnapshot(fixtureSchool(), "staff", OPTS);
    expect(snap.lessons).toHaveLength(3); // l3 dropped (ghost class), duplicate card folded
    expect(snap.lessons.map(l => `${l.day}:${l.period}`)).toEqual(["0:1", "0:4", "1:1"]);
  });

  it("gives every subject a color (stable fallback when the school has none)", () => {
    const a = buildSnapshot(fixtureSchool(), "staff", OPTS).subjects[0];
    const b = buildSnapshot(fixtureSchool(), "staff", OPTS).subjects[0];
    expect(a.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(a.color).toBe(b.color);
    expect(buildSnapshot(fixtureSchool(), "staff", OPTS).subjects[1].color).toBe("#123456");
  });
});

describe("dialog preview counts", () => {
  it("counts what each edition actually contains", () => {
    const staff = snapshotCounts(buildSnapshot(fixtureSchool(), "staff", OPTS));
    expect(staff).toEqual({ classes: 2, teachers: 2, lessons: 3, days: 6, periods: 7 });

    const publicCounts = snapshotCounts(buildSnapshot(fixtureSchool(), "public", OPTS));
    expect(publicCounts.classes).toBe(2);
    expect(publicCounts.teachers).toBe(0); // hidden → the preview must not promise them
    expect(publicCounts.lessons).toBe(3);
  });
});

describe("single-file offline viewer HTML", () => {
  // The bundle is W2-2's reader (js/viewer/render.js) + the W2-3 loader; the
  // only thing the writer assumes is that it registers window.ChronexaViewer.
  const BUNDLE = "window.ChronexaViewer={render:function(rootEl,snapshot){}};";

  it("inlines the snapshot and the viewer bundle, and boots the viewer", () => {
    const snap = buildSnapshot(fixtureSchool(), "staff", OPTS);
    const html = buildViewerHtml(snap, { viewerJs: BUNDLE });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<script type="application/json" id="chronexa-snapshot">');
    expect(html).toContain(BUNDLE);
    expect(html).toContain('id="chronexa-viewer-root"');
    expect(html).toContain("G.D. Goenka School, Darbhanga");
    // the inlined JSON must be parseable and equal to the snapshot
    const json = html.match(/<script type="application\/json" id="chronexa-snapshot">([\s\S]*?)<\/script>/)[1];
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(snap)));
    // and the viewer bundle must be a CLASSIC script (file:// blocks module CORS)
    expect(html).not.toContain('<script type="module"');
    // ONE file: no external script/stylesheet reference may exist
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    // layout: the snapshot block precedes the bundle
    expect(html.indexOf('id="chronexa-snapshot"')).toBeLessThan(html.indexOf(BUNDLE));
    // page shell: the class the reader's CSS expects, and no ESM syntax anywhere
    // (Review 2: raw module source inlined in a classic script = blank page)
    expect(html).toContain('class="chrx-viewer-active"');
    expect(html).not.toMatch(/^\s*(import|export)[ {]/m);
  });

  it("neutralizes a '</script>' inside the snapshot JSON", () => {
    const school = fixtureSchool();
    school.classes[0].name = 'I A </script><script>alert(1)</script>';
    const html = buildViewerHtml(buildSnapshot(school, "staff", OPTS), { viewerJs: BUNDLE });
    const json = html.match(/<script type="application\/json" id="chronexa-snapshot">([\s\S]*?)<\/script>/)[1];
    expect(json).not.toContain("</script>");
    expect(JSON.parse(json).classes[0].name).toBe('I A </script><script>alert(1)</script>');
  });
});
