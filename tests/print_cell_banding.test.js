// Printed cell layout: the subject is centred at the top, the classroom sits
// top-right and the teacher bottom-left. They must not print over each other —
// the school's own file showed "Sleeping Time" and "Sleeping Room" superimposed.
import { describe, it, expect } from "vitest";

/** Mirrors the banding rule in pivot_cell_renderer.renderAggregateCell. */
function band(xAlign, hasRightNeighbour) {
  if (xAlign === "right") return { right: "2%", width: "32%" };
  if (xAlign === "center" && hasRightNeighbour) return { left: "2%", right: "36%" };
  return { left: "2%", right: "2%" };
}

describe("printed cell bands", () => {
  it("keeps a right-hand element inside its own slice", () => {
    const b = band("right", true);
    expect(b.width).toBe("32%");
    expect(b.left).toBeUndefined();
  });

  it("reserves that slice on the centred element", () => {
    const b = band("center", true);
    expect(b.right).toBe("36%");     // 32% slice + 2% margin + slack
  });

  it("gives a centred element the full width when nothing sits beside it", () => {
    expect(band("center", false)).toEqual({ left: "2%", right: "2%" });
  });

  it("never narrows a left-aligned element", () => {
    expect(band("left", true)).toEqual({ left: "2%", right: "2%" });
  });

  it("the reserved slice is always wider than the neighbour's box", () => {
    const right = parseFloat(band("right", true).width);
    const reserved = 100 - parseFloat(band("center", true).right);
    expect(reserved).toBeGreaterThan(right);
  });
});
