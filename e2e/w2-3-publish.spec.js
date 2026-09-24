import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDemoSchool } from "./helpers.js";

/* W2-3 · Publish dialog + published single-file viewer (contract C2, writer side).
 *
 * Review 2 acceptance (orchestrator): from the demo school, download each
 * edition's viewer file, open it via file:// in a desktop 1470x727 context and
 * an isMobile 390x844 context and require — no pageerror, a week grid (desktop)
 * / one-day view (phone) with lesson cells, multi-period lessons as rowspan
 * cells, and a public edition with no Teacher tab and no teacher names in the
 * DOM or in the file.
 *
 * ONE renderer (Review 1): the file draws with W2-2's window.ChronexaViewer.render
 * bundled into dist/viewer.js as a self-contained IIFE (Review 2 fix) — there is
 * no second renderer anywhere in this lane.
 */

const DIALOG = '[data-testid="chrx-pub-dialog"]';
const COUNTS = '[data-testid="chrx-pub-counts"]';
const BTN_HTML = '[data-testid="chrx-pub-download-html"]';
const BTN_JSON = '[data-testid="chrx-pub-download-json"]';

const DESKTOP = { viewport: { width: 1470, height: 727 } };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };

async function openPublishDialog(page) {
  const link = page.locator(".chrx-side-link", { hasText: "Publish timetable" });
  if (!(await link.first().isVisible().catch(() => false))) {
    const toggle = page.locator('[data-toggle="side"]');
    if (await toggle.count()) await toggle.first().click();
  }
  await link.first().click();
  await expect(page.locator(DIALOG)).toBeVisible();
}

async function pickEdition(page, edition) {
  await page.click(`[data-testid="chrx-pub-edition-${edition}"]`);
  await expect(page.locator(`[data-testid="chrx-pub-edition-${edition}"]`)).toBeChecked();
}

/** Chromium sniffs file:// by extension: Playwright's artifact path has none,
 *  so a published .html would render as plain text. Copy it out as .html. */
function asLocalHtml(file) {
  const dest = path.join(os.tmpdir(), `w2-3-${process.pid}-${path.basename(file.name)}`);
  fs.copyFileSync(file.path, dest);
  return dest;
}

/** Click a download button and return the file that landed on disk. */
async function download(page, testid) {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 45_000 }),
    page.click(testid),
  ]);
  const file = await dl.path();
  return { name: dl.suggestedFilename(), path: file, text: fs.readFileSync(file, "utf8") };
}

/** Download all three editions, checking the single-file + content rules. */
async function publishAllEditions(page) {
  await openPublishDialog(page);
  const out = {};
  for (const edition of ["staff", "students", "public"]) {
    await pickEdition(page, edition);
    const file = await download(page, BTN_HTML);
    expect(file.name).toMatch(new RegExp(`-${edition}-timetable\\.html$`));

    // ONE self-contained file: no external script/stylesheet, no module scripts,
    // and — the Review 2 bug — zero import/export statements in the bundle.
    expect(file.text.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(file.text).not.toMatch(/<script[^>]+src=/i);
    expect(file.text).not.toMatch(/<link[^>]+href=/i);
    expect(file.text).not.toContain('type="module"');
    expect(file.text).not.toMatch(/^\s*(import|export)[ {]/m);
    expect(file.text).toContain('id="chronexa-snapshot"');

    const json = file.text.match(/<script type="application\/json" id="chronexa-snapshot">([\s\S]*?)<\/script>/)[1];
    const snap = JSON.parse(json);
    expect(snap.edition).toBe(edition);
    if (edition === "public") {
      expect(snap.teachers).toBeUndefined();
      expect(json).not.toMatch(/teacherIds":\["/);
    } else {
      expect(snap.teachers.length).toBeGreaterThan(0);
    }
    out[edition] = { ...file, snapshot: snap, offline: asLocalHtml(file) };
  }
  return out;
}

test("publish dialog: reachable from the editor menu, previews each edition, exports a leak-free public snapshot", async ({ page }) => {
  await loadDemoSchool(page);

  // The ribbon's Files → Export menu is what the feature was specified against.
  const exportLabels = await page.evaluate(() => {
    const def = (window.APP.ribbon.menus || []).find(m => m.key === "files");
    const exp = def.build().find(e => e.label === "Export");
    return (exp.sub || []).map(s => s.label);
  });
  expect(exportLabels).toContain("Publish timetable…");

  await openPublishDialog(page);

  const countsText = await page.locator(COUNTS).innerText();
  expect(countsText).toMatch(/\d+ classes/);
  expect(countsText).toMatch(/\d+ teachers/);
  expect(countsText).toMatch(/\d+ lessons/);
  expect(Number(countsText.match(/(\d+) teachers/)[1])).toBeGreaterThan(0);

  await pickEdition(page, "students");
  expect(await page.locator(COUNTS).innerText()).toMatch(/\d+ teachers/);

  await pickEdition(page, "public");
  const publicText = await page.locator(COUNTS).innerText();
  expect(publicText).toContain("no teacher names");
  expect(publicText).not.toMatch(/\d+ teachers/);

  const realNames = await page.evaluate(() => (window.APP.school.teachers || []).map(t => t.name).filter(Boolean));
  expect(realNames.length).toBeGreaterThan(0);
  const { name, text } = await download(page, BTN_JSON);
  expect(name).toMatch(/-public\.json$/);
  const snap = JSON.parse(text);
  expect(snap.format).toBe("chronexa-published");
  expect(snap.version).toBe(1);
  expect(snap.edition).toBe("public");
  expect(snap.teachers).toBeUndefined();
  expect(snap.lessons.every(l => Array.isArray(l.teacherIds) && l.teacherIds.length === 0)).toBe(true);
  expect(snap.lessons.length).toBeGreaterThan(100);
  for (const teacherName of realNames) {
    expect(text, `public snapshot must not name ${teacherName}`).not.toContain(
      String(teacherName).replace(/^(Mr|Ms|Mrs)\.\s*/i, "")
    );
  }
  expect(snap.periods.length).toBeGreaterThan(5);
  expect(snap.breaks.length).toBeGreaterThan(0);
  expect(snap.days.length).toBe(6);

  await pickEdition(page, "staff");
  const staff = JSON.parse((await download(page, BTN_JSON)).text);
  const allTeachers = await page.evaluate(() => (window.APP.school.teachers || []).length);
  expect(staff.teachers.length).toBe(allTeachers);
  expect(staff.lessons.some(l => l.teacherIds.length > 0)).toBe(true);
});

test("ACCEPTANCE desktop 1470x727: every edition's viewer file opens from file:// and renders the week grid", async ({ page, browser }) => {
  await loadDemoSchool(page);
  const files = await publishAllEditions(page);

  for (const edition of ["staff", "students", "public"]) {
    const ctx = await browser.newContext(DESKTOP);
    const view = await ctx.newPage();
    const errors = [];
    view.on("pageerror", e => errors.push(e.message));
    const netRequests = [];
    view.on("request", r => { if (/^https?:/i.test(r.url())) netRequests.push(r.url()); });

    await view.goto("file://" + files[edition].offline);
    await expect(view.locator(".chrx-pub-grid")).toBeVisible();

    // lesson cells in the week grid …
    const cells = view.locator(".chrx-pub-grid-slot .chrx-pub-cell");
    expect(await cells.count(), `${edition}: week grid lesson cells`).toBeGreaterThan(20);
    await expect(cells.first()).not.toBeEmpty();

    // … multi-period lessons as rowspan cells (never extra cells)
    expect(await view.locator(".chrx-pub-grid-slot[rowspan]").count(),
      `${edition}: multi-period lessons use rowspan`).toBeGreaterThan(0);

    // the day view is the phone layout, so it must be hidden here
    await expect(view.locator(".chrx-pub-day.is-active")).toBeHidden();

    // header meta says which edition this is
    await expect(view.locator(".chrx-pub-head")).toContainText(new RegExp(`${edition} edition`, "i"));

    // public: no teacher affordance, no teacher name anywhere
    if (edition === "public") {
      expect(await view.locator('[data-pub-view="teacher"]').count()).toBe(0);
      const domNames = await page.evaluate(() => (window.APP.school.teachers || []).map(t => t.name));
      const text = await view.locator("body").innerText();
      for (const n of domNames) {
        for (const token of String(n).split(/\s+/).filter(w => w.length > 3 && !/^M[rs]\.?$/i.test(w))) {
          expect(text, `public DOM must not name ${token}`).not.toContain(token);
        }
      }
    } else {
      expect(await view.locator('[data-pub-view="teacher"]').count()).toBeGreaterThan(0);
    }

    expect(errors, `${edition}: no pageerror in the published file`).toEqual([]);
    expect(netRequests, `${edition}: offline, no http(s) requests`).toEqual([]);
    await ctx.close();
  }
});

test("ACCEPTANCE phone 390x844 (isMobile): the same files render a one-day view", async ({ page, browser }) => {
  await loadDemoSchool(page);
  const files = await publishAllEditions(page);

  for (const edition of ["staff", "students", "public"]) {
    const ctx = await browser.newContext(PHONE);
    const view = await ctx.newPage();
    const errors = [];
    view.on("pageerror", e => errors.push(e.message));
    const netRequests = [];
    view.on("request", r => { if (/^https?:/i.test(r.url())) netRequests.push(r.url()); });

    await view.goto("file://" + files[edition].offline);

    // phone layout: one day visible, day tabs usable, week grid hidden
    await expect(view.locator(".chrx-pub-daytabs")).toBeVisible();
    await expect(view.locator(".chrx-pub-day.is-active")).toBeVisible();
    await expect(view.locator(".chrx-pub-grid-wrap")).toBeHidden();
    await expect(view.locator(".chrx-pub-day.is-active .chrx-pub-cell").first()).not.toBeEmpty();
    expect(await view.locator(".chrx-pub-day.is-active .chrx-pub-cell").count(),
      `${edition}: day-view lesson cells`).toBeGreaterThan(0);
    expect(await view.locator(".chrx-pub-day:visible").count()).toBe(1);

    // tapping another day switches the office day without errors
    const tabs = view.locator(".chrx-pub-daytab");
    expect(await tabs.count()).toBe(6);
    await tabs.nth(1).click();
    await expect(view.locator(".chrx-pub-day.is-active .chrx-pub-cell").first()).toBeVisible();

    if (edition === "public") {
      expect(await view.locator('[data-pub-view="teacher"]').count()).toBe(0);
    }
    expect(errors, `${edition}: no pageerror on the phone view`).toEqual([]);
    expect(netRequests).toEqual([]);
    await ctx.close();
  }
});

test("a damaged file explains itself instead of showing a blank page", async ({ page, context }) => {
  await loadDemoSchool(page);
  await openPublishDialog(page);
  await pickEdition(page, "public");

  // Publish a real file, then strip the reader the way a truncated/mangled file
  // would be missing it: the loader (which travels in the same bundle) must say
  // so instead of leaving a blank page.
  const file = await download(page, BTN_HTML);
  const damaged = file.text.replace("</body>", "<script>delete window.ChronexaViewer;</script></body>");
  expect(damaged).not.toBe(file.text);
  const dest = path.join(os.tmpdir(), `w2-3-damaged-${process.pid}.html`);
  fs.writeFileSync(dest, damaged);

  const bare = await context.newPage();
  const errors = [];
  bare.on("pageerror", e => errors.push(e.message));
  await bare.goto("file://" + dest);
  const alert = bare.locator("[role='alert']");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/missing its timetable viewer/i);
  await expect(bare.locator("#chronexa-viewer-root .chrx-pub-grid")).toHaveCount(0);
  expect(errors).toEqual([]);
  await bare.close();
});
