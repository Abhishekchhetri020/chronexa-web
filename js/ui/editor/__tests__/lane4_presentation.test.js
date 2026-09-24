import { describe, it, expect, vi } from "vitest";
import { loadSampleSchool } from "../../../solver/__tests__/helpers/load_school.js";
import "../../../ui/state.js";
import "../../../ui/entities/dialog_shell.js";
import "../../../ui/entities/classes.js";
import "../../../ui/entities/classrooms.js";
import "../../../ui/entities/lessons.js";
import { InputtedConstraintsDialog } from "../../../ui/components/inputted_constraints_dialog.js";
import "../../../ui/print_preview/templates_registry.js";
import "../../../ui/print_preview/templates/list_of_classes.js";

describe("Lane L4 Data Presentation Tests", () => {
  it("B8: list_of_classes registers without console warning and has valid render function", () => {
    const tpl = window.APP.printTemplates.get("list_of_classes");
    expect(tpl).toBeDefined();
    expect(typeof tpl.render).toBe("function");

    const school = loadSampleSchool();
    const rendered = tpl.render(school);
    expect(rendered).toBeDefined();
    expect(rendered.length).toBeGreaterThan(0);
  });

  it("B13: lessons list resolves TERM, WEEK, and DAYS to human names instead of hex GUIDs", () => {
    const school = loadSampleSchool();
    window.APP.school = school;
    let openedCfg = null;
    const origOpen = window.EntityDialog.open;
    window.EntityDialog.open = (cfg) => { openedCfg = cfg; };
    try {
      window.EntityLessons.open();
      expect(openedCfg).not.toBeNull();
      const rows = openedCfg.rows;
      expect(rows.length).toBeGreaterThan(0);
      const row = rows[0];

      // Original code outputs 16-hex GUIDs: "7F8912974819318E", "3CF8AC1951FD43B8", "44377B037E8211A0"
      expect(row.term).not.toMatch(/^[0-9A-Fa-f]{16}$/);
      expect(row.week).not.toMatch(/^[0-9A-Fa-f]{16}$/);
      expect(row.days).not.toMatch(/^[0-9A-Fa-f]{16}$/);
      expect(row.term).toBe("All");
      expect(row.week).toBe("All");
      expect(row.days).toBe("All");
    } finally {
      window.EntityDialog.open = origOpen;
    }
  });

  it("B13: a partial day list keeps its name and an unknown id is not shown as All", () => {
    const school = loadSampleSchool();
    const days = school.daysDefs || school.days;
    days.push({ id: "MONTUE0000000001", name: "Mon or Tue", short: "MT", days: "100000,010000" });
    school.lessons[0].daysDefId = "MONTUE0000000001";
    school.lessons[1].daysDefId = "FFFFFFFFFFFFFFFF";
    window.APP.school = school;
    let openedCfg = null;
    const origOpen = window.EntityDialog.open;
    window.EntityDialog.open = (cfg) => { openedCfg = cfg; };
    try {
      window.EntityLessons.open();
      const byId = Object.fromEntries(openedCfg.rows.map(r => [r.id, r]));
      expect(byId[school.lessons[0].id].days).toBe("Mon or Tue");
      expect(byId[school.lessons[1].id].days).toBe("Unknown");
    } finally {
      window.EntityDialog.open = origOpen;
    }
  });

  it("B14: inputted constraints filters out default week and term definitions", () => {
    const school = loadSampleSchool();
    const items = InputtedConstraintsDialog.collectConstraints(school);

    // Original code has 851 items (381 default week definitions + 381 default term definitions)
    const weekDefRows = items.filter(it => it.type === "lesson-weeks");
    const termDefRows = items.filter(it => it.type === "lesson-terms");

    expect(weekDefRows.length).toBe(0);
    expect(termDefRows.length).toBe(0);
    expect(items.length).toBe(89);
  });

  it("B18: shared option label helper deduplicates identical name/short case-insensitively", () => {
    const formatOptionLabel = window.EntityDialog.formatOptionLabel;
    expect(typeof formatOptionLabel).toBe("function");

    // Case-insensitive duplicates should not have parenthetical
    expect(formatOptionLabel({ name: "Mr. Zaid", abbr: "Mr. Zaid" })).toBe("Mr. Zaid");
    expect(formatOptionLabel({ name: "I A", short: "I A" })).toBe("I A");
    expect(formatOptionLabel({ name: "MATHS", abbr: "Maths" })).toBe("MATHS");

    // Differing short should show parenthetical
    expect(formatOptionLabel({ name: "Mathematics", abbr: "Maths" })).toBe("Mathematics (Maths)");
    expect(formatOptionLabel({ name: "Science", short: "SCI" })).toBe("Science (SCI)");

    // Empty / missing short should return name
    expect(formatOptionLabel({ name: "Physics" })).toBe("Physics");
  });

  it("Count column: classes and classrooms lists have Count column and count in rows", () => {
    const school = loadSampleSchool();
    window.APP.school = school;

    let openedClassCfg = null;
    let openedRoomCfg = null;
    const origOpen = window.EntityDialog.open;
    window.EntityDialog.open = (cfg) => {
      if (cfg.title === "Classes") openedClassCfg = cfg;
      if (cfg.title === "Classrooms") openedRoomCfg = cfg;
    };

    try {
      window.EntityClasses.open();
      expect(openedClassCfg).not.toBeNull();
      expect(openedClassCfg.columns.some(c => c.key === "count" && c.label === "Count")).toBe(true);
      expect(openedClassCfg.rows[0].count).toBeDefined();
      expect(typeof openedClassCfg.rows[0].count).toBe("number");
      expect(openedClassCfg.rows[0].count).toBeGreaterThan(0);

      window.EntityClassrooms.open();
      expect(openedRoomCfg).not.toBeNull();
      expect(openedRoomCfg.columns.some(c => c.key === "count" && c.label === "Count")).toBe(true);
      expect(openedRoomCfg.rows[0].count).toBeDefined();
      expect(typeof openedRoomCfg.rows[0].count).toBe("number");
    } finally {
      window.EntityDialog.open = origOpen;
    }
  });
});
