/* Chronexa Solver — Pre-launch dialog
 *
 * Mirrors Classic's `Test the timetable` / `Generate timetable` pre-flight.
 * See docs/legacy-research §B and the gap-map's
 * Complexity / Conditions / Algorithm matrix.
 *
 * Public API:
 *   SolverUI.PreLaunch.open(opts)
 *     opts.defaultMode      : "generate" | "test"   (default "generate")
 *     opts.school           : SchoolData            (only used for the card-count badge)
 *     opts.onConfirm(cfg)   : called with the chosen config, the dialog has already closed
 *     opts.onCancel()       : called when user dismisses
 *
 *   cfg = {
 *     mode:       "generate" | "test",
 *     complexity: "normal" | "large" | "huge",   // → timeLimitSec 30 / 60 / 120
 *     conditions: "draft" | "relax" | "strict",  // → solver options.conditions (advisory; solver ignores today)
 *     algorithm:  "browser" | "wasm" | "cloud",  // JS Worker · WASM CP-SAT · POST /solve
 *     showReport: true | false                   // open solver report after run
 *   }
 *
 * Design notes:
 *   - Globals/IIFE pattern (matches other components in js/ui/components/).
 *   - Uses the existing `chrx-*` theme tokens; no Tailwind.
 *   - The dialog is built on first open and reused (cheap toggle).
 *   - Card-count badge helps the user pick complexity ("1482 cards → Large").
 */
(function (global) {
  "use strict";

  const TIME_LIMIT_BY_COMPLEXITY = { normal: 30, large: 60, huge: 120 };

  let host, dialog, current;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function radioGroup(name, options, defaultValue) {
    const wrap = el("div", { class: "csu-radio-row", role: "radiogroup", "aria-label": name });
    for (const o of options) {
      const id = `csu-${name}-${o.value}`;
      const input = el("input", { type: "radio", name, id, value: o.value });
      if (o.value === defaultValue) input.checked = true;
      const lab = el("label", { class: "csu-radio", for: id },
        input,
        el("span", { class: "csu-radio__title" }, o.label),
        o.hint ? el("span", { class: "csu-radio__hint" }, o.hint) : null,
      );
      wrap.appendChild(lab);
    }
    return wrap;
  }

  function selectedRadio(wrap, name) {
    const r = wrap.querySelector(`input[name="${name}"]:checked`);
    return r ? r.value : null;
  }

  function build() {
    host = el("div", { class: "csu-backdrop", role: "presentation", "aria-hidden": "true" });
    host.addEventListener("click", (e) => { if (e.target === host) doCancel(); });

    dialog = el("section", {
      class: "csu-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "csu-prelaunch-title",
    });

    const titleEl = el("h2", { class: "csu-dialog__title", id: "csu-prelaunch-title" }, "Run the solver");
    const sub = el("p", { class: "csu-dialog__sub" }, "Pick how to check or build your timetable.");
    const summary = el("div", { class: "csu-dialog__summary", id: "csu-prelaunch-summary" }, "");

    // --- Mode (Test vs Generate) — big buttons + linked hidden radio --------
    const modeBtnTest = el("button", {
      type: "button",
      class: "csu-modebtn",
      "data-mode": "test",
      onclick: () => setMode("test"),
    },
      el("span", { class: "csu-modebtn__icon" }, "✓"),
      el("span", { class: "csu-modebtn__title" }, "Test the timetable"),
      el("span", { class: "csu-modebtn__hint" }, "Validate constraints — does not move any card."),
    );
    const modeBtnGen = el("button", {
      type: "button",
      class: "csu-modebtn",
      "data-mode": "generate",
      onclick: () => setMode("generate"),
    },
      el("span", { class: "csu-modebtn__icon" }, "✦"),
      el("span", { class: "csu-modebtn__title" }, "Generate timetable"),
      el("span", { class: "csu-modebtn__hint" }, "Run the solver from scratch and place cards."),
    );
    const modeBtnImp = el("button", {
      type: "button",
      class: "csu-modebtn",
      "data-mode": "improve",
      onclick: () => setMode("improve"),
    },
      el("span", { class: "csu-modebtn__icon" }, "⚡"),
      el("span", { class: "csu-modebtn__title" }, "Improve current schedule"),
      el("span", { class: "csu-modebtn__hint" }, "Keep existing placements; search outward via LNS for improvements."),
    );
    const modeBtnBest = el("button", {
      type: "button",
      class: "csu-modebtn",
      "data-mode": "best",
      onclick: () => setMode("best"),
    },
      el("span", { class: "csu-modebtn__icon" }, "★"),
      el("span", { class: "csu-modebtn__title" }, "Best timetable"),
      el("span", { class: "csu-modebtn__hint" }, "Draft fast, then perfect with CP-SAT — one click, offline, toward 100%."),
    );
    const modeRow = el("div", { class: "csu-mode-row" }, modeBtnTest, modeBtnGen, modeBtnImp, modeBtnBest);

    // --- Complexity ----------------------------------------------------------
    const complexity = radioGroup("complexity", [
      { value: "normal", label: "Normal", hint: "30s · small school" },
      { value: "large",  label: "Large",  hint: "60s · 30–50 classes" },
      { value: "huge",   label: "Huge",   hint: "2 min · 60+ teachers" },
    ], "large");

    // --- Conditions ----------------------------------------------------------
    const conditions = radioGroup("conditions", [
      { value: "draft",  label: "Draft",             hint: "Accept any partial result." },
      { value: "relax",  label: "Allow relaxation",  hint: "Skip the toughest soft constraints if stuck." },
      { value: "strict", label: "Strict",            hint: "Reject anything with hard conflicts." },
    ], "relax");

    // --- Algorithm -----------------------------------------------------------
    const cloudReady = !!(global.CHRONEXA_BACKEND_URL && global.CHRONEXA_BACKEND_URL.length > 0);
    const algorithm = radioGroup("algorithm", [
      { value: "browser", label: "Run on this computer", hint: "Uses a Web Worker. Stays offline." },
      { value: "wasm",    label: "CP-SAT in browser",    hint: "Full OR-Tools portfolio · offline · multi-threaded." },
      { value: "cloud",   label: "Run on cloud",          hint: cloudReady ? "OR-Tools CP-SAT via backend." : "Backend URL not set — will fall back to browser." },
    ], "browser");

    // --- Report toggle -------------------------------------------------------
    const reportTog = el("input", { type: "checkbox", id: "csu-show-report" });
    reportTog.checked = true;
    const reportLabel = el("label", { class: "csu-toggle", for: "csu-show-report" },
      reportTog,
      el("span", null, "Show solver report after run"),
    );

    // --- Actions -------------------------------------------------------------
    const cancelBtn = el("button", { type: "button", class: "chrx-btn", onclick: doCancel }, "Cancel");
    const startBtn  = el("button", { type: "button", class: "chrx-btn chrx-btn--primary", id: "csu-prelaunch-start", onclick: doStart }, "Start");
    const actions = el("div", { class: "csu-dialog__actions" }, cancelBtn, startBtn);

    dialog.append(
      titleEl, sub,
      modeRow,
      summary,
      sectionTitle("Complexity"),    complexity,
      sectionTitle("Conditions"),    conditions,
      // Algorithm (backend) only matters for Generate/Improve. setMode() hides
      // this section for Test (always local) and Best (always the pipeline).
      el("div", { id: "csu-algo-section" }, sectionTitle("Algorithm"), algorithm),
      reportLabel,
      actions,
    );
    host.appendChild(dialog);
    document.body.appendChild(host);

    // Esc to cancel.
    host.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); doCancel(); }
    });
  }

  function sectionTitle(text) {
    return el("h3", { class: "csu-dialog__section" }, text);
  }

  function setMode(mode) {
    if (!dialog) return;
    dialog.querySelectorAll(".csu-modebtn").forEach(b => {
      b.classList.toggle("is-selected", b.dataset.mode === mode);
    });
    const startBtn = dialog.querySelector("#csu-prelaunch-start");
    if (startBtn) startBtn.textContent =
      mode === "test" ? "Run test" :
      mode === "best" ? "Build best timetable" :
      mode === "improve" ? "Improve" : "Start generation";
    // Algorithm/backend choice only applies to Generate and Improve.
    const algoSec = dialog.querySelector("#csu-algo-section");
    if (algoSec) algoSec.style.display = (mode === "generate" || mode === "improve") ? "" : "none";
    dialog.dataset.mode = mode;
  }

  function setSummary(school) {
    const sum = dialog.querySelector("#csu-prelaunch-summary");
    if (!sum) return;
    if (!school) { sum.textContent = ""; sum.classList.remove("is-on"); return; }
    // Prefer live arrays (set by templates / wizards) over _meta.counts which
    // is only populated by the XML import path. Without this the dialog
    // showed "0 teachers · 0 classes" on freshly-templated schools.
    const c = (school._meta && school._meta.counts) || {};
    const teachers = (school.teachers && school.teachers.length) || c.teachers || 0;
    const classes  = (school.classes  && school.classes.length)  || c.classes  || 0;
    const lessons  = (school.lessons  && school.lessons.length)  || c.lessons  || 0;
    const cards    = (school.cards    && school.cards.length)    || c.cards    || 0;
    sum.textContent = `${school.schoolName || "(school)"} · ${teachers} teachers · ${classes} classes · ${lessons} lessons · ${cards} placed`;
    sum.classList.add("is-on");
  }

  function doCancel() {
    close();
    if (current && current.onCancel) {
      try { current.onCancel(); } catch (e) { console.error(e); }
    }
    current = null;
  }

  function doStart() {
    const mode = dialog.dataset.mode || "best";
    const cfg = {
      mode,
      complexity: selectedRadio(dialog, "complexity") || "large",
      conditions: selectedRadio(dialog, "conditions") || "relax",
      algorithm:  selectedRadio(dialog, "algorithm")  || "browser",
      showReport: !!dialog.querySelector("#csu-show-report").checked,
    };
    cfg.timeLimitSec = TIME_LIMIT_BY_COMPLEXITY[cfg.complexity] || 60;
    // "Best timetable" = silent two-stage pipeline (JS draft -> WASM-CP-SAT
    // improve). Forces the "auto" backend regardless of the Algorithm radio.
    if (mode === "best") cfg.algorithm = "auto";
    if (mode === "improve") cfg.improve = true;
    // Improve mode = warm-start from current cards + LNS perturbation +
    // longer search budget. The solver also accepts options.mode==="improve"
    // as a shorthand alias for the same combination, so callers that pass
    // cfg directly into solve() work either way.
    if (mode === "improve") {
      cfg.warmStart = true;
      cfg.useLNS    = true;
    }
    const cb = current && current.onConfirm;
    close();
    current = null;
    if (cb) {
      try { cb(cfg); } catch (e) { console.error(e); }
    }
  }

  function suggestComplexity(school) {
    if (!school) return null;
    const lessons  = (school.lessons  && school.lessons.length)  || 0;
    const teachers = (school.teachers && school.teachers.length) || 0;
    const classes  = (school.classes  && school.classes.length)  || 0;
    // Empirical: a 23-class / 66-teacher / 381-lesson school needs >60s.
    // Auto-pick Huge for anything above the Large threshold so first-time
    // Generate doesn't time out on real-world XML imports.
    if (lessons > 200 || teachers > 50 || classes > 25) return "huge";
    if (lessons > 80  || teachers > 25 || classes > 12) return "large";
    return "normal";
  }
  function applySuggestedComplexity(school) {
    if (!dialog) return;
    const suggested = suggestComplexity(school);
    if (!suggested) return;
    const radios = dialog.querySelectorAll("input[name='complexity']");
    radios.forEach(r => { r.checked = (r.value === suggested); });
  }

  function open(opts) {
    current = opts || {};
    if (!host) build();
    setMode(current.defaultMode || "best");
    const targetSchool = current.school || (global.APP && global.APP.school) || null;
    setSummary(targetSchool);
    applySuggestedComplexity(targetSchool);
    host.classList.add("is-open");
    host.setAttribute("aria-hidden", "false");
    // Focus the start button after frame so screen readers track it.
    requestAnimationFrame(() => {
      const f = dialog.querySelector("#csu-prelaunch-start");
      if (f) f.focus();
    });
  }
  function close() {
    if (!host) return;
    host.classList.remove("is-open");
    host.setAttribute("aria-hidden", "true");
  }

  global.SolverUI = global.SolverUI || {};
  global.SolverUI.PreLaunch = { open, close };
})(typeof window !== "undefined" ? window : globalThis);
