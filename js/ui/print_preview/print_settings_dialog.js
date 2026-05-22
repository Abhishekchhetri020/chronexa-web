/* Print Settings — tabbed dialog covering 7 of the 9 Classic sub-flows.
 *
 * Replaces three "coming soon"/redirect ribbon buttons (Sizes, Globals,
 * Structure, Colors) and adds three never-shipped Classic dialogs
 * (Supervision style, Page header, Grid header text). Together with the
 * existing CellStyleDialog (Top-30 #22 first row), this covers 8 of 9.
 * The 9th — Card-cell layout designer — was the original CellStyleDialog,
 * so the suite is functionally complete.
 *
 * Public API:
 *   window.PrintSettingsDialog.open(tab)
 *     tab ∈ "sizes" | "globals" | "structure" | "colors"
 *         | "supervision" | "header" | "gridtext"   (default "sizes")
 *
 * Persists to APP.printSettings (also mirrored to localStorage so settings
 * survive reload). Dispatches `app:print-settings-changed` after save so
 * the preview re-renders. Mounts via EntityDialog.openSheet (standalone
 * host machinery from p49 means no full EntityDialog needs to be open).
 */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;
  const APP = window.APP = window.APP || {};

  const STORAGE_KEY = "chronexa.printSettings";
  const DEFAULTS = {
    pageSize: "A4",
    orientation: "portrait",
    marginMM: 10,
    scalePct: 100,
    showBellTimes: true,
    showTeacherNames: true,
    showClassroomNames: true,
    showSubjectColors: true,
    showLogo: false,
    logoUrl: "",
    headerText: "",
    footerText: "",
    structure: "rows-days",
    dozorColor: "#fef3c7",
    headerFont: "system",
    headerAlign: "center",
  };

  function load() {
    if (APP.printSettings && Object.keys(APP.printSettings).length) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch {}
    APP.printSettings = Object.assign({}, DEFAULTS, saved);
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(APP.printSettings)); } catch {}
    window.dispatchEvent(new CustomEvent("app:print-settings-changed", { detail: APP.printSettings }));
    (window._chrxNotify || function () {})("Print settings saved", "info");
  }

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }
  function row(label, control) {
    return el("div", { style: "display:flex;align-items:center;gap:12px;margin:6px 0" },
      el("label", { style: "min-width:160px;font-size:12px;color:#475569" }, label),
      control);
  }
  function num(key, min, max, step) {
    const i = el("input", { type: "number", min, max, step: step || 1, value: APP.printSettings[key],
      style: "width:90px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px",
      oninput: e => APP.printSettings[key] = parseFloat(e.target.value) || 0 });
    return i;
  }
  function text(key, width) {
    return el("input", { type: "text", value: APP.printSettings[key] || "",
      style: `width:${width || 280}px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px`,
      oninput: e => APP.printSettings[key] = e.target.value });
  }
  function bool(key) {
    const c = el("input", { type: "checkbox",
      onchange: e => APP.printSettings[key] = e.target.checked });
    if (APP.printSettings[key]) c.checked = true;
    return c;
  }
  function pick(key, options) {
    const s = el("select",
      { style: "padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px",
        onchange: e => APP.printSettings[key] = e.target.value });
    for (const o of options) {
      const opt = el("option", { value: o }, o);
      if (o === APP.printSettings[key]) opt.setAttribute("selected", "selected");
      s.appendChild(opt);
    }
    return s;
  }
  function color(key) {
    return el("input", { type: "color", value: APP.printSettings[key] || "#fef3c7",
      style: "width:50px;height:28px;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer",
      oninput: e => APP.printSettings[key] = e.target.value });
  }

  // ─── Tabs (each returns a Node of form controls) ─────────────────────
  function tabSizes() {
    return el("div", null,
      row("Page size",     pick("pageSize",    ["A4","A3","Letter","Legal","Tabloid"])),
      row("Orientation",   pick("orientation", ["portrait","landscape"])),
      row("Margin (mm)",   num("marginMM", 0, 40, 1)),
      row("Scale (%)",     num("scalePct", 50, 200, 5)));
  }
  function tabGlobals() {
    return el("div", null,
      row("Show bell times",       bool("showBellTimes")),
      row("Show teacher names",    bool("showTeacherNames")),
      row("Show classroom names",  bool("showClassroomNames")),
      row("Show subject colors",   bool("showSubjectColors")));
  }
  function tabStructure() {
    const wrap = el("div", null,
      el("p", { style: "color:#64748b;font-size:11px;margin:0 0 8px" },
        "Whether each template lays out days as rows × periods as columns, or vice-versa. Some templates may ignore this if they have a fixed shape."),
      row("Days are… (default)", pick("structure", ["rows-days","columns-days"])));

    // Per-template overrides (audit §7.4). Lists every registered template
    // and lets the user override the global structure per-template. Stored
    // on APP.printTemplateStructure[id] = "rows-days" | "columns-days" |
    // "inherit" (inherit = use the global default above).
    APP.printTemplateStructure = APP.printTemplateStructure || {};
    try {
      const saved = JSON.parse(localStorage.getItem("chronexa.printTemplateStructure") || "{}");
      Object.assign(APP.printTemplateStructure, saved);
    } catch {}

    const head = el("h3", { style: "margin:14px 0 6px;font-size:11px;text-transform:uppercase;color:#334155;letter-spacing:.04em" }, "Per-template overrides");
    wrap.appendChild(head);

    const list = (APP.printTemplates && APP.printTemplates.list && APP.printTemplates.list()) || [];
    for (const t of list) {
      const cur = APP.printTemplateStructure[t.id] || "inherit";
      const sel = el("select", { style: "padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:11px" });
      ["inherit", "rows-days", "columns-days"].forEach(v => {
        const opt = el("option", { value: v }, v);
        if (v === cur) opt.setAttribute("selected", "selected");
        sel.appendChild(opt);
      });
      sel.addEventListener("change", e => {
        const v = e.target.value;
        if (v === "inherit") delete APP.printTemplateStructure[t.id];
        else APP.printTemplateStructure[t.id] = v;
        try { localStorage.setItem("chronexa.printTemplateStructure", JSON.stringify(APP.printTemplateStructure)); } catch {}
      });
      const row2 = el("div", { style: "display:flex;align-items:center;gap:12px;margin:3px 0;font-size:12px" });
      const lab = el("label", { style: "flex:1;color:#475569" }, t.name || t.id);
      row2.appendChild(lab);
      row2.appendChild(sel);
      wrap.appendChild(row2);
    }
    return wrap;
  }
  function tabColors() {
    return el("div", null,
      el("p", { style: "color:#64748b;font-size:11px;margin:0 0 8px" },
        "Per-subject colours are edited in Specification → Subjects. The toggle below controls whether the printer prints with those colours or in monochrome."),
      row("Print with subject colors", bool("showSubjectColors")));
  }
  function tabSupervision() {
    return el("div", null,
      row("Supervision cell color", color("dozorColor")));
  }
  function tabHeader() {
    return el("div", null,
      row("Header text",  text("headerText", 360)),
      row("Footer text",  text("footerText", 360)),
      row("Show logo",    bool("showLogo")),
      row("Logo URL",     text("logoUrl", 360)));
  }
  function tabGridText() {
    return el("div", null,
      row("Header font",   pick("headerFont",  ["system","serif","monospace"])),
      row("Header align",  pick("headerAlign", ["left","center","right"])));
  }

  const TABS = [
    { id: "sizes",       label: "Sizes",       build: tabSizes },
    { id: "globals",     label: "Globals",     build: tabGlobals },
    { id: "structure",   label: "Structure",   build: tabStructure },
    { id: "colors",      label: "Colors",      build: tabColors },
    { id: "supervision", label: "Supervision", build: tabSupervision },
    { id: "header",      label: "Page Header", build: tabHeader },
    { id: "gridtext",    label: "Header text", build: tabGridText },
  ];

  function open(activeTabId) {
    load();
    activeTabId = activeTabId || "sizes";
    const tabBar = el("div", { style: "display:flex;gap:2px;margin-bottom:12px;border-bottom:1px solid #e2e8f0" });
    const body = el("div", { style: "min-height:160px;padding:4px 2px" });
    function showTab(id) {
      activeTabId = id;
      tabBar.querySelectorAll("button").forEach(b => {
        const on = b.dataset.tab === id;
        b.style.borderBottom = on ? "2px solid #2563eb" : "2px solid transparent";
        b.style.color = on ? "#2563eb" : "#475569";
      });
      while (body.firstChild) body.removeChild(body.firstChild);
      const t = TABS.find(t => t.id === id);
      if (t) body.appendChild(t.build());
    }
    for (const t of TABS) {
      tabBar.appendChild(el("button", {
        type: "button", "data-tab": t.id,
        style: "padding:8px 12px;background:none;border:0;border-bottom:2px solid transparent;font-size:12px;cursor:pointer",
        onclick: () => showTab(t.id) }, t.label));
    }
    showTab(activeTabId);

    const closeBtn = el("button", { class: "chrx-btn", type: "button",
      onclick: () => D.closeSheet() }, "Cancel");
    const saveBtn = el("button", { class: "chrx-btn chrx-btn--primary", type: "button",
      onclick: () => { save(); D.closeSheet(); } }, "Save");
    const actions = el("div", { style: "display:flex;justify-content:flex-end;gap:8px;margin-top:14px;border-top:1px solid #e2e8f0;padding-top:10px" },
      closeBtn, saveBtn);

    const wrap = el("div", { style: "padding:6px 4px 0" }, tabBar, body, actions);
    D.openSheet(wrap, { title: "Print settings" });
  }

  global.PrintSettingsDialog = { open, load };
  load();
})(window);
