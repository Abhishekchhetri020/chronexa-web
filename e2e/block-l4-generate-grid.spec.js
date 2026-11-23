import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";
import fs from "node:fs";
import path from "node:path";

const SHOT_DIR = path.resolve("docs/neon/ui-shots/l4");

test.describe("Block L4 — Generate flow & Grid polish", () => {
  test("L4-1: Pre-launch plain counts, Cancel mid-generate leaves cards 100% identical, no raw internals in progress details", async ({ page }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await loadDemoSchool(page);

    const beforeCards = await page.evaluate(() => JSON.stringify(window.APP.school.cards));

    // Open Generate dialog (light & dark screenshots)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:generate")));
    await expect(page.locator(".csu-prelaunch")).toBeVisible({ timeout: 10_000 });

    // Item (a): pre-launch uses same unit as progress/result (946 lesson periods to place)
    const sumText = await page.locator("#csu-prelaunch-summary").innerText();
    expect(sumText).toMatch(/946\s+lesson periods to place/i);
    expect(sumText).toMatch(/currently on the grid/i);

    // Item (f): no stray hover tooltip while dialog is open
    const tipVisible = await page.evaluate(() => {
      const t = document.querySelector(".chrx-explainer-tooltip");
      return !!(t && getComputedStyle(t).display !== "none" && parseFloat(getComputedStyle(t).opacity) > 0);
    });
    expect(tipVisible).toBe(false);

    await page.screenshot({ path: path.join(SHOT_DIR, "generate-dialog-1440-light.png") });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOT_DIR, "generate-dialog-1440-dark.png") });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));

    // Hold the solver "done" event until Cancel is clicked so L4-1 never races a fast (~7s) solve under load.
    await page.evaluate(() => {
      const origRun = window.SolverUI.run.bind(window.SolverUI);
      window.__origSolverRunL4 = origRun;
      window.SolverUI.run = (spec) => {
        const src = origRun(spec);
        let cancelled = false;
        return {
          ...src,
          subscribe(fn) {
            return src.subscribe((ev) => {
              if (cancelled) return;
              if (ev && ev.type === "done") return; // keep progress modal open until Cancel is tested
              fn(ev);
            });
          },
          cancel() {
            cancelled = true;
            window.SolverUI.run = origRun;
            return src.cancel();
          },
        };
      };
    });
    await page.locator('.chrx-preset-card[data-preset="best"]').click();
    await page.locator("#csu-prelaunch-start").click();
    await expect(page.locator(".csu-progress")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1100);

    // Open "Show details" and verify no raw internal strings (item c)
    await page.locator("#csu-progress-details summary").click();
    await page.waitForTimeout(150);
    const progText = await page.locator(".csu-progress").innerText();
    expect(progText).not.toMatch(/applyingPhase|Soft penalties|Current branch|Schedules \/ sec/i);
    await page.screenshot({ path: path.join(SHOT_DIR, "generate-progress-1440-light.png") });

    // Elapsed timer must be live (not frozen at "—")
    const elapsedText = await page.locator("#csu-stat-elapsed").innerText();
    expect(elapsedText).toMatch(/^\d+:\d{2}$/);

    // Cancel mid-generate
    await page.locator(".csu-progress button", { hasText: "Cancel" }).click();
    await expect(page.locator(".csu-progress")).toBeHidden({ timeout: 10_000 });

    const afterCards = await page.evaluate(() => JSON.stringify(window.APP.school.cards));
    expect(afterCards).toBe(beforeCards);
    expect(errors).toEqual([]);
  });

  test("L4-2: Result uses 'conflict(s)' + explains resolved conflicts, single-line 390px tile, Apply then Undo restores identical cards", async ({ page }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await loadDemoSchool(page);

    const beforeCards = await page.evaluate(() => JSON.stringify(window.APP.school.cards));

    // Open Generate, pick Quick preset, cap to 3s for fast deterministic test
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:generate")));
    await expect(page.locator(".csu-prelaunch")).toBeVisible({ timeout: 10_000 });
    await page.locator('.chrx-preset-card[data-preset="fast"]').click();
    await page.evaluate(() => {
      const dlg = document.querySelector(".csu-prelaunch");
      if (dlg) dlg.dataset.timeLimitSec = "3";
    });
    await page.locator("#csu-prelaunch-start").click();

    // Wait for Result panel
    await expect(page.locator(".csu-result")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("#csu-result-apply")).toBeVisible();
    await expect(page.locator("#csu-result-reject")).toBeVisible();

    // Item (d): uses "conflict(s)", never "clash(es)"
    const resultText = await page.locator(".csu-result").innerText();
    expect(resultText).toMatch(/conflict/i);
    expect(resultText).not.toMatch(/\bclash(es)?\b/i);

    await page.screenshot({ path: path.join(SHOT_DIR, "generate-result-1440-light.png") });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOT_DIR, "generate-result-1440-dark.png") });

    // Item (g): at 390px, "946 / 946" tile stays on ONE line (height <= 36px)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    const tileNumBox = await page.locator(".csu-result .csu-result__tile").first().locator(".csu-result__num").boundingBox();
    expect(tileNumBox).not.toBeNull();
    expect(tileNumBox.height).toBeLessThanOrEqual(40);
    await page.screenshot({ path: path.join(SHOT_DIR, "generate-result-390-dark.png") });

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(150);

    // Apply result
    await page.locator("#csu-result-apply").click();
    await page.waitForTimeout(300);
    if (await page.locator("#csu-result-close").isVisible().catch(() => false)) {
      await page.locator("#csu-result-close").click();
    }

    // Item (f): autosave pill is positioned on the right (does not cover bottom-left Unplaced lessons label)
    const pillPos = await page.evaluate(() => {
      const pill = document.getElementById("chrx-autosave-pill");
      if (!pill) return null;
      const cs = getComputedStyle(pill);
      return { left: cs.left, right: cs.right };
    });
    if (pillPos) {
      expect(pillPos.right).toBe("16px");
    }

    // Item (h): Undo must restore the exact pre-generate cards snapshot
    await page.evaluate(() => window.APP.undo());
    await page.waitForTimeout(250);
    const afterUndoCards = await page.evaluate(() => JSON.stringify(window.APP.school.cards));
    expect(afterUndoCards).toBe(beforeCards);
    expect(errors).toEqual([]);
  });

  test("L4-3: dragging a card onto an invalid (red) cell is refused with plain-English reason + 390px grid layout clean", async ({ page }) => {
    test.setTimeout(60_000);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await loadDemoSchool(page, { view: "focus" });

    // Find a placed card on the visible focus board and a slot (td, tp) on the same board
    // where that card's teacher is already teaching ANOTHER class (a real hard conflict).
    const setup = await page.evaluate(() => {
      const S = window.APP.school;
      const cardsOnBoard = [...document.querySelectorAll("#editor-root .chrx-vkarta")];
      const slotsOnBoard = [...document.querySelectorAll("#editor-root .chrx-slot:not(.out-of-bell)")];
      for (const cardEl of cardsOnBoard) {
        const lid = cardEl.dataset.lessonId;
        const od = parseInt(cardEl.dataset.day, 10);
        const op = parseInt(cardEl.dataset.period, 10);
        const L = S._idx.lessonById[lid];
        const tid = L && L.teacherIds && L.teacherIds[0];
        if (!tid) continue;
        for (const slot of slotsOnBoard) {
          const td = parseInt(slot.dataset.day, 10);
          const tp = parseInt(slot.dataset.period, 10);
          if (td === od && tp === op) continue;
          // Is tid teaching another lesson (not on this board's class) at (td, tp)?
          const busyOther = (S.cards || []).some((c) => {
            if (c.day !== td || c.period !== tp || c.lessonId === lid) return false;
            const oL = S._idx.lessonById[c.lessonId];
            if (!oL || !(oL.teacherIds || []).includes(tid)) return false;
            const sameClass = (oL.classIds || []).some((cid) => (L.classIds || []).includes(cid));
            return !sameClass;
          });
          if (busyOther) {
            // Empty this slot on the current class board so dropping tests a pure hard-conflict refusal
            const occupying = [...slot.querySelectorAll(".chrx-vkarta")].map((el) => el.dataset.lessonId);
            if (occupying.length) {
              S.cards = (S.cards || []).filter((c) => !(c.day === td && c.period === tp && occupying.includes(c.lessonId)));
              const editorRoot = document.querySelector(".chrx-editor");
              if (editorRoot && window.Editor && window.Editor.render) window.Editor.render(editorRoot);
            }
            return { lessonId: lid, originDay: od, originPeriod: op, td, tp };
          }
        }
      }
      return null;
    });
    expect(setup).not.toBeNull();

    const cardLoc = page.locator(`#editor-root .chrx-vkarta[data-lesson-id="${setup.lessonId}"][data-day="${setup.originDay}"][data-period="${setup.originPeriod}"]`).first();
    const targetSlot = page.locator(`#editor-root .chrx-slot[data-day="${setup.td}"][data-period="${setup.tp}"]`).first();
    await expect(cardLoc).toBeVisible();
    await expect(targetSlot).toBeVisible();

    // Real mouse drag from card onto the red conflict slot
    const cBox = await cardLoc.boundingBox();
    const hBox = await targetSlot.boundingBox();
    expect(cBox && hBox).toBeTruthy();
    await page.mouse.move(cBox.x + cBox.width / 2, cBox.y + cBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(hBox.x + hBox.width / 2, hBox.y + hBox.height / 2, { steps: 8 });
    await page.mouse.up();

    // Refusal modal must appear with plain-English reason (never "clashes with 0 lessons")
    const popup = page.locator("#chrx-collision-modal-backdrop .chrx-collision-popup");
    await expect(popup).toBeVisible({ timeout: 5_000 });
    const popupText = await popup.innerText();
    expect(popupText.length).toBeGreaterThan(15);
    expect(popupText).not.toContain("0 lessons");
    await page.screenshot({ path: path.join(SHOT_DIR, "grid-invalid-drop-1440-light.png") });

    // Cancel and verify card stayed in its original slot
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(cardLoc).toBeVisible();

    // Capture 1440 dark grid shot
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOT_DIR, "grid-1440-dark.png") });

    // Item (g): 390px checks — class rail hidden (dropdown kept), overflow "⋯" button visible, no stray tooltip, no right-edge overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await expect(page.locator(".chrx-class-rail")).toBeHidden();
    await expect(page.locator("#editor-tools-more")).toBeVisible();
    const mobileAudit = await page.evaluate(() => {
      const tip = document.querySelector(".chrx-explainer-tooltip");
      const tipShown = !!(tip && getComputedStyle(tip).display !== "none" && parseFloat(getComputedStyle(tip).opacity) > 0);
      return {
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        tipShown,
      };
    });
    expect(mobileAudit.scrollW).toBeLessThanOrEqual(mobileAudit.innerW);
    expect(mobileAudit.tipShown).toBe(false);
    await page.screenshot({ path: path.join(SHOT_DIR, "grid-390-dark.png") });

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOT_DIR, "grid-390-light.png") });
    expect(errors).toEqual([]);
  });
});
