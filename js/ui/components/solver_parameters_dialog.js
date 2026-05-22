/* Solver parameters dialog (audit §6.9).
 *
 * Classic's "Parameters" sub-dialog lets the user tune the solver's
 * runtime budget, condition strictness, soft-constraint weights. We
 * surface the same knobs as a single sheet that writes APP.solverParams
 * (consumed by SolverUI.run via the prelaunch_dialog merge — see
 * prelaunch_dialog.js#doStart, which spreads draft.* into cfg already;
 * APP.solverParams is a separate persistent layer applied on top so
 * users don't have to retune at every Generate).
 *
 * Persists to localStorage so the values survive reload.
 *
 * Reached via Timetable menu → "Solver parameters…" or app:solver-params.
 */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;
  const APP = window.APP = window.APP || {};

  const STORAGE_KEY = "chronexa.solverParams";
  const DEFAULTS = {
    timeLimitSec: 60,
    conditions: "relax",
    seed: 0,                  // 0 = random; non-zero = deterministic
    teacherGapWeight: 50,     // 0..100 slider, scaled into solver weights
    classGapWeight:   40,
    distributionWeight: 30,
    roomStabilityWeight: 20,
    consecutiveOverloadWeight: 60,
    lastPeriodOverflowWeight: 50,
    // Timefold port — Late Acceptance Hill-Climbing in the LNS accept
    // rule. lahcLen is the history window; bigger = more tolerance for
    // uphill moves.
    useLAHC: false,
    lahcLen: 100,
    // Tier-A ports — new FET-style toggles surfaced to the user.
    minRestingPeriods: 0,
    minGapsBetweenBuildingChanges: 0,
    maxBuildingChangesPerDay: -1,
  };

  function load() {
    if (APP.solverParams && Object.keys(APP.solverParams).length) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch {}
    APP.solverParams = Object.assign({}, DEFAULTS, saved);
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(APP.solverParams)); } catch {}
    // Tier-A wiring — mirror onto school.settings so csp_solver.buildModel
    // can read them. localStorage covers the cross-session case; school
    // settings covers the per-school persistence + XML round-trip.
    if (APP.school) {
      APP.school.settings = APP.school.settings || {};
      APP.school.settings.solverParams = Object.assign({}, APP.solverParams);
      APP.school.settings.minRestingPeriods = APP.solverParams.minRestingPeriods | 0;
      APP.school.settings.minGapsBetweenBuildingChanges = APP.solverParams.minGapsBetweenBuildingChanges | 0;
      APP.school.settings.maxBuildingChangesPerDay = APP.solverParams.maxBuildingChangesPerDay | 0;
    }
    window.dispatchEvent(new CustomEvent("app:solver-params-changed", { detail: APP.solverParams }));
    (window._chrxNotify || function () {})("Solver parameters saved", "info");
  }

  function row(label, control, hint) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:12px;margin:6px 0";
    const lab = document.createElement("label");
    lab.style.cssText = "min-width:200px;font-size:12px;color:#475569";
    lab.textContent = label;
    wrap.appendChild(lab);
    wrap.appendChild(control);
    if (hint) {
      const h = document.createElement("span");
      h.style.cssText = "font-size:11px;color:#94a3b8";
      h.textContent = hint;
      wrap.appendChild(h);
    }
    return wrap;
  }
  function num(key, min, max, step) {
    const i = document.createElement("input");
    i.type = "number";
    i.min = String(min); i.max = String(max); i.step = String(step || 1);
    i.value = APP.solverParams[key];
    i.style.cssText = "width:90px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px";
    i.oninput = e => APP.solverParams[key] = parseFloat(e.target.value) || 0;
    return i;
  }
  function slider(key, min, max) {
    const i = document.createElement("input");
    i.type = "range";
    i.min = String(min); i.max = String(max); i.step = "1";
    i.value = APP.solverParams[key];
    i.style.cssText = "flex:1";
    const out = document.createElement("output");
    out.style.cssText = "min-width:32px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:#475569";
    out.textContent = String(APP.solverParams[key]);
    i.oninput = e => {
      const v = parseInt(e.target.value, 10) || 0;
      APP.solverParams[key] = v;
      out.textContent = String(v);
    };
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex:1;align-items:center;gap:8px";
    wrap.appendChild(i);
    wrap.appendChild(out);
    return wrap;
  }
  function bool(key) {
    const c = document.createElement("input");
    c.type = "checkbox";
    if (APP.solverParams[key]) c.checked = true;
    c.onchange = e => APP.solverParams[key] = e.target.checked;
    return c;
  }
  function pick(key, options) {
    const s = document.createElement("select");
    s.style.cssText = "padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px";
    s.onchange = e => APP.solverParams[key] = e.target.value;
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o; opt.textContent = o;
      if (o === APP.solverParams[key]) opt.selected = true;
      s.appendChild(opt);
    }
    return s;
  }

  function open() {
    load();
    const body = document.createElement("div");
    body.appendChild(row("Time limit (seconds)", num("timeLimitSec", 5, 600, 5), "Per Generate run"));
    body.appendChild(row("Conditions", pick("conditions", ["draft", "relax", "strict"]),
      "Strict rejects any hard conflict"));
    body.appendChild(row("Seed", num("seed", 0, 999999, 1),
      "0 = random; non-zero = deterministic run"));

    const wHead = document.createElement("h3");
    wHead.style.cssText = "margin:14px 0 6px;font-size:12px;text-transform:uppercase;color:#334155;letter-spacing:.04em";
    wHead.textContent = "Soft-constraint weights";
    body.appendChild(wHead);

    body.appendChild(row("Teacher gaps", slider("teacherGapWeight", 0, 100)));
    body.appendChild(row("Class gaps", slider("classGapWeight", 0, 100)));
    body.appendChild(row("Subject distribution", slider("distributionWeight", 0, 100)));
    body.appendChild(row("Teacher room stability", slider("roomStabilityWeight", 0, 100)));
    body.appendChild(row("Consecutive overload", slider("consecutiveOverloadWeight", 0, 100)));
    body.appendChild(row("Last-period overflow", slider("lastPeriodOverflowWeight", 0, 100)));

    const lHead = document.createElement("h3");
    lHead.style.cssText = "margin:14px 0 6px;font-size:12px;text-transform:uppercase;color:#334155;letter-spacing:.04em";
    lHead.textContent = "Late Acceptance Hill-Climbing (Timefold port)";
    body.appendChild(lHead);
    body.appendChild(row("Enable LAHC in LAS phase", bool("useLAHC")));
    body.appendChild(row("LAHC window size", num("lahcLen", 20, 500, 10),
      "Bigger = more tolerance for uphill moves"));

    const fHead = document.createElement("h3");
    fHead.style.cssText = "margin:14px 0 6px;font-size:12px;text-transform:uppercase;color:#334155;letter-spacing:.04em";
    fHead.textContent = "FET-style limits (Tier-A)";
    body.appendChild(fHead);
    body.appendChild(row("Min resting periods between days", num("minRestingPeriods", 0, 20, 1),
      "Penalty if gap < N (last-today + first-tomorrow)"));
    body.appendChild(row("Min gaps between building changes", num("minGapsBetweenBuildingChanges", 0, 10, 1),
      "Periods between consecutive building changes for a teacher"));
    body.appendChild(row("Max building changes per day", num("maxBuildingChangesPerDay", -1, 10, 1),
      "-1 = unlimited"));

    const closeBtn = document.createElement("button");
    closeBtn.className = "chrx-btn"; closeBtn.type = "button";
    closeBtn.textContent = "Cancel";
    closeBtn.onclick = () => D.closeSheet();
    const saveBtn = document.createElement("button");
    saveBtn.className = "chrx-btn chrx-btn--primary"; saveBtn.type = "button";
    saveBtn.textContent = "Save";
    saveBtn.onclick = () => { save(); D.closeSheet(); };
    const reset = document.createElement("button");
    reset.className = "chrx-btn"; reset.type = "button";
    reset.textContent = "Reset to defaults";
    reset.onclick = () => {
      APP.solverParams = Object.assign({}, DEFAULTS);
      save();
      D.closeSheet();
      open();
    };
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:14px;border-top:1px solid #e2e8f0;padding-top:10px";
    actions.appendChild(reset);
    actions.appendChild(closeBtn);
    actions.appendChild(saveBtn);
    body.appendChild(actions);

    D.openSheet(body, { title: "Solver parameters" });
  }

  window.addEventListener("app:solver-params", open);
  global.SolverParametersDialog = { open, load };
  load();
})(window);
