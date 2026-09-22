import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

/**
 * Lane-curtain E2E — the docked bottom curtain.
 *
 * The contract under test: the curtain OVERLAYS the grid. Opening, closing and
 * dragging it must never reflow or resize #editor-root. Every geometry test
 * below compares the grid's box across states and requires it to be identical.
 */

const CURTAIN = "#chrx-curtain";
const HANDLE = "#chrx-curtain-handle";
const BODY = "#chrx-curtain-body";

// The curtain animates its height (220ms). Geometry assertions must measure a
// settled value, not an in-flight interpolation, and the lane already ships a
// reduced-motion path that zeroes the transition — so pin it for this spec.
// (This also exercises that path on every run.)
test.use({ reducedMotion: "reduce" });

/**
 * The grid's LAYOUT box — the value that must never change when the curtain
 * moves. Deliberately offsetLeft/Top/Width/Height rather than
 * getBoundingClientRect(): those are layout coordinates, independent of any
 * scroll position, so a stray scroll (the drag engine calls scrollIntoView on
 * hover, and .chrx-main clamps a residual load-time scroll when the content
 * stops overflowing) cannot masquerade as a reflow. Scroll is asserted
 * separately where it matters.
 */
async function gridBox(page) {
  return page.locator("#editor-root").evaluate((el) =>
    [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight].join(","));
}

async function mainScrollTop(page) {
  return page.locator(".chrx-main").evaluate((el) => Math.round(el.scrollTop));
}

/**
 * Relative-luminance contrast ratios for the inspector's text against its own
 * tinted fill. Returns the panel background so a caller can also check that the
 * fill is a hue tint rather than a flat surface colour.
 */
async function measurePanelContrast(page) {
  return page.locator(`${CURTAIN} #chrx-card-panel`).evaluate((panel) => {
    const lum = (css) => {
      const m = css.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(",").map((v) => parseFloat(v));
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(parts[0]) + 0.7152 * f(parts[1]) + 0.0722 * f(parts[2]);
    };
    const ratio = (fg, bg) => {
      const l1 = lum(fg), l2 = lum(bg);
      if (l1 == null || l2 == null) return null;
      const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    };
    const bg = getComputedStyle(panel).backgroundColor;
    const ratios = {};
    for (const [name, sel] of Object.entries({
      title: ".chrx-card-panel__title",
      eyebrow: ".chrx-card-panel__eyebrow",
      rowLabel: ".chrx-card-panel__row dt",
      rowValue: ".chrx-card-panel__row dd",
      foot: ".chrx-card-panel__foot",
    })) {
      const el = panel.querySelector(sel);
      ratios[name] = el ? ratio(getComputedStyle(el).color, bg) : null;
    }
    return { bg, ratios };
  });
}

async function curtainHeight(page) {
  return page.locator(CURTAIN).evaluate((el) => Math.round(el.getBoundingClientRect().height));
}

/** Set a state and wait for the DOM and the geometry to agree. */
async function setCurtainState(page, next) {
  const target = await page.locator(CURTAIN).evaluate((el, s) => window.Curtain._heightFor(s), next);
  await page.locator(CURTAIN).evaluate((el, s) => window.Curtain.setState(s, { user: true }), next);
  await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", next);
  await expect.poll(() => curtainHeight(page), { timeout: 5_000 }).toBe(target);
}

/** WCAG relative luminance from a computed "rgb(r, g, b)" string. */


test.describe("bottom curtain", () => {
  test("mounts, adopts the tray + inspector, and rests slim when the tray is empty", async ({ page }) => {
    await loadDemoSchool(page);

    await expect(page.locator(CURTAIN)).toBeVisible();
    // The demo school is fully placed, so the resting state is the slim one.
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "peek");
    expect(await curtainHeight(page)).toBeLessThan(160);

    // Overlay, not flow.
    expect(await page.locator(CURTAIN).evaluate((el) => getComputedStyle(el).position)).toBe("fixed");

    // The old in-flow wrapper is retired, and both adopted nodes now live
    // inside the curtain.
    expect(await page.locator("#editor-lower").evaluate((el) => getComputedStyle(el).display)).toBe("none");
    await expect(page.locator(`${CURTAIN} #editor-inspector-root`)).toBeAttached();
    await expect(page.locator(`${CURTAIN} #pending-strip-root`)).toBeAttached();
    await expect(page.locator(`${CURTAIN} #pending-count`)).toBeAttached();

    // Collapsed by default? No — but the body is present and the handle is a
    // real separator widget.
    await expect(page.locator(HANDLE)).toHaveAttribute("role", "separator");
    await expect(page.locator(HANDLE)).toHaveAttribute("aria-orientation", "horizontal");
    await expect(page.locator(HANDLE)).toHaveAttribute("tabindex", "0");
    await expect(page.locator("#chrx-curtain-toggle")).toHaveAttribute("aria-expanded", "true");
  });

  test("never reflows or resizes the grid — identical box in all three states", async ({ page }) => {
    await loadDemoSchool(page);

    await setCurtainState(page, "peek");
    const atPeek = await gridBox(page);

    await setCurtainState(page, "expanded");
    const atExpanded = await gridBox(page);
    expect(await curtainHeight(page)).toBeGreaterThan(190);

    await setCurtainState(page, "collapsed");
    const atCollapsed = await gridBox(page);
    expect(await curtainHeight(page)).toBeLessThan(60);

    expect(atExpanded, "expanded must not resize the grid").toBe(atPeek);
    expect(atCollapsed, "collapsed must not resize the grid").toBe(atPeek);
  });

  test("dragging the handle up snaps to expanded, and the grid still does not move", async ({ page }) => {
    await loadDemoSchool(page);
    const before = await gridBox(page);
    const beforeScroll = await mainScrollTop(page);
    const startH = await curtainHeight(page);

    const box = await page.locator(HANDLE).boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 240, { steps: 14 });
    // Mid-drag the curtain must already be following the pointer.
    expect(await curtainHeight(page)).toBeGreaterThan(startH + 120);
    await page.mouse.up();

    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "expanded");
    await expect.poll(() => curtainHeight(page), { timeout: 5_000 }).toBeGreaterThan(startH + 120);
    expect(await gridBox(page), "grid geometry must be untouched by the drag").toBe(before);
    expect(await mainScrollTop(page), "the curtain must not scroll the workspace").toBe(beforeScroll);
  });

  test("dragging the handle down snaps to collapsed and hides the body from AT", async ({ page }) => {
    await loadDemoSchool(page);
    await setCurtainState(page, "expanded");
    const before = await gridBox(page);

    const box = await page.locator(HANDLE).boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 320, { steps: 14 });
    await page.mouse.up();

    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "collapsed");
    await expect(page.locator(BODY)).toBeHidden();
    await expect(page.locator(BODY)).toHaveAttribute("inert", "");
    expect(await gridBox(page), "grid geometry must be untouched by the drag").toBe(before);
  });

  test("keyboard: End expands, Home collapses, arrows step, toggle flips", async ({ page }) => {
    await loadDemoSchool(page);
    const handle = page.locator(HANDLE);
    await handle.focus();

    await page.keyboard.press("End");
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "expanded");

    await page.keyboard.press("Home");
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "collapsed");
    await expect(page.locator(BODY)).toBeHidden();

    await page.keyboard.press("ArrowUp");
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "peek");

    await page.keyboard.press("ArrowUp");
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "expanded");

    await page.keyboard.press("Escape");
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "collapsed");

    // The toggle button is the same control for pointer users: from collapsed
    // it restores the last open state (expanded was chosen a moment ago).
    await page.locator("#chrx-curtain-toggle").click();
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "expanded");
    await expect(page.locator("#chrx-curtain-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => curtainHeight(page), { timeout: 5_000 }).toBeGreaterThan(190);

    // ...and collapses again on a second click.
    await page.locator("#chrx-curtain-toggle").click();
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "collapsed");
    await expect(page.locator("#chrx-curtain-toggle")).toHaveAttribute("aria-expanded", "false");

    // ARIA reflects the geometry it controls.
    const now = Number(await handle.getAttribute("aria-valuenow"));
    expect(now).toBeGreaterThan(0);
    expect(Number(await handle.getAttribute("aria-valuemax"))).toBeGreaterThan(now);
  });

  test("persists the chosen height, and re-collapses slim while the tray is empty", async ({ page }) => {
    await loadDemoSchool(page);

    await setCurtainState(page, "expanded");
    const expanded = await curtainHeight(page);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("chrx.curtain.v1")));
    expect(stored.state).toBe("expanded");
    expect(stored.height).toBeGreaterThan(190);

    // Reload: the height is remembered, but an empty tray must rest slim.
    await page.reload();
    await loadDemoSchool(page);
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "peek");
    const restored = await page.locator(CURTAIN).evaluate(() => window.Curtain.getState());
    expect(restored.expandedHeight).toBeGreaterThan(190);
    expect(restored.height).toBeLessThan(expanded);

    // The user's height survives: expanding again lands on their value.
    await setCurtainState(page, "expanded");
    expect(Math.abs((await curtainHeight(page)) - restored.expandedHeight)).toBeLessThanOrEqual(1);
  });

  test("a manual open while empty stays open until the count changes", async ({ page }) => {
    await loadDemoSchool(page);
    await setCurtainState(page, "expanded");
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "expanded");

    // A count refresh that still reports 0 must not yank it shut.
    await page.locator(CURTAIN).evaluate(() => window.Curtain.syncCount(0));
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "expanded");
  });

  test("existing unplaced flow still works inside the curtain: filter, drag source, drag back", async ({ page }) => {
    await loadDemoSchool(page);

    // 1. Remove a placed card → it lands in the tray, inside the curtain.
    const card = page.locator("#editor-root .chrx-vkarta").first();
    const meta = await card.evaluate((el) => ({ ...el.dataset }));
    await card.click({ button: "right" });
    await page.getByRole("button", { name: /remove/i }).first().click();

    const pendingCard = page.locator(`${CURTAIN} #pending-strip-root [data-card-id]`).first();
    await expect(pendingCard).toBeAttached({ timeout: 10_000 });
    await expect(page.locator(`${CURTAIN} #pending-count`)).toContainText("1 unplaced");
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-count-nonzero", "1");

    // 2. The tray's own search filter still works where it now lives.
    const search = page.locator(`${CURTAIN} #pending-strip-root .chrx-pending-search`);
    await search.fill("zzzz-no-such-subject");
    await expect(page.locator(`${CURTAIN} #pending-strip-root .chrx-vk-pending`)).toHaveCount(0);
    await search.fill("");
    await expect(page.locator(`${CURTAIN} #pending-strip-root .chrx-vk-pending`)).toHaveCount(1);

    // 3. Give the tray room, then drag the card back onto its old slot.
    await page.locator(CURTAIN).evaluate(() => window.Curtain.open({ state: "expanded" }));
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "expanded");
    await expect.poll(() => curtainHeight(page), { timeout: 5_000 }).toBeGreaterThan(190);
    const target = page.locator(
      `#editor-root .chrx-slot[data-day="${meta.day}"][data-period="${meta.period}"]`
    ).first();

    const from = await pendingCard.boundingBox();
    const to = await target.boundingBox();
    expect(from).not.toBeNull();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();

    // 4. Placed again, tray empty, curtain back to slim.
    await expect(
      page.locator(
        `#editor-root .chrx-slot[data-day="${meta.day}"][data-period="${meta.period}"] .chrx-vkarta`
      ).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`${CURTAIN} #pending-strip-root [data-card-id]`)).toHaveCount(0);
    // The tray emptied, so the curtain returns to its slim resting state —
    // after the card hand is released, which happens on a timer.
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "peek", { timeout: 10_000 });
  });

  test("stable API + event seam for the class-count lane", async ({ page }) => {
    await loadDemoSchool(page);

    const classId = await page.evaluate(() => window.APP.school.classes[0].id);

    // API form.
    const res = await page.evaluate((id) => window.Curtain.open({ classId: id }), classId);
    expect(res.state).toBe("expanded");
    expect(await page.evaluate(() => window.APP.editor.selectedClassId)).toBe(classId);

    // Event form.
    await page.locator(CURTAIN).evaluate((el) => window.Curtain.close());
    const fired = await page.evaluate((id) => {
      let seen = null;
      document.addEventListener("curtain:opened", (e) => { seen = e.detail; }, { once: true });
      document.dispatchEvent(new CustomEvent("curtain:open", { detail: { classId: id } }));
      return seen;
    }, classId);
    expect(fired).not.toBeNull();
    expect(fired.classId).toBe(classId);
    await expect(page.locator(CURTAIN)).toHaveAttribute("data-state", "expanded");
  });

  test("inspector looks like a lesson card and inherits the hovered card's actual hue", async ({ page }) => {
    await loadDemoSchool(page);
    await page.locator(CURTAIN).evaluate(() => window.Curtain.open({ state: "expanded" }));

    const card = page.locator("#editor-root .chrx-vkarta").first();
    await card.hover();

    const panel = page.locator(`${CURTAIN} #chrx-card-panel`);
    await expect(panel).toBeVisible();

    const cardHue = await card.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--chrx-card-hue").trim());
    const panelHue = await panel.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--chrx-panel-hue").trim());
    expect(cardHue).not.toBe("");
    expect(panelHue).toBe(cardHue);
    await expect(panel).toHaveAttribute("data-hue-from", "card");

    // Card-like treatment: a hue rail, a tinted fill, and a real ink — not the
    // plain white sidebar panel the inspector used to be.
    const look = await panel.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { rail: cs.borderLeftWidth, bg: cs.backgroundColor, ink: cs.color };
    });
    expect(parseFloat(look.rail)).toBeGreaterThanOrEqual(3);
    expect(look.bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(look.ink).not.toBe(look.bg);

    // Existing content is unchanged.
    await expect(panel.locator(".chrx-card-panel__title")).not.toBeEmpty();
    await expect(panel.locator(".chrx-card-panel__rows")).toBeVisible();
    await expect(panel.locator(".chrx-card-panel__foot")).toBeVisible();
  });

  test("inspector text meets WCAG AA contrast against the tinted card fill", async ({ page }) => {
    await loadDemoSchool(page);
    await page.locator(CURTAIN).evaluate(() => window.Curtain.open({ state: "expanded" }));
    await page.locator("#editor-root .chrx-vkarta").first().hover();
    await expect(page.locator(`${CURTAIN} #chrx-card-panel`)).toBeVisible();

    const measured = await measurePanelContrast(page);
    for (const [name, ratio] of Object.entries(measured.ratios)) {
      expect(ratio, `${name} should render`).not.toBeNull();
      // AA for small text is 4.5:1. The footer/chips are small and bold, so the
      // same threshold applies to all of them.
      expect(ratio, `light ${name} contrast ${ratio && ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("inspector keeps its card tint in dark mode and still meets AA", async ({ page }) => {
    await loadDemoSchool(page);
    await page.locator(CURTAIN).evaluate(() => window.Curtain.open({ state: "expanded" }));
    await page.locator("#editor-root .chrx-vkarta").first().hover();
    await expect(page.locator(`${CURTAIN} #chrx-card-panel`)).toBeVisible();

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor !== "rgba(0, 0, 0, 0)"))
      .toBeTruthy();

    const dark = await measurePanelContrast(page);

    // Regression guard. editor.css carries
    //   :root[data-theme="dark"] .chrx-card-panel { background: var(--chrx-bg-elev) }
    // at the same specificity as a plain 3-class selector, so a dark-mode panel
    // silently lost its hue tint and became a flat surface colour. The panel
    // must never end up the same colour as the curtain it sits on.
    const curtainBg = await page.locator(CURTAIN).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(dark.bg, "the inspector must keep a hue tint, not a flat surface").not.toBe(curtainBg);

    for (const [name, ratio] of Object.entries(dark.ratios)) {
      expect(ratio, `dark ${name} contrast ${ratio && ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("no 'Best' affordance was added anywhere in the curtain", async ({ page }) => {
    await loadDemoSchool(page);
    await page.locator(CURTAIN).evaluate(() => window.Curtain.open({ state: "expanded" }));

    const offenders = await page.locator(CURTAIN).evaluate((root) => {
      const out = [];
      for (const el of root.querySelectorAll("*")) {
        const bits = [
          el.getAttribute("title") || "",
          el.getAttribute("aria-label") || "",
          el.getAttribute("data-tooltip") || "",
          el.textContent && el.children.length === 0 ? el.textContent : "",
        ];
        if (bits.some((b) => /\bbest\b/i.test(b))) {
          out.push(el.tagName + "." + (el.className || "") + " :: " + bits.join(" | ").trim());
        }
      }
      return out;
    });
    expect(offenders).toEqual([]);
  });
});
