/**
 * Editor activator — turns on the editor + pending strip when the user enters Step 6.
 * Hooks the existing #step-6 nav button and the CreateNew wizard's school-loaded event.
 *
 * Without this, the editor (Agent E's grid_canvas + pending_strip) lives in
 * hidden divs (#editor-root / #pending-strip-root) and is never wired to render.
 */
(function (global) {
  "use strict";

  let activated = false;

  function activate() {
    const APP = global.APP || {};
    if (!APP.school) {
      console.warn("[editor] no school loaded yet — cannot activate");
      return;
    }
    // Ensure every teacher / subject / class has a color
    if (global.CreateNew && typeof global.CreateNew.ensureColors === "function") {
      global.CreateNew.ensureColors();
    }

    const editorRoot = document.getElementById("editor-root");
    const pendingRoot = document.getElementById("pending-strip-root");
    if (!editorRoot || !pendingRoot) return;
    editorRoot.hidden = false;
    pendingRoot.hidden = false;

    // Render the grid (Agent E's grid_canvas exports window.Editor)
    if (global.Editor && typeof global.Editor.render === "function") {
      try { global.Editor.render(editorRoot); }
      catch (e) { editorRoot.innerHTML = '<div class="p-4 text-red-600">Editor render failed: ' + e.message + '</div>'; }
    } else {
      editorRoot.innerHTML = '<div class="p-4 text-amber-700">Editor module not loaded.</div>';
    }
    // Render the pending strip (Agent E's pending_strip exports window.PendingStrip)
    if (global.PendingStrip && typeof global.PendingStrip.render === "function") {
      try { global.PendingStrip.render(pendingRoot); }
      catch (e) { pendingRoot.innerHTML = '<div class="p-2 text-red-600">Pending strip render failed: ' + e.message + '</div>'; }
    }

    activated = true;
    updatePendingCount();
    setBannerOnce();
  }

  function deactivate() {
    const editorRoot = document.getElementById("editor-root");
    const pendingRoot = document.getElementById("pending-strip-root");
    if (editorRoot) editorRoot.hidden = true;
    if (pendingRoot) pendingRoot.hidden = true;
  }

  function updatePendingCount() {
    const APP = global.APP || {};
    if (!APP.school || !APP.school.lessons) return;
    let pending = 0;
    const placedByLesson = {};
    for (const c of (APP.school.cards || [])) {
      placedByLesson[c.lessonId] = (placedByLesson[c.lessonId] || 0) + 1;
    }
    for (const l of APP.school.lessons) {
      const needed = l.periodsPerWeek || 0;
      const placed = placedByLesson[l.id] || 0;
      pending += Math.max(0, needed - placed);
    }
    const el = document.getElementById("pending-count");
    if (el) el.textContent = "(" + pending + " unplaced)";
  }

  function setBannerOnce() {
    const el = document.getElementById("editor-banner");
    const text = document.getElementById("editor-banner-text");
    if (!el || !text) return;
    const APP = global.APP || {};
    const nTeachers = (APP.school?.teachers || []).length;
    const nLessons = (APP.school?.lessons || []).length;
    if (nTeachers === 0 && nLessons === 0) {
      text.textContent = "Open Teachers / Subjects / Classes / Lessons from the ribbon (top bar) and add your data. Then come back here to place cards.";
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  // Listen for any of these → activate when user enters step 6
  document.addEventListener("step:changed", e => {
    if (e.detail && e.detail.step === 6) activate();
    else if (activated) deactivate();
  });

  // Listen for school-loaded → auto-advance to editor if user just clicked "Create new"
  document.addEventListener("app:school-loaded", e => {
    // Mark step 6 enabled
    document.querySelectorAll("[data-step='6']").forEach(b => b.removeAttribute("disabled"));
    if (e.detail && (e.detail.source === "create-new" || e.detail.source === "create-demo")) {
      // jump straight to editor
      document.dispatchEvent(new CustomEvent("nav:goto-step", { detail: { step: 6 } }));
    }
  });

  // Re-render pending count on every place/pickup
  document.addEventListener("editor:place", updatePendingCount);
  document.addEventListener("editor:pickup", updatePendingCount);

  global.EditorActivator = { activate, deactivate, updatePendingCount };
})(window);
