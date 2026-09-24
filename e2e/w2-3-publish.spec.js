import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDemoSchool } from "./helpers.js";

/* W2-3 · Publish dialog + single-file offline viewer (contract C2, writer side).
 *
 * Flows a user performs:
 *   1. Editor → sidebar "Publish timetable…" → dialog previews the edition counts
 *   2. Pick each edition → download the viewer file / the snapshot
 *   3. Open the downloaded .html from DISK (file://) on desktop and on a phone
 *      and see the timetable — with no network and no server.
 *
 * Review 1 rule: ONE renderer, W2-2's window.ChronexaViewer.render(rootEl,
 * snapshot). The offline file must therefore be verified with a STUBBED reader
 * (a test double injected before the page scripts) — this lane does not ship a
 * renderer of its own, and the missing-reader case must show a clear error.
 */

const DIALOG = '[data-testid="chrx-pub-dialog"]';
const COUNTS = '[data-testid="chrx-pub-counts"]';
const BTN_HTML = '[data-testid="chrx-pub-download-html"]';
const BTN_JSON = '[data-testid="chrx-pub-download-json"]';

/** Test double for W2-2's reader: records the call, paints a marker. */
const STUB_READER = () => {
  window.__readerCalls = [];
  window.ChronexaViewer = {
    css: ".chrx-pub-stub{display:block}",
    render: (rootEl, snapshot) => {
      window.__readerCalls.push({
        sameRoot: rootEl && rootEl.id === "chronexa-viewer-root",
        width: (rootEl && rootEl.clientWidth) || 0,
        edition: snapshot && snapshot.edition,
        lessons: snapshot && snapshot.lessons ? snapshot.lessons.length : -1,
        hasTeachers: !!(snapshot && snapshot.teachers),
        firstClass: snapshot && snapshot.classes && snapshot.classes[0] ? snapshot.classes[0].name : null,
      });
      const box = document.createElement("div");
      box.className = "chrx-pub-stub";
      box.setAttribute("data-rendered-by", "stub-reader");
      box.textContent = "reader: " + (snapshot && snapshot.edition);
      rootEl.appendChild(box);
    },
  };
};

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
  const staffTeachers = Number(countsText.match(/(\d+) teachers/)[1]);
  expect(staffTeachers).toBeGreaterThan(0);

  // Students edition keeps teacher names by default …
  await pickEdition(page, "students");
  expect(await page.locator(COUNTS).innerText()).toMatch(/\d+ teachers/);

  // … and the public edition promises none.
  await pickEdition(page, "public");
  const publicText = await page.locator(COUNTS).innerText();
  expect(publicText).toContain("no teacher names");
  expect(publicText).not.toMatch(/\d+ teachers/);

  // Teachers must not even be in the JSON of the public snapshot.
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
  expect(snap.lessons.every(l => l.classIds.length > 0)).toBe(true);
  for (const teacherName of realNames) {
    expect(text, `public snapshot must not name ${teacherName}`).not.toContain(
      String(teacherName).replace(/^(Mr|Ms|Mrs)\.\s*/i, "")
    );
  }
  // and the periods/breaks the school actually runs are in there
  expect(snap.periods.length).toBeGreaterThan(5);
  expect(snap.breaks.length).toBeGreaterThan(0);
  expect(snap.days.length).toBe(6);

  // The staff edition, by contrast, carries them.
  await pickEdition(page, "staff");
  const staff = JSON.parse((await download(page, BTN_JSON)).text);
  const allTeachers = await page.evaluate(() => (window.APP.school.teachers || []).length);
  expect(staff.teachers.length).toBe(allTeachers);
  expect(staff.lessons.some(l => l.teacherIds.length > 0)).toBe(true);
});

test("each edition downloads one self-contained .html that the stubbed reader paints from disk", async ({ page, context }) => {
  await loadDemoSchool(page);
  await openPublishDialog(page);

  const written = {};
  for (const edition of ["staff", "students", "public"]) {
    await pickEdition(page, edition);
    const file = await download(page, BTN_HTML);
    expect(file.name).toMatch(new RegExp(`-${edition}-timetable\\.html$`));

    // ONE file: no external script/stylesheet, no module scripts (file:// blocks them).
    expect(file.text.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(file.text).not.toMatch(/<script[^>]+src=/i);
    expect(file.text).not.toMatch(/<link[^>]+href=/i);
    expect(file.text).not.toContain('type="module"');
    expect(file.text).toContain('id="chronexa-snapshot"');

    // The inlined snapshot follows the edition's content rules.
    const json = file.text.match(/<script type="application\/json" id="chronexa-snapshot">([\s\S]*?)<\/script>/)[1];
    const snap = JSON.parse(json);
    expect(snap.edition).toBe(edition);
    if (edition === "public") {
      expect(snap.teachers).toBeUndefined();
      expect(json).not.toMatch(/teacherIds":\["/);
    } else {
      expect(snap.teachers.length).toBeGreaterThan(0);
    }
    written[edition] = file;
  }

  // --- the PUBLIC file, opened from disk on a desktop, read by the stub ------
  const desktop = await context.newPage();
  const netRequests = [];
  desktop.on("request", r => { if (/^https?:/i.test(r.url())) netRequests.push(r.url()); });
  await desktop.addInitScript(STUB_READER);
  await desktop.goto("file://" + asLocalHtml(written.public));
  await expect(desktop.locator("[data-rendered-by='stub-reader']")).toBeVisible();

  const call = (await desktop.evaluate(() => window.__readerCalls))[0];
  expect(call.sameRoot, "the reader must receive #chronexa-viewer-root").toBe(true);
  expect(call.edition).toBe("public");
  expect(call.hasTeachers).toBe(false);
  expect(call.lessons).toBeGreaterThan(100);
  expect(call.firstClass).toBeTruthy();
  expect(call.width).toBeGreaterThan(600);
  // the reader's stylesheet travelled inside the file
  const styleTags = desktop.locator("#chronexa-shared-viewer-style");
  await expect(styleTags).toHaveCount(1);
  // <style> has no rendered text, so read textContent (not innerText)
  expect(await styleTags.textContent()).toContain("chrx-pub-stub");
  expect(netRequests, "the published file must not fetch anything").toEqual([]);
  await desktop.close();

  // --- the STAFF file carries the teachers into the reader ------------------
  const staffPage = await context.newPage();
  await staffPage.addInitScript(STUB_READER);
  await staffPage.goto("file://" + asLocalHtml(written.staff));
  await expect(staffPage.locator("[data-rendered-by='stub-reader']")).toBeVisible();
  const staffCall = (await staffPage.evaluate(() => window.__readerCalls))[0];
  expect(staffCall.edition).toBe("staff");
  expect(staffCall.hasTeachers).toBe(true);
  await staffPage.close();
});

test("the published file works on a phone viewport (390px) and hands the reader a 390px root", async ({ page, context }) => {
  await loadDemoSchool(page);
  await openPublishDialog(page);
  await pickEdition(page, "students");
  const file = await download(page, BTN_HTML);

  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  const external = [];
  phone.on("request", r => { if (/^https?:/i.test(r.url())) external.push(r.url()); });
  await phone.addInitScript(STUB_READER);
  await phone.goto("file://" + asLocalHtml(file));

  await expect(phone.locator("[data-rendered-by='stub-reader']")).toBeVisible();
  const call = (await phone.evaluate(() => window.__readerCalls))[0];
  expect(call.edition).toBe("students");
  expect(call.hasTeachers).toBe(true);
  expect(call.width).toBeLessThanOrEqual(390);          // the reader lays out for the phone
  expect(call.width).toBeGreaterThan(200);
  expect(external, "offline: no http(s) requests").toEqual([]);

  // no horizontal overflow: the reader's root fits the phone width
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await phone.close();
});

test("without the reader bundle the file explains itself instead of showing a blank page", async ({ page, context }) => {
  await loadDemoSchool(page);
  await openPublishDialog(page);
  await pickEdition(page, "public");
  const file = await download(page, BTN_HTML);

  const bare = await context.newPage();          // no stub: no reader in the bundle either
  await bare.goto("file://" + asLocalHtml(file));
  const alert = bare.locator("[role='alert']");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/missing its timetable viewer/i);
  await expect(alert).toContainText(/re-publish/i);
  // never a second renderer: nothing timetable-shaped was drawn
  await expect(bare.locator("#chronexa-viewer-root table")).toHaveCount(0);
  await expect(bare.locator("[data-class-chip]")).toHaveCount(0);
  await bare.close();
});
