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

    // ─── Empty-school coaching: instead of a blank grid, show "Get started" ─
    if (isEmptySchool(APP.school)) {
      renderEmptyHero(editorRoot);
      pendingRoot.innerHTML = `<div class="p-3 text-sm text-slate-500 text-center">Cards will appear here once you add lessons.</div>`;
      activated = true;
      updatePendingCount();
      return;
    }

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

  function isEmptySchool(school) {
    if (!school) return true;
    const counts = ["subjects", "teachers", "classes", "classrooms", "lessons"]
      .map(k => (school[k] || []).length);
    return counts.every(n => n === 0);
  }

  function renderEmptyHero(root) {
    const fire = (kind) => () => window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind } }));
    const tile = (icon, title, sub, kind, color) => `
      <button data-kind="${kind}" class="text-left bg-white border-2 border-${color}-200 hover:border-${color}-500 rounded-xl p-4 transition-colors group">
        <div class="text-3xl mb-2">${icon}</div>
        <div class="font-semibold text-${color}-700 group-hover:text-${color}-800">${title}</div>
        <div class="text-xs text-slate-500 mt-1">${sub}</div>
      </button>`;
    root.innerHTML = `
      <div class="p-6 sm:p-10">
        <div class="max-w-3xl mx-auto text-center mb-6">
          <h3 class="text-2xl font-bold text-slate-800">🎯 Let's build your timetable</h3>
          <p class="text-sm text-slate-600 mt-2">Pick a starting point. We recommend going in this order — but you can do them in any order.</p>
        </div>
        <div class="max-w-4xl mx-auto grid sm:grid-cols-3 gap-3">
          ${tile("📚", "1. Subjects", "Maths, Science, English, …", "subjects", "emerald")}
          ${tile("👨‍🏫", "2. Teachers", "Names, abbreviations, colors", "teachers", "blue")}
          ${tile("👥", "3. Classes", "I-A, I-B, VIII-C …", "classes", "violet")}
          ${tile("🚪", "4. Classrooms", "Lab, Library, Music Room …", "classrooms", "amber")}
          ${tile("📝", "5. Lessons", "Who teaches what, how often", "lessons", "rose")}
          ${tile("⚡", "6. Generate", "Auto-place all cards", "_generate", "slate")}
        </div>
        <div class="max-w-3xl mx-auto text-center mt-6 text-xs text-slate-500">
          Tip: every tile opens the same dialog as <em>Specification</em> → <em>(entity)…</em> in the ribbon. Use whichever feels natural.
        </div>
      </div>`;
    root.querySelectorAll("[data-kind]").forEach(btn => {
      btn.onclick = () => {
        const k = btn.dataset.kind;
        if (k === "_generate") {
          const gen = document.getElementById("cta-generate");
          if (gen) gen.click();
          return;
        }
        fire(k)();
      };
    });
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

  // Re-render the editor whenever an entity changes (so the hero card swaps to grid)
  document.addEventListener("entity:changed", () => {
    if (document.getElementById("step-6") && !document.getElementById("step-6").classList.contains("hidden")) {
      activate();
    }
  });

  global.EditorActivator = { activate, deactivate, updatePendingCount };
})(window);
