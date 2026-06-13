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
    if (needsSetupHero(APP.school)) {
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
    if (global.FirstCardCoachmark && typeof global.FirstCardCoachmark.schedule === "function") {
      global.FirstCardCoachmark.schedule();
    }
  }

  function needsSetupHero(school) {
    if (!school) return true;
    return (school.lessons || []).length === 0;
  }

  function renderEmptyHero(root) {
    const fire = (kind) => () => window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind } }));
    const school = (window.APP && window.APP.school) || {};

    function tile(icon, num, title, sub, kind) {
      const isGenerate = kind === "_generate";
      const count = isGenerate ? 0 : (school[kind] || []).length;
      const hasData = count > 0;
      const statusLabel = isGenerate ? "Needs lessons" : hasData ? count + " added" : "Not started";
      const actionLabel = isGenerate ? "Locked" : hasData ? "Manage →" : "Add →";

      return `
        <button data-kind="${kind}" class="chrx-hero-tile chrx-lift chrx-press" ${hasData ? 'data-completed="true"' : ''} ${isGenerate ? "disabled" : ""}>
          <span class="chrx-hero-tile__num">${num}</span>
          <span class="chrx-hero-tile__icon" aria-hidden="true">${icon}</span>
          <span class="chrx-hero-tile__title">${title}</span>
          <span class="chrx-hero-tile__sub">${sub}</span>
          <span class="chrx-hero-tile__status" data-complete="${hasData}">
            <span>${hasData ? "✓" : "○"} ${statusLabel}</span>
            <span>${actionLabel}</span>
          </span>
        </button>`;
    }

    root.innerHTML = `
      <div class="chrx-hero">
        <div class="chrx-hero__inner">
          <header class="chrx-hero__head chrx-fade-in">
            <span class="chrx-hero__eyebrow">Get started</span>
            <h3 class="chrx-hero__title">Let's build your timetable</h3>
            <p class="chrx-hero__sub">Pick a starting point. We recommend this order, but you can jump in anywhere.</p>
          </header>
          <div class="chrx-hero__grid chrx-rise-stagger">
            ${tile("📚", "1", "Subjects",   "Maths, Science, English, …",      "subjects")}
            ${tile("👨‍🏫", "2", "Teachers",   "Names, abbreviations, colors",         "teachers")}
            ${tile("👥", "3", "Classes",    "I-A, I-B, VIII-C …",              "classes")}
            ${tile("🚪", "4", "Classrooms", "Lab, Library, Music Room …",      "classrooms")}
            ${tile("📝", "5", "Lessons",    "Who teaches what, how often",          "lessons")}
            ${tile("⚡",    "6", "Generate",   "Auto-place all cards",                 "_generate")}
          </div>
          <form class="chrx-hero-quickadd chrx-fade-in" data-quick-add>
            <strong>Quick add</strong>
            <select name="kind" aria-label="Entity type">
              <option value="subjects">Subject</option>
              <option value="teachers">Teacher</option>
              <option value="classes">Class</option>
            </select>
            <input name="name" required maxlength="80" placeholder="Name" aria-label="Name">
            <input name="abbr" maxlength="12" placeholder="Short code" aria-label="Short code">
            <button class="chrx-btn chrx-btn--primary" type="submit">Add</button>
            <p class="chrx-hero-quickadd__message" data-quick-add-message>Add a subject, teacher, or class without leaving this screen.</p>
          </form>
          <p class="chrx-hero__tip chrx-fade-in">Build the five inputs above, then lessons become draggable cards in the editor.</p>
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
    root.querySelector("[data-quick-add]")?.addEventListener("submit", quickAdd);
  }

  function quickAdd(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const kind = form.elements.kind.value;
    const name = form.elements.name.value.trim();
    const abbr = form.elements.abbr.value.trim();
    const message = form.querySelector("[data-quick-add-message]");
    const school = global.APP && global.APP.school;
    if (!school || !name || !["subjects", "teachers", "classes"].includes(kind)) return;
    const list = school[kind] || (school[kind] = []);
    if (list.some((item) => String(item.name || "").toLowerCase() === name.toLowerCase())) {
      if (message) message.textContent = name + " already exists.";
      form.elements.name.focus();
      return;
    }

    const D = global.EntityDialog;
    const prefix = kind === "subjects" ? "s" : kind === "teachers" ? "t" : "c";
    const entity = {
      id: D && D.uid ? D.uid(prefix) : prefix + "_" + Date.now().toString(36),
      name,
      abbr: abbr || undefined,
      color: D && D.autoPickColor ? D.autoPickColor(kind) : undefined,
    };
    if (kind === "teachers") entity.lastName = name;
    list.push(entity);
    if (global.CreateNew && global.CreateNew.refreshIndex) global.CreateNew.refreshIndex();
    if (global.APP.audit && global.APP.audit.append) {
      global.APP.audit.append({ entity: kind, op: "add", after: { ...entity }, source: "hero-quick-add" });
    }
    form.reset();
    if (message) message.textContent = name + " added.";
    document.dispatchEvent(new CustomEvent("entity:changed", { detail: { entity: kind, source: "hero-quick-add" } }));
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

  // Re-render the editor whenever an entity changes (so the hero card swaps to grid).
  // Debounced: rapid-fire undo/redo bursts dispatch many entity:changed events; coalesce them.
  let _entityChangedTimer = null;
  document.addEventListener("entity:changed", () => {
    clearTimeout(_entityChangedTimer);
    _entityChangedTimer = setTimeout(() => {
      if (document.getElementById("step-6") && !document.getElementById("step-6").classList.contains("hidden")) {
        activate();
      }
    }, 80);
  });

  global.EditorActivator = { activate, deactivate, updatePendingCount };
})(window);
