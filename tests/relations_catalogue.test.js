// The Card relationships dialog is the only way a school can create an
// advanced (aSc a_*) condition. These assertions pin the contract the solver
// relies on: the type is in the catalogue, it declares param1, and its default
// is inside the range the input renders — so a row the dialog can save is
// never inert in the solver.
import { describe, it, expect, beforeAll } from "vitest";

const ADVANCED = ["a_4", "a_5", "a_6", "a_26", "a_27", "a_1", "a_22", "a_82", "a_83",
  "a_0", "a_3", "a_9", "a_10", "a_12", "a_13", "a_54", "a_74",
  "a_17", "a_18", "a_19", "a_21", "a_67", "a_68", "a_69", "a_70",
  "a_11", "a_20", "a_23", "a_37", "a_40", "a_41", "a_42",
  "a_7", "a_8", "a_30", "a_34", "a_60",
  "a_24", "a_25", "a_39", "a_43", "a_58"];
const PAIR_TYPES = ["a_1", "a_22", "a_82", "a_83", "a_21", "a_11", "a_37", "a_40", "a_41", "a_42",
  "a_30", "a_34"];

beforeAll(async () => {
  // Minimal EntityDialog stub — the module only needs buildField/el at import time.
  window.EntityDialog = window.EntityDialog || {
    el: (tag, attrs, ...kids) => {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (k === "class") node.className = v;
        else if (k.startsWith("on") && typeof v === "function") node[k] = v;
        else if (v != null) node.setAttribute(k, v);
      }
      kids.flat().forEach((k) => node.append(k && k.nodeType ? k : String(k)));
      return node;
    },
    buildField: (label, control) => {
      const w = document.createElement("label");
      w.append(String(label), control);
      return w;
    },
    uid: (p) => p + Math.random().toString(36).slice(2, 8),
  };
  window.APP = window.APP || { school: {} };
  await import("../js/ui/entities/relations.js");
});

describe("relations catalogue — advanced aSc conditions", () => {
  it("exports the dialog's own catalogue for verification", () => {
    expect(window.EntityRelations).toBeTruthy();
    expect(Array.isArray(window.EntityRelations.catalogue)).toBe(true);
  });

  it("contains every advanced type the solver enforces", () => {
    const codes = window.EntityRelations.catalogue.map((t) => t.code);
    for (const code of ADVANCED) expect(codes, code).toContain(code);
  });

  it("every advanced type declares a param1 with a sane default", () => {
    const NO_PARAM = ["a_30", "a_34"];   // positional; a_60 uses a period window
    for (const code of ADVANCED) {
      if (NO_PARAM.includes(code)) { expect(window.EntityRelations.needsParam1.has(code)).toBe(false); continue; }
      if (code === "a_60") { expect(window.EntityRelations.needsParam1.has(code)).toBe(false); continue; }
      const t = window.EntityRelations.catalogue.find((x) => x.code === code);
      expect(t.param1, `${code} has no param1 config`).toBeTruthy();
      expect(t.param1.min).toBeLessThanOrEqual(t.param1.def);
      expect(t.param1.def).toBeLessThanOrEqual(t.param1.max);
      expect(window.EntityRelations.needsParam1.has(code)).toBe(true);
    }
  });

  it("pair conditions ask for Subject B, single-subject ones do not", () => {
    for (const code of ADVANCED) {
      const shouldPair = PAIR_TYPES.includes(code);
      expect(window.EntityRelations.needsSubject2.has(code), code).toBe(shouldPair);
    }
  });

  it("gives every type a category and help text", () => {
    for (const t of window.EntityRelations.catalogue) {
      expect(t.category, t.code).toBeTruthy();
      expect((t.help || "").length, t.code).toBeGreaterThan(10);
    }
  });

  it("keeps the negative 'cannot follow' wording on a_22 instead of claiming it is allowed", () => {
    const t = window.EntityRelations.catalogue.find((x) => x.code === "a_22");
    expect(t.label).toMatch(/can not follow/i);
  });
});
