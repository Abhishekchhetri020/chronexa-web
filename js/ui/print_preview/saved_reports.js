// [vite-esm] imports resolved by the Vite build.
import "../state.js";

/* Saved print layouts — aSc's `ttreports`, done per file.
 *
 * In aSc the print setup is part of the timetable: 24 report definitions live in
 * `ttreports`, each with page/row/column axes, cell geometry and per-field
 * typography, so reopening a file restores the exact print. Chronexa kept that
 * state in localStorage (`APP.printSettings`, `APP.printTemplateStructure`) —
 * per browser, not per file — so changing file or machine lost the layout and
 * there was no way to keep two variants of one report.
 *
 * This module stores layouts on the school object (`school.printReports`),
 * mutated through APP.mutate so undo and the audit trail work, and keeps an
 * `asc` block with aSc's own field names so an import/export round-trip has
 * somewhere to land.
 *
 * Shape:
 *   { id, name, baseTemplate, structure,
 *     settings,            // snapshot of APP.printSettings
 *     asc: { typ, page_tables, row_tables, column_tables, cellwidth,
 *            cellheight, fitwidth, fitheight, hideemptyrows,
 *            hideemptycolumns, landscape, cardstyles } }
 */
(function (global) {
  "use strict";
  const APP = (global.APP = global.APP || {});
  const D = global.EntityDialog;
  const notify = (m, k) => (global._chrxNotify || function () {})(m, k || "info");

  // aSc's report catalogue ids we can map our templates onto. Only the ones
  // Chronexa actually renders are listed; unknown typ values keep our own id.
  const ASC_TYP = {
    class: 0, teacher: 1, student: 2, classroom: 3, subject: 4,
    summary: 5, teacher_summary: 6, classroom_summary: 7,
    poster: 8, teacher_poster: 9, classroom_poster: 10,
    lesson_grid: 15, student_summary: 17, subject_summary: 18,
  };

  function school() {
    return APP.school || null;
  }

  function ensure() {
    const s = school();
    if (!s) return [];
    if (!Array.isArray(s.printReports)) {
      // Mutate once so the change is undoable and shows in the audit trail.
      if (typeof APP.mutate === "function") APP.mutate("Initialise print layouts", (sch) => {
        sch.printReports = sch.printReports || [];
      });
      s.printReports = s.printReports || [];
    }
    return s.printReports;
  }

  function list() {
    return ensure().slice();
  }

  function find(idOrName) {
    return ensure().find((r) => r.id === idOrName || r.name === idOrName) || null;
  }

  /** The axes an aSc row would carry, derived from the base template/preset. */
  function ascFromTemplate(templateId, structure) {
    const preset = (APP.PrintPresets && APP.PrintPresets.get && APP.PrintPresets.get(templateId)) || null;
    const invert = structure === "rows-days" ? false : true;
    const pages = preset && preset.pages ? preset.pages.slice() : ["class"];
    let rows = preset && preset.rows ? preset.rows.slice() : ["day"];
    let cols = preset && preset.cols ? preset.cols.slice() : ["period"];
    if (invert) { const t = rows; rows = cols; cols = t; }
    const map = { day: "days", days: "days", period: "periods", periods: "periods",
      class: "classes", classes: "classes", teacher: "teachers", teachers: "teachers",
      classroom: "classrooms", classrooms: "classrooms", subject: "subjects",
      subjects: "subjects", student: "students", students: "students" };
    return {
      typ: ASC_TYP[templateId] != null ? ASC_TYP[templateId] : null,
      page_tables: pages.map((p) => map[p] || p),
      row_tables: rows.map((r) => map[r] || r),
      column_tables: cols.map((c) => map[c] || c),
      cellwidth: 0.1,
      cellheight: 0.1,
      fitwidth: true,
      fitheight: true,
      hideemptyrows: false,
      hideemptycolumns: false,
      landscape: !!(APP.printSettings && APP.printSettings.orientation === "landscape"),
      cardstyles: {},
    };
  }

  /**
   * Snapshot the CURRENT print setup as a named layout.
   * Returns the stored row, or null when there is nothing to save.
   */
  function save(name, opts) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const base = (opts && opts.baseTemplate) || APP.activePrintTemplate || "class";
    // "inherit" is resolved to the global structure at save time, so the saved
    // row is deterministic (applying it later cannot depend on whatever the
    // global happens to be then).
    const perTemplate = (APP.printTemplateStructure && APP.printTemplateStructure[base]) || "inherit";
    const structure = perTemplate === "inherit"
      ? ((APP.printSettings && APP.printSettings.structure) || "rows-days")
      : perTemplate;
    const row = {
      id: (opts && opts.id) || "prep_" + Date.now(),
      name: trimmed,
      baseTemplate: base,
      structure,
      settings: JSON.parse(JSON.stringify(APP.printSettings || {})),
      asc: ascFromTemplate(base, structure),
      savedAt: new Date().toISOString(),
    };
    if (typeof APP.mutate === "function") {
      APP.mutate("Save print layout", (sch) => {
        sch.printReports = Array.isArray(sch.printReports) ? sch.printReports : [];
        const at = sch.printReports.findIndex((r) => r.id === row.id || r.name === trimmed);
        if (at >= 0) sch.printReports[at] = row;
        else sch.printReports.push(row);
      });
    } else {
      const arr = ensure();
      const at = arr.findIndex((r) => r.id === row.id || r.name === trimmed);
      if (at >= 0) arr[at] = row; else arr.push(row);
    }
    notify(`Layout “${trimmed}” saved with this timetable`, "success");
    return row;
  }

  /** Load a saved layout back into the app and re-render the preview. */
  function apply(idOrName) {
    const row = find(idOrName);
    if (!row) return false;
    APP.printSettings = Object.assign({}, APP.printSettings || {}, row.settings || {});
    APP.printTemplateStructure = APP.printTemplateStructure || {};
    if (row.structure) APP.printTemplateStructure[row.baseTemplate] = row.structure;
    else delete APP.printTemplateStructure[row.baseTemplate];
    APP.activePrintTemplate = row.baseTemplate;
    try { localStorage.setItem("chronexa.printSettings", JSON.stringify(APP.printSettings)); } catch {}
    global.dispatchEvent(new CustomEvent("app:print-settings-changed", { detail: APP.printSettings }));
    global.dispatchEvent(new CustomEvent("app:print-template", { detail: { template: row.baseTemplate } }));
    notify(`Layout “${row.name}” applied`, "info");
    return true;
  }

  function rename(idOrName, newName) {
    const trimmed = String(newName || "").trim();
    const row = find(idOrName);
    if (!row || !trimmed) return false;
    if (typeof APP.mutate === "function") {
      APP.mutate("Rename print layout", (sch) => {
        const t = (sch.printReports || []).find((r) => r.id === row.id);
        if (t) t.name = trimmed;
      });
    } else row.name = trimmed;
    return true;
  }

  function remove(idOrName) {
    const row = find(idOrName);
    if (!row) return false;
    if (typeof APP.mutate === "function") {
      APP.mutate("Delete print layout", (sch) => {
        sch.printReports = (sch.printReports || []).filter((r) => r.id !== row.id);
      });
    } else {
      const s = school();
      s.printReports = ensure().filter((r) => r.id !== row.id);
    }
    return true;
  }

  /**
   * One-time migration: anything already tuned in localStorage becomes a
   * layout on the file, so opening the settings on a fresh file does not look
   * like the setup was thrown away.
   */
  function migrateFromLocalStorage() {
    if (!school() || !Array.isArray(school().printReports)) return 0;
    if (school().printReports.length) return 0;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("chronexa.printSettings") || "null"); } catch {}
    if (!saved || !Object.keys(saved).length) return 0;
    APP.printSettings = Object.assign({}, saved);
    save("My layout", { baseTemplate: (APP.printTemplates && APP.activePrintTemplate) || "class" });
    return 1;
  }

  // ── UI: manage sheet ────────────────────────────────────────────────────
  function openManager() {
    if (!D || typeof D.openSubSheet !== "function") return;
    const host = document.createElement("div");
    host.className = "chrx-print-layouts";
    host.style.cssText = "display:flex;flex-direction:column;gap:12px;min-width:420px";

    const intro = document.createElement("p");
    intro.style.cssText = "margin:0;color:#64748b;font-size:12px";
    intro.textContent = "Print layouts are saved inside this timetable file (like aSc's saved reports), so they travel with it and survive a different machine.";
    host.appendChild(intro);

    const saveBox = document.createElement("div");
    saveBox.style.cssText = "padding:10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc";
    const saveRow = document.createElement("div");
    saveRow.style.cssText = "display:flex;gap:8px;align-items:center";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Layout name (e.g. Class timetable — A4 portrait)";
    input.id = "chrx-print-layout-name";
    input.style.cssText = "flex:1;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "chrx-btn chrx-btn--primary";
    saveBtn.textContent = "Save current layout";
    saveBtn.onclick = () => { if (save(input.value)) render(); };
    saveRow.append(input, saveBtn);
    saveBox.appendChild(saveRow);
    host.appendChild(saveBox);

    const listBox = document.createElement("div");
    listBox.id = "chrx-print-layouts-list";
    listBox.style.cssText = "display:flex;flex-direction:column;gap:6px;max-height:280px;overflow:auto";
    host.appendChild(listBox);

    function render() {
      listBox.innerHTML = "";
      const rows = list();
      if (!rows.length) {
        const empty = document.createElement("p");
        empty.style.cssText = "color:#94a3b8;font-size:12px;margin:4px 0";
        empty.textContent = "No saved layouts in this file yet.";
        listBox.appendChild(empty);
        return;
      }
      for (const r of rows) {
        const line = document.createElement("div");
        line.style.cssText = "display:flex;gap:8px;align-items:center;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px";
        const nm = document.createElement("span");
        nm.style.cssText = "flex:1;font-size:13px";
        nm.textContent = r.name + "  ";
        const meta = document.createElement("small");
        meta.style.color = "#94a3b8";
        meta.textContent = (APP.printTemplates && APP.printTemplates.get && APP.printTemplates.get(r.baseTemplate)?.name) || r.baseTemplate;
        nm.appendChild(meta);

        const applyBtn = document.createElement("button");
        applyBtn.type = "button"; applyBtn.className = "chrx-btn"; applyBtn.textContent = "Apply";
        applyBtn.onclick = () => { apply(r.id); if (typeof D.closeSubSheet === "function") D.closeSubSheet(); };
        const renBtn = document.createElement("button");
        renBtn.type = "button"; renBtn.className = "chrx-btn"; renBtn.textContent = "Rename";
        renBtn.onclick = () => {
          const next = global.prompt ? global.prompt("New name for this layout:", r.name) : null;
          if (next && rename(r.id, next)) render();
        };
        const delBtn = document.createElement("button");
        delBtn.type = "button"; delBtn.className = "chrx-btn"; delBtn.textContent = "Delete";
        delBtn.onclick = () => {
          const ok = global.confirm ? global.confirm(`Delete layout “${r.name}”?`) : true;
          if (ok && remove(r.id)) render();
        };
        line.append(nm, applyBtn, renBtn, delBtn);
        listBox.appendChild(line);
      }
    }
    render();
    D.openSubSheet(host, { title: "Saved print layouts" });
  }

  const SavedReports = { list, find, save, apply, rename, remove, ensure, migrateFromLocalStorage, openManager, ascFromTemplate };
  global.SavedReports = SavedReports;
  if (APP) APP.SavedReports = SavedReports;
})(window);

export const SavedReports = (typeof window !== "undefined" ? window.SavedReports : globalThis.SavedReports);
