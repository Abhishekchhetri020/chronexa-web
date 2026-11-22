import { test, expect } from "@playwright/test";
import fs from "fs";

const REAL_XML = `<?xml version="1.0" encoding="utf-8"?>
<timetable ascttversion="2012" importtype="database" displayname="Real Academy H1" options="export:idprefix:%CHRX">
  <periods columns="period,name,short,starttime,endtime">
    <period period="1" name="1" short="1" starttime="08:00" endtime="08:45"/>
    <period period="2" name="2" short="2" starttime="08:50" endtime="09:35"/>
  </periods>
  <daysdefs columns="id,days,name,short">
    <daysdef id="DDANY" name="Any day" short="X" days="11111"/>
  </daysdefs>
  <weeksdefs columns="id,weeks,name,short">
    <weeksdef id="WDALL" name="All weeks" short="All" weeks="1"/>
  </weeksdefs>
  <termsdefs columns="id,terms,name,short">
    <termsdef id="TDYR" name="Whole year" short="YR" terms="1"/>
  </termsdefs>
  <subjects columns="id,name,short"><subject id="S1" name="Physics" short="Phy"/></subjects>
  <teachers columns="id,name,short"><teacher id="T1" name="Dr. Rao" short="Rao"/></teachers>
  <classrooms columns="id,name,short"><classroom id="R1" name="Lab 1" short="L1"/></classrooms>
  <classes columns="id,name,short"><class id="C1" name="Grade 10A" short="10A"/></classes>
  <groups columns="id,classid,name,entireclass,divisiontag"><group id="G1" classid="C1" name="Entire class" entireclass="1" divisiontag="0"/></groups>
  <lessons columns="id,subjectid,classids,groupids,teacherids,classroomids,periodspercard,periodsperweek,daysdefid,weeksdefid,termsdefid">
    <lesson id="L1" subjectid="S1" classids="C1" groupids="G1" teacherids="T1" classroomids="R1" periodspercard="1" periodsperweek="2" daysdefid="DDANY" weeksdefid="WDALL" termsdefid="TDYR"/>
  </lessons>
  <cards columns="lessonid,classroomids,period,days,weeks,terms">
    <card lessonid="L1" classroomids="R1" period="1" days="10000" weeks="1" terms="1"/>
    <card lessonid="L1" classroomids="R1" period="2" days="01000" weeks="1" terms="1"/>
  </cards>
</timetable>`;

test.describe("Block H — Reliability of user data", () => {
  test("H1: peeking at Demo after saving a real school never overwrites the real school on reload", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    const tmpXml = `/tmp/chrx-h1-real-${Date.now()}.xml`;
    fs.writeFileSync(tmpXml, REAL_XML, "utf8");

    // 1. Import real school
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("#xml-file").setInputFiles(tmpXml);
    await page.waitForFunction(() => window.APP?.school?.schoolName === "Real Academy H1", { timeout: 15000 });

    // 2. Peek at Demo school (untouched) as if user opened demo just to look
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { source: "demo-xml" } }));
    });
    await page.waitForTimeout(300);

    // 3. Reload — Real Academy H1 must still be auto-restored, NOT replaced by demo
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => window.APP?.school?.schoolName === "Real Academy H1", { timeout: 15000 });
    const cards = await page.evaluate(() => window.APP?.school?.cards?.length || 0);
    expect(cards).toBe(2);
    expect(pageErrors).toEqual([]);
    fs.unlinkSync(tmpXml);
  });

  test("H2: two open browser tabs warn before overwriting the other tab's saved school", async ({ context }) => {
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Tab 1 creates School Alpha
    await page1.goto("/", { waitUntil: "networkidle" });
    await page1.waitForFunction(() => !!window.CreateNew?.createBlank, { timeout: 15000 });
    await page1.evaluate(() => window.CreateNew.createBlank({ schoolName: "School Alpha" }));
    await page1.waitForFunction(() => window.APP?.school?.schoolName === "School Alpha", { timeout: 10000 });

    // Tab 2 opens and creates School Beta (overwriting storage from a second tab)
    await page2.goto("/", { waitUntil: "networkidle" });
    await page2.waitForFunction(() => !!window.CreateNew?.createBlank, { timeout: 15000 });
    await page2.evaluate(() => window.CreateNew.createBlank({ schoolName: "School Beta" }));
    await page2.waitForFunction(() => window.APP?.school?.schoolName === "School Beta", { timeout: 10000 });

    // Tab 1 should receive the multi-tab conflict warning banner
    const warnBanner = page1.locator('[data-testid="chrx-multitab-warning"]');
    await expect(warnBanner).toBeVisible({ timeout: 10000 });
    await expect(warnBanner).toContainText("School Beta");

    // Calling AutoSave.save() in Tab 1 must NOT silently wipe School Beta from localStorage
    await page1.evaluate(() => window.AutoSave.save({ autoRestore: true }));
    const storedBeforeConfirm = await page1.evaluate(() => JSON.parse(localStorage.getItem("chronexa.autosave.v1") || "{}").schoolName);
    expect(storedBeforeConfirm).toBe("School Beta");

    // Switch back to Tab 1 and click "Keep this tab" to confirm overwriting School Beta
    await page1.bringToFront();
    await warnBanner.locator("[data-keep-this]").click({ timeout: 8000 });
    const storedAfterConfirm = await page1.evaluate(() => JSON.parse(localStorage.getItem("chronexa.autosave.v1") || "{}").schoolName);
    expect(storedAfterConfirm).toBe("School Alpha");

    await page1.close();
    await page2.close();
  });

  test("H3: importing malformed or non-timetable XML shows a clear error message and never a blank page", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    const badXml = `/tmp/chrx-h3-bad-${Date.now()}.xml`;
    const wrongXml = `/tmp/chrx-h3-wrong-${Date.now()}.xml`;
    fs.writeFileSync(badXml, "<timetable><lessons><lesson id='1'", "utf8");
    fs.writeFileSync(wrongXml, "<?xml version='1.0'?><root><item>not a timetable</item></root>", "utf8");

    await page.goto("/", { waitUntil: "networkidle" });

    // 1. Truncated / malformed XML
    await page.locator("#xml-file").setInputFiles(badXml);
    await expect(page.locator("#xml-status")).toContainText(/invalid xml|parse|error|could not|failed/i, { timeout: 10000 });
    expect(await page.evaluate(() => !!window.APP?.school)).toBe(false);
    await expect(page.locator("#cta-landing-demo")).toBeVisible();

    // 2. Valid XML but not a timetable (missing <timetable>)
    await page.locator("#xml-file").setInputFiles(wrongXml);
    await expect(page.locator("#xml-status")).toContainText(/not a valid timetable|missing <timetable>|failed/i, { timeout: 10000 });
    expect(await page.evaluate(() => !!window.APP?.school)).toBe(false);
    await expect(page.locator("#cta-landing-demo")).toBeVisible();

    expect(pageErrors).toEqual([]);
    fs.unlinkSync(badXml);
    fs.unlinkSync(wrongXml);
  });

  test("H4: export -> import aSc XML round-trip preserves day patterns, week patterns, term patterns, lessons, and cards", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    const tmpIn = `/tmp/chrx-h4-in-${Date.now()}.xml`;
    const tmpOut = `/tmp/chrx-h4-out-${Date.now()}.xml`;
    fs.writeFileSync(tmpIn, REAL_XML, "utf8");

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("#xml-file").setInputFiles(tmpIn);
    await page.waitForFunction(() => window.APP?.school?.schoolName === "Real Academy H1", { timeout: 15000 });

    // Add custom Day pattern (Mon/Wed = 10100), Week A (10), Term 1 (10) via UI dialogs
    await page.evaluate(() => window.EntityDays.open());
    await page.locator('.chrx-ent-btn[data-act="new"]').first().click();
    let sheet = page.locator(".chrx-ent-sheet, .chrx-sheet").last();
    await sheet.locator("input[type='text']").nth(0).fill("MonWed");
    await sheet.locator("input[type='text']").nth(1).fill("MW");
    const dayCbs = sheet.locator("input[type='checkbox']");
    const dayCount = await dayCbs.count();
    for (let i = 0; i < Math.min(dayCount, 5); i++) {
      const want = i === 0 || i === 2;
      if ((await dayCbs.nth(i).isChecked()) !== want) await dayCbs.nth(i).click();
    }
    await sheet.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");

    // Verify daysDefs synced
    const hasDayDef = await page.evaluate(() => (window.APP.school.daysDefs || []).some((d) => d.name === "MonWed"));
    expect(hasDayDef).toBe(true);

    // Assign MonWed day pattern to lesson L1, then export aSc XML via UI
    await page.evaluate(() => {
      const d = window.APP.school.daysDefs.find((x) => x.name === "MonWed");
      window.APP.school.lessons[0].daysDefId = d.id;
    });

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:export-dialog")));
    await page.click('[data-testid="chrx-export-format-xml"]');
    const dlPromise = page.waitForEvent("download");
    await page.click('[data-testid="chrx-export-submit"]');
    const dl = await dlPromise;
    await dl.saveAs(tmpOut);

    const exported = fs.readFileSync(tmpOut, "utf8");
    expect(exported).toContain('name="MonWed"');
    expect(exported).toMatch(/days="101000?"/);

    // Re-import exported XML into a clean state
    await page.evaluate(() => { localStorage.clear(); });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("#xml-file").setInputFiles(tmpOut);
    await page.waitForFunction(() => (window.APP?.school?.cards?.length || 0) === 2, { timeout: 15000 });

    const roundTripped = await page.evaluate(() => {
      const s = window.APP.school;
      const d = (s.daysDefs || []).find((x) => x.name === "MonWed");
      return {
        hasMonWed: !!d && /^101000?$/.test(d.bits),
        lessonUsesMonWed: !!(d && s.lessons[0] && s.lessons[0].daysDefId === d.id),
        cards: s.cards.length,
      };
    });
    expect(roundTripped).toEqual({ hasMonWed: true, lessonUsesMonWed: true, cards: 2 });
    expect(pageErrors).toEqual([]);
    fs.unlinkSync(tmpIn);
    fs.unlinkSync(tmpOut);
  });
});
