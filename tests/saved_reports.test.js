// Saved print layouts are the aSc `ttreports` idea, per file: the print setup
// belongs to the timetable, not to the browser. These assertions pin the store
// contract (mutate/undo path, apply restores settings, aSc field mapping) and
// the one-time localStorage migration that stops an existing setup vanishing.
import { describe, it, expect, beforeEach } from "vitest";
import { SavedReports } from "../js/ui/print_preview/saved_reports.js";

function reset() {
  window.APP = window.APP || {};
  window.APP.school = { schoolName: "Test", lessons: [], printReports: [] };
  window.APP.printSettings = { pageSize: "A4", orientation: "portrait", marginMM: 10, structure: "rows-days" };
  window.APP.printTemplateStructure = {};
  window.APP.activePrintTemplate = "class";
  window.APP.PrintPresets = {
    get: (id) => (id === "class"
      ? { id: "class", pages: ["class"], rows: ["day"], cols: ["period"] }
      : null),
  };
  window.APP.printTemplates = { get: (id) => ({ name: id }), list: () => [] };
  window.APP.mutate = (label, fn) => { window.__lastMutate = label; return fn(window.APP.school); };
  window.APP.audit = { append: () => {} };
  localStorage.clear();
}

describe("SavedReports store", () => {
  beforeEach(reset);

  it("saves the current setup onto the school, through mutate", () => {
    const row = SavedReports.save("A4 portrait class");
    expect(row).toBeTruthy();
    expect(window.__lastMutate).toBe("Save print layout");
    expect(window.APP.school.printReports).toHaveLength(1);
    expect(row.baseTemplate).toBe("class");
    expect(row.settings.pageSize).toBe("A4");
  });

  it("maps the axes onto aSc's ttreports field names", () => {
    const row = SavedReports.save("asc shape");
    expect(row.asc.page_tables).toEqual(["classes"]);
    expect(row.asc.row_tables).toEqual(["days"]);
    expect(row.asc.column_tables).toEqual(["periods"]);
    expect(row.asc.typ).toBe(0);              // aSc typ 0 = timetable per class
    expect(row.asc.fitwidth).toBe(true);
  });

  it("finds by id and by name, and re-saves under an existing name", () => {
    const first = SavedReports.save("Layout A");
    expect(SavedReports.find("Layout A").id).toBe(first.id);
    expect(SavedReports.find(first.id).name).toBe("Layout A");
    SavedReports.save("Layout A", { baseTemplate: "teacher" });
    expect(window.APP.school.printReports).toHaveLength(1);   // replaced, not duplicated
    expect(SavedReports.find("Layout A").baseTemplate).toBe("teacher");
  });

  it("applies a layout back into the app", () => {
    window.APP.printSettings.marginMM = 4;      // tune something
    const row = SavedReports.save("Tight margins");
    window.APP.printSettings.marginMM = 25;     // change it afterwards
    let changed = 0;
    window.addEventListener("app:print-settings-changed", () => { changed += 1; });
    expect(SavedReports.apply(row.id)).toBe(true);
    expect(window.APP.printSettings.marginMM).toBe(4);
    expect(window.APP.activePrintTemplate).toBe("class");
    expect(changed).toBe(1);
  });

  it("renames and deletes", () => {
    const row = SavedReports.save("Old name");
    expect(SavedReports.rename(row.id, "New name")).toBe(true);
    expect(SavedReports.find("New name")).toBeTruthy();
    expect(SavedReports.remove(row.id)).toBe(true);
    expect(window.APP.school.printReports).toHaveLength(0);
  });

  it("ignores a blank name", () => {
    expect(SavedReports.save("   ")).toBeNull();
    expect(SavedReports.list()).toHaveLength(0);
  });
});

describe("SavedReports migration", () => {
  beforeEach(reset);

  it("promotes an existing localStorage setup into the file exactly once", () => {
    localStorage.setItem("chronexa.printSettings", JSON.stringify({ pageSize: "A4", marginMM: 7 }));
    expect(SavedReports.migrateFromLocalStorage()).toBe(1);
    const rows = SavedReports.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("My layout");
    expect(rows[0].settings.marginMM).toBe(7);
    // second run must not stack another copy
    expect(SavedReports.migrateFromLocalStorage()).toBe(0);
    expect(SavedReports.list()).toHaveLength(1);
  });

  it("does nothing when the file already has layouts", () => {
    SavedReports.save("Mine");
    localStorage.setItem("chronexa.printSettings", JSON.stringify({ marginMM: 9 }));
    expect(SavedReports.migrateFromLocalStorage()).toBe(0);
    expect(SavedReports.list()).toHaveLength(1);
  });
});
