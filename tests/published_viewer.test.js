/**
 * W2-3 · offline published-file LOADER tests (js/viewer/offline_viewer.js).
 *
 * Review 1 rule: ONE renderer. The published viewer and the offline file both
 * draw with W2-2's `window.ChronexaViewer.render(rootEl, snapshot)`. So these
 * tests stub that reader (a test double, never a real implementation) and pin:
 *   - the exact call signature,
 *   - the reader's stylesheet being inlined into the single file,
 *   - a clear, readable error — never a blank page and never a second renderer —
 *     when the reader is missing/fails or the snapshot is missing/unreadable.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildSnapshot } from "../js/ui/io/publish.js";
import { fixtureSchool } from "./fixtures/school.js";
// side-effect import: installs window.ChronexaPublishedFile (dependency-free
// IIFE so its raw source can be inlined as a classic script)
import "../js/viewer/offline_viewer.js";

const OPTS = { now: "2026-09-25T00:00:00.000Z", appVer: "test" };
const snapshot = () => buildSnapshot(fixtureSchool(), "staff", OPTS);
const loader = () => window.ChronexaPublishedFile;

function mountPoint() {
  const root = document.createElement("div");
  root.id = "chronexa-viewer-root";
  document.body.appendChild(root);
  return root;
}

/** Minimal test double for W2-2's reader — records its call, paints a marker. */
function stubReader(impl) {
  const calls = [];
  window.ChronexaViewer = {
    render: (rootEl, snap) => {
      calls.push([rootEl, snap]);
      if (impl === "throw") throw new Error("reader exploded");
      if (impl !== "silent") rootEl.appendChild(document.createElement("div")).className = "stub-reader";
    },
  };
  return calls;
}

function inlineJsonBlock(value) {
  const node = document.createElement("script");
  node.type = "application/json";
  node.id = "chronexa-snapshot";
  node.textContent = typeof value === "string" ? value : JSON.stringify(value);
  document.body.appendChild(node);
  return node;
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  delete window.ChronexaViewer;
  delete loader().css;
  delete loader().bundle;
});
afterEach(() => {
  delete window.ChronexaViewer;
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("one renderer: it delegates to W2-2's reader", () => {
  it("calls ChronexaViewer.render(rootEl, snapshot) exactly once, and draws nothing itself", () => {
    const snap = snapshot();
    const calls = stubReader();
    const root = mountPoint();
    loader().render(root, snap);

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(root);   // rootEl first …
    expect(calls[0][1]).toBe(snap);   // … snapshot second (W2-2's order)
    expect(root.querySelector(".stub-reader")).not.toBeNull();
    // and nothing that looks like a second renderer's output
    expect(root.querySelectorAll("table, .cxv, .cxv-grid, [data-class-chip]")).toHaveLength(0);
  });

  it("has no renderer of its own: with the reader absent the page shows only an error", () => {
    const root = mountPoint();
    loader().render(root, snapshot());          // valid snapshot, no reader
    expect(root.querySelector("[role='alert']")).not.toBeNull();
    expect(root.querySelectorAll("table, .cxv, [data-class-chip]")).toHaveLength(0);
    // a real renderer would have painted the published content
    expect(root.textContent).not.toContain("MAT");
    expect(root.textContent).not.toContain("I A");
  });
});

describe("reader stylesheet stays inside the one file", () => {
  it("injects window.ChronexaViewer.css once, as a <style>, not a <link>", () => {
    stubReader();
    window.ChronexaViewer.css = ".chrx-pub-grid{display:grid}";
    const root = mountPoint();
    loader().render(root, snapshot());

    const styles = document.querySelectorAll("#chronexa-shared-viewer-style");
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain(".chrx-pub-grid");
    expect(document.querySelectorAll("link[href]")).toHaveLength(0);

    loader().render(mountPoint(), snapshot());  // never injected twice
    expect(document.querySelectorAll("#chronexa-shared-viewer-style")).toHaveLength(1);
  });

  it("also accepts the stylesheet handed over by the bundle entry (loader.css)", () => {
    stubReader();
    loader().css = "@media print{.chrx-pub-grid{font-size:9pt}}";
    const root = mountPoint();
    loader().render(root, snapshot());
    expect(document.getElementById("chronexa-shared-viewer-style").textContent)
      .toContain(".chrx-pub-grid");
  });
});

describe("failures are readable, never blank", () => {
  it("says the viewer is missing when the bundle has no reader", () => {
    const root = mountPoint();
    loader().render(root, snapshot());
    expect(root.textContent).toMatch(/cannot be shown/i);
    expect(root.textContent).toMatch(/missing its timetable viewer/i);
    expect(root.querySelector("[role='alert']").textContent).toMatch(/re-publish/i);
  });

  it("reports a reader that throws or paints nothing", () => {
    const thrown = mountPoint();
    stubReader("throw");
    loader().render(thrown, snapshot());
    expect(thrown.textContent).toMatch(/failed to start/i);
    expect(thrown.textContent).toContain("reader exploded");

    const silent = mountPoint();
    stubReader("silent");
    loader().render(silent, snapshot());
    expect(silent.textContent).toMatch(/did not render anything/i);
  });

  it("reports a missing or unreadable inlined snapshot", () => {
    stubReader();
    const missing = mountPoint();
    loader().mount(missing);
    expect(missing.textContent).toMatch(/no timetable data/i);

    const bad = mountPoint();
    inlineJsonBlock("{not json");
    loader().mount(bad);
    expect(bad.textContent).toMatch(/unreadable/i);
  });

  it("reports a null snapshot passed straight to render", () => {
    stubReader();
    const root = mountPoint();
    loader().render(root, null);
    expect(root.textContent).toMatch(/no timetable data/i);
    expect(window.ChronexaViewer.render && root.querySelector(".stub-reader")).toBeNull();
  });
});

describe("entry points used by the published file", () => {
  it("mounts from the inlined JSON block and hands the parsed snapshot to the reader", () => {
    const snap = snapshot();
    inlineJsonBlock(snap);
    const calls = stubReader();
    const root = mountPoint();

    loader().mount(root);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(snap);

    expect(loader().readInlineSnapshot(document)).toEqual(snap);
  });

  it("autoMount() only fills an empty root (never re-renders a populated one)", () => {
    inlineJsonBlock(snapshot());
    const calls = stubReader();
    const root = mountPoint();
    root.appendChild(document.createElement("div"));   // pretend the reader already ran
    loader().autoMount();
    expect(calls).toHaveLength(0);
    root.textContent = "";
    loader().autoMount();
    expect(calls).toHaveLength(1);
  });
});
