/**
 * Orchestrator — step navigation, XML upload, search, language toggle.
 */
(function () {
  "use strict";
  const t = (k) => I18N.t(k);

  // ─── Event Delegation for CTA Buttons (P129 Load-Order / DOM Re-render fixes) ───
  document.addEventListener("click", async (e) => {
    const demoBtn = e.target.closest("#cta-load-demo");
    const buildBtn = e.target.closest("#cta-build-new");
    const infoBtn = e.target.closest("#start-sample-info");

    if (demoBtn) {
      e.preventDefault();
      if (window.Tour && window.Tour.end) window.Tour.end();
      const status = document.getElementById("xml-status");
      if (status) status.innerHTML = `<span class="text-slate-500">Loading bundled sample…</span>`;
      try {
        const r = await fetch("./sample-school.xml");
        if (!r.ok) throw new Error("HTTP " + r.status);
        const xmlText = await r.text();
        const blob = new Blob([xmlText], { type: "application/xml" });
        const file = new File([blob], "sample-school.xml", { type: "application/xml" });
        const school = await parseTimetableXml.parseFile(file);
        window.APP.school = school;
        if (window.CreateNew && window.CreateNew.ensureColors) window.CreateNew.ensureColors();
        const c = school._meta.counts;
        if (status) status.innerHTML = `<span class="text-emerald-700 font-semibold">Loaded.</span> <span class="text-slate-600">${c.teachers} teachers · ${c.classes} classes · ${c.subjects} subjects · ${c.classrooms} rooms · ${c.lessons} lessons · ${c.cards} cards</span>`;
        document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
        document.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { source: "demo-xml" } }));
        setTimeout(() => showStep(6), 250);
      } catch (err) {
        console.warn("[demo] bundled XML fetch failed, falling back to 22-card seed:", err);
        if (status) status.innerHTML = `<span class="text-amber-700">Bundled file unavailable, using 22-card demo instead.</span>`;
        if (window.CreateNew && window.CreateNew.createDemoSeed) {
          window.CreateNew.createDemoSeed();
          document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
          showStep(6);
        }
      }
    } else if (buildBtn) {
      e.preventDefault();
      if (window.SchoolTemplates && window.SchoolTemplates.showPicker) {
        try {
          const S = window.APP && window.APP.school;
          const hasData = S && ((S.teachers && S.teachers.length) || (S.cards && S.cards.length));
          if (hasData && !confirm("A timetable is already loaded. Replace it with a fresh start?")) return;
        } catch (err) {}
        window.SchoolTemplates.showPicker((id, result) => {
          if (window.OnboardingWiring && window.OnboardingWiring.onTemplatePicked) {
            window.OnboardingWiring.onTemplatePicked(id, result);
          } else {
            document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
            if (window.WizardWalkthrough && window.WizardWalkthrough.start) {
              window.WizardWalkthrough.start();
            } else {
              showStep(6);
            }
          }
        });
        return;
      }
      
      // Fallback build-new handler
      if (window.Tour && window.Tour.end) window.Tour.end();
      if (window.APP.school && (window.APP.school.teachers.length || window.APP.school.cards.length)) {
        if (!confirm("A timetable is already loaded. Replace it with a new one?")) return;
      }
      if (window.CreateNew && window.CreateNew.createBlank) {
        window.CreateNew.createBlank();
        document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
        if (window.WizardWalkthrough && window.WizardWalkthrough.start) {
          window.WizardWalkthrough.start();
        } else {
          showStep(6);
        }
      }
    } else if (infoBtn) {
      e.preventDefault();
      if (window.StartScreen && window.StartScreen.openSampleInfo) {
        window.StartScreen.openSampleInfo();
      } else {
        openSampleInfoFallback();
      }
    }
  });

  function openSampleInfoFallback() {
    const title = "Sample school";
    const paragraphs = [
      "The bundled demo contains a realistic school setup with teachers, classes, rooms, subjects, lessons, bell periods, and placed timetable cards.",
      "It loads locally from this app, can be edited like any timetable, and is useful for trying the editor before opening your own file.",
    ];
    const D = window.EntityDialog;
    if (D && D.openSheet && D.el) {
      try {
        D.openSheet(D.el("div", { class: "chrx-start-info" },
          ...paragraphs.map((text) => D.el("p", null, text))
        ), { title });
        return;
      } catch (e) {}
    }
    const modal = document.createElement("div");
    modal.className = "chrx-start-modal";
    modal.innerHTML = `
      <div class="chrx-start-modal__panel" role="dialog" aria-modal="true" aria-label="Sample school">
        <h3>Sample school</h3>
        <p>${escapeHtml(paragraphs[0])}</p>
        <p>${escapeHtml(paragraphs[1])}</p>
        <button type="button" class="chrx-btn chrx-btn--primary">Done</button>
      </div>
    `;
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector("button").addEventListener("click", () => modal.remove());
    document.body.appendChild(modal);
  }

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
      case 1:
        if (window.StartScreen && window.StartScreen.render) window.StartScreen.render();
        break;
      case 2:
        // Prefer the multi-pane School Hub (its file docstring calls it
        // "multi-pane page for step-2"); fall back to SchoolInfo if missing.
        if (window.SchoolHub && window.SchoolHub.render) {
          window.SchoolHub.render(document.getElementById("step-2-body"));
        } else {
          SchoolInfo.render(document.getElementById("step-2-body"));
        }
        break;
      case 3: ClassGrid.render(document.getElementById("step-3-body")); break;
      case 4: TeacherGrid.render(document.getElementById("step-4-body")); break;
      case 5: RoomGrid.render(document.getElementById("step-5-body")); break;
      // case 6 is handled by EditorActivator listening to step:changed
    }
    // Entity toolbar: render when the editor is shown (or refresh if already mounted)
    const tbMount = document.getElementById("entity-toolbar-mount");
    if (tbMount && window.SchoolToolbar && window.SchoolToolbar.render) {
      window.SchoolToolbar.render(tbMount);
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
        if (/\.har$/i.test(f.name || "")) {
          if (!window.APP.school) throw new Error("Open or create a timetable before importing a HAR file.");
          if (!window.APP.io || !window.APP.io.importCardRelationshipsHARFile) {
            throw new Error("HAR importer is not ready yet.");
          }
          await window.APP.io.importCardRelationshipsHARFile(f);
          status.innerHTML = `<span class="text-emerald-700 font-semibold">Imported HAR.</span>`;
          input.value = "";
          return;
        }
        const t0 = performance.now();
        const school = await parseTimetableXml.parseFile(f);
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
    console.log("--> [main.js] boot() is executing!");
    const demoBtnCheck = document.getElementById("cta-load-demo");
    const buildBtnCheck = document.getElementById("cta-build-new");
    console.log("--> [main.js] cta-load-demo element exists:", !!demoBtnCheck);
    console.log("--> [main.js] cta-build-new element exists:", !!buildBtnCheck);

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
    // CreateNew.createBlank() fires `app:school-loaded`, which the editor
    // activator listens for and auto-advances to step 6. We then layer the
    // 5-step wizard walkthrough on top as a modal overlay.
    const buildBtn = document.getElementById("cta-build-new");
    if (buildBtn) {
      buildBtn.onclick = () => {
        if (window.Tour && window.Tour.end) window.Tour.end();
        if (window.APP.school && (window.APP.school.teachers.length || window.APP.school.cards.length)) {
          if (!confirm("A timetable is already loaded. Replace it with a new one?")) return;
        }
        // Friendly entry: show school template picker first. If the user picks
        // "Blank" we fall through to createBlank(); otherwise SchoolTemplates
        // seeds subjects/bell/classes/teachers/rooms for that school type.
        if (window.SchoolTemplates && window.SchoolTemplates.showPicker) {
          window.SchoolTemplates.showPicker((id /*, result */) => {
            document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
            // Wizard walkthrough overlay covers the seeded school
            if (window.WizardWalkthrough && window.WizardWalkthrough.start) {
              window.WizardWalkthrough.start();
            } else {
              showStep(6);
            }
          });
        } else if (window.CreateNew && window.CreateNew.createBlank) {
          // Fallback: no template picker loaded (shouldn't happen on live)
          window.CreateNew.createBlank();
          document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
          if (window.WizardWalkthrough && window.WizardWalkthrough.start) {
            window.WizardWalkthrough.start();
          } else {
            showStep(6);
          }
        }
      };
    }

    // ─── CTA: Load Demo Seed (bundled GD Goenka sample-school.xml) ──
    const demoBtn = document.getElementById("cta-load-demo");
    if (demoBtn) {
      demoBtn.onclick = async () => {
        if (window.Tour && window.Tour.end) window.Tour.end();
        const status = document.getElementById("xml-status");
        if (status) status.innerHTML = `<span class="text-slate-500">Loading bundled sample…</span>`;
        try {
          const r = await fetch("./sample-school.xml");
          if (!r.ok) throw new Error("HTTP " + r.status);
          const xmlText = await r.text();
          // Use the same parse pipeline as <input type="file">
          const blob = new Blob([xmlText], { type: "application/xml" });
          const file = new File([blob], "sample-school.xml", { type: "application/xml" });
          const school = await parseTimetableXml.parseFile(file);
          window.APP.school = school;
          if (window.CreateNew && window.CreateNew.ensureColors) window.CreateNew.ensureColors();
          const c = school._meta.counts;
          if (status) status.innerHTML = `<span class="text-emerald-700 font-semibold">Loaded.</span> <span class="text-slate-600">${c.teachers} teachers · ${c.classes} classes · ${c.subjects} subjects · ${c.classrooms} rooms · ${c.lessons} lessons · ${c.cards} cards</span>`;
          document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
          document.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { source: "demo-xml" } }));
          setTimeout(() => showStep(6), 250);
        } catch (e) {
          console.warn("[demo] bundled XML fetch failed, falling back to 22-card seed:", e);
          if (status) status.innerHTML = `<span class="text-amber-700">Bundled file unavailable, using 22-card demo instead.</span>`;
          if (window.CreateNew && window.CreateNew.createDemoSeed) {
            window.CreateNew.createDemoSeed();
            document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
            showStep(6);
          }
        }
      };
    }

    // ─── Listen for nav:goto-step events (fired by activators / wizards) ──
    document.addEventListener("nav:goto-step", e => {
      const n = e.detail && e.detail.step;
      if (n) showStep(n);
    });

    // ─── Classic skin toggle in editor header ──────────────────
    const skinBtn = document.getElementById("editor-toggle-skin");
    if (skinBtn) {
      skinBtn.onclick = () => {
        const html = document.documentElement;
        if (html.getAttribute("data-skin") === "classic") {
          html.removeAttribute("data-skin");
          skinBtn.classList.remove("bg-amber-100", "border-amber-500");
        } else {
          html.setAttribute("data-skin", "classic");
          skinBtn.classList.add("bg-amber-100", "border-amber-500");
        }
      };
    }

    // ─── Perspective rotator in editor header ──────────────────
    const persBtn = document.getElementById("editor-perspective");
    if (persBtn) {
      const PERS = ["class", "teacher", "room", "subject"];
      const LABEL = { class: "By Class", teacher: "By Teacher", room: "By Room", subject: "By Subject" };
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

    // ─── Card color axis rotator ──────────────────
    const colorBtn = document.getElementById("editor-color-by");
    if (colorBtn) {
      const AXIS = ["subject", "teacher", "class", "room"];
      const LABEL = { subject: "Color: Subject", teacher: "Color: Teacher", class: "Color: Class", room: "Color: Room" };
      let savedAxis = "subject";
      try { savedAxis = localStorage.getItem("chronexa.editor.colorBy") || "subject"; } catch {}
      if (!AXIS.includes(savedAxis)) savedAxis = "subject";
      window.APP.editor = window.APP.editor || {};
      window.APP.editor.colorBy = savedAxis;
      colorBtn.textContent = LABEL[savedAxis];
      colorBtn.onclick = () => {
        const cur = window.APP.editor.colorBy || "subject";
        const next = AXIS[(AXIS.indexOf(cur) + 1) % AXIS.length];
        window.APP.editor.colorBy = next;
        colorBtn.textContent = LABEL[next];
        try { localStorage.setItem("chronexa.editor.colorBy", next); } catch {}
        if (window.EditorActivator) window.EditorActivator.activate();
      };
    }

    // ─── Lesson-grid matrix entry in editor header ──────────────
    const lgBtn = document.getElementById("editor-lesson-grid");
    if (lgBtn) {
      lgBtn.onclick = () => {
        if (window.LessonsGridMatrix && window.LessonsGridMatrix.open) {
          window.LessonsGridMatrix.open(window.APP.school);
        } else {
          alert("Lesson grid matrix is not loaded yet — try again in a moment.");
        }
      };
    }

    // ─── Card density toggle in editor header ──────────────────
    const densBtn = document.getElementById("editor-density");
    if (densBtn) {
      // Restore from localStorage; default to compact.
      let savedDens = "compact";
      try { savedDens = localStorage.getItem("chronexa.editor.density") || "compact"; } catch {}
      window.APP.editor = window.APP.editor || {};
      window.APP.editor.density = savedDens;
      densBtn.textContent = savedDens === "compact" ? "Compact" : "Comfortable";
      densBtn.onclick = () => {
        const cur = window.APP.editor.density || "compact";
        const next = cur === "compact" ? "comfortable" : "compact";
        window.APP.editor.density = next;
        densBtn.textContent = next === "compact" ? "Compact" : "Comfortable";
        try { localStorage.setItem("chronexa.editor.density", next); } catch {}
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
