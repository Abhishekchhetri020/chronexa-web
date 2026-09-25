import { describe, it, expect, beforeEach, vi } from "vitest";
import { SavedViews } from "../js/ui/components/saved_views.js";

describe("SavedViews manager", () => {
  beforeEach(() => {
    // Setup window mock environment
    window.APP = {
      school: {
        id: "sch_1",
        schoolName: "Test School",
        savedViews: [],
      },
      editor: {
        perspective: "class",
        viewMode: "focus",
        zoom: "mid",
        colorBy: "subject",
        selectedClassId: "cls_1",
        focusRowByPerspective: { class: "cls_1", teacher: "tch_1" },
      },
      ribbon: {
        _p: "class",
        _z: 100,
        getPerspective: () => window.APP.ribbon._p,
        setPerspective: (p) => { window.APP.ribbon._p = p; },
        getZoom: () => window.APP.ribbon._z,
        setZoom: (z) => { window.APP.ribbon._z = z; },
      },
      mutate: (label, fn) => {
        return fn(window.APP.school);
      },
    };

    window.EditorActivator = {
      activate: vi.fn(),
    };
    window._chrxNotify = vi.fn();
  });

  it("exports SavedViews module with required methods", () => {
    expect(SavedViews).toBeDefined();
    expect(typeof SavedViews.capture).toBe("function");
    expect(typeof SavedViews.save).toBe("function");
    expect(typeof SavedViews.apply).toBe("function");
    expect(typeof SavedViews.rename).toBe("function");
    expect(typeof SavedViews.delete).toBe("function");
    expect(typeof SavedViews.list).toBe("function");
  });

  it("captures all 5 required attributes from the editor state", () => {
    window.APP.editor.perspective = "teacher";
    window.APP.editor.viewMode = "overview";
    window.APP.editor.zoom = "far";
    window.APP.editor.colorBy = "room";
    window.APP.editor.selectedClassId = "cls_99";
    window.APP.editor.focusRowByPerspective = { teacher: "tch_42", class: "cls_99" };
    window.APP.ribbon._z = 125;

    const snap = SavedViews.capture();
    expect(snap.perspective).toBe("teacher");
    expect(snap.viewMode).toBe("overview");
    expect(snap.zoom).toBe("far");
    expect(snap.ribbonZoom).toBe(125);
    expect(snap.colorBy).toBe("room");
    expect(snap.selectedClassId).toBe("cls_99");
    expect(snap.focusRowByPerspective).toEqual({ teacher: "tch_42", class: "cls_99" });
  });

  it("saves a view to APP.school.savedViews via APP.mutate", () => {
    let mutateCalledWith = null;
    window.APP.mutate = (label, fn) => {
      mutateCalledWith = label;
      return fn(window.APP.school);
    };

    const saved = SavedViews.save("Grade 10 Focus");
    expect(mutateCalledWith).toBe("Save view");
    expect(saved).not.toBeNull();
    expect(saved.name).toBe("Grade 10 Focus");
    expect(saved.perspective).toBe("class");
    expect(window.APP.school.savedViews).toHaveLength(1);
    expect(window.APP.school.savedViews[0].name).toBe("Grade 10 Focus");

    // Updating existing view by same name replaces it
    window.APP.editor.zoom = "near";
    SavedViews.save("Grade 10 Focus");
    expect(window.APP.school.savedViews).toHaveLength(1);
    expect(window.APP.school.savedViews[0].zoom).toBe("near");
  });

  it("lists views from APP.school.savedViews", () => {
    expect(SavedViews.list()).toEqual([]);
    window.APP.school.savedViews = [
      { id: "v1", name: "View 1", perspective: "class" },
      { id: "v2", name: "View 2", perspective: "teacher" },
    ];
    expect(SavedViews.list()).toHaveLength(2);
    expect(SavedViews.list()[1].name).toBe("View 2");
  });

  it("applies a saved view, restoring all attributes and re-activating the editor", () => {
    const targetView = {
      id: "v_custom",
      name: "Teachers Overview",
      perspective: "teacher",
      viewMode: "overview",
      zoom: "far",
      ribbonZoom: 75,
      colorBy: "teacher",
      selectedClassId: "cls_5",
      selectedEntityId: "tch_8",
      focusRowByPerspective: { teacher: "tch_8", class: "cls_5" },
    };

    const applied = SavedViews.apply(targetView);
    expect(applied).toBe(true);

    expect(window.APP.editor.perspective).toBe("teacher");
    expect(window.APP.editor.viewMode).toBe("overview");
    expect(window.APP.editor.zoom).toBe("far");
    expect(window.APP.editor.colorBy).toBe("teacher");
   expect(window.APP.editor.selectedClassId).toBe("cls_5");
   expect(window.APP.editor.focusRowByPerspective.teacher).toBe("tch_8");
   expect(window.APP.ribbon.getZoom()).toBe(75);

   expect(window.EditorActivator.activate).toHaveBeenCalled();
  });

  it("renames a view via APP.mutate", () => {
    window.APP.school.savedViews = [
      { id: "v1", name: "Old Name", perspective: "class" },
    ];
    let mutateLabel = null;
    window.APP.mutate = (label, fn) => {
      mutateLabel = label;
      return fn(window.APP.school);
    };

    const ok = SavedViews.rename("Old Name", "New Name");
    expect(ok).toBe(true);
    expect(mutateLabel).toBe("Rename view");
    expect(window.APP.school.savedViews[0].name).toBe("New Name");
  });

  it("deletes a view via APP.mutate", () => {
    window.APP.school.savedViews = [
      { id: "v1", name: "To Delete", perspective: "class" },
      { id: "v2", name: "Keep Me", perspective: "room" },
    ];
    let mutateLabel = null;
    window.APP.mutate = (label, fn) => {
      mutateLabel = label;
      return fn(window.APP.school);
    };

    const ok = SavedViews.delete("To Delete");
    expect(ok).toBe(true);
    expect(mutateLabel).toBe("Delete view");
    expect(window.APP.school.savedViews).toHaveLength(1);
    expect(window.APP.school.savedViews[0].name).toBe("Keep Me");
  });

  it("prompts the user and saves a view via promptSave()", () => {
    window.prompt = vi.fn().mockReturnValue("Prompted View");
    const saved = SavedViews.promptSave();
    expect(window.prompt).toHaveBeenCalledWith("Name this view:");
    expect(saved).not.toBeNull();
    expect(saved.name).toBe("Prompted View");
    expect(window.APP.school.savedViews[0].name).toBe("Prompted View");
  });

  it("opens the manager sheet when openManager() is called", () => {
    window.EntityDialog = {
      openSheet: vi.fn(),
      closeSheet: vi.fn(),
    };
    SavedViews.openManager();
    expect(window.EntityDialog.openSheet).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ title: "Manage saved views" })
    );
  });
});
