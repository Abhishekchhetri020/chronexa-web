import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";
import fs from "fs";

const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<timetable ascttversion="2012" importtype="database" options="export:idprefix:%CHRX">
  <periods columns="period,name,short,starttime,endtime">
    <period period="1" name="1" short="1" starttime="08:00" endtime="08:45"/>
    <period period="2" name="2" short="2" starttime="08:50" endtime="09:35"/>
  </periods>
  <daysdefs columns="id,days,name,short">
    <daysdef id="DDANY" name="Any day" short="X" days="11"/>
  </daysdefs>
  <weeksdefs columns="id,weeks,name,short">
    <weeksdef id="WDALL" name="All weeks" short="All" weeks="1"/>
  </weeksdefs>
  <termsdefs columns="id,terms,name,short">
    <termsdef id="TDYR" name="Whole year" short="YR" terms="1"/>
  </termsdefs>
  <subjects columns="id,name,short"><subject id="S1" name="Mathematics" short="Mat"/></subjects>
  <teachers columns="id,name,short"><teacher id="T1" name="Alice" short="Ali"/></teachers>
  <classrooms columns="id,name,short"><classroom id="R1" name="Room 1" short="R1"/></classrooms>
  <classes columns="id,name,short"><class id="C1" name="Class 1A" short="1A"/></classes>
  <groups columns="id,classid,name,entireclass,divisiontag"><group id="G1" classid="C1" name="Entire class" entireclass="1" divisiontag="0"/></groups>
  <lessons columns="id,subjectid,classids,groupids,teacherids,classroomids,periodspercard,periodsperweek,daysdefid,weeksdefid,termsdefid">
    <lesson id="L1" subjectid="S1" classids="C1" groupids="G1" teacherids="T1" classroomids="R1" periodspercard="1" periodsperweek="2" daysdefid="DDANY" weeksdefid="WDALL" termsdefid="TDYR"/>
  </lessons>
  <cards columns="lessonid,classroomids,period,days,weeks,terms">
    <card lessonid="L1" classroomids="R1" period="1" days="10" weeks="1" terms="1"/>
    <card lessonid="L1" classroomids="R1" period="2" days="01" weeks="1" terms="1"/>
  </cards>
</timetable>`;

test.describe("Block F regressions (F0 reload-after-import/create, E-02 non-negative soft penalties)", () => {
  test("F0: imported XML school survives immediate page reload with no edits", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    const tmpXml = `/tmp/chrx-f0-import-${Date.now()}.xml`;
    fs.writeFileSync(tmpXml, SAMPLE_XML, "utf8");

    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("#xml-file").setInputFiles(tmpXml);
    await page.locator("button.chrx-btn--primary", { hasText: "Generate" }).first().waitFor({ state: "visible", timeout: 20000 });

    const before = await page.evaluate(() => ({
      cards: window.APP?.school?.cards?.length || 0,
      lessons: window.APP?.school?.lessons?.length || 0,
      teachers: window.APP?.school?.teachers?.length || 0,
    }));
    expect(before.cards).toBe(2);

    // Reload immediately without making any edits
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => !!(window.APP && window.APP.school && window.APP.school.cards && window.APP.school.cards.length === 2), { timeout: 15000 });
    await expect(page.locator("button.chrx-btn--primary", { hasText: "Generate" }).first()).toBeVisible({ timeout: 15000 });

    const after = await page.evaluate(() => ({
      cards: window.APP?.school?.cards?.length || 0,
      lessons: window.APP?.school?.lessons?.length || 0,
      teachers: window.APP?.school?.teachers?.length || 0,
    }));
    expect(after).toEqual(before);
    expect(pageErrors).toEqual([]);
    fs.unlinkSync(tmpXml);
  });

  test("F0: newly created blank school survives immediate page reload with no edits", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForFunction(() => !!(window.CreateNew && typeof window.CreateNew.createBlank === "function"), { timeout: 15000 });
    await page.evaluate(() => window.CreateNew.createBlank({ schoolName: "F0 New School" }));
    await page.waitForFunction(() => window.APP?.school?.schoolName === "F0 New School", { timeout: 10000 });

    // Reload immediately without any edits
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => window.APP?.school?.schoolName === "F0 New School", { timeout: 15000 });
    expect(pageErrors).toEqual([]);
  });

  test("E-02: solver result panel displays non-negative soft penalties (>= 0, never leading minus)", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await loadDemoSchool(page);
    await page.locator("button.chrx-btn--primary", { hasText: "Generate" }).first().click();
    await page.locator(".chrx-preset-card", { hasText: /fast preview/i }).click();
    await page.locator("#csu-prelaunch-start").click();

    const softTile = page.locator(".csu-result .csu-result__tile").filter({ hasText: /soft penalties/i }).locator(".csu-result__num");
    await expect(softTile).toBeVisible({ timeout: 100000 });
    const rawText = ((await softTile.textContent()) || "").trim();
    expect(rawText, `soft penalties should never be negative: "${rawText}"`).not.toMatch(/^[-−]/);
    const num = parseInt(rawText.replace(/[^0-9]/g, ""), 10);
    expect(Number.isFinite(num) && num >= 0).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
