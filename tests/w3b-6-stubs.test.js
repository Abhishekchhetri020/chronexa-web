import { describe, it, expect, vi, beforeEach } from "vitest";
import "../js/ui/state.js";
import "../js/ui/entities/dialog_shell.js";
import "../js/ui/print_preview/print_settings_dialog.js";
import "../js/ui/entity_router.js";
import "../js/ui/ribbon/topbar.js";
import "../js/ui/ribbon/menus/options_menu.js";
import "../js/ui/entities/lessons.js";
import "../js/ui/editor/row_context_menu.js";

describe("Lane W3b-6: Remove Coming Soon stubs & wire dead affordances", () => {
  beforeEach(() => {
    window.APP = window.APP || {};
    window.APP.school = {
      schoolName: "Test School",
      classes: [{ id: "c1", name: "1A" }],
      teachers: [{ id: "t1", name: "Teacher 1" }],
      subjects: [{ id: "s1", name: "Math" }],
      classrooms: [{ id: "r1", name: "Room 101" }],
      lessons: [{ id: "l1", classIds: ["c1"], teacherIds: ["t1"], subjectId: "s1", periodsPerWeek: 3 }],
      cards: [],
      relations: [],
      _idx: {
        lessonById: { l1: { id: "l1", classIds: ["c1"], teacherIds: ["t1"], subjectId: "s1" } },
      },
    };
  });

  describe("1. Options menu and EntityRouter stubs", () => {
    it("wires 'print-defaults' to PrintSettingsDialog.open instead of openStub", () => {
      const openSpy = vi.fn();
      window.PrintSettingsDialog = { open: openSpy };
      window.EntityDialog = window.EntityDialog || {};
      const openSheetSpy = vi.fn();
      window.EntityDialog.openSheet = openSheetSpy;

      window.EntityRouter.ROUTE["print-defaults"]();

      expect(openSpy).toHaveBeenCalledWith("globals");
      expect(openSheetSpy).not.toHaveBeenCalled();
    });

    it("wires 'settings' to SchoolSettings instead of openStub", () => {
      const openSpy = vi.fn();
      window.SchoolSettings = { open: openSpy };
      window.EntityDialog = window.EntityDialog || {};
      const openSheetSpy = vi.fn();
      window.EntityDialog.openSheet = openSheetSpy;

      window.EntityRouter.ROUTE["settings"]();

      expect(openSpy).toHaveBeenCalled();
      expect(openSheetSpy).not.toHaveBeenCalled();
    });

    it("removes dead account and display-settings stubs from Options menu", () => {
      const optionsDef = window.APP.ribbon.menus.find(m => m.key === "options");
      expect(optionsDef).toBeDefined();
      const items = optionsDef.build();
      const labels = items.map(i => i.label).filter(Boolean);

      expect(labels).not.toContain("Preferences (account)…");
      expect(labels).not.toContain("Display settings…");
      expect(labels).toContain("School settings…");
      expect(labels).toContain("Print defaults…");
    });

    it("does not pop up 'Coming soon' on unhandled entity_router kind", () => {
      window.EntityDialog = window.EntityDialog || {};
      const openSheetSpy = vi.fn();
      window.EntityDialog.openSheet = openSheetSpy;
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind: "nonexistent_future_kind" } }));

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[entity_router] no handler for kind:"), "nonexistent_future_kind");
      expect(openSheetSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("2. Topbar menu items flagged soon", () => {
    it("does not render menu items marked with soon: true as dead controls", () => {
      const panel = window.ChrxMenu.buildPanel([
        { label: "Active Item", run: vi.fn() },
        { label: "Coming Soon Item", soon: true },
      ]);
      const text = panel.textContent || "";
      expect(text).toContain("Active Item");
      expect(text).not.toContain("Coming Soon Item");
    });
  });

  describe("3. Row context menu stubs", () => {
    it("wires 'Test' action to SolverUI.Test.open when invoked", () => {
      const openSpy = vi.fn();
      window.SolverUI = window.SolverUI || {};
      window.SolverUI.Test = { open: openSpy };

      // Dispatch app:test
      window.dispatchEvent(new CustomEvent("app:test", { detail: { perspective: "class", rowId: "c1" } }));

      expect(openSpy).toHaveBeenCalledWith({ school: window.APP.school });
    });

    it("passes focusTimeoff to app:open-entity when Time off is clicked", () => {
      let receivedDetail = null;
      const handler = (e) => { receivedDetail = e.detail; };
      window.addEventListener("app:open-entity", handler);

      // Open row context menu for class c1
      window.RowContextMenu.open("class", "c1", "1A", 100, 100);
      const menuEl = document.getElementById("chrx-row-ctx");
      expect(menuEl).not.toBeNull();

      // Find Time off button
      const buttons = Array.from(menuEl.querySelectorAll("button"));
      const timeOffBtn = buttons.find(b => b.textContent.includes("Time off"));
      expect(timeOffBtn).toBeDefined();

      timeOffBtn.click();
      window.removeEventListener("app:open-entity", handler);

      expect(receivedDetail).toBeDefined();
      expect(receivedDetail.kind).toBe("classes");
      expect(receivedDetail.focusTimeoff).toBe("c1");
    });

    it("wires 'Print preview…' to dispatch app:print-preview", () => {
      let printPreviewFired = false;
      const handler = () => { printPreviewFired = true; };
      window.addEventListener("app:print-preview", handler);

      window.RowContextMenu.open("class", "c1", "1A", 100, 100);
      const menuEl = document.getElementById("chrx-row-ctx");
      const buttons = Array.from(menuEl.querySelectorAll("button"));
      const printBtn = buttons.find(b => b.textContent.includes("Print preview"));
      expect(printBtn).toBeDefined();

      printBtn.click();
      window.removeEventListener("app:print-preview", handler);

      expect(printPreviewFired).toBe(true);
    });
  });

  describe("4. Lessons bulk change dialog", () => {
    it("does not show 'Group' or any dead 'coming soon' field option", () => {
      let changeOpened = false;
      let sheetBody = null;
      const originalOpenSubSheet = window.EntityDialog.openSubSheet;
      window.EntityDialog.openSubSheet = (body, opts) => {
        if (opts && opts.title === "Change") {
          changeOpened = true;
          sheetBody = body;
        }
        if (originalOpenSubSheet) originalOpenSubSheet(body, opts);
      };

      // Open Lessons dialog
      window.EntityLessons.open();
      // Select the first row
      const tr = document.querySelector(".chrx-ent-tr");
      if (tr) tr.click();

      // Click the Change button
      const changeBtn = document.querySelector('.chrx-ent-btn[data-act="change"]');
      expect(changeBtn).not.toBeNull();
      changeBtn.click();

      expect(changeOpened).toBe(true);
      const text = sheetBody?.textContent || "";
      expect(text).not.toContain("Group");
      expect(text).not.toContain("coming soon");
    });
  });
});
