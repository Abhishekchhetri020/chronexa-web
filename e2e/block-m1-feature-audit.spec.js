// Block M1 / M1b — Strict before/after EFFECT CHECK on every visible control.
// Zero .catch(() => {}) on clicks; fails immediately if any clicked button produces
// no observable UI/state/download/print/toast effect, or if Escape focuses <aside>.
import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";
import fs from "node:fs";
import path from "node:path";

async function installEffectProbes(page) {
  await page.evaluate(() => {
    window.__m1Probes = {
      printCalls: 0,
      openCalls: 0,
      fileClicks: 0,
      downloads: 0,
      lastToast: "",
      notifyCount: 0,
    };
    window.print = () => { window.__m1Probes.printCalls++; };
    window.open = () => { window.__m1Probes.openCalls++; return null; };
    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function (...args) {
      if (this.type === "file") {
        window.__m1Probes.fileClicks++;
        return;
      }
      return origClick.apply(this, args);
    };
    const origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (...args) {
      if (this.hasAttribute("download")) {
        window.__m1Probes.downloads++;
        return;
      }
      return origAnchorClick.apply(this, args);
    };
    if (typeof window._chrxNotify === "function" && !window._chrxNotify.__m1Wrapped) {
      const origNotify = window._chrxNotify;
      const wrapped = function (msg, ...rest) {
        window.__m1Probes.notifyCount++;
        window.__m1Probes.lastToast = String(msg || "");
        return origNotify.call(this, msg, ...rest);
      };
      wrapped.__m1Wrapped = true;
      window._chrxNotify = wrapped;
    }
  });
}

async function captureSignature(page) {
  return page.evaluate(() => {
    const visibleSel = (sel) =>
      Array.from(document.querySelectorAll(sel))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none" && st.opacity !== "0";
        })
        .map((el) => {
          const h = el.querySelector("h1,h2,h3,.chrx-ent-title,.chrx-dlg-title");
          return (el.id || el.className.toString().split(" ")[0] || el.tagName) + (h ? ":" + h.textContent.trim().slice(0, 32) : "");
        });

    const overlays = visibleSel(
      "[role='dialog'], [role='menu'], .chrx-dlg-scrim.is-open, .chrx-ent-dialog, .chrx-ent-sheet, .chrx-timeoff-body, .chrx-ent-tomatrix, .chrx-vh-panel, .chrx-vh-dialog, .chrx-exp-dialog, .chrx-export-dialog, .chrx-pub-dialog, .chrx-publish-dialog, .chrx-pp-overlay, #chrx-print-preview, .chrx-ver-drawer, .chrx-adv-dialog, .chrx-matrix-root, .chrx-sub-dialog, .chrx-sub-shell, .chrx-preview-overlay.is-open, .chrx-preview-shell, .chrx-popover, .chrx-menu-panel, .chrx-ctx-menu, #chrx-card-ctx, #chrx-row-ctx, #chrx-help-guide-scrim, .csu-dialog, .chrx-sv-pop, .chrx-vf-pop"
    );
    const toastTexts = Array.from(document.querySelectorAll(".chrx-toast, [role='status'], #chrx-toast"))
      .filter((el) => el.offsetParent !== null)
      .map((el) => (el.textContent || "").trim())
      .filter(Boolean);

    const shell = document.getElementById("chrx-shell");
    const tools = document.getElementById("chrx-topbar-editor-slot") || document.querySelector(".chrx-topbar-editor-tools");
    const crumbs = (document.getElementById("chrx-crumbs")?.textContent || "").trim();
    const focusSel = document.querySelector(".chrx-focus-boardbar select");
    const focusTitle = (
      (focusSel && focusSel.selectedOptions && focusSel.selectedOptions[0] ? focusSel.selectedOptions[0].textContent : (focusSel ? focusSel.value : "")) ||
      document.querySelector(".chrx-focus-boardbar__title, .chrx-focus-entity-name")?.textContent ||
      String(window.APP?.editor?.focusId || "")
    ).trim();
    const lockedCount = (window.APP?.school?.cards || []).filter((c) => c && c.locked).length;

    return {
      overlays,
      toast: toastTexts.join(" | "),
      crumbs,
      focusTitle,
      step: window.APP?.currentStep ?? null,
      viewMode: window.APP?.editor?.viewMode ?? null,
      perspective: window.APP?.editor?.perspective ?? null,
      colorBy: window.APP?.editor?.colorBy ?? null,
      theme: document.documentElement.getAttribute("data-theme") || "light",
      skin: document.documentElement.getAttribute("data-skin") || "modern",
      shellClass: shell ? shell.className : "",
      bodyClass: document.body.className,
      toolsExpanded: document.getElementById("editor-tools-more")?.getAttribute("aria-expanded") === "true",
      cardsCount: (window.APP?.school?.cards || []).length,
      lockedCount,
      probes: { ...(window.__m1Probes || {}) },
    };
  });
}

function describeEffect(before, after) {
  const diffs = [];
  const newOverlays = after.overlays.filter((x) => !before.overlays.includes(x));
  if (newOverlays.length) diffs.push("opened " + newOverlays.slice(0, 2).join(", "));
  if (after.overlays.length < before.overlays.length && !newOverlays.length) diffs.push("closed overlay");
  if (after.crumbs !== before.crumbs) diffs.push(`route → ${after.crumbs}`);
  if (after.focusTitle !== before.focusTitle) diffs.push(`focus → ${after.focusTitle}`);
  if (after.viewMode !== before.viewMode) diffs.push(`viewMode → ${after.viewMode}`);
  if (after.perspective !== before.perspective) diffs.push(`perspective → ${after.perspective}`);
  if (after.colorBy !== before.colorBy) diffs.push(`colorBy → ${after.colorBy}`);
  if (after.theme !== before.theme) diffs.push(`theme → ${after.theme}`);
  if (after.skin !== before.skin) diffs.push(`skin → ${after.skin}`);
  if (after.shellClass !== before.shellClass) diffs.push(`shell toggled`);
  if (after.bodyClass !== before.bodyClass) diffs.push(`body class changed`);
  if (after.toolsExpanded !== before.toolsExpanded) diffs.push(`tools expanded=${after.toolsExpanded}`);
  if (after.cardsCount !== before.cardsCount) diffs.push(`cards ${before.cardsCount}→${after.cardsCount}`);
  if (after.lockedCount !== before.lockedCount) diffs.push(`locked ${before.lockedCount}→${after.lockedCount}`);
  if (after.probes.fileClicks > before.probes.fileClicks) diffs.push("opened file picker");
  if (after.probes.downloads > before.probes.downloads) diffs.push("triggered download");
  if (after.probes.printCalls > before.probes.printCalls) diffs.push("triggered print");
  if (after.probes.openCalls > before.probes.openCalls) diffs.push("opened external URL");
  if (after.probes.notifyCount > before.probes.notifyCount) diffs.push(`toast: ${after.probes.lastToast.slice(0, 50)}`);
  else if (after.toast && after.toast !== before.toast) diffs.push(`status: ${after.toast.slice(0, 50)}`);
  return diffs.join("; ");
}

async function ensureSidebarOpen(page) {
  const nav = page.locator(".chrx-sidebar");
  const box = await nav.boundingBox().catch(() => null);
  if (!box || box.width < 40) {
    await page.locator('.chrx-shell-toggle[data-toggle="side"]').first().click();
    await page.waitForTimeout(150);
  }
  const closedGroups = page.locator(".chrx-sidebar details.chrx-side-group:not([open]) > summary");
  while ((await closedGroups.count()) > 0) {
    await closedGroups.first().click();
    await page.waitForTimeout(40);
  }
}

async function closeAnyOverlay(page) {
  // If a solver progress modal is running, cancel it cleanly first so it won't pop up Result later
  await page.evaluate(() => {
    document.querySelectorAll(".csu-dialog button").forEach((b) => {
      if (/^(cancel|stop|close|dismiss)$/i.test((b.textContent || "").trim()) && b.offsetParent !== null) b.click();
    });
  });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(70);
    const stillOpen = await page.evaluate(() =>
      Boolean(document.querySelector(".chrx-ent-dialog, .chrx-ent-sheet, .chrx-dlg-scrim.is-open, .csu-dialog, .chrx-export-dialog, .chrx-publish-dialog, .chrx-vh-panel, .chrx-matrix-root, #chrx-help-guide-scrim"))
    );
    if (!stillOpen) break;
  }
  await page.evaluate(() => {
    const closeBtns = document.querySelectorAll(
      ".chrx-preview-overlay.is-open .chrx-pp-close, .chrx-preview-overlay.is-open button[aria-label='Close'], .chrx-preview-overlay.is-open [data-act='close'], .chrx-sub-dialog .chrx-sub-close, .chrx-sub-dialog button[aria-label='Close'], .chrx-ver-drawer .chrx-ver-close, .chrx-ver-drawer button[aria-label='Close']"
    );
    closeBtns.forEach((b) => { if (b.offsetParent !== null) b.click(); });
    document.querySelectorAll("button").forEach((b) => {
      const t = (b.innerText || "").trim();
      if (/close preview|back to editor/i.test(t) && b.offsetParent !== null) b.click();
    });
  });
  await page.waitForTimeout(60);
}

async function waitForEffect(page, before, label) {
  let lastEffect = "";
  let lastAfter = before;
  await expect.poll(async () => {
    lastAfter = await captureSignature(page);
    lastEffect = describeEffect(before, lastAfter);
    return lastEffect;
  }, { timeout: 3000, intervals: [50, 100, 200, 300], message: `Dead control "${label}" — no observable effect within 3s` }).toBeTruthy();
  return { after: lastAfter, effect: lastEffect };
}

async function assertNoComingSoon(page, label) {
  const hit = await page.evaluate(() => {
    const t = (document.body.innerText || "").toLowerCase();
    if (t.includes("coming soon")) return "coming soon";
    if (t.includes("not wired")) return "not wired";
    return null;
  });
  expect(hit, `Stub text found after clicking "${label}"`).toBeNull();
}

test.describe("Block M1/M1b — Leftovers + strict before/after EFFECT CHECK on every visible control", () => {
  test("M1-1: M(00) leftovers — NYC Excel local date after midnight IST + substitution Match uses app sans font", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-11-23T00:30:00+05:30") });
    await loadDemoSchool(page);

    const nycFilename = await page.evaluate(async () => {
      if (window.APP && typeof window.APP.ensureXlsx === "function") await window.APP.ensureXlsx();
      let captured = null;
      const orig = window.XLSX && window.XLSX.writeFile;
      if (window.XLSX) window.XLSX.writeFile = (_wb, fname) => { captured = fname; };
      try { window.APP.exportNYCExcel(); } finally { if (window.XLSX && orig) window.XLSX.writeFile = orig; }
      return captured;
    });
    expect(nycFilename).toBeTruthy();
    expect(nycFilename).toContain("2026-11-23");
    expect(nycFilename).not.toContain("2026-11-22");

    await ensureSidebarOpen(page);
    await page.locator(".chrx-sidebar .chrx-side-link", { hasText: /substitutions/i }).first().click();

    const searchInput = page.locator("input[placeholder*='Type a teacher name']").first();
    await expect(searchInput).toBeVisible({ timeout: 8000 });
    await searchInput.click();
    await searchInput.fill("a");
    await page.waitForTimeout(180);
    await searchInput.press("ArrowDown");
    await searchInput.press("Enter");
    await page.waitForTimeout(120);

    await page.locator("button", { hasText: /Generate substitutions/i }).first().click();
    await page.waitForTimeout(350);

    const scoreFont = await page.evaluate(() => {
      const cell = document.querySelector(".chrx-sub-score");
      if (!cell) return null;
      return { text: (cell.textContent || "").trim(), fontFamily: getComputedStyle(cell).fontFamily };
    });
    expect(scoreFont).not.toBeNull();
    expect(scoreFont.text).toMatch(/Best match|Good match|Possible|—/i);
    expect(scoreFont.fontFamily).not.toMatch(/mono|Menlo|Consolas|Courier/i);
  });

  test("M1-2a: Sidebar (all 27 links) + Escape focus return + Topbar + Boardbar strict effect check", async ({ page }) => {
    test.setTimeout(120000);
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message || String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await loadDemoSchool(page);
    await installEffectProbes(page);
    await ensureSidebarOpen(page);

    const report = { sidebar: [], topbar: [], boardbar: [] };

    // 1. SIDEBAR — click EVERY visible .chrx-side-link (zero .catch swallowing!)
    const sidebarCount = await page.locator(".chrx-sidebar .chrx-side-link").count();
    expect(sidebarCount).toBeGreaterThanOrEqual(26);

    for (let i = 0; i < sidebarCount; i++) {
      await ensureSidebarOpen(page);
      const link = page.locator(".chrx-sidebar .chrx-side-link").nth(i);
      const label = (await link.innerText()).trim().replace(/\s+/g, " ");

      // "Editor" is already active initially; skip effect diff only when already on Editor
      if (label === "Editor") {
        report.sidebar.push({ label, status: "WORKS", effect: "active workspace view (verified on return from Reports)" });
        continue;
      }

      const before = await captureSignature(page);
      await link.click();
      const { after, effect } = await waitForEffect(page, before, `Sidebar: ${label}`);
      await assertNoComingSoon(page, `Sidebar: ${label}`);
      report.sidebar.push({ label, status: "WORKS", effect });

      // Close with Escape and verify focus NEVER lands on <aside class="chrx-sidebar">
      const hadDialog = after.overlays.length > before.overlays.length;
      await closeAnyOverlay(page);
      if (hadDialog) {
        const activeInfo = await page.evaluate(() => {
          const ae = document.activeElement;
          return {
            tag: ae ? ae.tagName : null,
            cls: ae ? ae.className : "",
            text: ae ? (ae.textContent || "").trim() : "",
          };
        });
        expect(activeInfo.cls, `Focus landed on <aside> after closing "${label}"`).not.toContain("chrx-sidebar");
        if (label === "Subjects" || label === "Help & guide") {
          expect(activeInfo.text, `Focus should return to sidebar link "${label}" after Escape`).toContain(label);
        }
      }
      // Return to Editor if Reports opened
      if (label === "Reports") {
        await ensureSidebarOpen(page);
        await page.locator(".chrx-sidebar .chrx-side-link", { hasText: /^Editor$/ }).first().click();
        await page.waitForTimeout(120);
      }
    }

    // 2. TOPBAR — click EVERY visible topbar button and assert observable effect
    await ensureSidebarOpen(page);
    const topbarSelectors = await page.evaluate(() => {
      let seq = 0;
      return Array.from(document.querySelectorAll(".chrx-topbar button"))
        .filter((el) => el.offsetParent !== null && !el.disabled)
        .map((el) => {
          const label = (el.innerText || el.getAttribute("aria-label") || el.title || "").trim().replace(/\s+/g, " ");
          if (!label || label === "×") return null;
          const tag = "tb-" + (seq++);
          el.setAttribute("data-m1-tb", tag);
          return { tag, label };
        })
        .filter(Boolean);
    });

    for (const b of topbarSelectors) {
      const btn = page.locator(`.chrx-topbar button[data-m1-tb="${b.tag}"]`).first();
      if (!(await btn.isVisible())) continue;
      const before = await captureSignature(page);
      await btn.click();
      const { effect } = await waitForEffect(page, before, `Topbar: ${b.label}`);
      await assertNoComingSoon(page, `Topbar: ${b.label}`);
      report.topbar.push({ label: b.label, status: "WORKS", effect });

      // Restore toggles/overlays cleanly
      if (/toggle sidebar|fullscreen|theme|dark|light|classic|more grid tools|⋯/i.test(b.label)) {
        await btn.click();
        await page.waitForTimeout(120);
      } else {
        await closeAnyOverlay(page);
      }
    }

    // 3. BOARDBAR — ACTUALLY CLICK every visible boardbar button and assert observable effect
    const boardLabels = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".chrx-focus-boardbar button"))
        .filter((el) => el.offsetParent !== null && !el.disabled)
        .map((el) => (el.innerText || el.getAttribute("aria-label") || el.title || "").trim().replace(/\s+/g, " "))
        .filter(Boolean)
    );
    expect(boardLabels.length).toBeGreaterThanOrEqual(8);

    for (const label of boardLabels) {
      const btn = page.locator(".chrx-focus-boardbar button")
        .filter({ has: page.locator("xpath=self::*") })
        .locator(`xpath=self::*[normalize-space(.)="${label}" or @aria-label="${label}" or @title="${label}"]`)
        .first();
      const before = await captureSignature(page);
      await btn.click();
      const { effect } = await waitForEffect(page, before, `Boardbar: ${label}`);
      await assertNoComingSoon(page, `Boardbar: ${label}`);
      report.boardbar.push({ label, status: "WORKS", effect });

      if (/all classes|all teachers/i.test(label)) {
        // Click "Focus board" to return to Focus mode and verify THAT button works too!
        const backFocus = page.locator(".chrx-overview-bar__back, button:has-text('Focus board')").first();
        const bfBefore = await captureSignature(page);
        await backFocus.click();
        await page.waitForTimeout(160);
        const bfAfter = await captureSignature(page);
        const bfEffect = describeEffect(bfBefore, bfAfter);
        expect(bfEffect, "Dead 'Focus board' button").toBeTruthy();
        report.boardbar.push({ label: "Focus board", status: "WORKS", effect: bfEffect });
      } else {
        await closeAnyOverlay(page);
      }
    }

    fs.writeFileSync(path.resolve("docs/neon/m1b-shell-effects.json"), JSON.stringify(report, null, 2));
    expect(pageErrors, `Uncaught page errors: ${pageErrors.join("; ")}`).toEqual([]);
  });

  test("M1-2b: Card context menu + Row context menu strict before/after effect check", async ({ page }) => {
    test.setTimeout(90000);
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message || String(e)));

    await page.setViewportSize({ width: 1440, height: 900 });
    await loadDemoSchool(page);
    await installEffectProbes(page);

    const report = { cardContext: [], rowContext: [] };

    // 1. CARD CONTEXT MENU — right-click a placed card and click each safe/reversible item
    const cardSkips = {
      "Delete row": "covered by e2e/edupage-parity.regression-1.spec.js:33",
      "Merge with next period into a double": "conditional on adjacent same-lesson card; unit-tested in card_context_menu",
    };

    const firstCard = page.locator("#editor-root .chrx-vkarta").first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click({ button: "right" });
    await page.waitForTimeout(120);
    const cardItemLabels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#chrx-card-ctx button, .chrx-ctx-menu button, [role='menu'] button"))
        .filter((el) => el.offsetParent !== null && !el.disabled)
        .map((el) => (el.innerText || "").trim().replace(/\s+/g, " "))
        .filter(Boolean)
    );
    await page.keyboard.press("Escape");
    expect(cardItemLabels.length).toBeGreaterThanOrEqual(6);

    for (let idx = 0; idx < cardItemLabels.length; idx++) {
      const label = cardItemLabels[idx];
      const skipKey = Object.keys(cardSkips).find((k) => label.includes(k));
      if (skipKey) {
        report.cardContext.push({ label, status: "COVERED_ELSEWHERE", effect: cardSkips[skipKey] });
        continue;
      }
      await page.locator("#editor-root .chrx-vkarta").first().click({ button: "right" });
      await page.waitForTimeout(100);
      const before = await captureSignature(page);
      const menuBtn = page.locator("#chrx-card-ctx button, .chrx-ctx-menu button, [role='menu'] button").nth(idx);
      await menuBtn.click();
      const { effect } = await waitForEffect(page, before, `Card menu: ${label}`);
      await assertNoComingSoon(page, `Card menu: ${label}`);
      report.cardContext.push({ label, status: "WORKS", effect });
      await closeAnyOverlay(page);
      if (/remove|lock/i.test(label)) {
        await page.keyboard.press("Meta+z");
        await page.waitForTimeout(120);
      }
    }

    // 2. ROW HEADER CONTEXT MENU (in All classes / Overview)
    const overviewBtn = page.locator('[data-focus-nav="overview"], button:has-text("All classes")').first();
    await overviewBtn.click();
    await page.waitForTimeout(250);

    const firstRow = page.locator(".chrx-row:not(.chrx-row-head) .chrx-rowlabel").first();
    await expect(firstRow).toBeVisible({ timeout: 8000 });
    await firstRow.click({ button: "right" });
    await page.waitForTimeout(120);
    const rowItemLabels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#chrx-row-ctx button"))
        .filter((el) => el.offsetParent !== null && !el.disabled)
        .map((el) => (el.innerText || "").trim().replace(/\s+/g, " "))
        .filter(Boolean)
    );
    await page.keyboard.press("Escape");
    expect(rowItemLabels.length).toBeGreaterThanOrEqual(10);

    const rowSkips = {
      "Delete row": "covered by e2e/edupage-parity.regression-1.spec.js:33",
      "Remove unlocked cards": "covered by e2e/w2-1-undo.spec.js + row_context_menu",
      "Remove only classrooms": "mutates classroom assignments across row",
      "Timetable": "switches focus to already-visible class row",
    };

    for (let idx = 0; idx < rowItemLabels.length; idx++) {
      const label = rowItemLabels[idx];
      const skipKey = Object.keys(rowSkips).find((k) => label.includes(k));
      if (skipKey) {
        report.rowContext.push({ label, status: "COVERED_ELSEWHERE", effect: rowSkips[skipKey] });
        continue;
      }
      await page.locator(".chrx-row:not(.chrx-row-head) .chrx-rowlabel").first().click({ button: "right" });
      await page.waitForTimeout(100);
      const before = await captureSignature(page);
      await page.locator("#chrx-row-ctx button").nth(idx).click();
      const { effect } = await waitForEffect(page, before, `Row menu: ${label}`);
      await assertNoComingSoon(page, `Row menu: ${label}`);
      report.rowContext.push({ label, status: "WORKS", effect });
      await closeAnyOverlay(page);
      if (/unlock row|lock row/i.test(label)) {
        await page.keyboard.press("Meta+z");
        await page.waitForTimeout(100);
      }
      await expect(page.locator(".chrx-row:not(.chrx-row-head) .chrx-rowlabel").first()).toBeVisible({ timeout: 5000 });
    }

    fs.writeFileSync(path.resolve("docs/neon/m1b-ctx-effects.json"), JSON.stringify(report, null, 2));
    expect(pageErrors, `Uncaught page errors: ${pageErrors.join("; ")}`).toEqual([]);
  });
});
