// Right-click in the print preview — aSc's "click the RIGHT MOUSE button on the
// area you wish to change". The mapping is pure, so it is asserted directly;
// attach() is exercised with a real event on a tagged node.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { menuFor, describeTarget, attach, ELEMENT_LABEL } from "../js/ui/print_preview/preview_context_menu.js";

beforeEach(() => {
  document.body.innerHTML = "";
  window.APP = { activePrintReport: null };
  window._chrxNotify = vi.fn();
});

describe("menuFor", () => {
  it("offers to style the element that was clicked", () => {
    const ids = menuFor({ el: "subject" }).map((e) => e.id);
    expect(ids[0]).toBe("style-element");
    expect(menuFor({ el: "subject" })[0].label).toBe("Style: Subject…");
    expect(menuFor({ el: "bellTimes" })[0].label).toBe("Style: Bell time…");
  });

  it("adds the header style entry only when a table header was clicked", () => {
    expect(menuFor({ el: "teacher" }).map((e) => e.id)).not.toContain("header-style");
    expect(menuFor({ el: "teacher", inHeader: true }).map((e) => e.id)).toContain("header-style");
  });

  it("always offers the report-level dialogs", () => {
    const ids = menuFor({}).map((e) => e.id);
    for (const id of ["structure", "extra", "sizes", "colors", "filter"]) expect(ids).toContain(id);
  });

  it("has a label for every element the renderer can tag", () => {
    for (const key of ["subject", "teacher", "class", "group", "classroom", "count", "bellTimes"]) {
      expect(ELEMENT_LABEL[key]).toBeTruthy();
    }
  });
});

describe("describeTarget", () => {
  it("reads the element tag, page and header context", () => {
    document.body.innerHTML = `
      <div class="chrx-preview-page">
        <table><thead><tr><th id="h">P1</th></tr></thead>
        <tbody><tr><td><div data-chrx-el="teacher" id="t">Ms. Rao</div></td></tr></tbody></table>
      </div>`;
    const info = describeTarget(document.getElementById("t"));
    expect(info.el).toBe("teacher");
    expect(info.inPage).toBe(true);
    expect(info.inHeader).toBe(false);
    expect(describeTarget(document.getElementById("h")).inHeader).toBe(true);
  });

  it("ignores anything outside a preview page", () => {
    document.body.innerHTML = `<div id="outside">x</div>`;
    expect(describeTarget(document.getElementById("outside")).inPage).toBe(false);
  });
});

describe("attach", () => {
  it("opens a menu on right-click and closes it on Escape", () => {
    document.body.innerHTML = `<div id="shell"><div class="chrx-preview-page">
      <div data-chrx-el="subject">Maths</div></div></div>`;
    const shell = document.getElementById("shell");
    const detach = attach(shell);
    const target = shell.querySelector("[data-chrx-el]");
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    const panel = document.querySelector(".chrx-menu-panel");
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain("Style: Subject");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".chrx-menu-panel")).toBeNull();
    detach();
  });

  it("does not hijack right-click outside a page", () => {
    document.body.innerHTML = `<div id="shell"><span id="chrome">toolbar</span></div>`;
    const detach = attach(document.getElementById("shell"));
    document.getElementById("chrome").dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(document.querySelector(".chrx-menu-panel")).toBeNull();
    detach();
  });
});
