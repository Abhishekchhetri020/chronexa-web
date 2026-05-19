/**
 * Wizard Walkthrough — 5-step Classic-style onboarding overlay.
 *
 * Replaces the jarring "Create new → blank editor" flow with a sequential
 * walkthrough: Subjects → Teachers → Classes → Classrooms → Lessons.
 *
 * Rendered as a fullscreen modal overlay on top of the editor (which the
 * activator has already activated via the `app:school-loaded` event). On
 * Finish (or close-at-any-time), the user lands on the editor — empty-state
 * hero from `editor/activator.js` handles the case where they skipped all 5.
 *
 * Exports `window.WizardWalkthrough = { start(), close() }`.
 */
(function (global) {
  "use strict";

  const STEPS = [
    {
      key: "subjects",
      title: "Subjects",
      icon: "📚",
      instruction: "Add the subjects taught at your school — Maths, Science, English, Hindi, and so on.",
      hint: "Click + Add subject to open the full editor. Repeat for as many subjects as you teach.",
      open: () => window.EntitySubjects && window.EntitySubjects.open(),
      describe: (s) => s.name + (s.abbr ? " (" + s.abbr + ")" : ""),
      color: "emerald",
    },
    {
      key: "teachers",
      title: "Teachers",
      icon: "👨‍🏫",
      instruction: "Add the teachers on your staff. Each teacher gets a colour so their cards are easy to spot.",
      hint: "Last name is required. Abbreviation + colour are recommended for the editor grid.",
      open: () => window.EntityTeachers && window.EntityTeachers.open(),
      describe: (t) => (t.name || ((t.firstName || "") + " " + (t.lastName || "")).trim()) + (t.abbr ? " (" + t.abbr + ")" : ""),
      color: "blue",
    },
    {
      key: "classes",
      title: "Classes",
      icon: "👥",
      instruction: "Add the classes (sections) — I-A, VI-B, X-C, and the rest.",
      hint: "Optionally pick a class teacher and home classroom now, or leave them blank and set them later.",
      open: () => window.EntityClasses && window.EntityClasses.open(),
      describe: (c) => c.name + (c.abbr ? " (" + c.abbr + ")" : ""),
      color: "violet",
    },
    {
      key: "classrooms",
      title: "Classrooms",
      icon: "🚪",
      instruction: "Add the physical rooms — Lab, Library, Music Room, normal classrooms.",
      hint: "Each lesson can be locked to a specific room or pool of rooms once you create lessons in the next step.",
      open: () => window.EntityClassrooms && window.EntityClassrooms.open(),
      describe: (r) => r.name + (r.abbr ? " (" + r.abbr + ")" : ""),
      color: "amber",
    },
    {
      key: "lessons",
      title: "Lessons",
      icon: "📝",
      instruction: "Tie it all together: each lesson is a subject + teacher(s) + class(es) + how many periods/week.",
      hint: "Lessons are what becomes draggable cards. No lessons = no cards in the editor.",
      open: () => window.EntityLessons && window.EntityLessons.open(),
      describe: (l) => {
        const idx = (window.APP.school && window.APP.school._idx) || {};
        const subj = (idx.subjectById && idx.subjectById[l.subjectId]);
        const subjName = subj ? subj.name : l.subjectId;
        const n = l.periodsPerWeek || 0;
        const cls = (l.classIds || []).length;
        return subjName + " — " + n + "× — " + cls + " class" + (cls === 1 ? "" : "es");
      },
      color: "rose",
    },
  ];

  let host = null;
  let active = 0;
  let observer = null;

  // ─── Public API ─────────────────────────────────────────────────────────
  function start() {
    if (host) close();
    active = 0;
    host = buildShell();
    document.body.appendChild(host);
    document.addEventListener("keydown", onKey, true);

    // When an entity dialog closes, the user is back on the wizard — re-render
    // the pane so the live counts/list update. We watch the body for removal
    // of `.chrx-ent-dialog` rather than monkey-patching EntityDialog.
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.removedNodes) {
          if (node && node.nodeType === 1 && node.classList && node.classList.contains("chrx-ent-dialog")) {
            renderPane();
            document.dispatchEvent(new CustomEvent("entity:changed"));
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });

    renderPane();
  }

  function close() {
    document.removeEventListener("keydown", onKey, true);
    if (observer) { try { observer.disconnect(); } catch (e) {} observer = null; }
    if (host) { host.remove(); host = null; }
    // Notify listeners so editor grid / activator update with whatever the
    // user added. We do NOT dispatch nav:goto-step — activator already put
    // us on step 6 when `app:school-loaded` fired.
    document.dispatchEvent(new CustomEvent("entity:changed"));
  }

  // ─── Shell ──────────────────────────────────────────────────────────────
  function buildShell() {
    const root = document.createElement("div");
    root.className = "fixed inset-0 z-50 flex items-center justify-center p-4";
    root.style.background = "rgba(15, 23, 42, 0.55)";
    root.addEventListener("click", (e) => { if (e.target === root) close(); });

    const card = document.createElement("div");
    card.className = "bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden";
    card.id = "chrx-wizard-card";
    root.appendChild(card);
    return root;
  }

  // ─── Pane render ────────────────────────────────────────────────────────
  function renderPane() {
    if (!host) return;
    const card = host.querySelector("#chrx-wizard-card");
    if (!card) return;
    const step = STEPS[active];
    const list = ((window.APP.school && window.APP.school[step.key]) || []).slice();
    const n = list.length;

    card.innerHTML = "";

    // Header
    const header = document.createElement("div");
    header.className = "px-6 pt-5 pb-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white";
    header.innerHTML = `
      <div class="flex items-center justify-between gap-3 mb-2">
        <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Step ${active + 1} of ${STEPS.length}
        </div>
        <button type="button" id="chrx-wiz-x" aria-label="Close wizard"
                class="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-3xl">${step.icon}</div>
        <h2 class="text-2xl font-bold text-slate-900">${escapeHtml(step.title)}</h2>
      </div>
      <p class="text-sm text-slate-600 mt-2">${escapeHtml(step.instruction)}</p>
    `;
    card.appendChild(header);

    // Progress dots
    const progress = document.createElement("div");
    progress.className = "px-6 py-3 flex items-center gap-2 border-b border-slate-100 bg-white";
    for (let i = 0; i < STEPS.length; i++) {
      const dot = document.createElement("div");
      const isDone = i < active;
      const isActive = i === active;
      const cls = isActive
        ? "flex-1 h-1.5 rounded-full bg-blue-600"
        : isDone
          ? "flex-1 h-1.5 rounded-full bg-emerald-500"
          : "flex-1 h-1.5 rounded-full bg-slate-200";
      dot.className = cls;
      dot.title = "Step " + (i + 1) + " · " + STEPS[i].title;
      progress.appendChild(dot);
    }
    card.appendChild(progress);

    // Body — live list + Add button
    const body = document.createElement("div");
    body.className = "px-6 py-5 flex-1 overflow-y-auto";

    const countBar = document.createElement("div");
    countBar.className = "flex items-center justify-between mb-3";
    const countLabel = document.createElement("div");
    countLabel.className = "text-sm font-semibold text-slate-700";
    countLabel.textContent = n === 0
      ? "No " + step.title.toLowerCase() + " yet."
      : n + " " + step.title.toLowerCase().replace(/s$/, n === 1 ? "" : "s") + " added.";
    const ctaWrap = document.createElement("div");
    ctaWrap.className = "flex items-center gap-2";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "px-3 py-1.5 rounded-lg bg-" + step.color + "-600 text-white text-sm font-semibold hover:bg-" + step.color + "-700";
    addBtn.textContent = "+ Add " + step.title.toLowerCase().replace(/s$/, "");
    addBtn.addEventListener("click", () => { step.open(); });
    ctaWrap.appendChild(addBtn);

    // Bulk-add CTA — only for kinds the BulkAddWizard supports.
    const bulkSupported = ["subjects", "teachers", "classes", "classrooms"].includes(step.key);
    if (bulkSupported && window.BulkAddWizard && typeof window.BulkAddWizard.open === "function") {
      const bulkBtn = document.createElement("button");
      bulkBtn.type = "button";
      bulkBtn.className = "px-3 py-1.5 rounded-lg border border-" + step.color + "-300 text-" + step.color + "-700 text-sm font-semibold hover:bg-" + step.color + "-50";
      bulkBtn.textContent = "+ Bulk-add";
      bulkBtn.title = "Add many " + step.title.toLowerCase() + " at once — paste a list, type one per line, or import from spreadsheet";
      bulkBtn.addEventListener("click", () => {
        // BulkAddWizard.open(kind, school?) — pass current school explicitly
        // so the wizard never tries to re-load it.
        window.BulkAddWizard.open(step.key, window.APP && window.APP.school);
      });
      ctaWrap.appendChild(bulkBtn);
    }

    countBar.appendChild(countLabel);
    countBar.appendChild(ctaWrap);
    body.appendChild(countBar);

    if (n === 0) {
      const empty = document.createElement("div");
      empty.className = "border-2 border-dashed border-slate-200 rounded-xl p-8 text-center bg-slate-50";
      empty.innerHTML = `
        <div class="text-4xl mb-2">${step.icon}</div>
        <div class="text-sm text-slate-600">${escapeHtml(step.hint)}</div>
        <div class="text-xs text-slate-400 mt-3">Or click <em>Skip</em> below — you can come back to this anytime.</div>
      `;
      body.appendChild(empty);
    } else {
      const grid = document.createElement("div");
      grid.className = "grid sm:grid-cols-2 gap-2";
      list.forEach((item) => {
        const chip = document.createElement("div");
        chip.className = "flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm";
        const sw = document.createElement("span");
        sw.className = "inline-block w-3 h-3 rounded-full border border-slate-300 flex-shrink-0";
        sw.style.background = item.color || "transparent";
        const label = document.createElement("span");
        label.className = "truncate text-slate-700";
        label.textContent = step.describe(item);
        chip.appendChild(sw);
        chip.appendChild(label);
        grid.appendChild(chip);
      });
      body.appendChild(grid);
      const tip = document.createElement("div");
      tip.className = "text-xs text-slate-500 mt-3";
      tip.textContent = step.hint;
      body.appendChild(tip);
    }

    card.appendChild(body);

    // Footer — Back / Skip / Next / Finish
    const footer = document.createElement("div");
    footer.className = "px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center gap-2";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed";
    backBtn.textContent = "← Back";
    backBtn.disabled = active === 0;
    backBtn.addEventListener("click", () => { if (active > 0) { active--; renderPane(); } });
    footer.appendChild(backBtn);

    const spacer = document.createElement("div");
    spacer.className = "flex-1";
    footer.appendChild(spacer);

    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "px-4 py-2 rounded-lg text-slate-500 text-sm font-semibold hover:text-slate-700";
    skipBtn.textContent = "Skip";
    skipBtn.addEventListener("click", () => advance());
    footer.appendChild(skipBtn);

    const isLast = active === STEPS.length - 1;
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "px-5 py-2 rounded-lg bg-blue-700 text-white text-sm font-bold hover:bg-blue-800";
    nextBtn.textContent = isLast ? "Finish →" : "Next →";
    nextBtn.addEventListener("click", () => advance());
    footer.appendChild(nextBtn);

    card.appendChild(footer);

    // Wire close (×) button
    const xBtn = header.querySelector("#chrx-wiz-x");
    if (xBtn) xBtn.addEventListener("click", close);
  }

  function advance() {
    // Fire entity:changed so the editor grid + activator refresh with what
    // the user just added (per task spec).
    document.dispatchEvent(new CustomEvent("entity:changed"));
    if (active < STEPS.length - 1) {
      active++;
      renderPane();
      return;
    }
    // Last step → Finish. Close the wizard and explicitly nav to editor.
    close();
    document.dispatchEvent(new CustomEvent("nav:goto-step", { detail: { step: 6 } }));
  }

  function onKey(e) {
    if (!host) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    // Block bubbling to the underlying step nav while wizard is open
    if (e.key === "ArrowRight") { e.preventDefault(); advance(); }
    if (e.key === "ArrowLeft" && active > 0) { e.preventDefault(); active--; renderPane(); }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  global.WizardWalkthrough = { start, close };
})(window);
