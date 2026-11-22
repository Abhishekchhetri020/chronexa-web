import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { loadDemoSchool } from "./helpers.js";

const staffSnap = JSON.parse(
  readFileSync(new URL("../tests/fixtures/published/staff.json", import.meta.url))
);

const TINY_SCHOOL_XML = `<?xml version="1.0" encoding="utf-8"?>
<timetable ascttversion="2024.1" importtype="database" options="export:idprefix:%CHRX" defaultexport="1" displayname="aSc Timetables 2024" displaycountries="">
  <periods options="canadd,export:silent" columns="period,name,short,starttime,endtime">
    <period name="1" short="1" period="1" starttime="08:00" endtime="08:45"/>
    <period name="2" short="2" period="2" starttime="08:50" endtime="09:35"/>
    <period name="3" short="3" period="3" starttime="09:40" endtime="10:25"/>
  </periods>
  <daysdefs options="canadd,export:silent" columns="id,days,name,short">
    <daysdef id="D1" name="Every day" short="X" days="11111"/>
  </daysdefs>
  <weeksdefs options="canadd,export:silent" columns="id,weeks,name,short">
    <weeksdef id="W1" name="All weeks" short="All" weeks="1"/>
  </weeksdefs>
  <termsdefs options="canadd,export:silent" columns="id,terms,name,short">
    <termsdef id="T1" name="All year" short="AY" terms="1"/>
  </termsdefs>
  <subjects options="canadd,export:silent" columns="id,name,short">
    <subject id="S1" name="Mathematics" short="Math"/>
    <subject id="S2" name="English" short="Eng"/>
  </subjects>
  <teachers options="canadd,export:silent" columns="id,name,short">
    <teacher id="TR1" name="Alice Smith" short="AS"/>
    <teacher id="TR2" name="Bob Jones" short="BJ"/>
  </teachers>
  <classes options="canadd,export:silent" columns="id,name,short">
    <class id="C1" name="Grade 1A" short="1A"/>
  </classes>
  <classrooms options="canadd,export:silent" columns="id,name,short">
    <classroom id="R1" name="Room 101" short="101"/>
  </classrooms>
  <groups options="canadd,export:silent" columns="id,classid,name,entireclass,divisiontag">
    <group id="G1" classid="C1" name="Entire class" entireclass="1" divisiontag="0"/>
  </groups>
  <lessons options="canadd,export:silent" columns="id,classids,subjectid,periodspercard,periodsperweek,teacherids,classroomids,groupids,daysdefid,weeksdefid,termsdefid">
    <lesson id="L1" classids="C1" subjectid="S1" periodspercard="1" periodsperweek="2" teacherids="TR1" classroomids="R1" groupids="G1" daysdefid="D1" weeksdefid="W1" termsdefid="T1"/>
    <lesson id="L2" classids="C1" subjectid="S2" periodspercard="1" periodsperweek="2" teacherids="TR2" classroomids="R1" groupids="G1" daysdefid="D1" weeksdefid="W1" termsdefid="T1"/>
  </lessons>
  <cards options="canadd,export:silent" columns="lessonid,period,days,weeks,terms,classroomids"/>
</timetable>`;

async function runAxe(page, surfaceName) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const severe = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );
  if (severe.length > 0) {
    console.log(`\n=== AXE [${surfaceName}] (${severe.length} critical/serious) ===`);
    for (const v of severe) {
      const sample = v.nodes.slice(0, 3).map((n) => ({
        target: n.target.join(" "),
        html: (n.html || "").slice(0, 140),
        summary: (n.failureSummary || "").replace(/\s+/g, " ").slice(0, 160),
      }));
      console.log(
        `  [${v.impact.toUpperCase()}] ${v.id} (${v.nodes.length} nodes): ${v.help}\n    ` +
          sample.map((s) => `${s.target} :: ${s.html} :: ${s.summary}`).join("\n    ")
      );
    }
  } else {
    console.log(`\n=== AXE [${surfaceName}] 0 critical/serious ===`);
  }
  return severe;
}

test.describe("Block I — Accessibility, keyboard flow & 390px dialogs", () => {
  test("I1: zero critical/serious axe-core violations on all 6 surfaces", async ({ page }) => {
    test.setTimeout(120_000);
    const report = {};

    await page.emulateMedia({ reducedMotion: "reduce" });
    // 1. Start screen
    await page.goto("/");
    await expect(page.locator("#chrx-hero-title")).toBeVisible({ timeout: 15_000 });
    report.startScreen = await runAxe(page, "Start screen");

    // 2. Editor
    await loadDemoSchool(page);
    await expect(page.locator("#editor-root .chrx-vkarta").first()).toBeVisible({ timeout: 15_000 });
    report.editor = await runAxe(page, "Editor");

    // 3. Lesson dialog
    await page.evaluate(() => {
      const lesson = window.APP?.school?.lessons?.[0];
      if (lesson && window.EntityLessons?.open) {
        window.EntityLessons.open({ focusLessonId: lesson.id });
      }
    });
    await expect(page.locator(".chrx-ent-sheet").first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(200);
    report.lessonDialog = await runAxe(page, "Lesson dialog");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);

    // 4. Print preview
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:print-preview")));
    await expect(page.locator(".chrx-preview-controls")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(200);
    report.printPreview = await runAxe(page, "Print preview");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:preview-close")));
    await page.waitForTimeout(200);

    // 5. Substitutions
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:substitutions")));
    await expect(page.locator(".chrx-sub-dialog")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(200);
    report.substitutions = await runAxe(page, "Substitutions");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);

    // 6. Published viewer
    const json = JSON.stringify(staffSnap).replace(/</g, "\\u003c");
    await page.route(/view=published/, async (route) => {
      const req = route.request();
      if (!req.isNavigationRequest()) return route.continue();
      const resp = await route.fetch();
      const body = (await resp.text()).replace(
        "</head>",
        `<script type="application/json" id="chronexa-snapshot">${json}</script></head>`
      );
      await route.fulfill({ response: resp, body });
    });
    await page.goto("/?view=published");
    await page.locator("#viewer-root > *").first().waitFor({ timeout: 30_000 });
    report.publishedViewer = await runAxe(page, "Published viewer");

    const total = Object.values(report).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(0);
  });

  test("I2: 390px mobile pass for every major dialog", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await loadDemoSchool(page);

    const openEntity = (kind) => window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind } }));

    const dialogsToCheck = [
      { name: "Generate", open: () => window.dispatchEvent(new CustomEvent("app:generate")) },
      { name: "Export", open: () => window.dispatchEvent(new CustomEvent("app:export-dialog")) },
      { name: "SchoolSettings", open: openEntity, arg: "school" },
      { name: "Teachers", open: openEntity, arg: "teachers" },
      { name: "Classes", open: openEntity, arg: "classes" },
      { name: "Subjects", open: openEntity, arg: "subjects" },
      { name: "Rooms", open: openEntity, arg: "classrooms" },
      { name: "Days", open: openEntity, arg: "days" },
      { name: "Weeks", open: openEntity, arg: "weeks" },
      { name: "Terms", open: openEntity, arg: "terms" },
      { name: "Lesson", open: () => { const l = window.APP?.school?.lessons?.[0]; if (l) window.EntityLessons?.open({ focusLessonId: l.id }); } },
      { name: "PrintPreview", open: () => window.dispatchEvent(new CustomEvent("app:print-preview")) },
      { name: "Substitutions", open: () => window.dispatchEvent(new CustomEvent("app:substitutions")) },
    ];

    const issues = [];
    for (const d of dialogsToCheck) {
      await page.evaluate(d.open, d.arg);
      await page.waitForTimeout(300);

      const metrics = await page.evaluate(() => {
        const docOverflow = document.documentElement.scrollWidth - window.innerWidth;
        const sel = [
          "dialog[open]",
          ".chrx-modal",
          ".chrx-dlg",
          ".chrx-ent-dialog",
          ".chrx-ent-sheet",
          ".chrx-sub-dialog",
          ".chrx-preview-overlay.is-open",
          ".csu-dialog",
          ".chrx-export-dialog",
          "[role='dialog']",
        ].join(",");
        const openModals = Array.from(document.querySelectorAll(sel))
          .filter((el) => {
            const st = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return st.display !== "none" && st.visibility !== "hidden" && r.width > 0 && r.height > 0;
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              id: el.id || (el.className || "").toString().slice(0, 40),
              w: Math.round(r.width),
              right: Math.round(r.right),
              left: Math.round(r.left),
            };
          });
        return { docOverflow, openModals };
      });

      console.log(`[390px ${d.name}] docOverflow=${metrics.docOverflow}`, JSON.stringify(metrics.openModals));
      if (metrics.openModals.length === 0) issues.push(`${d.name}: dialog did not open`);
      if (metrics.docOverflow > 2) issues.push(`${d.name}: docOverflow=${metrics.docOverflow}`);
      for (const m of metrics.openModals) {
        if (m.right > 392) issues.push(`${d.name} (${m.id}): right=${m.right} > 390`);
        if (m.left < -2) issues.push(`${d.name} (${m.id}): left=${m.left} < 0`);
      }

      if (d.name === "PrintPreview") {
        await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:preview-close")));
      } else {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(150);
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(150);
    }
    expect(issues).toEqual([]);
  });

  test("I3: keyboard-only path through Generate -> Print (zero mouse clicks)", async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      window.__printCalls = 0;
      window.print = () => { window.__printCalls += 1; };
    });

    // Import tiny 4-card school cleanly
    await page.goto("/");
    await page.waitForFunction(() => window.APP && window.SolverUI && window.Editor);
    await page.locator("#xml-file").setInputFiles({
      name: "tiny-kbd.xml",
      mimeType: "text/xml",
      buffer: Buffer.from(TINY_SCHOOL_XML, "utf8"),
    });
    await page.waitForFunction(() => (window.APP?.school?.lessons?.length || 0) === 2, null, { timeout: 15_000 });

    // Blur any active input so keyboard shortcuts act on the app shell
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });

    // 1. Open Generate dialog via keyboard shortcut (Control+g)
    await page.keyboard.press("Control+g");
    await expect(page.locator("#csu-prelaunch-start")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#csu-prelaunch-start")).toBeFocused({ timeout: 5_000 });

    // 2. Press Enter to start generation
    await page.keyboard.press("Enter");

    // 3. Wait for solver result panel Apply button to appear and receive focus
    await expect(page.locator("#csu-result-apply")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#csu-result-apply")).toBeFocused({ timeout: 5_000 });

    // 4. Press Enter to apply the generated timetable
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => (window.APP?.school?.cards?.length || 0) >= 4,
      null,
      { timeout: 10_000 }
    );

    // 5. Open Print Preview via keyboard shortcut (Control+p)
    await page.keyboard.press("Control+p");
    await expect(page.locator(".chrx-preview-overlay.is-open")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".chrx-preview-doc .chrx-preview-page").first()).toBeVisible({ timeout: 15_000 });

    // 6. Trigger Print via keyboard shortcut (Control+p inside Print Preview)
    await page.keyboard.press("Control+p");
    await expect
      .poll(async () => page.evaluate(() => window.__printCalls), { timeout: 10_000 })
      .toBeGreaterThan(0);

    // 7. Close Print Preview via Escape
    await page.keyboard.press("Escape");
    await expect(page.locator(".chrx-preview-overlay.is-open")).toBeHidden({ timeout: 5_000 });
  });
});
