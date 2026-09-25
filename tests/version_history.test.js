// W3-1 · Automatic backups + version history — unit tests.
//
// The ring policy and the diff are pure, so they are tested directly; the
// store is tested through its adapter contract with an in-memory adapter
// (jsdom has no IndexedDB — the e2e lane covers the real one).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createMemoryAdapter,
  createBackupStore,
  planEvictions,
  diffSchools,
  describeDiff,
  stripForBackup,
  applyRestore,
  configure,
  VersionHistory,
} from "../js/ui/components/version_history.js";

const DAYS_DEFS = [
  { name: "Monday", short: "MO", bits: "100000" },
  { name: "Tuesday", short: "TU", bits: "010000" },
  { name: "Wednesday", short: "WE", bits: "001000" },
  { name: "Thursday", short: "TH", bits: "000100" },
  { name: "Friday", short: "FR", bits: "000010" },
  { name: "Saturday", short: "SA", bits: "000001" },
];

function makeSchool() {
  return {
    schoolName: "Fixture School",
    daysPerWeek: 6,
    daysDefs: DAYS_DEFS.map((d) => ({ ...d })),
    bell: { periods: [
      { index: 1, label: "1st", startMin: 475, endMin: 520 },
      { index: 2, label: "2nd", startMin: 520, endMin: 565 },
      { index: 3, label: "3rd", startMin: 565, endMin: 610 },
      { index: 4, label: "4th", startMin: 610, endMin: 655 },
    ] },
    teachers: [{ id: "t1", name: "Ms. A" }, { id: "t2", name: "Mr. B" }],
    classes: [{ id: "c1", name: "VI A" }, { id: "c2", name: "VI B" }],
    classrooms: [{ id: "r1", name: "Room 1" }],
    subjects: [{ id: "s1", name: "Maths", abbr: "MAT" }, { id: "s2", name: "Science", abbr: "SCI" }],
    lessons: [
      { id: "l1", subjectId: "s1", teacherIds: ["t1"], classIds: ["c1"], periodsPerCard: 1 },
      { id: "l2", subjectId: "s2", teacherIds: ["t2"], classIds: ["c1"], periodsPerCard: 1 },
      { id: "l3", subjectId: "s1", teacherIds: ["t1"], classIds: ["c2"], periodsPerCard: 1 },
    ],
    cards: [
      { id: "k1", lessonId: "l1", day: 0, period: 1, classroomId: "r1" },
      { id: "k2", lessonId: "l2", day: 0, period: 2, classroomId: "r1" },
      { id: "k3", lessonId: "l3", day: 1, period: 1, classroomId: "r1" },
    ],
  };
}

function slotOf(school, lessonId) {
  const card = (school.cards || []).find((c) => c.lessonId === lessonId);
  return card ? { day: card.day, period: card.period } : null;
}

describe("W3-1 backup ring", () => {
  it("keeps the last 20 versions: the 21st backup evicts the oldest", async () => {
    const adapter = createMemoryAdapter();
    const store = createBackupStore(adapter, { maxVersions: 20, maxBytes: Number.MAX_SAFE_INTEGER });
    const school = makeSchool();

    for (let i = 1; i <= 21; i++) {
      school.cards[0].day = i % 6;                 // 21 distinct states
      await store.record(school, { ts: i, label: "Edit " + i });
    }

    const versions = await store.list();
    expect(versions.length).toBe(20);
    expect(versions[0].ts).toBe(21);               // newest first
    expect(versions[versions.length - 1].ts).toBe(2);
    expect(versions.some((v) => v.ts === 1)).toBe(false);   // oldest evicted
  });

  it("size cap drops the oldest versions and always keeps the newest", async () => {
    const school = makeSchool();
    const probe = createBackupStore(createMemoryAdapter(), { maxVersions: 20, maxBytes: Number.MAX_SAFE_INTEGER });
    const probeRec = await probe.record(school, { ts: 1 });
    const bytes = probeRec.bytes;                  // every record below is this size

    const adapter = createMemoryAdapter();
    const store = createBackupStore(adapter, { maxVersions: 20, maxBytes: 2 * bytes });
    for (let i = 0; i < 4; i++) {
      school.cards[0].day = i;                     // same JSON width, different hash
      await store.record(school, { ts: 10 + i });
    }

    const versions = await store.list();
    expect(versions.length).toBe(2);               // 2 x bytes, no more
    expect(versions.map((v) => v.ts)).toEqual([13, 12]);

    // A single version larger than the whole cap is still kept.
    const tiny = createBackupStore(createMemoryAdapter(), { maxVersions: 20, maxBytes: 1 });
    await tiny.record(school, { ts: 1 });
    await tiny.record(school, { ts: 2, force: true });
    expect((await tiny.list()).length).toBeGreaterThanOrEqual(1);
  });

  it("planEvictions is newest-first greedy and never empties the ring", () => {
    const metas = [
      { id: "a", ts: 1, bytes: 1000 },
      { id: "b", ts: 2, bytes: 1000 },
      { id: "c", ts: 3, bytes: 1000 },
    ];
    expect(planEvictions(metas, { maxVersions: 20, maxBytes: 2500 })).toEqual(["a"]);
    expect(planEvictions(metas, { maxVersions: 20, maxBytes: 1 })).toEqual(["a", "b"]);
    expect(planEvictions(metas, { maxVersions: 2, maxBytes: Number.MAX_SAFE_INTEGER })).toEqual(["a"]);
    expect(planEvictions(metas, { maxVersions: 5, maxBytes: Number.MAX_SAFE_INTEGER })).toEqual([]);
  });

  it("an unchanged school is not stored twice", async () => {
    const store = createBackupStore(createMemoryAdapter(), { maxVersions: 20, maxBytes: Number.MAX_SAFE_INTEGER });
    const school = makeSchool();
    const first = await store.record(school, { ts: 1, label: "Load" });
    const again = await store.record(school, { ts: 2, label: "Auto-save" });
    expect(first).not.toBeNull();
    expect(again).toBeNull();
    expect((await store.list()).length).toBe(1);
  });

  it("records the label and size the history list shows", async () => {
    const store = createBackupStore(createMemoryAdapter(), { maxVersions: 20, maxBytes: Number.MAX_SAFE_INTEGER });
    const school = makeSchool();
    await store.record(school, { ts: 7, label: "Move card" });
    const [meta] = await store.list();
    expect(meta.label).toBe("Move card");
    expect(meta.cards).toBe(3);
    expect(meta.lessons).toBe(3);
    expect(meta.sizeKB).toBeGreaterThan(0);
    expect(meta.schoolName).toBe("Fixture School");
    // _idx is derived and must not be stored.
    expect(stripForBackup({ ...school, _idx: { huge: true } })._idx).toBeUndefined();
  });
});

describe("W3-1 version diff", () => {
  it("reports a moved lesson as one move, not removed + added", () => {
    const before = makeSchool();
    const after = makeSchool();
    after.cards[0].day = 2;            // l1: Mon P1 → Wed P1
    after.cards[0].period = 3;

    const diff = diffSchools(before, after);
    expect(diff.counts).toEqual({ moved: 1, added: 0, removed: 0 });
    expect(diff.moved[0].lessonId).toBe("l1");
    expect(diff.moved[0].from).toEqual({ day: 0, period: 1 });
    expect(diff.moved[0].to).toEqual({ day: 2, period: 3 });
  });

  it("reports added and removed placements separately", () => {
    const before = makeSchool();
    const after = makeSchool();
    after.cards.push({ id: "k9", lessonId: "l2", day: 4, period: 1, classroomId: "r1" });
    after.cards = after.cards.filter((c) => c.id !== "k3");

    const diff = diffSchools(before, after);
    expect(diff.counts).toEqual({ moved: 0, added: 1, removed: 1 });
    expect(diff.added[0]).toMatchObject({ lessonId: "l2", day: 4, period: 1 });
    expect(diff.removed[0]).toMatchObject({ lessonId: "l3", day: 1, period: 1 });
  });

  it("describes the diff with lesson, day and period names", () => {
    const before = makeSchool();
    const after = makeSchool();
    after.cards[0].day = 2;
    after.cards[0].period = 3;
    const described = describeDiff(before, diffSchools(before, after));
    expect(described.summary).toBe("1 moved · 0 added · 0 removed");
    expect(described.lines[0].text).toContain("Maths (VI A)");
    expect(described.lines[0].text).toContain("Monday");
    expect(described.lines[0].text).toContain("Wednesday");
  });

  it("counts a swap as two moves", () => {
    const before = makeSchool();
    const after = makeSchool();
    after.cards[0].day = 0; after.cards[0].period = 2;
    after.cards[1].day = 0; after.cards[1].period = 1;
    expect(diffSchools(before, after).counts.moved).toBe(2);
  });
});

describe("W3-1 restore", () => {
  let originalSchool;

  beforeEach(() => {
    window.APP = window.APP || {};
    originalSchool = window.APP.school;
  });
  afterEach(() => {
    window.APP.school = originalSchool;
    window.APP.history.clear();
  });

  it("restores a stored version through APP.mutate, so ⌘Z puts the edit back", async () => {
    configure(createMemoryAdapter());
    const school = makeSchool();
    window.APP.school = school;

    const rec = await VersionHistory.record(school, { ts: 1, label: "Before the move" });
    expect(rec).not.toBeNull();

    // The user's edit: l1 moves from Mon P1 to Wed P3.
    window.APP.mutate("Move card", (s) => {
      const card = s.cards.find((c) => c.lessonId === "l1");
      card.day = 2;
      card.period = 3;
    });
    expect(slotOf(window.APP.school, "l1")).toEqual({ day: 2, period: 3 });
    expect(window.APP.history.canUndo).toBe(true);

    // Restore the version.
    expect(applyRestore(rec.payload, "Restore backup")).toBe(true);
    expect(slotOf(window.APP.school, "l1")).toEqual({ day: 0, period: 1 });
    // Restore is itself a transaction: the move did not swallow the history.
    expect(window.APP.history.peek().label).toBe("Restore backup");

    // Undo the restore → the edit is back.
    expect(window.APP.undo()).toBe(true);
    expect(slotOf(window.APP.school, "l1")).toEqual({ day: 2, period: 3 });
  });

  it("re-renders the workspace after a restore (entity:changed)", () => {
    const seen = [];
    const onChanged = (e) => seen.push(e.detail);
    document.addEventListener("entity:changed", onChanged);
    try {
      window.APP.school = makeSchool();
      applyRestore(makeSchool(), "Restore backup");
    } finally {
      document.removeEventListener("entity:changed", onChanged);
    }
    expect(seen.some((d) => d && d.source === "version-history")).toBe(true);
  });
});

describe("W3-1 backup triggers (auto_save wiring)", () => {
  it("auto_save records a version labelled with the last undo label", async () => {
    const adapter = createMemoryAdapter();
    configure(adapter);
    window.APP = window.APP || {};
    window.APP.school = makeSchool();

    // auto_save.js is imported for its side effects (event listeners).
    await import("../js/ui/components/auto_save.js");
    expect(typeof window.AutoSave.recordBackup).toBe("function");

    window.AutoSave.recordBackup("Move card");
    await vi.waitFor(async () => {
      expect((await VersionHistory.list()).length).toBe(1);
    });
    const [meta] = await VersionHistory.list();
    expect(meta.label).toBe("Move card");
  });

  it("a card move through APP.mutate is persisted by the autosave within a timer period", async () => {
    vi.useFakeTimers();
    try {
      configure(createMemoryAdapter());
      window.APP = window.APP || {};
      window.APP.school = makeSchool();
      window.APP.audit = window.APP.audit || { _log: [] };
      window.localStorage.removeItem("chronexa.autosave.v1");
      await import("../js/ui/components/auto_save.js");   // boot() arms the 60s timer

      // Exactly what a drag does: APP.mutate (via audit.commit). It never
      // touches audit._log, which is all the periodic check used to look at.
      window.APP.mutate("Move card", (s) => { s.cards[0].day = 2; });
      expect(window.localStorage.getItem("chronexa.autosave.v1")).toBeNull();

      vi.advanceTimersByTime(61 * 1000);
      expect(window.localStorage.getItem("chronexa.autosave.v1")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
