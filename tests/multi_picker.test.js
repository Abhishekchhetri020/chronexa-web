// The "you cannot actually choose anything" bug: every multi-entity field used
// to be a bare <select multiple>, which needs an undiscoverable ctrl-click and
// hides the current selection. These assertions pin the replacement — chips,
// a Choose… button, a searchable sheet, live counts and per-chip removal — so
// no module can quietly go back to the listbox.
import { describe, it, expect, beforeAll } from "vitest";
import { EntityDialog } from "../js/ui/entities/dialog_shell.js";

const ITEMS = [
  { id: "s1", label: "ENGLISH (English)" },
  { id: "s2", label: "MATHS (Maths)" },
  { id: "s3", label: "SCI LAB PERIOD (Sci Lab)" },
];

beforeAll(() => {
  window.APP = window.APP || { school: {}, mutate: (l, fn) => fn(window.APP.school) };
  window.HelpTooltip = window.HelpTooltip || { create: () => null };
  document.body.innerHTML = "";
});

describe("buildIdMultiPicker", () => {
  it("shows an empty state and a Choose… button when nothing is picked", () => {
    const host = EntityDialog.buildIdMultiPicker({ items: ITEMS, ids: [], onChange: () => {} });
    document.body.appendChild(host);
    expect(host.querySelector(".chrx-ent-multi__empty").textContent).toMatch(/None selected/);
    expect(host.querySelector(".chrx-ent-multi__choose").textContent).toBe("Choose…");
  });

  it("renders one removable chip per selection and counts the rest", () => {
    const seen = [];
    const host = EntityDialog.buildIdMultiPicker({
      items: ITEMS, ids: ["s1", "s2", "s3"], maxChips: 2,
      onChange: (ids) => seen.push(ids),
    });
    document.body.innerHTML = "";
    document.body.appendChild(host);
    const chips = [...host.querySelectorAll(".chrx-ent-chip")];
    expect(chips.length).toBe(3);                       // 2 chips + "+1 more"
    expect(chips[2].textContent).toContain("+1 more");
    expect(host.querySelector(".chrx-ent-multi__choose").textContent).toBe("Edit selection (3)");

    chips[0].querySelector(".chrx-ent-chip__x").click();
    expect(seen.pop()).toEqual(["s2", "s3"]);
  });

  it("opens a searchable sheet from Choose… and applies the ticks", () => {
    let value = [];
    const host = EntityDialog.buildIdMultiPicker({
      items: ITEMS, ids: [], label: "Subjects",
      onChange: (ids) => { value = ids; },
    });
    document.body.innerHTML = "";
    document.body.appendChild(host);
    host.querySelector(".chrx-ent-multi__choose").click();

    const search = document.querySelector(".chrx-ent-picker__search");
    expect(search).toBeTruthy();
    expect(document.querySelector(".chrx-ent-picker__count").textContent)
      .toMatch(/3 available · 0 selected/);

    search.value = "lab";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelector(".chrx-ent-picker__count").textContent)
      .toMatch(/1 of 3 · 0 selected/);

    const rows = [...document.querySelectorAll(".chrx-ent-picker__row")]
      .filter((r) => r.style.display !== "none");
    expect(rows.length).toBe(1);
    const cb = rows[0].querySelector("input");
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.querySelector(".chrx-ent-picker__count").textContent)
      .toMatch(/1 of 3 · 1 selected/);

    [...document.querySelectorAll("button")]
      .find((x) => /Use selection/i.test(x.textContent)).click();
    expect(value).toEqual(["s3"]);
    expect(host.querySelectorAll(".chrx-ent-chip").length).toBe(1);
  });

  it("ignores ids that no longer exist in the school", () => {
    const host = EntityDialog.buildIdMultiPicker({
      items: ITEMS, ids: ["s1", "ghost"], onChange: () => {},
    });
    document.body.innerHTML = "";
    document.body.appendChild(host);
    expect(host.querySelectorAll(".chrx-ent-chip").length).toBe(1);
  });
});
