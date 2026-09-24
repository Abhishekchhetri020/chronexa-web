import { describe, it, expect, beforeEach } from "vitest";
import "../availability_shading.js";

describe("AvailabilityShading unit tests", () => {
  let mockSchool;

  beforeEach(() => {
    document.body.innerHTML = `
      <div class="chrx-shell">
        <div id="editor-root" class="chrx-editor">
          <div class="chrx-row" data-row="class_1">
            <div class="chrx-slot empty" data-day="0" data-period="1" data-row="class_1"></div>
            <div class="chrx-slot empty" data-day="0" data-period="2" data-row="class_1"></div>
            <div class="chrx-slot empty" data-day="0" data-period="3" data-row="class_1"></div>
          </div>
          <div class="chrx-row" data-row="class_2">
            <div class="chrx-slot empty" data-day="0" data-period="1" data-row="class_2"></div>
            <div class="chrx-slot empty" data-day="0" data-period="2" data-row="class_2"></div>
            <div class="chrx-slot empty" data-day="0" data-period="3" data-row="class_2"></div>
          </div>
        </div>
        <div id="editor-inspector-root"></div>
      </div>
    `;

    mockSchool = {
      _idx: {
        lessonById: {
          les_1: { id: "les_1", subjectId: "sub_1", classIds: ["class_1"], teacherIds: ["tea_1"] },
        },
        classById: { class_1: { id: "class_1", name: "I A" }, class_2: { id: "class_2", name: "I B" } },
        teacherById: { tea_1: { id: "tea_1", name: "Teacher 1" } },
        classroomById: {},
        subjectById: { sub_1: { id: "sub_1", name: "Maths", abbr: "MAT" } },
      },
      cards: [],
      bell: { periods: [{ index: 1, isTeaching: true }, { index: 2, isTeaching: true }, { index: 3, isTeaching: true }] }
    };

    window.APP = {
      school: mockSchool,
      editor: { perspective: "class", cardInHand: null }
    };

    window.Placement = {
      classify: (lessonId, day, period) => {
        if (day === 0 && period === 1) return { validity: "green", reasons: [] };
        if (day === 0 && period === 2) return { validity: "amber", reasons: ["preferred off"] };
        return { validity: "red", reasons: ["busy"] };
      }
    };
  });

  it("AvailabilityShading is exposed on window", () => {
    expect(window.AvailabilityShading).toBeDefined();
    expect(typeof window.AvailabilityShading.paint).toBe("function");
    expect(typeof window.AvailabilityShading.clear).toBe("function");
  });

  it("paints visible slots with three availability states: ok, soft-conflict, hard-conflict", () => {
    const inHand = { cardId: "card_1", lessonId: "les_1", originDay: 0, originPeriod: 1 };
    window.APP.editor.cardInHand = inHand;

    window.AvailabilityShading.paint(inHand);

    const okSlots = document.querySelectorAll(".chrx-slot.chrx-avail-ok");
    const softSlots = document.querySelectorAll(".chrx-slot.chrx-avail-soft-conflict");
    const hardSlots = document.querySelectorAll(".chrx-slot.chrx-avail-hard-conflict");

    expect(okSlots.length).toBe(2); // (0,1) in class_1 and class_2
    expect(softSlots.length).toBe(2); // (0,2) in class_1 and class_2
    expect(hardSlots.length).toBe(2); // (0,3) in class_1 and class_2

    expect(okSlots[0].getAttribute("data-availability")).toBe("ok");
    expect(softSlots[0].getAttribute("data-availability")).toBe("soft-conflict");
    expect(hardSlots[0].getAttribute("data-availability")).toBe("hard-conflict");
  });

  it("renders availability legend in the inspector", () => {
    const inHand = { cardId: "card_1", lessonId: "les_1", originDay: 0, originPeriod: 1 };
    window.APP.editor.cardInHand = inHand;

    window.AvailabilityShading.paint(inHand);

    const legend = document.getElementById("chrx-availability-legend");
    expect(legend).not.toBeNull();
    expect(legend.textContent).toContain("Free");
    expect(legend.textContent).toContain("Soft");
    expect(legend.textContent).toContain("Forbidden");
  });

  it("clear() clears all slot classes, data attributes, and removes inspector legend", () => {
    const inHand = { cardId: "card_1", lessonId: "les_1", originDay: 0, originPeriod: 1 };
    window.APP.editor.cardInHand = inHand;

    window.AvailabilityShading.paint(inHand);
    expect(document.querySelectorAll(".chrx-slot.chrx-avail-ok").length).toBe(2);

    window.AvailabilityShading.clear();
    expect(document.querySelectorAll(".chrx-slot.chrx-avail-ok").length).toBe(0);
    expect(document.querySelectorAll(".chrx-slot.chrx-avail-soft-conflict").length).toBe(0);
    expect(document.querySelectorAll(".chrx-slot.chrx-avail-hard-conflict").length).toBe(0);
    expect(document.querySelectorAll("[data-availability]").length).toBe(0);
    expect(document.getElementById("chrx-availability-legend")).toBeNull();
  });

  it("reuses cached classify results during pickup for fast performance", () => {
    let classifyCalls = 0;
    window.Placement.classify = (lessonId, day, period) => {
      classifyCalls++;
      return { validity: "green", reasons: [] };
    };

    const inHand = { cardId: "card_1", lessonId: "les_1", originDay: 0, originPeriod: 1 };
    window.AvailabilityShading.paint(inHand);

    // 6 slots total across 2 rows, but only 3 unique (day, period) combinations: (0,1), (0,2), (0,3)
    expect(classifyCalls).toBe(3);
  });
});
