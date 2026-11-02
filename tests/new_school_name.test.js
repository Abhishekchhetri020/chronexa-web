// Picking a starting template must not name the school after that template's
// label — the label ended up in the school name and printed on every report.
import { describe, it, expect, beforeAll } from "vitest";
import "../js/ui/wizard/create_new.js";
import "../js/ui/onboarding/school_templates.js";

beforeAll(() => {
  window.APP = window.APP || {};
  window.APP.audit = { _log: [], append: () => {} };
  window.APP.mutate = (label, fn) => fn(window.APP.school);
});

describe("starting a new school", () => {
  it("the blank template leaves a neutral name", () => {
    window.SchoolTemplates.applyChoice("blank");
    expect(window.APP.school.schoolName).toBe("My School");
    expect(window.APP.school.schoolName).not.toMatch(/Blank/);
  });

  it("a seeded template does not name the school after its label either", () => {
    window.SchoolTemplates.applyChoice("india_cbse");
    expect(window.APP.school.schoolName).not.toMatch(/CBSE school/i);
  });

  it("an explicit name is still honoured", () => {
    window.SchoolTemplates.applyChoice("blank", { schoolName: "G.D. Goenka, Darbhanga" });
    expect(window.APP.school.schoolName).toBe("G.D. Goenka, Darbhanga");
  });
});
