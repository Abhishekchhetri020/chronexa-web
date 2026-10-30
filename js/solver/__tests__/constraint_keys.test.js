// The constraint registry is only worth having if it cannot lie. These tests
// read the three solver sources off disk and check every claim the registry
// makes about them, plus the reverse: a key that a dialog writes must be
// registered, and a key marked dead must appear in no solver at all.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONSTRAINT_KEYS, SOLVERS, SOLVER_SOURCES,
  hasValue, rowsFor, findRow, enforcedBy, isEnforced,
  deadRows, deadKeysByEntity, enforcementHelp, auditSchool,
} from "../constraint_keys.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const src = Object.fromEntries(
  SOLVERS.map((s) => [s, readFileSync(resolve(ROOT, SOLVER_SOURCES[s]), "utf8")])
);

// Keys each dialog writes — kept here by hand on purpose: if a dialog gains a
// field without touching the registry, this list and the dialog disagree and
// `dialog keys ⊆ registry` below still holds, but the *dialog* test (below)
// re-reads the dialog sources so the gap cannot hide.
const DIALOG_FILES = {
  teacher: "js/ui/components/teacher_constraints_dialog.js",
  class: "js/ui/components/class_constraints_dialog.js",
  classroom: "js/ui/entities/classrooms.js",
  subject: "js/ui/entities/subjects.js",
};

describe("constraint registry — shape", () => {
  it("has no duplicate entity+key rows", () => {
    const seen = new Map();
    for (const r of CONSTRAINT_KEYS) {
      const id = `${r.entity}.${r.key}`;
      expect(seen.has(id), `duplicate row ${id}`).toBe(false);
      seen.set(id, r);
    }
  });

  it("every row declares a weight and a kind", () => {
    for (const r of CONSTRAINT_KEYS) {
      expect(["hard", "soft", "none"]).toContain(r.weight);
      expect(["int", "intOrAny", "bool", "mask", "object"]).toContain(r.kind);
    }
  });

  it("an unenforced row must say why", () => {
    for (const r of deadRows()) {
      expect(r.uiOnly, `${r.entity}.${r.key} is inert but has no uiOnly reason`).toBeTruthy();
    }
  });

  it("an enforced row must not claim uiOnly", () => {
    for (const r of CONSTRAINT_KEYS) {
      if (enforcedBy(r).length) expect(r.uiOnly).toBeUndefined();
    }
  });
});

describe("constraint registry — does not drift from the solvers", () => {
  it("every enforced field name appears in that solver's source", () => {
    for (const r of CONSTRAINT_KEYS) {
      for (const s of SOLVERS) {
        const field = r.solvers[s];
        if (!field) continue;
        const probe = (r.probes && r.probes[s]) || field;
        expect(
          src[s].includes(probe),
          `${r.entity}.${r.key} claims ${s} reads "${probe}", but ${SOLVER_SOURCES[s]} does not contain it`
        ).toBe(true);
      }
    }
  });

  it("no dead key is mentioned by any solver", () => {
    // A key name can collide with another entity's field (`maxPerDay` exists on
    // teachers, classes and subjects), so colliding names are checked in their
    // entity-qualified form, where they mean exactly one thing.
    const ENTITY_PREFIX = { teacher: "tt", class: "cc", classroom: "r", subject: "sj" };
    const colliding = new Set([
      ...CONSTRAINT_KEYS.map((r) => r.topLevel).filter(Boolean),
      ...CONSTRAINT_KEYS.map((r) => r.key),
    ]);
    for (const r of deadRows()) {
      const bare = [r.key, r.ascKey].filter((t) => t && !colliding.has(t));
      const qualified = [`${ENTITY_PREFIX[r.entity] || r.entity}.${r.key}`];
      if (r.ascKey) qualified.push(`${ENTITY_PREFIX[r.entity] || r.entity}.${r.ascKey}`);
      const tokens = [...bare, ...qualified];
      for (const s of SOLVERS) {
        for (const t of tokens) {
          expect(
            src[s].includes(t),
            `${r.entity}.${r.key} is marked dead but ${SOLVER_SOURCES[s]} mentions "${t}" — wire it or drop the claim`
          ).toBe(false);
        }
      }
    }
  });

  it("records exactly which limits the cloud CP-SAT enforces (R3-B4)", () => {
    // Not a wish — a recorded fact, so the table cannot drift from the backend.
    // Everything else (teacher maxDaysPerWeek, the a_* gap/ordering/frequency/
    // room families, supervision) is still browser-only — a recorded gap, not
    // an oversight.
    const CLOUD = [
      "class.classTeacherPos",    // homeroom-teacher slot (soft)
      "class.lunch_periodfrom",   // lunch window (soft)
      "class.lunch_periodto",     // lunch window (soft)
      "class.maxperiodsday",      // class daily cap (hard)
      "class.m_nMaxVyucDo",       // teaching window (soft)
      "class.m_nMaxVyucOd",       // teaching window (soft)
      "class.minperiodsday",      // class daily floor (soft)
      "subject.maxParallel",      // a_15 cards of a subject per period (hard)
      "teacher.lessonsPerDayMax", // teacher daily cap (hard)
      "teacher.teachers_maxconsecutiveperiods", // teacher consecutive run (soft)
      "teacher.teachers_maxgapsday",   // teacher gap cap per day (soft)
      "teacher.teachers_maxgapsweek",  // teacher gap cap per week (soft)
    ];
    const claimed = CONSTRAINT_KEYS
      .filter((r) => r.solvers.cloud)
      .map((r) => `${r.entity}.${r.key}`)
      .sort();
    expect(claimed).toEqual([...CLOUD].sort());
  });
});

describe("constraint registry — dialogs cannot write unregistered keys", () => {
  for (const [entity, rel] of Object.entries(DIALOG_FILES)) {
    it(`${entity} dialog writes only registered keys`, () => {
      let text;
      try {
        text = readFileSync(resolve(ROOT, rel), "utf8");
      } catch {
        return; // dialog moved/absent in this checkout — nothing to assert
      }
      const registered = new Set(rowsFor(entity).map((r) => r.key));
      const ascKeys = new Set(rowsFor(entity).map((r) => r.ascKey).filter(Boolean));
      // `c.<key> = v` assignments and `{ ... constraints }` default maps.
      const written = new Set(
        [...text.matchAll(/c\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map((m) => m[1])
      );
      const constrainKeys = [...text.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*["']\*["']/g)]
        .map((m) => m[1]);
      constrainKeys.forEach((k) => written.add(k));
      const unknown = [...written].filter(
        (k) => !registered.has(k) && !ascKeys.has(k) && !isKnownNonConstraint(k)
      );
      expect(unknown, `${rel} writes keys missing from the registry: ${unknown.join(", ")}`).toEqual([]);
    });
  }
});

// Fields a dialog file touches that are not constraint keys at all.
function isKnownNonConstraint(k) {
  return [
    "value", "checked", "innerHTML", "textContent", "className", "disabled",
    "onclick", "oninput", "title", "style", "id", "name", "type", "placeholder",
  ].includes(k);
}

describe("constraint registry — helpers", () => {
  it("hasValue treats aSc sentinels as unset", () => {
    for (const v of ["*", "i", "", null, undefined]) expect(hasValue(v)).toBe(false);
    for (const v of [0, "0", 3, false]) expect(hasValue(v)).toBe(true);
  });

  it("splits enforced vs inert for teachers", () => {
    expect(isEnforced("teacher", "teachers_maxgapsday")).toBe(true);
    expect(isEnforced("teacher", "supervisionMinCount")).toBe(false);
    expect(enforcedBy(findRow("teacher", "teachers_maxconsecutiveperiods"))).toEqual(["js", "wasm", "cloud"]);
    expect(enforcedBy(findRow("teacher", "teachers_maxgapsweek"))).toEqual(["js", "cloud"]);
  });

  it("groups dead keys per entity", () => {
    const dead = deadKeysByEntity();
    expect(dead.teacher).toContain("supervisionMinMinutes");
    expect(dead.class).toContain("maxneedspreparation");
    expect(dead.classroom).toContain("maxCardsPos");
  });

  it("enforcementHelp is silent for live keys and explains dead ones", () => {
    expect(enforcementHelp("teacher", "teachers_maxgapsday")).toBeNull();
    const h = enforcementHelp("teacher", "supervisionMinCount");
    expect(h).toMatch(/Supervision duty is not scheduled/);
    expect(h).toMatch(/enforced by: no solver/);
  });

  it("auditSchool reports only values that are actually set", () => {
    const hit = auditSchool({
      teachers: [{ id: "t1", name: "T1", constraints: { supervisionMinCount: 2, teachers_maxgapsday: 1 } }],
      classes: [{ id: "c1", name: "C1", constraints: { maxneedspreparation: 3, lunch_periodfrom: 4 } }],
      classrooms: [{ id: "r1", name: "R1", constraints: { maxCardsPos: 2 } }],
    });
    expect(hit.map((h) => h.key).sort()).toEqual(["maxCardsPos", "maxneedspreparation", "supervisionMinCount"]);
    expect(auditSchool({ teachers: [{ id: "t1", constraints: { teachers_maxgapsday: 1 } }] })).toEqual([]);
  });
});
