import { describe, it, expect } from "vitest";
import { validateSnapshot } from "../validate.js";
import { render } from "../render.js";
import staffSnap from "../../../tests/fixtures/published/staff.json";
import studentsSnap from "../../../tests/fixtures/published/students.json";
import publicSnap from "../../../tests/fixtures/published/public.json";

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

describe("w2-2 published snapshot validation (contract C2)", () => {
  it("accepts the staff / students / public fixtures", () => {
    for (const snap of [staffSnap, studentsSnap, publicSnap]) {
      const r = validateSnapshot(snap);
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });

  it("rejects a non-object snapshot", () => {
    const r = validateSnapshot(null);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/object/i);
  });

  it("rejects a wrong format tag", () => {
    const snap = clone(staffSnap);
    snap.format = "something-else";
    const r = validateSnapshot(snap);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/format/);
  });

  it("rejects an unsupported version", () => {
    const snap = clone(staffSnap);
    snap.version = 2;
    const r = validateSnapshot(snap);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/version/i);
  });

  it("rejects an unknown edition", () => {
    const snap = clone(staffSnap);
    snap.edition = "secret";
    const r = validateSnapshot(snap);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/edition/i);
  });

  it("rejects a snapshot with no days", () => {
    const snap = clone(staffSnap);
    snap.days = [];
    expect(validateSnapshot(snap).ok).toBe(false);
  });

  it("rejects a snapshot with no periods", () => {
    const snap = clone(staffSnap);
    snap.periods = [];
    expect(validateSnapshot(snap).ok).toBe(false);
  });

  it("rejects a snapshot with no classes", () => {
    const snap = clone(staffSnap);
    snap.classes = [];
    expect(validateSnapshot(snap).ok).toBe(false);
  });

  it("rejects a lesson pointing at an unknown subject", () => {
    const snap = clone(staffSnap);
    snap.lessons = [{ day: 0, period: 1, span: 1, subjectId: "nope", classIds: ["c1"], teacherIds: [], classroomIds: [] }];
    const r = validateSnapshot(snap);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/subject/i);
  });

  it("rejects a lesson with an out-of-range day", () => {
    const snap = clone(staffSnap);
    snap.lessons = [{ day: 99, period: 1, span: 1, subjectId: "s1", classIds: ["c1"], teacherIds: [], classroomIds: [] }];
    expect(validateSnapshot(snap).ok).toBe(false);
  });
});

describe("w2-2 viewer render (read-only week grid)", () => {
  it("renders a week grid with break bands for the staff fixture", () => {
    const root = document.createElement("div");
    const res = render(root, staffSnap);
    expect(res.ok).toBe(true);
    // one section per day
    expect(root.querySelectorAll(".chrx-pub-day").length).toBe(5);
    // break band from snapshot.breaks
    expect(root.textContent).toMatch(/Recess/);
    expect(root.querySelectorAll(".chrx-pub-break").length).toBeGreaterThan(0);
    // lesson content visible
    expect(root.textContent).toMatch(/Mathematics/);
    // teacher view available when teachers exist
    expect(root.querySelector('[data-pub-view="teacher"]')).not.toBeNull();
  });

  it("hides the teacher view and teacher names in editions without teachers", () => {
    const root = document.createElement("div");
    const res = render(root, publicSnap);
    expect(res.ok).toBe(true);
    expect(root.querySelector('[data-pub-view="teacher"]')).toBeNull();
    expect(root.textContent).not.toMatch(/Sushmita/);
    expect(root.textContent).not.toMatch(/Ravi/);
    // class content still renders
    expect(root.textContent).toMatch(/Mathematics/);
  });

  it("shows a date picker only when snapshot.changes exist", () => {
    const withChanges = document.createElement("div");
    render(withChanges, staffSnap);
    expect(withChanges.querySelector('input[type="date"].chrx-pub-date')).not.toBeNull();

    const without = document.createElement("div");
    render(without, studentsSnap);
    expect(without.querySelector('input[type="date"].chrx-pub-date')).toBeNull();
  });

  it("overlays a substitution as struck-through original + substitute", () => {
    const root = document.createElement("div");
    render(root, staffSnap, { date: "2026-09-25" });
    // absent teacher struck through, substitute named
    const struck = root.querySelector(".chrx-pub-sub-orig");
    expect(struck).not.toBeNull();
    expect(struck.textContent).toMatch(/Mr. Ravi/);
    expect(root.textContent).toMatch(/Ms. Sushmita/);
    // cancelled lesson marked (it belongs to class VI B — switch entity)
    const sel = root.querySelector(".chrx-pub-entity");
    sel.value = "c2";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.textContent).toMatch(/Cancelled/);
  });

  it("uses no editor affordances: no vkarta cards, nothing draggable", () => {
    const root = document.createElement("div");
    render(root, staffSnap);
    expect(root.querySelectorAll(".chrx-vkarta").length).toBe(0);
    expect(root.querySelectorAll("[draggable='true']").length).toBe(0);
  });

  it("renders an error screen (never blank) for an invalid snapshot", () => {
    const root = document.createElement("div");
    const res = render(root, { format: "nope" });
    expect(res.ok).toBe(false);
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
    expect(root.textContent).toMatch(/could not|invalid|error/i);
  });

  it("renders a desktop week grid: day columns, period rows, full-width breaks", () => {
    const root = document.createElement("div");
    const res = render(root, staffSnap);
    expect(res.ok).toBe(true);
    const grid = root.querySelector(".chrx-pub-grid");
    expect(grid).not.toBeNull();
    // N day columns in the header
    expect(grid.querySelectorAll(".chrx-pub-grid-day").length).toBe(staffSnap.days.length);
    // one row per period …
    expect(grid.querySelectorAll(".chrx-pub-grid-row").length).toBe(staffSnap.periods.length);
    // … plus break rows (staff fixture: Recess after period 2)
    const breaks = grid.querySelectorAll(".chrx-pub-grid-break");
    expect(breaks.length).toBe(1);
    expect(breaks[0].textContent).toMatch(/Recess/);
    expect(breaks[0].querySelector("td").getAttribute("colspan"))
      .toBe(String(staffSnap.days.length + 1));
    // known lesson in the right (day, period) cell: VI A Monday 1st = Mathematics
    const cell = grid.querySelector('.chrx-pub-grid-slot[data-day="0"][data-period="1"]');
    expect(cell).not.toBeNull();
    expect(cell.textContent).toMatch(/Mathematics/);
    // period header carries label + times
    const periodHead = grid.querySelector('.chrx-pub-grid-row[data-period="1"] .chrx-pub-grid-period');
    expect(periodHead.textContent).toMatch(/1st/);
    expect(periodHead.textContent).toMatch(/07:55/);
  });

  it("highlights today's column in the week grid (or none outside snapshot days)", () => {
    const root = document.createElement("div");
    render(root, staffSnap);
    const js = new Date().getDay();
    const idx = js >= 1 && js <= 6 ? js - 1 : -1;
    const inSnap = staffSnap.days.some((d) => d.index === idx);
    const head = root.querySelectorAll(".chrx-pub-grid-day.is-today");
    if (inSnap) {
      expect(head.length).toBe(1);
      expect(head[0].getAttribute("data-day")).toBe(String(idx));
      // one highlighted slot per period row (Wednesday has a span-2 lesson in periods 3&4, so 3 slots; others have 4)
      const expectedSlots = idx === 2 ? 3 : staffSnap.periods.length;
      expect(root.querySelectorAll(".chrx-pub-grid-slot.is-today").length)
        .toBe(expectedSlots);
    } else {
      expect(head.length).toBe(0);
      expect(root.querySelectorAll(".chrx-pub-grid-slot.is-today").length).toBe(0);
    }
  });

  it("renders a multi-period lesson (span>1) as ONE cell with rowspan without extra cells", () => {
    const root = document.createElement("div");
    const res = render(root, staffSnap);
    expect(res.ok).toBe(true);
    const grid = root.querySelector(".chrx-pub-grid");
    // Wednesday (day 2) Period 3 has the span-2 lesson
    const spanCell = grid.querySelector('.chrx-pub-grid-slot[data-day="2"][data-period="3"]');
    expect(spanCell).not.toBeNull();
    expect(spanCell.getAttribute("rowspan")).toBe("2");
    expect(spanCell.textContent).toMatch(/Sports Meet Practice/);

    // Period 4 for Wednesday is spanned down, so no cell is emitted for Wednesday in period 4 row
    const extraCell = grid.querySelector('.chrx-pub-grid-slot[data-day="2"][data-period="4"]');
    expect(extraCell).toBeNull();

    // Exactly 3 slot cells for Wednesday across 4 periods
    expect(grid.querySelectorAll('.chrx-pub-grid-slot[data-day="2"]').length).toBe(3);

    // Phone view also gives the slot rowspan="2" without extra cells
    const phoneWed = root.querySelector('.chrx-pub-day[data-day="2"]');
    expect(phoneWed).not.toBeNull();
    const phoneSlot = phoneWed.querySelector('.chrx-pub-slot[rowspan="2"]');
    expect(phoneSlot).not.toBeNull();
    expect(phoneSlot.textContent).toMatch(/Sports Meet Practice/);
    expect(phoneWed.querySelectorAll(".chrx-pub-slot").length).toBe(3);

    // Switching entity to VI B (c2), which does not have this lesson, renders normal unmerged cells (4 cells)
    const entSel = root.querySelector(".chrx-pub-entity");
    entSel.value = "c2";
    entSel.dispatchEvent(new Event("change", { bubbles: true }));
    const gridB = root.querySelector(".chrx-pub-grid");
    expect(gridB.querySelectorAll('.chrx-pub-grid-slot[data-day="2"]').length).toBe(4);
    expect(gridB.querySelector('.chrx-pub-grid-slot[data-day="2"][data-period="4"]')).not.toBeNull();

    // Switching to Teacher view for Ms. Sushmita (t1) shows the span-2 lesson with rowspan=2
    const tTab = root.querySelector('[data-pub-view="teacher"]');
    tTab.click();
    const gridT = root.querySelector(".chrx-pub-grid");
    const tSpan = gridT.querySelector('.chrx-pub-grid-slot[data-day="2"][data-period="3"]');
    expect(tSpan).not.toBeNull();
    expect(tSpan.getAttribute("rowspan")).toBe("2");
    expect(tSpan.textContent).toMatch(/Sports Meet Practice/);
  });
});
