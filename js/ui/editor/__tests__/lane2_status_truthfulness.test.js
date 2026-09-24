/**
 * Lane L2 — status truthfulness (B1, B9, B17).
 *
 * B1: the topbar chip must not read "all good" while hard conflicts exist.
 * B9: "Suggest fix" must show an explicit Apply proposal + hint, and re-run
 *     verification after applying so the header count updates.
 * B17: the Verification footer must wrap inside the dialog (not clip), and
 *     the bottom-right toast must hide while any modal is open.
 *
 * Run: npx vitest run js/ui/editor/__tests__/lane2_status_truthfulness.test.js
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkPlacement } from "../../../solver/constraints.js";
import "../../components/verification_panel_pro.js";

const VPro = () => window.VerificationPro;

// Minimal school with ONE real teacher clash (L1 vs L2 share Ms. Ashmita at
// D1P2), verified through the real SolverConstraints.checkPlacement — the
// same verifier the panel reuses, not a stubbed count.
function clashSchool() {
  const periods = Array.from({ length: 8 }, (_, i) => ({ index: i, label: `P${i + 1}` }));
  return {
    bell: { periods },
    teachers: [{ id: "t1", name: "Ms. Ashmita" }],
    classes: [{ id: "c1", name: "VII A" }, { id: "c2", name: "VII B" }],
    subjects: [{ id: "s1", name: "Maths" }, { id: "s2", name: "Science" }],
    lessons: [
      { id: "L1", classIds: ["c1"], teacherIds: ["t1"], subjectId: "s1" },
      { id: "L2", classIds: ["c2"], teacherIds: ["t1"], subjectId: "s2" },
    ],
    cards: [
      { id: "k1", lessonId: "L1", day: 0, period: 1 },
      { id: "k2", lessonId: "L2", day: 0, period: 1 },
    ],
  };
}

beforeEach(() => {
  // Wire the real verifier behind the panel's seam (production does this via
  // js/entry/solver_shims.js). No RelationEnforcer: single-source, deterministic.
  window.SolverConstraints = { checkPlacement };
  delete window.RelationEnforcer;
  window._chrxNotify = () => {};
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = () => ({
      matches: false, media: "",
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {},
    });
  }
});

afterEach(() => {
  // Close any open Verification panel (× button) and scrub test DOM.
  document.querySelector(".chrx-vpro-close")?.click();
  document.querySelector(".chrx-vpro-root")?.remove();
  document.querySelector("#chrx-pwa-banner")?.remove();
});

describe("B1 — truthful status chip", () => {
  it("countHardConflicts reuses the verifier: finds the teacher clash", () => {
    expect(VPro().countHardConflicts(clashSchool())).toBe(2);
    expect(VPro().countHardConflicts(null)).toBe(0);
  });

  it("chip copy never looks all-good while hard conflicts exist", () => {
    expect(VPro().statusChipText(0, 102).text).toBe("All placed · 102 conflicts");
    expect(VPro().statusChipText(0, 102)).toMatchObject({ warn: true, conflict: true });
    expect(VPro().statusChipText(0, 1).text).toBe("All placed · 1 conflict");
    expect(VPro().statusChipText(0, 0)).toMatchObject({ text: "All placed", warn: false, conflict: false });
    expect(VPro().statusChipText(3, 0).text).toBe("3 unplaced");
    expect(VPro().statusChipText(1, 2).text).toBe("1 unplaced · 2 conflicts");
  });
});

describe("B9 — explicit suggest-fix + recount", () => {
  it("first click shows Apply + hint, second click applies and updates the header", () => {
    const school = clashSchool();
    const root = VPro().open(school);
    const summary = () => root.querySelector(".chrx-vpro-summary").textContent;

    expect(summary()).toMatch(/2 violation\(s\) found/);
    expect(summary()).toMatch(/2 hard/);

    const row = root.querySelector(".chrx-vpro-row");
    const fixBtn = row.querySelector(".chrx-vpro-fix");
    fixBtn.click();

    // Explicit proposal state — not a silent relabel.
    expect(fixBtn.textContent).toMatch(/^Apply: move to D\d+P\d+$/);
    expect(fixBtn.title).toMatch(/click again/i);
    const hint = row.querySelector(".chrx-vpro-hint");
    expect(hint).toBeTruthy();
    expect(hint.textContent).toMatch(/click.*again/i);

    // Applying re-runs verification: the header count drops to zero.
    fixBtn.click();
    expect(summary()).toMatch(/0 violation\(s\) found/);
    expect(summary()).toMatch(/0 hard/);
    expect(root.querySelector(".chrx-vpro-empty")).toBeTruthy();
  });

  it("no feasible slot is an explicit dead-end, not a silent relabel", () => {
    // Every slot clashes: L2 shadows L1's teacher on all 6×8 slots.
    const school = clashSchool();
    for (let d = 0; d < 6; d++)
      for (let p = 0; p < 8; p++)
        school.cards.push({ id: `w${d}_${p}`, lessonId: "L2", day: d, period: p });
    const root = VPro().open(school);
    const fixBtn = root.querySelector(".chrx-vpro-fix");
    fixBtn.click();
    expect(fixBtn.textContent).toBe("No feasible slot");
    expect(fixBtn.disabled).toBe(true);
    expect(fixBtn.title).toMatch(/no alternative slot/i);
  });
});

describe("B17 — footer inside dialog, toast hidden under modals", () => {
  it("footer CSS wraps instead of clipping at the dialog edge", () => {
    VPro().open(clashSchool());
    const css = document.getElementById("chrx-vpro-styles").textContent;
    const footerRule = css.match(/\.chrx-vpro-panel footer\{[^}]*\}/)[0];
    expect(footerRule).toMatch(/flex-wrap:wrap/);
    expect(footerRule).toMatch(/flex-shrink:0/);
  });

  it("toast hides while a modal is open and restores after it closes", async () => {
    const { PWA } = await import("../../pwa_install.js");
    const banner = document.createElement("div");
    banner.id = "chrx-pwa-banner";
    document.body.appendChild(banner);

    const dlg = document.createElement("div");
    dlg.setAttribute("role", "dialog");
    document.body.appendChild(dlg);

    expect(PWA.isModalOpen()).toBe(true);
    PWA.syncBannerWithModals();
    expect(banner.style.display).toBe("none");

    dlg.remove();
    PWA.syncBannerWithModals();
    expect(banner.style.display).toBe("");
    expect(PWA.isModalOpen()).toBe(false);
  });
});
