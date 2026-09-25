import { beforeEach, describe, expect, it } from "vitest";
import "../js/ui/state.js";
import "../js/ui/io/snapshot.js";
import { fixtureSchool } from "./fixtures/school.js";
import { CustomFields } from "../js/ui/entities/custom_fields.js";

describe("W3b-4: Custom Fields on Entities", () => {
  let school;

  beforeEach(() => {
    school = fixtureSchool();
    school.customFields = [];
    window.APP.school = school;
    window.APP.history?.clear?.();
    window.APP.audit?.clear?.();
  });

  it("defines custom fields with entity, label, type, and optional choices", () => {
    expect(typeof CustomFields.addField).toBe("function");

    const field = CustomFields.addField(school, {
      entity: "teachers",
      label: "Phone ext.",
      type: "text",
    });

    expect(field).toBeDefined();
    expect(field.id).toMatch(/^cf_/);
    expect(field.entity).toBe("teachers");
    expect(field.label).toBe("Phone ext.");
    expect(field.type).toBe("text");
    expect(school.customFields).toHaveLength(1);
    expect(school.customFields[0]).toEqual(field);
  });

  it("sets and gets custom values on entity rows", () => {
    const field = CustomFields.addField(school, {
      entity: "teachers",
      label: "Phone ext.",
      type: "text",
    });

    const teacher = school.teachers[0];
    CustomFields.setValue(school, "teachers", teacher.id, field.id, "101");

    expect(teacher.customValues).toBeDefined();
    expect(teacher.customValues[field.id]).toBe("101");
  });

  it("undo restores previous custom values and field definitions", () => {
    const field = CustomFields.addField(school, {
      entity: "teachers",
      label: "Phone ext.",
      type: "text",
    });

    const teacher = school.teachers[0];
    CustomFields.setValue(school, "teachers", teacher.id, field.id, "101");
    expect(teacher.customValues[field.id]).toBe("101");

    // Mutate again: change to 202
    CustomFields.setValue(school, "teachers", teacher.id, field.id, "202");
    expect(teacher.customValues[field.id]).toBe("202");

    // Undo 202 -> 101
    expect(window.APP.history.canUndo).toBe(true);
    window.APP.undo();
    expect(teacher.customValues[field.id]).toBe("101");

    // Undo 101 -> empty / undefined
    window.APP.undo();
    expect(teacher.customValues?.[field.id]).toBeUndefined();

    // Redo -> 101
    window.APP.redo();
    expect(teacher.customValues[field.id]).toBe("101");
  });

  it("reorders custom fields and undo restores order", () => {
    const f1 = CustomFields.addField(school, { entity: "teachers", label: "Field A", type: "text" });
    const f2 = CustomFields.addField(school, { entity: "teachers", label: "Field B", type: "text" });
    expect(school.customFields.map(f => f.label)).toEqual(["Field A", "Field B"]);

    CustomFields.reorderField(school, f1.id, 1);
    expect(school.customFields.map(f => f.label)).toEqual(["Field B", "Field A"]);

    window.APP.undo();
    expect(school.customFields.map(f => f.label)).toEqual(["Field A", "Field B"]);
  });

  it("counts dropped values when deleting a field, deletes values, and undo restores", () => {
    const field = CustomFields.addField(school, {
      entity: "teachers",
      label: "Room pref",
      type: "text",
    });

    CustomFields.setValue(school, "teachers", school.teachers[0].id, field.id, "Lab A");
    CustomFields.setValue(school, "teachers", school.teachers[1].id, field.id, "Lab B");

    // 2 teachers have values for this field
    const count = CustomFields.countValues(school, field.id);
    expect(count).toBe(2);

    // Delete field
    CustomFields.deleteField(school, field.id);
    expect(school.customFields.find(f => f.id === field.id)).toBeUndefined();
    expect(school.teachers[0].customValues?.[field.id]).toBeUndefined();
    expect(school.teachers[1].customValues?.[field.id]).toBeUndefined();

    // Undo restores both field and values
    window.APP.undo();
    expect(school.customFields.find(f => f.id === field.id)).toBeDefined();
    expect(school.teachers[0].customValues[field.id]).toBe("Lab A");
    expect(school.teachers[1].customValues[field.id]).toBe("Lab B");
  });

  it("preserves custom fields and values across JSON export and import round-trip", () => {
    const fTeacher = CustomFields.addField(school, {
      entity: "teachers",
      label: "Phone ext.",
      type: "text",
    });
    const fClass = CustomFields.addField(school, {
      entity: "classes",
      label: "Class rep",
      type: "text",
    });
    const fChoice = CustomFields.addField(school, {
      entity: "subjects",
      label: "Category",
      type: "choice",
      choices: ["STEM", "Humanities", "Arts"],
    });

    CustomFields.setValue(school, "teachers", school.teachers[0].id, fTeacher.id, "402");
    CustomFields.setValue(school, "classes", school.classes[0].id, fClass.id, "Alice");
    CustomFields.setValue(school, "subjects", school.subjects[0].id, fChoice.id, "STEM");

    // Export JSON
    expect(typeof window.APP.io.exportJson).toBe("function");
    const jsonStr = window.APP.io.exportJson(school);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.customFields).toHaveLength(3);
    expect(parsed.teachers[0].customValues[fTeacher.id]).toBe("402");
    expect(parsed.classes[0].customValues[fClass.id]).toBe("Alice");
    expect(parsed.subjects[0].customValues[fChoice.id]).toBe("STEM");

    // Import JSON
    const imported = window.APP.io.importJson(jsonStr);
    expect(imported.customFields).toHaveLength(3);
    expect(imported.teachers[0].customValues[fTeacher.id]).toBe("402");
    expect(imported.classes[0].customValues[fClass.id]).toBe("Alice");
    expect(imported.subjects[0].customValues[fChoice.id]).toBe("STEM");
  });

  it("preserves custom fields and values even when sourceText XML is present in importJson", () => {
    const fTeacher = CustomFields.addField(school, {
      entity: "teachers",
      label: "Phone ext.",
      type: "text",
    });
    CustomFields.setValue(school, "teachers", school.teachers[0].id, fTeacher.id, "402");

    school._meta = { sourceText: "<xml></xml>", sourceFilename: "test.xml" };
    // Mock parseTimetableXml
    window.parseTimetableXml = {
      parseText: () => ({
        schoolName: "Parsed",
        teachers: [{ id: school.teachers[0].id, name: "Ms. Sushmita" }],
      }),
    };

    const jsonStr = window.APP.io.exportJson(school);
    const imported = window.APP.io.importJson(jsonStr);

    expect(imported.customFields).toBeDefined();
    expect(imported.customFields).toHaveLength(1);
    expect(imported.customFields[0].label).toBe("Phone ext.");
    expect(imported.teachers[0].customValues).toBeDefined();
    expect(imported.teachers[0].customValues[fTeacher.id]).toBe("402");
  });

  it("supports all 5 entity types and all 4 field types", () => {
    const f1 = CustomFields.addField(school, { entity: "teachers", label: "Office No", type: "number" });
    const f2 = CustomFields.addField(school, { entity: "classes", label: "Graduation", type: "date" });
    const f3 = CustomFields.addField(school, { entity: "subjects", label: "Stream", type: "choice", choices: ["A", "B"] });
    const f4 = CustomFields.addField(school, { entity: "classrooms", label: "Smart Board", type: "text" });
    const f5 = CustomFields.addField(school, { entity: "students", label: "Blood Group", type: "choice", choices: ["O+", "A+", "B+"] });

    expect(school.customFields).toHaveLength(5);
    expect(f1.type).toBe("number");
    expect(f2.type).toBe("date");
    expect(f3.choices).toEqual(["A", "B"]);
    expect(f5.choices).toEqual(["O+", "A+", "B+"]);
  });

  it("updates field label and choices and undo restores them", () => {
    const field = CustomFields.addField(school, { entity: "teachers", label: "Old Name", type: "text" });
    CustomFields.updateField(school, field.id, { label: "New Name" });

    expect(school.customFields[0].label).toBe("New Name");

    window.APP.undo();
    expect(school.customFields[0].label).toBe("Old Name");
  });

  it("generates columns and input fields with user labels and no internal IDs in UI labels", () => {
    const field = CustomFields.addField(school, { entity: "teachers", label: "Phone ext.", type: "text" });
    const cols = CustomFields.getCustomColumns("teachers");

    expect(cols).toHaveLength(1);
    expect(cols[0].label).toBe("Phone ext.");
    expect(cols[0].label).not.toContain("cf_");

    const draft = {};
    const inputs = CustomFields.buildEditFields("teachers", draft);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].label).toBe("Phone ext.");
    expect(inputs[0].label).not.toContain("cf_");
    expect(inputs[0].control.tagName.toLowerCase()).toBe("input");

    // Typing into the control mutates draft
    inputs[0].control.value = "999";
    inputs[0].control.dispatchEvent(new Event("input"));
    expect(draft[field.id]).toBe("999");
  });
});
