/**
 * Orchestrator — step navigation, XML upload, search, language toggle.
 */
(function () {
  "use strict";
  const t = (k) => I18N.t(k);

  // ----- Error banner (red on-page, copy of sitting-planner pattern) --------
  function showError(where, err) {
    const msg = (err && err.message) ? err.message : String(err);
    const stack = (err && err.stack) ? err.stack.split("\n").slice(0, 4).join("\n") : "";
    const banner = document.createElement("div");
    banner.className = "error-banner";
    banner.style.cssText = "background:#fee2e2;border:1px solid #f87171;color:#991b1b;padding:12px;margin:8px 0;border-radius:6px;font-size:12px;font-family:monospace;white-space:pre-wrap;";
    banner.innerHTML = `<strong>${escapeHtml(where)}:</strong>\n${escapeHtml(msg)}\n${escapeHtml(stack)}`;
    const slot = document.getElementById("error-slot") || document.body;
    slot.prepend(banner);
    console.error(`[${where}]`, err);
  }
  window.addEventListener("error", (e) => showError("error", e.error || e));
  window.addEventListener("unhandledrejection", (e) => showError("async", e.reason));
  window._showError = showError;

  // ----- Step navigation ----------------------------------------------------
  function showStep(n) {
    window.APP.step = n;
    for (let i = 1; i <= 6; i++) {
      document.getElementById("step-" + i)?.classList.toggle("hidden", i !== n);
    }
    document.querySelectorAll(".step-btn").forEach(b => {
      const active = parseInt(b.dataset.step, 10) === n;
      // step 6 has its own emerald primary; don't paint it blue when active
      const isEditor = parseInt(b.dataset.step, 10) === 6;
      if (!isEditor) {
        b.classList.toggle("bg-blue-700", active);
        b.classList.toggle("text-white",  active);
        b.classList.toggle("bg-slate-200", !active);
        b.classList.toggle("text-slate-700", !active);
      }
      b.setAttribute("aria-current", active ? "step" : "false");
    });
    renderActiveStep();
    // notify the editor activator + other listeners
    document.dispatchEvent(new CustomEvent("step:changed", { detail: { step: n } }));
  }
  function renderActiveStep() {
    switch (window.APP.step) {
      case 2: SchoolInfo.render(document.getElementById("step-2-body")); break;
      case 3: ClassGrid.render(document.getElementById("step-3-body")); break;
      case 4: TeacherGrid.render(document.getElementById("step-4-body")); break;
      case 5: RoomGrid.render(document.getElementById("step-5-body")); break;
      // case 6 is handled by EditorActivator listening to step:changed
    }
  }

  // ----- Search ------------------------------------------------------------
  function wireSearch() {
    const input = document.getElementById("search-input");
    if (!input) return;
    input.placeholder = t("searchPlaceholder");
    let timer = null;
    input.addEventListener("input", () => {
      window.APP.filter = input.value.trim().toLowerCase();
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Cheap path: hide rows by text-content lookup
        const host = activeHost();
        if (host) GridView.applyFilter(host);
      }, 80);
    });
  }
  function activeHost() {
    return document.getElementById(`step-${window.APP.step}-body`);
  }

  // ----- Language toggle ---------------------------------------------------
  function wireLang() {
    const en = document.getElementById("lang-en");
    const hi = document.getElementById("lang-hi");
    if (!en || !hi) return;
    en.onclick = () => setLang("en");
    hi.onclick = () => setLang("hi");
    updateLangButtons();
  }
  function setLang(lang) {
    window.APP.lang = lang;
    applyStaticLabels();
    updateLangButtons();
    renderActiveStep();
  }
  function updateLangButtons() {
    document.querySelectorAll("[data-lang]").forEach(b => {
      const active = b.dataset.lang === window.APP.lang;
      b.classList.toggle("bg-blue-700", active);
      b.classList.toggle("text-white",  active);
      b.classList.toggle("bg-white",    !active);
      b.classList.toggle("text-slate-700", !active);
    });
  }
  function applyStaticLabels() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const k = el.dataset.i18n;
      el.textContent = t(k);
    });
    const s = document.getElementById("search-input");
    if (s) s.placeholder = t("searchPlaceholder");
  }

  // ----- XML upload --------------------------------------------------------
  function wireXmlUpload() {
    const input = document.getElementById("xml-file");
    if (!input) return;
    input.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const status = document.getElementById("xml-status");
      status.innerHTML = `<span class="text-slate-500">${escapeHtml(t("parsing"))}</span>`;
      try {
        const t0 = performance.now();
        const school = await parseAscXml.parseFile(f);
        const dt = Math.round(performance.now() - t0);
        window.APP.school = school;
        const c = school._meta.counts;
        status.innerHTML = `
          <span class="text-emerald-700 font-semibold">${escapeHtml(t("parseOK"))}</span>
          <span class="text-slate-600">
            ${c.teachers} teachers · ${c.classes} classes · ${c.subjects} subjects ·
            ${c.classrooms} rooms · ${c.lessons} lessons · ${c.cards} cards
            <span class="text-slate-400 ml-1">(${dt} ms)</span>
          </span>`;
        document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
        // Auto-color anything without a color (Agent A's parser doesn't always set them)
        if (window.CreateNew && window.CreateNew.ensureColors) window.CreateNew.ensureColors();
        // Fire school-loaded event so EditorActivator can hook
        document.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { source: "upload-xml" } }));
        // Auto-advance to the Editor (was School Info; users want the grid first)
        setTimeout(() => showStep(6), 250);
      } catch (err) {
        console.error(err);
        status.innerHTML = `<span class="text-rose-700 font-semibold">${escapeHtml(t("parseFail"))} ${escapeHtml(err.message || "")}</span>`;
      }
    });
  }

  // ----- Boot --------------------------------------------------------------
  function boot() {
    document.querySelectorAll(".step-btn").forEach(b => {
      b.onclick = () => {
        const n = parseInt(b.dataset.step, 10);
        if (n > 1 && !window.APP.school) {
          // Gate steps 2-6 behind a parsed-or-created school
          showError(t("needXml") || "Build or load a timetable first.", new Error(""));
          return;
        }
        showStep(n);
      };
    });

    // ─── CTA: Build New Timetable ────────────────────────────
    const buildBtn = document.getElementById("cta-build-new");
    if (buildBtn) {
      buildBtn.onclick = () => {
        if (window.APP.school && (window.APP.school.teachers.length || window.APP.school.cards.length)) {
          if (!confirm("A timetable is already loaded. Replace it with a blank one?")) return;
        }
        if (window.CreateNew && window.CreateNew.createBlank) {
          window.CreateNew.createBlank();
          document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
          // jump to editor
          showStep(6);
        }
      };
    }

    // ─── CTA: Load Demo Seed ─────────────────────────────────
    const demoBtn = document.getElementById("cta-load-demo");
    if (demoBtn) {
      demoBtn.onclick = () => {
        if (window.CreateNew && window.CreateNew.createDemoSeed) {
          window.CreateNew.createDemoSeed();
          document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
          showStep(6);
        }
      };
    }

    // ─── Listen for nav:goto-step events (fired by activators / wizards) ──
    document.addEventListener("nav:goto-step", e => {
      const n = e.detail && e.detail.step;
      if (n) showStep(n);
    });

    // ─── EduPage skin toggle in editor header ──────────────────
    const skinBtn = document.getElementById("editor-toggle-skin");
    if (skinBtn) {
      skinBtn.onclick = () => {
        const html = document.documentElement;
        if (html.getAttribute("data-skin") === "edupage") {
          html.removeAttribute("data-skin");
          skinBtn.classList.remove("bg-amber-100", "border-amber-500");
        } else {
          html.setAttribute("data-skin", "edupage");
          skinBtn.classList.add("bg-amber-100", "border-amber-500");
        }
      };
    }

    // ─── Perspective rotator in editor header ──────────────────
    const persBtn = document.getElementById("editor-perspective");
    if (persBtn) {
      const PERS = ["class", "teacher", "room"];
      const LABEL = { class: "By Class", teacher: "By Teacher", room: "By Room" };
      persBtn.onclick = () => {
        const cur = (window.APP.editor && window.APP.editor.perspective) || "class";
        const next = PERS[(PERS.indexOf(cur) + 1) % PERS.length];
        window.APP.editor = window.APP.editor || {};
        window.APP.editor.perspective = next;
        persBtn.textContent = LABEL[next];
        // Re-render
        if (window.EditorActivator) window.EditorActivator.activate();
      };
    }

    wireSearch();
    wireLang();
    wireXmlUpload();
    applyStaticLabels();
    showStep(1);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
