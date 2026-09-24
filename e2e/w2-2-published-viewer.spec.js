import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const staff = JSON.parse(readFileSync(new URL("../tests/fixtures/published/staff.json", import.meta.url)));
const students = JSON.parse(readFileSync(new URL("../tests/fixtures/published/students.json", import.meta.url)));
const pub = JSON.parse(readFileSync(new URL("../tests/fixtures/published/public.json", import.meta.url)));

/**
 * Serve the app shell with a snapshot inlined as
 * <script type="application/json" id="chronexa-snapshot"> (contract C2a),
 * then navigate to the published viewer.
 */
async function gotoWithInline(page, snap, query = "/?view=published") {
  const json = JSON.stringify(snap).replace(/</g, "\\u003c");
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
  await page.goto(query);
  await page.locator("#viewer-root > *").first().waitFor({ timeout: 30_000 });
}

/**
 * Review-1 guard: toBeVisible does not detect occlusion, so assert what the
 * user actually sees — the viewport centre must hit the viewer (not the
 * landing hero), the hero title must be hidden, and the landing body class
 * must be gone.
 */
async function assertViewerOwnsScreen(page) {
  await expect(page.locator("#chrx-hero-title")).toBeHidden();
  expect(
    await page.evaluate(() => document.body.classList.contains("chrx-landing-active"))
  ).toBe(false);
  expect(
    await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      const root = document.getElementById("viewer-root");
      return !!(el && root && root.contains(el));
    })
  ).toBe(true);
}

test("staff snapshot via inlined JSON renders the week grid with break bands", async ({ page }) => {
  await gotoWithInline(page, staff);
  await assertViewerOwnsScreen(page);
  await expect(page.locator(".chrx-pub h1").first()).toHaveText(/Demo High School/);
  expect(await page.locator(".chrx-pub-day").count()).toBe(5);
  await expect(page.locator(".chrx-pub-break").first()).toContainText(/Recess/);
  await expect(page.locator(".chrx-pub").first()).toContainText(/Mathematics/);
  // teacher view exists when the snapshot carries teachers
  await expect(page.locator('[data-pub-view="teacher"]')).toBeVisible();
  await expect(page.locator('[data-pub-view="classroom"]')).toBeVisible();
  // changes exist → date picker shown
  await expect(page.locator('input[type="date"].chrx-pub-date')).toBeVisible();
  // print affordance
  await expect(page.locator(".chrx-pub-print")).toBeVisible();
});

test("snapshot via &src renders the same grid", async ({ page }) => {
  // NOTE: the glob also matches the navigation URL (it ends with the same
  // path), so only fulfill the sub-resource fetch, never the document.
  await page.route("**/pub-fixture-staff.json", (route) => {
    if (route.request().isNavigationRequest()) return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(staff) });
  });
  await page.goto("/?view=published&src=/pub-fixture-staff.json");
  await page.locator("#viewer-root > *").first().waitFor({ timeout: 30_000 });
  await assertViewerOwnsScreen(page);
  await expect(page.locator(".chrx-pub h1").first()).toHaveText(/Demo High School/);
  expect(await page.locator(".chrx-pub-day").count()).toBe(5);
  await expect(page.locator(".chrx-pub").first()).toContainText(/Mathematics/);
});

test("snapshot via &src with an ABSOLUTE same-origin URL renders the grid", async ({ page }) => {
  const port = Number(process.env.E2E_PORT || 4173);
  const abs = `http://localhost:${port}/pub-fixture-staff.json`;
  await page.route("**/pub-fixture-staff.json", (route) => {
    if (route.request().isNavigationRequest()) return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(staff) });
  });
  await page.goto(`/?view=published&src=${encodeURIComponent(abs)}`);
  await page.locator("#viewer-root > *").first().waitFor({ timeout: 30_000 });
  await assertViewerOwnsScreen(page);
  await expect(page.locator(".chrx-pub h1").first()).toHaveText(/Demo High School/);
  expect(await page.locator(".chrx-pub-day").count()).toBe(5);
  await expect(page.locator(".chrx-pub").first()).toContainText(/Mathematics/);
});

test("public edition hides the teacher view and all teacher names", async ({ page }) => {
  await gotoWithInline(page, pub);
  await expect(page.locator(".chrx-pub h1").first()).toHaveText(/Demo High School/);
  expect(await page.locator('[data-pub-view="teacher"]').count()).toBe(0);
  await expect(page.locator(".chrx-pub").first()).not.toContainText(/Sushmita/);
  await expect(page.locator(".chrx-pub").first()).not.toContainText(/Ravi/);
  // class content still renders
  await expect(page.locator(".chrx-pub").first()).toContainText(/Mathematics/);
});

test("published viewer is read-only: no editor affordances reachable", async ({ page }) => {
  await gotoWithInline(page, staff);
  // no editor cards, nothing draggable
  expect(await page.locator(".chrx-vkarta").count()).toBe(0);
  expect(await page.locator('#viewer-root [draggable="true"]').count()).toBe(0);
  // editor chrome hidden: Generate/Test, ribbon, step nav
  await expect(page.locator("#cta-generate")).toBeHidden();
  await expect(page.locator("#cta-test")).toBeHidden();
  await expect(page.locator("#chrx-ribbon")).toBeHidden();
  // the editor never booted: no school loaded into APP
  expect(await page.evaluate(() => !!(window.APP && window.APP.school))).toBe(false);
  // right-clicking a cell opens no editor context menu (grid holds the
  // visible cells on desktop; the phone day-list is display:none there)
  await page.locator(".chrx-pub-grid .chrx-pub-cell").first().click({ button: "right" });
  await page.waitForTimeout(400);
  expect(await page.locator("#chrx-card-ctx").count()).toBe(0);
});

test("picking a change date overlays substitutions (struck-through + substitute)", async ({ page }) => {
  await gotoWithInline(page, staff);
  await page.locator('input[type="date"].chrx-pub-date').fill("2026-09-25");
  // Friday VI A: absent Mr. Ravi struck through, Ms. Sushmita covers
  const struck = page.locator(".chrx-pub-sub-orig").first();
  await expect(struck).toContainText(/Mr. Ravi/);
  await expect(page.locator(".chrx-pub").first()).toContainText(/Ms. Sushmita/);
  // Thursday VI B: lesson cancelled
  await page.locator(".chrx-pub-entity").selectOption("c2");
  await expect(page.locator(".chrx-pub").first()).toContainText(/Cancelled/);
});

test("invalid snapshot shows a clear error, never a blank page", async ({ page }) => {
  const bad = { ...staff, version: 99 };
  await gotoWithInline(page, bad);
  const alert = page.locator('#viewer-root [role="alert"]');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/version/i);
});

test("no snapshot source shows a file picker", async ({ page }) => {
  await page.goto("/?view=published");
  await page.locator("#viewer-root > *").first().waitFor({ timeout: 30_000 });
  await expect(page.locator(".chrx-pub-file")).toBeAttached();
});

test.describe("phone single-day view", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("day tabs show one day at a time at 390x844", async ({ page }) => {
    await gotoWithInline(page, students);
    await assertViewerOwnsScreen(page);
    // phone shows the single-day list, not the desktop grid
    await expect(page.locator(".chrx-pub-grid-wrap")).toBeHidden();
    const tabs = page.locator(".chrx-pub-daytab");
    await expect(tabs.first()).toBeVisible();
    expect(await tabs.count()).toBe(5);
    // exactly one day section is visible on a phone (active day defaults
    // to today's weekday, not necessarily Monday)
    const visibleDays = async () => {
      const out = [];
      for (const d of ["0", "1", "2", "3", "4"]) {
        if (await page.locator(`.chrx-pub-day[data-day="${d}"]`).isVisible()) out.push(d);
      }
      return out;
    };
    expect(await visibleDays()).toHaveLength(1);
    // switching tabs switches the day
    await page.locator('.chrx-pub-daytab[data-pub-day="1"]').click();
    expect(await visibleDays()).toEqual(["1"]);
  });
});

test.describe("desktop week grid", () => {
  test.use({ viewport: { width: 1470, height: 727 } });

  test("periods as rows, days as columns, breaks full-width, lesson in right cell; print keeps the grid", async ({
    page,
  }) => {
    await gotoWithInline(page, staff);
    await assertViewerOwnsScreen(page);
    // desktop shows the grid; the phone day-list is hidden
    await expect(page.locator(".chrx-pub-grid")).toBeVisible();
    await expect(page.locator(".chrx-pub-week")).toBeHidden();
    // N day columns, one row per period + break rows
    expect(await page.locator(".chrx-pub-grid-day").count()).toBe(5);
    expect(await page.locator(".chrx-pub-grid-row").count()).toBe(4);
    const breaks = page.locator(".chrx-pub-grid-break");
    expect(await breaks.count()).toBe(1);
    await expect(breaks.first()).toContainText(/Recess/);
    // known fixture lesson in the right (day, period) cell:
    // default entity VI A, Monday 1st period = Mathematics + teacher + room
    const cell = page.locator('.chrx-pub-grid-slot[data-day="0"][data-period="1"]');
    await expect(cell).toContainText(/Mathematics/);
    await expect(cell).toContainText(/Sushmita/);
    await expect(cell).toContainText(/Room 101/);
    // today's column highlighted when today falls in the snapshot week
    const jsDay = new Date().getDay();
    const todayIdx = jsDay >= 1 && jsDay <= 5 ? jsDay - 1 : -1;
    if (todayIdx >= 0) {
      await expect(page.locator(`.chrx-pub-grid-day.is-today[data-day="${todayIdx}"]`)).toBeVisible();
      const expectedSlots = todayIdx === 2 ? 3 : 4;
      expect(await page.locator(".chrx-pub-grid-slot.is-today").count()).toBe(expectedSlots);
    } else {
      expect(await page.locator(".chrx-pub-grid-day.is-today").count()).toBe(0);
    }
    // print prints the week grid, not the phone list
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".chrx-pub-grid")).toBeVisible();
    await expect(page.locator(".chrx-pub-week")).toBeHidden();
    await page.emulateMedia({ media: "screen" });
  });

  test("multi-period lesson (span>1) occupies ONE cell spanning period rows without extra cells", async ({
    page,
  }) => {
    await gotoWithInline(page, staff);
    await assertViewerOwnsScreen(page);
    const grid = page.locator(".chrx-pub-grid");
    // Wednesday (day 2) Period 3: Sports Meet Practice (span=2)
    const spanCell = grid.locator('.chrx-pub-grid-slot[data-day="2"][data-period="3"]');
    await expect(spanCell).toBeVisible();
    await expect(spanCell).toContainText(/Sports Meet Practice/);
    await expect(spanCell).toHaveAttribute("rowspan", "2");

    // Exactly ONE cell exists for this lesson — period 4 on Wednesday is covered by the span,
    // so no data-day="2" data-period="4" cell exists in the table DOM.
    expect(await grid.locator('.chrx-pub-grid-slot[data-day="2"][data-period="4"]').count()).toBe(0);

    // Wednesday column has 3 slot cells total across the 4 periods (P1, P2, P3[rowspan=2]).
    expect(await grid.locator('.chrx-pub-grid-slot[data-day="2"]').count()).toBe(3);
  });
});
