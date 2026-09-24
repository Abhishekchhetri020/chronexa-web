import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

// Lane L3 — visual legibility (B3, B15, B16, B7, B6).
//
// Every assertion below fails on the pre-lane code; the failing values are
// recorded in ../chronexa-edupage-study/wave1/status/L3.md. The evidence base is
// round2/out/B-visual-ux.md §2/§3 (measured on this same demo school at
// 1470×727 and 390×844).

const OVERVIEW = '[data-focus-nav="overview"]';

async function loadDemoOverview(page) {
  await loadDemoSchool(page);
  const btn = page.locator(OVERVIEW);
  if (await btn.isVisible()) await btn.click();
  await page.waitForTimeout(500);
  await expect(page.locator("#editor-root .chrx-vkarta").first()).toBeVisible();
}

/** Drive the semantic zoom level the way the toolbar button does. */
async function setZoom(page, level) {
  await page.evaluate((l) => {
    window.APP.editor.zoom = l;
    window.APP.editor.density = l === "near" ? "comfortable" : "compact";
    if (window.EditorActivator) window.EditorActivator.activate();
  }, level);
  await page.waitForTimeout(400);
}

/** Per-line overflow census on the grid's primary line. */
function measureCodes(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll("#editor-root .chrx-vk-line1")];
    const overflowing = els.filter((el) => el.scrollWidth > el.clientWidth + 1);
    // A mid-glyph cut is an overflow with `text-overflow: clip`: the cell shows
    // part of a glyph run ("MATM" → "MA", "URDU" → "UR") and reads as a real,
    // different code.
    const cut = overflowing.filter((el) => getComputedStyle(el).textOverflow === "clip");
    return {
      lines: els.length,
      overflowing: overflowing.length,
      cut: cut.length,
      sample: cut.slice(0, 6).map((el) => `${el.textContent}(${el.scrollWidth}>${el.clientWidth})`),
    };
  });
}

/**
 * How much of a card's own area changes when its locked state is dropped.
 * Screenshots the card, toggles the `locked` class, screenshots again, and diffs
 * the two PNGs on a canvas inside the page — no image library in the dependency
 * set, and it measures the PAINTED result rather than the CSS declaration.
 */
async function lockInkDelta(page, handle) {
  // An ElementHandle, not a Locator: dropping the class makes the `.locked`
  // selector stop matching, and a Locator re-resolves on every action.
  const box = await handle.boundingBox();
  const clip = {
    x: Math.max(0, Math.round(box.x)),
    y: Math.max(0, Math.round(box.y)),
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
  };
  const shot = async () => (await page.screenshot({ clip })).toString("base64");

  const locked = await shot();
  await handle.evaluate((el) => el.classList.remove("locked"));
  await page.waitForTimeout(150);
  const plain = await shot();
  await handle.evaluate((el) => el.classList.add("locked"));
  await page.waitForTimeout(150);

  return page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = "data:image/png;base64," + src;
    });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement("canvas");
    c.width = ia.width;
    c.height = ia.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(ia, 0, 0);
    const da = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(ib, 0, 0);
    const db = g.getImageData(0, 0, c.width, c.height).data;
    let changed = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (
        Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24
      ) changed++;
    }
    const total = da.length / 4;
    return { changed, total, pct: (100 * changed) / total };
  }, [locked, plain]);
}

test("L3-B15 subject codes are never cut mid-glyph at any zoom level", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 727 });
  await loadDemoOverview(page);

  for (const zoom of ["far", "mid", "near"]) {
    await setZoom(page, zoom);
    const m = await measureCodes(page);
    expect(m.lines, `zoom ${zoom}: the grid rendered no primary lines`).toBeGreaterThan(900);
    expect(m.cut, `zoom ${zoom} still cuts ${m.cut}/${m.lines} code(s) mid-glyph: ${JSON.stringify(m.sample)}`).toBe(0);
    // Every overflow that remains (there are none on the demo school) must at
    // least be marked as an abbreviation.
    expect(m.overflowing, `zoom ${zoom} has ${m.overflowing} unexplained overflow(s)`).toBe(0);
  }
});

test("L3-B15/density Compact really fits ~20 class rows at 1470x727", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 727 });
  await loadDemoOverview(page);
  await setZoom(page, "far");

  const m = await page.evaluate(() => {
    const sc = document.querySelector(".chrx-grid-scroll");
    const sr = sc.getBoundingClientRect();
    const rows = [...sc.querySelectorAll(".chrx-row:not(.chrx-row-head)")];
    const tops = rows.map((r) => r.getBoundingClientRect().top);
    return {
      rows: rows.length,
      fullyVisible: rows.filter((r) => r.getBoundingClientRect().bottom <= sr.bottom + 0.5).length,
      rowH: rows[0].getBoundingClientRect().height,
      pitch: tops[1] - tops[0],
    };
  });

  expect(m.rows).toBeGreaterThan(20);
  expect(m.fullyVisible, `Compact shows ${m.fullyVisible} class rows at a ${m.pitch}px pitch (row height ${m.rowH}px)`).toBeGreaterThanOrEqual(20);
  // The row height IS the density contract — the pitch must not add to it.
  expect(m.pitch).toBeLessThanOrEqual(m.rowH + 0.5);
});

test("L3-B3 a locked card is visibly marked at every zoom level", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 727 });
  await loadDemoOverview(page);

  // Lock one card through the app's own rule (grid_canvas: `card.locked ||
  // lesson.fixedDay != null || lesson.fixedPeriod != null`), not by hand-adding
  // a class to the DOM.
  const target = await page.evaluate(() => {
    const S = window.APP.school;
    const card = (S.cards || []).find((c) => +c.day === 0 && +c.period === 2) || S.cards[0];
    card.locked = true;
    if (window.EditorActivator) window.EditorActivator.activate();
    return { day: +card.day, period: +card.period };
  });
  await page.waitForTimeout(400);

  for (const zoom of ["far", "mid", "near"]) {
    await setZoom(page, zoom);
    const sel = `#editor-root .chrx-vkarta.locked[data-day="${target.day}"][data-period="${target.period}"]`;
    const card = page.locator(sel).first();
    await card.scrollIntoViewIfNeeded();
    await expect(card, `zoom ${zoom}: the locked card did not render`).toBeVisible();
    const handle = await page.waitForSelector(sel);

    // The lock state must reach the card's own pixels, not just a tooltip.
    const ink = await lockInkDelta(page, handle);
    expect(
      ink.pct,
      `zoom ${zoom}: dropping the locked state changed only ${ink.changed}/${ink.total} card pixels (${ink.pct.toFixed(1)}%)`
    ).toBeGreaterThan(8);

    // …and it must keep the aria description it already had.
    await expect(card).toHaveAttribute("aria-label", /locked/);
  }
});

test("L3-B16 the density control is not a dead control in the default view", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 727 });
  await loadDemoSchool(page);

  const read = () => page.evaluate(() => {
    const btn = document.getElementById("editor-density");
    const cs = getComputedStyle(btn);
    return {
      viewMode: (window.APP.editor || {}).viewMode,
      hidden: btn.hidden,
      display: cs.display,
      painted: !!btn.offsetParent && cs.display !== "none" && cs.visibility !== "hidden",
      disabled: btn.disabled,
      label: btn.textContent.trim(),
    };
  });

  // The demo opens in Focus view, where zoom does not apply.
  const focus = await read();
  expect(focus.viewMode).toBe("focus");
  expect(
    focus.painted,
    "the demo opens in Focus view with a painted, disabled density control (a dead control)"
  ).toBe(false);

  // It must still be there for the grid it does drive.
  await page.locator(OVERVIEW).click();
  await page.waitForTimeout(400);
  const overview = await read();
  expect(overview.viewMode).toBe("overview");
  expect(overview.painted).toBe(true);
  expect(overview.disabled).toBe(false);
});

test("L3-B7 no two editor controls share a label", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 727 });
  await loadDemoOverview(page);

  const labels = await page.evaluate(() =>
    [...document.querySelectorAll("#editor-quick-tools button")]
      .filter((b) => b.offsetParent && getComputedStyle(b).display !== "none")
      .map((b) => b.textContent.trim())
      .filter(Boolean)
  );

  expect(labels.length).toBeGreaterThan(4);
  expect(
    labels.length - new Set(labels).size,
    `duplicate control label(s): ${JSON.stringify(labels)}`
  ).toBe(0);
});

test("L3-B6 the 390px topbar wraps instead of covering its own actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDemoSchool(page);
  await page.waitForTimeout(500);

  const m = await page.evaluate(() => {
    const testBtn = [...document.querySelectorAll(".chrx-topbar .chrx-btn")].find(
      (b) => b.textContent.trim() === "Test"
    );
    const t = testBtn.getBoundingClientRect();
    const hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
    const tools = document.getElementById("chrx-topbar-editor-slot").getBoundingClientRect();
    const crumbs = document.getElementById("chrx-crumbs");
    return {
      vw: window.innerWidth,
      docW: document.documentElement.scrollWidth,
      testPainted: !!testBtn.offsetParent,
      testHit: hit === testBtn || testBtn.contains(hit),
      actionsOverlappedByTools:
        tools.right > t.left && tools.left < t.right && tools.bottom > t.top && tools.top < t.bottom,
      crumbsW: crumbs.clientWidth,
      crumbsText: crumbs.textContent.trim(),
    };
  });

  // The bar (and therefore the page) must fit the phone width.
  expect(m.docW, `the document is ${m.docW}px wide in a ${m.vw}px viewport`).toBeLessThanOrEqual(m.vw);
  // "Test" must be readable and clickable, not painted under the tool cluster.
  expect(m.testPainted).toBe(true);
  expect(m.testHit, "a point inside Test resolves to something else — the tool cluster paints over it").toBe(true);
  expect(m.actionsOverlappedByTools, "the editor tool cluster overlaps Test/Generate").toBe(false);
  // The breadcrumb must keep room for its text instead of collapsing to "U".
  expect(m.crumbsW, `breadcrumb is ${m.crumbsW}px wide ("${m.crumbsText}")`).toBeGreaterThan(60);
});
