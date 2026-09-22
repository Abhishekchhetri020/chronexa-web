// Lane-CURTAIN — the docked bottom curtain (unplaced tray + lesson inspector).
//
// CONTRACT (this is the whole point of the lane)
//   The curtain is `position:fixed` and OVERLAYS the timetable grid. Opening,
//   closing and dragging it must never reflow or resize `#editor-root`. The
//   grid's box is the same in all three snap states; only the curtain's own
//   height changes. Asserted in e2e/curtain.spec.js.
//
// STATES
//   collapsed  ~32px   handle row only (body hidden + inert)
//   peek       ~118px  slim resting state — what an empty tray sits at
//   expanded   >=190px user-chosen height (persisted)
//
// SNAP RULE (why it is deliberately timid)
//   Automatic movement is confined to `peek`. The curtain never expands
//   itself, and never moves at all while a card is in hand or while the user
//   is dragging — moving a drop surface under a dragging pointer is the
//   failure this lane exists to avoid. A manual move always wins, and is
//   remembered for as long as the tray stays empty.
//
// STABLE INTEGRATION SEAM (for the class-count lane)
//   window.Curtain.open({ classId, state })            → API
//   document.dispatchEvent(new CustomEvent("curtain:open", { detail: { classId } }))
//   `classId` is written to APP.editor.selectedClassId and the tray is
//   re-rendered, so the curtain opens scoped to that class. Fires
//   `curtain:opened` when done.
//
// NO NEW DEPENDENCIES. Pointer Events only (mouse + touch + pen).
//
// [vite-esm] The stylesheet import below is a deliberate lane-local bootstrap;
// the canonical cascade position is js/entry/main.js (see css/lane-curtain.css).
import "../../../css/lane-curtain.css";

window.Curtain = (function () {
  "use strict";

  const STORAGE_KEY = "chrx.curtain.v1";
  const STATES = ["collapsed", "peek", "expanded"];

  const COLLAPSED_PX = 32;
  // Two peek heights, because "slim when empty" and "usable when there is work"
  // are different requirements and one number cannot serve both:
  //   PEEK_EMPTY — head + search + "every lesson is on the timetable".
  //   PEEK_WORK  — the minimum that keeps one complete 48px unplaced card
  //                inside the tray's scroll viewport, so it stays a working
  //                drag SOURCE from the resting state (guarded by the
  //                pre-existing e2e/drag-card.spec.js).
  const PEEK_EMPTY_PX = 118;
  const PEEK_WORK_PX = 168;
  const EXPANDED_MIN = 190;
  const EXPANDED_DEFAULT = 268;
  const EXPANDED_MAX_RATIO = 0.55;

  let mounted = false;
  let root = null;
  let handle = null;
  let toggleBtn = null;
  let bodyBox = null;
  let inspectorSlot = null;
  let traySlot = null;

  let state = "peek";
  let expandedHeight = EXPANDED_DEFAULT;
  let count = 0;
  let countKnown = false;
  let manualDuringEmpty = false;
  let dragging = false;
  let lastNonCollapsed = "peek";
  let hueObserver = null;
  let lastHueCard = null;

  // ── geometry ─────────────────────────────────────────────────────────────

  function viewportH() {
    return (typeof window !== "undefined" && window.innerHeight) || 800;
  }

  function maxHeight() {
    const vh = viewportH();
    return Math.max(EXPANDED_MIN, Math.min(Math.round(vh * EXPANDED_MAX_RATIO), vh - 140));
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function heightFor(s) {
    if (s === "collapsed") return COLLAPSED_PX;
    if (s === "peek") return (countKnown && count > 0) ? PEEK_WORK_PX : PEEK_EMPTY_PX;
    return clamp(expandedHeight, EXPANDED_MIN, maxHeight());
  }

  /** Which snap state a raw pixel height belongs to. */
  function snapFor(h) {
    if (h <= (COLLAPSED_PX + PEEK_EMPTY_PX) / 2) return "collapsed";
    if (h <= (heightFor("peek") + heightFor("expanded")) / 2) return "peek";
    return "expanded";
  }

  // ── persistence ──────────────────────────────────────────────────────────

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        state: state,
        height: expandedHeight,
      }));
    } catch (_) { /* private mode / storage disabled — geometry is not critical */ }
  }

  function restore() {
    let parsed = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (_) { parsed = null; }
    if (!parsed || typeof parsed !== "object") return;
    if (STATES.indexOf(parsed.state) !== -1) state = parsed.state;
    if (Number.isFinite(parsed.height)) expandedHeight = clamp(parsed.height, EXPANDED_MIN, maxHeight());
    if (state !== "collapsed") lastNonCollapsed = state;
  }

  // ── rendering helpers ────────────────────────────────────────────────────

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  /**
   * Write the curtain's height.
   *
   * `instant` skips the 220ms transition. It is used for height changes driven
   * by the TRAY'S CONTENT (0→n cards, n→0), not by the user, because an
   * animated re-fit moves the cards themselves: a card that was just unplaced
   * would slide upward under the reader's eyes, and any pointer or test that
   * measured it a frame earlier is looking at where it no longer is. User 
   * gestures (drag, key, toggle, open) animate normally.
   */
  function applyHeight(h, instant) {
    if (!root) return;
    const px = Math.round(h) + "px";
    if (!instant) {
      root.style.setProperty("--chrx-curtain-h", px);
      return;
    }
    root.classList.add("no-anim");
    root.style.setProperty("--chrx-curtain-h", px);
    // Flush layout with the transition disabled so the new height commits
    // without animating, then re-enable transitions from the new value.
    void root.offsetHeight;
    root.classList.remove("no-anim");
  }

  /** Push the current state into the DOM (attributes, ARIA, visibility). */
  function reflect() {
    if (!root) return;
    const h = heightFor(state);
    root.dataset.state = state;
    root.dataset.count = String(count);
    root.dataset.countNonzero = count > 0 ? "1" : "0";

    if (handle) {
      handle.setAttribute("aria-valuemin", String(COLLAPSED_PX));
      handle.setAttribute("aria-valuemax", String(maxHeight()));
      handle.setAttribute("aria-valuenow", String(Math.round(h)));
      handle.setAttribute("aria-valuetext", h + " pixels — " + state);
    }
    if (bodyBox) {
      const collapsed = state === "collapsed";
      bodyBox.hidden = collapsed;
      // Hide collapsed content from AT and from the tab order. `inert` is the
      // precise tool; the hidden attribute above already covers browsers
      // without it.
      if (collapsed) bodyBox.setAttribute("inert", "");
      else bodyBox.removeAttribute("inert");
    }
    if (toggleBtn) {
      const expanded = state !== "collapsed";
      toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
      const label = expanded ? "Collapse the lesson curtain" : "Expand the lesson curtain";
      toggleBtn.setAttribute("aria-label", label);
      toggleBtn.title = expanded ? "Collapse curtain" : "Expand curtain";
    }
  }

  // ── state machine ────────────────────────────────────────────────────────

  /**
   * @param {string} next   collapsed | peek | expanded
   * @param {{user?: boolean, silent?: boolean, instant?: boolean}} [opts]
   *   user    — a human moved it, so remember that intent while the tray is empty
   *   silent  — suppress the `curtain:state` event (used during restore)
   *   instant — skip the height transition (content-driven re-fit)
   */
  function setState(next, opts) {
    opts = opts || {};
    if (STATES.indexOf(next) === -1) next = "peek";
    state = next;
    if (next !== "collapsed") lastNonCollapsed = next;
    if (opts.user) manualDuringEmpty = count === 0;
    applyHeight(heightFor(state), opts.instant === true);
    persist();
    reflect();
    if (!opts.silent) {
      dispatch("curtain:state", { state: state, height: heightFor(state), count: count });
    }
    return state;
  }

  function toggle() {
    return setState(state === "collapsed" ? lastNonCollapsed : "collapsed", { user: true });
  }

  /**
   * Recompute the slim/expanded rule from the current unplaced count.
   * Called by EditorActivator.updatePendingCount(), which already runs on
   * every place/pickup/unplace/entity:changed event — one source of truth.
   */
  function syncCount(n) {
    if (Number.isFinite(n)) { count = n; countKnown = true; }
    const inHand = !!(window.APP && window.APP.editor && window.APP.editor.cardInHand);

    if (count > 0) {
      // Work exists: forget the "user opened it while empty" intent, and make
      // sure the tray is at least discoverable.
      manualDuringEmpty = false;
      if (state === "collapsed" && !dragging && !inHand) setState("peek");
    } else {
      reapplyEmptyRule();
    }

    // The peek height depends on whether there is work (PEEK_EMPTY_PX vs
    // PEEK_WORK_PX), so a resting curtain must re-fit when the count crosses
    // zero — instantly, so the cards do not slide out from under a pointer
    // that is about to grab one.
    if (state === "peek" && !dragging) {
      const want = heightFor("peek");
      if (root && Math.round(root.getBoundingClientRect().height) !== want) applyHeight(want, true);
    }

    reflect();
    return count;
  }

  /**
   * The "empty tray rests slim" rule, isolated so it can also be re-run when
   * the card hand empties.
   *
   * A completed drop clears `APP.editor.cardInHand` on a timer (160–240ms
   * after the placement commits), so by the time `editor:place` reaches
   * syncCount the hand is still nominally full and the collapse is correctly
   * suppressed. Without a second trigger the curtain then stayed open forever
   * with an empty tray. watchHand() below supplies that trigger.
   */
  function reapplyEmptyRule() {
    if (!mounted || dragging) return false;
    if (count !== 0 || manualDuringEmpty) return false;
    if (window.APP && window.APP.editor && window.APP.editor.cardInHand) return false;
    if (state !== "expanded") return false;
    setState("peek", { instant: true });
    return true;
  }

  /** Re-run the empty rule the moment the card hand is released. */
  function watchHand() {
    if (typeof MutationObserver !== "function") return;
    const obs = new MutationObserver(() => {
      if (document.body.classList.contains("chrx-card-in-hand")) return;
      reapplyEmptyRule();
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  // ── drag (mouse · touch · pen) ───────────────────────────────────────────

  function beginDrag(ev) {
    if (!root || !handle) return;
    if (ev && typeof ev.button === "number" && ev.button !== 0) return;
    if (ev) ev.preventDefault();

    dragging = true;
    root.classList.add("is-dragging");
    document.body.classList.add("chrx-body--curtain-dragging");

    const pid = ev.pointerId;
    const startY = ev.clientY;
    const startH = root.getBoundingClientRect().height || heightFor(state);
    let latest = startH;

    try { handle.setPointerCapture(pid); } catch (_) { /* capture is an optimisation */ }

    function onMove(e) {
      if (pid != null && e.pointerId !== pid) return;
      latest = clamp(startH + (startY - e.clientY), COLLAPSED_PX, maxHeight());
      applyHeight(latest);
      if (handle) handle.setAttribute("aria-valuenow", String(Math.round(latest)));
    }

    function onUp(e) {
      if (pid != null && e.pointerId !== pid) return;
      cleanup();
      // Snapping into `expanded` is where the user CHOOSES the taller height,
      // so that is where it is remembered. Coming back to it later restores
      // what they picked instead of the factory default.
      const target = snapFor(latest);
      if (target === "expanded") expandedHeight = clamp(latest, EXPANDED_MIN, maxHeight());
      // `user:true` — this was a hand.
      setState(target, { user: true });
    }

    function cleanup() {
      dragging = false;
      root.classList.remove("is-dragging");
      document.body.classList.remove("chrx-body--curtain-dragging");
      try { handle.releasePointerCapture(pid); } catch (_) { /* already released */ }
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    }

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
  }

  function onHandleKeydown(ev) {
    const up = ev.key === "ArrowUp";
    const down = ev.key === "ArrowDown";
    const home = ev.key === "Home";
    const end = ev.key === "End";
    const toggleKey = ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar";
    const escape = ev.key === "Escape";
    if (!up && !down && !home && !end && !toggleKey && !escape) return;

    ev.preventDefault();
    if (home) return void setState("collapsed", { user: true });
    if (end) return void setState("expanded", { user: true });
    if (escape) return void setState("collapsed", { user: true });
    if (toggleKey) return void toggle();

    const idx = STATES.indexOf(state);
    const next = STATES[clamp(idx + (up ? 1 : -1), 0, STATES.length - 1)];
    setState(next, { user: true });
  }

  // ── inspector hue inheritance ────────────────────────────────────────────
  //
  // The inspector must look like the lesson card the cursor is on, in the
  // card's ACTUAL colour. grid_canvas.js writes each card's hue to
  // `--chrx-card-hue` (already resolved through APP.editor.colorBy, i.e.
  // subject / teacher / class / room). We copy that exact value onto
  // `--chrx-panel-hue` so the two cannot drift.

  function rememberCard(el) {
    if (el) lastHueCard = el;
  }

  function applyInspectorHue() {
    const panel = document.getElementById("chrx-card-panel");
    if (!panel) return;
    let hue = "";
    let from = "panel";
    if (lastHueCard && document.contains(lastHueCard)) {
      hue = (getComputedStyle(lastHueCard).getPropertyValue("--chrx-card-hue") || "").trim();
      if (hue) from = "card";
    }
    if (!hue) {
      hue = (panel.style.getPropertyValue("--chrx-panel-hue")
          || getComputedStyle(panel).getPropertyValue("--chrx-panel-hue") || "").trim();
    }
    if (!hue) return;
    if (panel.style.getPropertyValue("--chrx-panel-hue").trim() !== hue) {
      panel.style.setProperty("--chrx-panel-hue", hue);
    }
    panel.dataset.hueFrom = from;
  }

  function trackCardFrom(ev) {
    const t = ev.target;
    if (!t || typeof t.closest !== "function") return;
    const card = t.closest(".chrx-vkarta");
    if (!card) return;
    rememberCard(card);
    // grid_canvas / pending_strip render the panel synchronously inside their
    // own listener. This handler is registered in the bubble phase on
    // `document`, so it runs after theirs; the microtask re-run covers any
    // path that renders later still.
    queueMicrotask(applyInspectorHue);
    applyInspectorHue();
  }

  function bindInspectorHue() {
    document.addEventListener("mouseover", trackCardFrom, false);
    document.addEventListener("focusin", trackCardFrom, false);
    document.addEventListener("click", trackCardFrom, false);
    document.addEventListener("editor:focusCard", (e) => {
      const id = e.detail && e.detail.cardId;
      if (!id) return;
      const el = document.querySelector('.chrx-vkarta[data-card-id="' + cssEsc(id) + '"]');
      rememberCard(el);
      queueMicrotask(applyInspectorHue);
    });

    const host = document.getElementById("editor-inspector-root");
    if (host && typeof MutationObserver === "function") {
      hueObserver = new MutationObserver(() => applyInspectorHue());
      hueObserver.observe(host, { childList: true, subtree: true });
    }
  }

  function cssEsc(s) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(s);
    return String(s).replace(/"/g, '\\"');
  }

  // ── mount / adoption ─────────────────────────────────────────────────────

  const CHEVRON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>';

  /** Where the curtain must live for its fixed-positioning contract to hold. */
  function hostFor() {
    return document.querySelector(".chrx-shell") || document.body;
  }

  function mount() {
    const host = hostFor();

    // Already built: make sure it is still a DIRECT child of the shell.
    // shell_v3.js builds the shell once and sweeps every existing body child
    // into .chrx-main; if this module ever mounted before that ran, the
    // curtain would be parked inside a scrolling <main> instead of beside it.
    // Re-homing is cheap (the adopted nodes ride along as descendants) and
    // removes the whole ordering failure mode.
    if (mounted && root) {
      if (root.parentElement !== host) host.appendChild(root);
      return root;
    }

    root = document.createElement("div");
    root.id = "chrx-curtain";
    root.className = "chrx-curtain";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Lesson curtain");
    root.innerHTML =
      '<div class="chrx-curtain__head">' +
        '<div class="chrx-curtain__handle" id="chrx-curtain-handle" role="separator" ' +
             'aria-orientation="horizontal" tabindex="0" ' +
             'aria-label="Resize the lesson curtain"></div>' +
        '<button type="button" class="chrx-curtain__toggle" id="chrx-curtain-toggle" ' +
                'aria-controls="chrx-curtain-body">' + CHEVRON + '</button>' +
      '</div>' +
      '<div class="chrx-curtain__body" id="chrx-curtain-body">' +
        '<div class="chrx-curtain__inspector"></div>' +
        '<div class="chrx-curtain__tray"></div>' +
      '</div>';

    handle = root.querySelector("#chrx-curtain-handle");
    toggleBtn = root.querySelector("#chrx-curtain-toggle");
    bodyBox = root.querySelector("#chrx-curtain-body");
    inspectorSlot = root.querySelector(".chrx-curtain__inspector");
    traySlot = root.querySelector(".chrx-curtain__tray");

    applyHeight(heightFor(state));
    host.appendChild(root);

    handle.addEventListener("pointerdown", beginDrag);
    handle.addEventListener("keydown", onHandleKeydown);
    toggleBtn.addEventListener("click", () => toggle());

    adopt();
    bindInspectorHue();
    watchHand();
    window.addEventListener("resize", () => applyHeight(heightFor(state)));

    mounted = true;
    reflect();
    return root;
  }

  /**
   * Move the two in-flow nodes that used to sit below the grid into the
   * curtain. Deliberately by MOVING the existing elements, not re-rendering
   * them: every listener, drag source and render target inside
   * (pending_strip.js, card_in_hand.js, grid_canvas.js) keeps working
   * untouched.
   */
  function adopt() {
    const lower = document.getElementById("editor-lower");
    const inspector = document.getElementById("editor-inspector-root");
    const tray = document.querySelector(".chrx-pending-region");
    // The heading travels with the tray so its live "#pending-count" (owned by
    // activator.js) becomes the curtain's title — moved, never duplicated.
    const heading = tray ? tray.querySelector(":scope > h3") : null;

    if (heading && inspectorSlot && heading.parentNode !== handle) handle.appendChild(heading);
    if (inspector && inspectorSlot && inspector.parentNode !== inspectorSlot) inspectorSlot.appendChild(inspector);
    if (tray && traySlot && tray.parentNode !== traySlot) traySlot.appendChild(tray);

    // Retire the emptied wrapper so it stops contributing margin — see
    // `#editor-lower[data-curtain-adopted]` in lane-curtain.css.
    if (lower) lower.setAttribute("data-curtain-adopted", "1");
  }

  function show() {
    mount();
    root.hidden = false;
    return true;
  }

  function hide() {
    if (root) root.hidden = true;
    return false;
  }

  function isVisible() {
    return !!(root && root.isConnected && !root.hidden);
  }

  // ── public API ───────────────────────────────────────────────────────────

  function open(opts) {
    opts = opts || {};
    show();
    if (opts.classId) {
      window.APP = window.APP || {};
      window.APP.editor = window.APP.editor || {};
      window.APP.editor.selectedClassId = opts.classId;
      const tray = document.getElementById("pending-strip-root");
      if (tray && window.PendingStrip && typeof window.PendingStrip.render === "function") {
        try { window.PendingStrip.render(tray); } catch (_) { /* tray re-render is best-effort */ }
      }
      dispatch("curtain:class-filter", { classId: opts.classId });
    }
    if (opts.count != null) syncCount(opts.count);
    setState(opts.state || "expanded", { user: true });
    dispatch("curtain:opened", { classId: opts.classId || null, state: state, height: heightFor(state) });
    return getState();
  }

  function close() {
    const next = setState("collapsed", { user: true });
    dispatch("curtain:closed", { state: next });
    return next;
  }

  function refresh() {
    if (window.EditorActivator && typeof window.EditorActivator.updatePendingCount === "function") {
      window.EditorActivator.updatePendingCount();
    }
    applyInspectorHue();
    reflect();
    return getState();
  }

  function getState() {
    return {
      state: state,
      height: root ? Math.round(root.getBoundingClientRect().height) : heightFor(state),
      expandedHeight: expandedHeight,
      count: count,
      countKnown: countKnown,
      mounted: mounted,
      visible: isVisible(),
      snapPoints: { collapsed: COLLAPSED_PX, peek: heightFor("peek"), expanded: heightFor("expanded") },
    };
  }

  // ── document-level API events (the stable seam for other lanes) ──────────
  document.addEventListener("curtain:open", (e) => open(e.detail || {}));
  document.addEventListener("curtain:close", () => close());
  document.addEventListener("curtain:toggle", () => toggle());

  // Keep the curtain honest after any tray re-render triggered elsewhere.
  document.addEventListener("editor:place", () => { if (mounted) reflect(); });
  document.addEventListener("editor:unplace", () => { if (mounted) reflect(); });

  window.Curtain = {
    VERSION: "1.0.0",
    mount: mount,
    show: show,
    hide: hide,
    isMounted: () => mounted,
    isVisible: isVisible,
    open: open,
    close: close,
    toggle: toggle,
    setState: setState,
    getState: getState,
    syncCount: syncCount,
    refresh: refresh,
    // Hand an in-progress pointer gesture to the curtain drag. Used by
    // pending_strip.js so the tray's legacy resize handle cannot start a
    // second, competing resize path once the curtain owns vertical sizing.
    beginDrag: beginDrag,
    // exposed for tests + the class-count lane
    _snapFor: snapFor,
    _heightFor: heightFor,
    _adopted: adopt,
  };

  return window.Curtain;
})();

// [vite-esm] exports auto-generated by the 2026-07 Vite migration.
export const Curtain = window.Curtain;
