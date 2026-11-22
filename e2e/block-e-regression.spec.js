import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";
import fs from "fs";

test.describe("Block E regressions (E-03 weeks/terms UI sync + XML round-trip, E-04 390px entity dialogs)", () => {
  test("E-03: Week A/B & Term 1/2 created in UI dialogs sync weeksDefs/termsDefs, work in grid filter, and survive aSc XML round-trip", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await loadDemoSchool(page);

    async function addBitmaskPattern(name, shortName, bits) {
      await page.locator('.chrx-ent-btn[data-act="new"]').first().click();
      const sheet = page.locator(".chrx-ent-sheet, .chrx-sheet").last();
      await expect(sheet).toBeVisible();
      const inputs = sheet.locator("input[type='text']");
      await inputs.nth(0).fill(name);
      await inputs.nth(1).fill(shortName);
      const numSel = sheet.locator("select, input[type='number']").first();
      if (await numSel.isVisible().catch(() => false)) {
        const tag = await numSel.evaluate((el) => el.tagName);
        if (tag === "SELECT") await numSel.selectOption(String(bits.length));
        else await numSel.fill(String(bits.length));
      }
      const cbs = sheet.locator("input[type='checkbox']");
      const cbCount = await cbs.count();
      for (let i = 0; i < Math.min(cbCount, bits.length); i++) {
        const want = bits[i] === "1";
        const isChecked = await cbs.nth(i).isChecked();
        if (want !== isChecked) await cbs.nth(i).click();
      }
      await sheet.locator('button[type="submit"]').first().click();
      await page.waitForTimeout(200);
    }

    // 1. Create Week A (10) & Week B (01) via Weeks dialog
    await page.evaluate(() => window.EntityWeeks.open());
    await addBitmaskPattern("Week A", "WA", "10");
    await addBitmaskPattern("Week B", "WB", "01");
    await page.keyboard.press("Escape");

    // 2. Create Term 1 (10) & Term 2 (01) via Terms dialog
    await page.evaluate(() => window.EntityTerms.open());
    await addBitmaskPattern("Term 1", "T1", "10");
    await addBitmaskPattern("Term 2", "T2", "01");
    await page.keyboard.press("Escape");

    // Verify weeksDefs & termsDefs stayed in sync with weeks & terms
    const synced = await page.evaluate(() => {
      const s = window.APP.school;
      return {
        wkDefNames: (s.weeksDefs || []).map((w) => `${w.name}:${w.bits}`),
        tmDefNames: (s.termsDefs || []).map((t) => `${t.name}:${t.bits}`),
      };
    });
    expect(synced.wkDefNames).toContain("Week A:10");
    expect(synced.wkDefNames).toContain("Week B:01");
    expect(synced.tmDefNames).toContain("Term 1:10");
    expect(synced.tmDefNames).toContain("Term 2:01");

    // 3. Assign Week A + Term 1 to first row in Lessons dialog
    await page.evaluate(() => window.EntityLessons.open());
    await page.locator(".chrx-ent-tr").first().click();
    await page.locator('.chrx-ent-btn[data-act="edit"]').first().click();
    const sheet = page.locator(".chrx-ent-sheet, .chrx-sheet").last();
    const selects = sheet.locator("select");
    const n = await selects.count();
    let setW = false, setT = false;
    for (let i = 0; i < n; i++) {
      const opts = await selects.nth(i).locator("option").allTextContents();
      if (!setW && opts.some((o) => o.includes("Week A"))) {
        await selects.nth(i).selectOption({ label: opts.find((o) => o.includes("Week A")) });
        setW = true;
      } else if (!setT && opts.some((o) => o.includes("Term 1"))) {
        await selects.nth(i).selectOption({ label: opts.find((o) => o.includes("Term 1")) });
        setT = true;
      }
    }
    expect(setW).toBe(true);
    expect(setT).toBe(true);
    await sheet.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");

    // 4. Grid week/term filter exposes Week A and updates label
    const filterBtn = page.locator("#editor-view-filter");
    await filterBtn.click();
    const vfPanel = page.locator(".chrx-view-filter-panel");
    await expect(vfPanel).toBeVisible();
    const wkOpts = await vfPanel.locator("#chrx-vf-week option").allTextContents();
    const wkALabel = wkOpts.find((o) => o.includes("Week A"));
    expect(wkALabel, "Week A should appear in #chrx-vf-week dropdown").toBeTruthy();
    await vfPanel.locator("#chrx-vf-week").selectOption({ label: wkALabel });
    await expect(filterBtn).toContainText(/Week A|WA/i);
    await page.keyboard.press("Escape");

    // 5. Export to aSc XML via UI and re-import — weeks/terms & lesson assignment survive
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:export-dialog")));
    await page.click('[data-testid="chrx-export-format-xml"]');
    const dlPromise = page.waitForEvent("download");
    await page.click('[data-testid="chrx-export-submit"]');
    const dl = await dlPromise;
    const tmpXml = `/tmp/chrx-e03-roundtrip-${Date.now()}.xml`;
    await dl.saveAs(tmpXml);
    const xmlContent = fs.readFileSync(tmpXml, "utf8");
    expect(xmlContent).toContain('name="Week A"');
    expect(xmlContent).toContain('weeks="10"');
    expect(xmlContent).toContain('name="Term 1"');
    expect(xmlContent).toContain('terms="10"');

    // Re-import into fresh page
    await page.evaluate(() => localStorage.clear());
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator("#xml-file").setInputFiles(tmpXml);
    await page.locator("button.chrx-btn--primary", { hasText: "Generate" }).first().waitFor({ state: "visible", timeout: 20000 });
    const reimported = await page.evaluate(() => {
      const s = window.APP.school;
      const wkA = (s.weeksDefs || []).find((w) => w.name === "Week A");
      const tm1 = (s.termsDefs || []).find((t) => t.name === "Term 1");
      return {
        hasWkA: !!wkA && wkA.bits === "10",
        hasTm1: !!tm1 && tm1.bits === "10",
        matchedLesson: (s.lessons || []).some((l) => wkA && tm1 && l.weeksDefId === wkA.id && l.termsDefId === tm1.id),
      };
    });
    expect(reimported.hasWkA).toBe(true);
    expect(reimported.hasTm1).toBe(true);
    expect(reimported.matchedLesson).toBe(true);
    expect(pageErrors).toEqual([]);
    fs.unlinkSync(tmpXml);
  });

  test("E-04: Entity dialogs have zero horizontal overflow at 390px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadDemoSchool(page);

    for (const globalName of ["EntityClasses", "EntityWeeks", "EntityTerms", "EntityLessons"]) {
      await page.evaluate((g) => window[g].open(), globalName);
      await page.waitForTimeout(200);
      const ov = await page.evaluate(() => {
        const cw = document.documentElement.clientWidth;
        const culprits = [];
        for (const el of document.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > cw + 4) {
            culprits.push(`${el.tagName}.${(el.className || "").toString().slice(0,40)} right=${Math.round(r.right)}`);
            if (culprits.length >= 6) break;
          }
        }
        return { scrollW: document.documentElement.scrollWidth, clientW: cw, culprits };
      });
      expect(ov.scrollW, `${globalName} overflow culprits: ${ov.culprits.join("; ")}`).toBeLessThanOrEqual(ov.clientW + 4);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
    }
  });
});
