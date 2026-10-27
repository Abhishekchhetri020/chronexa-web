// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { offState, markTimeOff } from "../../ui/editor/timeoff_marks.js";

describe("time-off marks in the grid", () => {
  it("reads both time-off shapes (periods are 1-based in the grid)", () => {
    expect(offState([[0, 2, 1]], 0, 2)).toBe(2);
    expect(offState([[0, 2, 1]], 0, 3)).toBe(1);
    expect(offState({ "1_4": "unavailable", "1_5": "preferred" }, 1, 4)).toBe(2);
    expect(offState({ "1_4": "unavailable", "1_5": "preferred" }, 1, 5)).toBe(1);
    expect(offState(undefined, 0, 1)).toBe(0);
  });

  it("marks only slots of the row's entity", () => {
    document.body.innerHTML = '<div id="r">' +
      '<div class="chrx-slot" data-row="c1" data-day="0" data-period="2"></div>' +
      '<div class="chrx-slot" data-row="c1" data-day="0" data-period="1"></div>' +
      '<div class="chrx-slot" data-row="c2" data-day="0" data-period="2"></div></div>';
    const school = { classes: [{ id: "c1", timeOff: [[0, 2]] }, { id: "c2" }] };
    expect(markTimeOff(document.getElementById("r"), school, "class")).toBe(1);
    expect([...document.querySelectorAll("[data-timeoff]")].map((e) => e.dataset.row + e.dataset.period)).toEqual(["c12"]);
  });
});
