// [vite-esm] imports resolved by the Vite build.
import "../state.js";

/* Right-click in the print preview — aSc's signature styling gesture:
 *
 *   "Click the RIGHT MOUSE button on the area you wish to change.
 *    It can be a card or the header of the table."
 *
 * aSc users reach every style dialog that way instead of hunting toolbar
 * buttons. Our dialogs already exist (cell style, period header, colors, sizes,
 * structure, extras, filter); this module maps the thing under the cursor to the
 * right one, so the preview feels like the reference product.
 *
 * menuFor() is pure: given what was clicked it returns the entry list, which is
 * what the tests assert. attach() only renders and routes.
 */

/** Which style panel a card element maps to (data-chrx-el on the rendered line). */
export const ELEMENT_LABEL = Object.freeze({
  subject: "Subject",
  teacher: "Teacher",
  class: "Class",
  group: "Group",
  classroom: "Classroom",
  count: "Count",
  bellTimes: "Bell time",
});

/**
 * Entries for the context menu.
 * @param {{el?:string, inPage?:boolean, inHeader?:boolean, hasReport?:boolean}} info
 * @returns {Array<{id:string,label:string,icon?:string}>}
 */
export function menuFor(info) {
  const i = info || {};
  const out = [];
  if (i.el && ELEMENT_LABEL[i.el]) {
    out.push({ id: "style-element", icon: "🎨", label: `Style: ${ELEMENT_LABEL[i.el]}…` });
  }
  if (i.inHeader) {
    out.push({ id: "header-style", icon: "🔤", label: "Header style (periods, times)…" });
  }
  out.push({ id: "structure", icon: "🧱", label: "Modify structure (pages / rows / columns)…" });
  out.push({ id: "extra", icon: "➕", label: "Extra columns / rows…" });
  out.push({ id: "sizes", icon: "📐", label: "Sizes / widths…" });
  out.push({ id: "colors", icon: "🌈", label: "Colors…" });
  out.push({ id: "filter", icon: "🎚", label: "Filter this report…" });
  return out;
}

/** What did we click? Reads the tags the renderers leave behind. */
export function describeTarget(node) {
  const info = { el: null, inPage: false, inHeader: false, hasReport: false };
  if (!node || typeof node.closest !== "function") return info;
  const elNode = node.closest("[data-chrx-el]");
  if (elNode) info.el = elNode.getAttribute("data-chrx-el");
  info.inPage = !!node.closest(".chrx-preview-page");
  const th = node.closest("th");
  info.inHeader = !!th && !!(th.closest("thead"));
  info.hasReport = !!(typeof window !== "undefined" && window.APP && window.APP.activePrintReport);
  return info;
}

function runAction(id, info) {
  const APP = (typeof window !== "undefined" && window.APP) || {};
  const notify = window._chrxNotify || function () {};
  // Dialog globals are inconsistent across modules (CellStyleDialog on window,
  // the rest on APP), so resolve through both.
  const dlg = (name) => APP[name] || (typeof window !== "undefined" ? window[name] : null);

  /** The dialogs edit a PrintReport; activate one from the preset when needed. */
  function ensureReport() {
    if (APP.activePrintReport) return APP.activePrintReport;
    const id = APP.activePrintTemplate;
    const Presets = APP.PrintPresets;
    const Schema = APP.PrintReportSchema;
    if (id && Presets && Schema) {
      const preset = Presets.get(id);
      if (preset) {
        const r = Schema.create({ context: preset.context });
        Schema.applyPreset(r, preset);
        r._presetId = preset.id;
        APP.activePrintReport = r;
        return r;
      }
    }
    return null;
  }

  if (!ensureReport()) {
    notify("This report is a fixed layout — per-element styling applies to the tile reports " +
      "(Class / Teacher / Room / Summary / Poster). Switch the report, then right-click a card.", "warn");
    return;
  }

  const onSave = (r) => { if (r) APP.activePrintReport = r; notifySaved(); };
  const report = APP.activePrintReport;

  if (id === "style-element") {
    const D = dlg("CellStyleDialog");
    if (!D) return;
    D.open({ mode: "defaults", report, focusElement: info.el, onSave });
    return;
  }
  const byId = {
    "header-style": ["PrintHeaderDialog", (D) => D.open(report, onSave)],
    "structure":    ["ModifyStructureDialog", (D) => D.open(report, onSave)],
    "extra":        ["PrintExtrasDialog", (D) => D.open(report, onSave)],
    "sizes":        ["PrintSizesDialog", (D) => D.open(report, onSave)],
    "colors":       ["PrintColorsDialog", (D) => D.open(report, onSave)],
    "filter":       ["PrintFilterDialog", (D) => D.open(report, onSave)],
  };
  const entry = byId[id];
  if (!entry) return;
  const D = dlg(entry[0]);
  if (!D) return;
  entry[1](D);
}

function notifySaved() {
  try {
    window.dispatchEvent(new CustomEvent("app:print-report-updated", {}));
    (window._chrxNotify || function () {})("Report style updated", "success");
  } catch {}
}

let panel = null;

function closePanel() {
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  panel = null;
}

/**
 * Attach the context menu to the preview overlay.
 * Returns a detach() for symmetry (tests and hot-reload).
 */
export function attach(host) {
  if (!host || typeof host.addEventListener !== "function") return () => {};
  function onContextMenu(ev) {
    const info = describeTarget(ev.target);
    if (!info.inPage) return;               // only inside a rendered page
    ev.preventDefault();
    closePanel();
    const entries = menuFor(info);
    const Menu = window.ChrxMenu;
    if (Menu && typeof Menu.buildPanel === "function") {
      panel = Menu.buildPanel(entries.map((e) => ({
        icon: e.icon, label: e.label, run: () => runAction(e.id, info),
      })));
    } else {
      panel = document.createElement("div");
      panel.className = "chrx-menu-panel";
      for (const e of entries) {
        const item = document.createElement("div");
        item.className = "chrx-menu-item";
        item.textContent = `${e.icon || ""} ${e.label}`;
        item.onclick = () => { closePanel(); runAction(e.id, info); };
        panel.appendChild(item);
      }
    }
    panel.style.position = "fixed";
    panel.style.left = Math.min(ev.clientX, window.innerWidth - 280) + "px";
    panel.style.top = Math.min(ev.clientY, window.innerHeight - 260) + "px";
    panel.style.zIndex = "9500";
    document.body.appendChild(panel);

    const away = (e) => {
      if (panel && !panel.contains(e.target)) { closePanel(); document.removeEventListener("mousedown", away, true); }
    };
    const esc = (e) => {
      if (e.key === "Escape") { closePanel(); document.removeEventListener("keydown", esc, true); }
    };
    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", esc, true);
  }
  host.addEventListener("contextmenu", onContextMenu);
  return () => {
    host.removeEventListener("contextmenu", onContextMenu);
    closePanel();
  };
}

export default { menuFor, describeTarget, attach, ELEMENT_LABEL };
