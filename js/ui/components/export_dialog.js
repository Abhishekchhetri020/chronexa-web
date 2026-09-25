// [vite-esm] imports
import "../state.js";
import "../io/export_excel.js";
import "../io/export_csv.js";
import "../io/export_ics.js";
import "../io/export_html.js";
import "../io/export_timetable_xml.js";
import "../io/export_png.js";
import "../print_preview/print_preview.js";

/**
 * Export Dialog — Lane W3-4
 * One Export dialog replacing the flat list of ~13 format rows.
 * Choose FORMAT (Excel, CSV, ICS, HTML, aSc XML, PNG, PDF)
 * and SCOPE (whole school, one class, one teacher, one room).
 */
(function (global) {
  "use strict";
  const APP = (global.APP = global.APP || {});
  const notify = global._chrxNotify || console.log;

  const FORMATS = [
    { id: "excel", label: "Excel Workbook (.xlsx)", icon: "📊", desc: "Multi-sheet workbook with class, teacher and room schedules." },
    { id: "csv",   label: "CSV Spreadsheet (.csv)", icon: "📑", desc: "Structured timetable grid and detailed lesson records." },
    { id: "ics",   label: "iCalendar (.ics)",        icon: "📆", desc: "Subscribable calendar feed recurring weekly for an academic year." },
    { id: "html",  label: "Standalone Web Page (.html)", icon: "🌐", desc: "Self-contained print-friendly HTML timetable with zero dependencies." },
    { id: "xml",   label: "Classic XML (.xml)",      icon: "📄", desc: "Round-trip XML file compatible with classic timetabling software." },
    { id: "png",   label: "PNG Image (.png)",         icon: "🖼", desc: "High-resolution timetable image rendered via SVG foreignObject." },
    { id: "pdf",   label: "PDF / Print (.pdf)",      icon: "🖨", desc: "One-click print dialog set up for A4 landscape with zero app chrome." },
  ];

  const SCOPES = [
    { id: "all",     label: "Whole school" },
    { id: "class",   label: "One class" },
    { id: "teacher", label: "One teacher" },
    { id: "room",    label: "One room" },
  ];

  let state = {
    format: "excel",
    scope: "all",
    entityId: "",
    busy: false,
  };

  let scrim = null;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null) continue;
        if (k === "class") n.className = v;
        else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v);
      }
    }
    for (const c of kids) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  }

  function getEntitiesForScope(school, scope) {
    if (!school) return [];
    if (scope === "class")   return school.classes || [];
    if (scope === "teacher") return school.teachers || [];
    if (scope === "room")    return school.classrooms || [];
    return [];
  }

  function renderContent(dialogBox) {
    dialogBox.textContent = "";
    const school = APP.school;
    if (!school) return;

    // Header
    const header = el("div", {
      style: "background:#1e293b;color:#f8fafc;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;",
    },
      el("div", null,
        el("h3", { style: "margin:0;font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;" },
          el("span", null, "📤"),
          "Export Timetable"),
        el("div", { style: "color:#94a3b8;font-size:12px;margin-top:2px;" },
          school.schoolName || "Chronexa Timetable")),
      el("button", {
        type: "button",
        "data-testid": "chrx-export-close",
        style: "background:transparent;border:0;color:#94a3b8;font-size:22px;cursor:pointer;line-height:1;padding:0 4px;",
        onclick: close,
      }, "×"));
    dialogBox.appendChild(header);

    // Body
    const body = el("div", {
      style: "padding:20px;display:flex;flex-direction:column;gap:18px;max-height:75vh;overflow-y:auto;",
    });

    // ── 1. Format Selection ───────────────────────────────────────────
    const formatSection = el("div", { style: "display:flex;flex-direction:column;gap:8px;" },
      el("label", { style: "font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;" },
        "1. Select Format"));

    const formatGrid = el("div", {
      style: "display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:8px;",
    });

    for (const fmt of FORMATS) {
      const isSelected = state.format === fmt.id;
      const card = el("label", {
        "data-testid": `chrx-export-format-${fmt.id}`,
        style: `display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1.5px solid ${isSelected ? "#2563eb" : "#e2e8f0"};`
          + `border-radius:8px;background:${isSelected ? "#eff6ff" : "#ffffff"};cursor:pointer;transition:all 0.15s ease;`,
        onclick: (e) => {
          if (state.format !== fmt.id) {
            state.format = fmt.id;
            renderContent(dialogBox);
          }
        },
      },
        el("input", {
          type: "radio",
          name: "chrx-export-format",
          value: fmt.id,
          checked: isSelected ? "checked" : null,
          style: "margin-top:3px;",
          onchange: () => {
            state.format = fmt.id;
            renderContent(dialogBox);
          },
        }),
        el("div", null,
          el("div", { style: "font-weight:600;font-size:13px;color:#1e293b;" },
            `${fmt.icon} ${fmt.label}`),
          el("div", { style: "font-size:11px;color:#64748b;margin-top:2px;line-height:1.3;" },
            fmt.desc)));
      formatGrid.appendChild(card);
    }
    formatSection.appendChild(formatGrid);
    body.appendChild(formatSection);

    // ── 2. Scope Selection ─────────────────────────────────────────────
    const scopeAllowed = state.format !== "xml";
    const scopeSection = el("div", { style: "display:flex;flex-direction:column;gap:8px;" },
      el("label", { style: "font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;" },
        "2. Select Scope"));

    const scopeRow = el("div", { style: "display:flex;flex-wrap:wrap;gap:10px;" });
    for (const sc of SCOPES) {
      const isSelected = state.scope === sc.id;
      const isScopeDisabled = !scopeAllowed && sc.id !== "all";
      const scopeLabel = el("label", {
        "data-testid": `chrx-export-scope-${sc.id}`,
        style: `display:flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid ${isSelected ? "#2563eb" : "#cbd5e1"};`
          + `border-radius:6px;background:${isSelected ? "#eff6ff" : "#fff"};cursor:${isScopeDisabled ? "not-allowed" : "pointer"};`
          + `opacity:${isScopeDisabled ? "0.5" : "1"};font-size:13px;font-weight:500;`,
        onclick: (e) => {
          if (!isScopeDisabled && state.scope !== sc.id) {
            state.scope = sc.id;
            const entities = getEntitiesForScope(school, sc.id);
            state.entityId = entities[0]?.id || "";
            renderContent(dialogBox);
          }
        },
      },
        el("input", {
          type: "radio",
          name: "chrx-export-scope",
          value: sc.id,
          disabled: isScopeDisabled ? "disabled" : null,
          checked: isSelected ? "checked" : null,
          onchange: () => {
            state.scope = sc.id;
            const entities = getEntitiesForScope(school, sc.id);
            state.entityId = entities[0]?.id || "";
            renderContent(dialogBox);
          },
        }),
        sc.label);
      scopeRow.appendChild(scopeLabel);
    }
    scopeSection.appendChild(scopeRow);

    // Entity Picker Dropdown (when single class / teacher / room is selected)
    if (state.scope !== "all" && scopeAllowed) {
      const entities = getEntitiesForScope(school, state.scope);
      if (!state.entityId && entities.length) {
        state.entityId = entities[0].id;
      }
      const pickerRow = el("div", { style: "margin-top:6px;display:flex;align-items:center;gap:8px;" },
        el("span", { style: "font-size:13px;color:#475569;" }, `Choose ${state.scope}:`),
        el("select", {
          "data-testid": "chrx-export-entity-select",
          style: "padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;background:#fff;min-width:180px;",
          onchange: (e) => {
            state.entityId = e.target.value;
          },
        },
          ...entities.map(ent => el("option", {
            value: ent.id,
            selected: state.entityId === ent.id ? "true" : null,
          }, ent.name || ent.short || ent.id))));
      scopeSection.appendChild(pickerRow);
    }
    body.appendChild(scopeSection);

    // ── Summary message ───────────────────────────────────────────────
    let summaryText = "";
    if (state.format === "pdf") {
      summaryText = state.scope === "all"
        ? `Will open browser print preview configured for A4 landscape with all ${(school.classes || []).length} classes (one per page).`
        : `Will open browser print preview configured for A4 landscape with 1 timetable page.`;
    } else if (state.format === "png") {
      summaryText = `Will render timetable view to high-resolution PNG image without external dependencies.`;
    } else if (state.format === "xml") {
      summaryText = `Will export complete classic timetable XML structure.`;
    } else {
      summaryText = state.scope === "all"
        ? `Exporting whole school data.`
        : `Exporting filtered data for ${state.scope}.`;
    }

    const infoBox = el("div", {
      style: "padding:10px 14px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12.5px;color:#475569;",
    }, summaryText);
    body.appendChild(infoBox);

    dialogBox.appendChild(body);

    // Footer actions
    const footer = el("div", {
      style: "padding:14px 20px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;background:#fafafa;",
    },
      el("button", {
        type: "button",
        "data-testid": "chrx-export-cancel",
        class: "chrx-btn",
        style: "padding:8px 16px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155;font-size:13px;font-weight:500;cursor:pointer;",
        onclick: close,
      }, "Cancel"),
      el("button", {
        type: "button",
        "data-testid": "chrx-export-submit",
        class: "chrx-btn chrx-btn--primary",
        style: "padding:8px 20px;border:0;border-radius:6px;background:#2563eb;color:#ffffff;font-size:13px;font-weight:600;cursor:pointer;",
        disabled: state.busy ? "disabled" : null,
        onclick: async () => {
          await runExport();
        },
      }, state.busy ? "Exporting…" : (state.format === "pdf" ? "🖨 Print / Save as PDF" : "Export")));

    dialogBox.appendChild(footer);
  }

  async function runExport() {
    const liveApp = (typeof window !== "undefined" ? window.APP : null) || APP;
    const school = liveApp.school;
    if (!school) { notify("Open a timetable first.", "error"); return; }
    state.busy = true;
    const scopeObj = { type: state.scope, id: state.entityId };

    try {
      switch (state.format) {
        case "excel":
          if (liveApp.io?.exportTimetable) liveApp.io.exportTimetable(scopeObj);
          break;
        case "csv":
          if (liveApp.io?.exportCsv) liveApp.io.exportCsv(scopeObj);
          break;
        case "ics":
          if (liveApp.io?.exportIcs) liveApp.io.exportIcs(state.scope, state.entityId);
          break;
        case "html":
          if (liveApp.io?.exportHTML) liveApp.io.exportHTML(scopeObj);
          break;
        case "xml":
          if (liveApp.io?.exportTimetableXml) liveApp.io.exportTimetableXml();
          break;
        case "png":
          if (liveApp.io?.exportPng) {
            await liveApp.io.exportPng(scopeObj);
          } else {
            window.dispatchEvent(new CustomEvent("app:export-png", { detail: { scope: scopeObj } }));
          }
          break;
        case "pdf":
          if (liveApp.printPreview?.printScope) {
            liveApp.printPreview.printScope(scopeObj);
          } else {
            window.dispatchEvent(new CustomEvent("app:print-scope", { detail: { scope: scopeObj } }));
          }
          break;
        default:
          notify("Unknown format: " + state.format, "error");
      }
      close();
    } catch (err) {
      console.error("[ExportDialog] export error:", err);
      notify("Export failed: " + err.message, "error");
    } finally {
      state.busy = false;
    }
  }

  function open() {
    const school = APP.school;
    if (!school) {
      notify("Open a timetable first.", "error");
      return;
    }
    if (scrim) scrim.remove();

    scrim = el("div", {
      class: "chrx-export-modal-scrim",
      style: "position:fixed;inset:0;background:rgba(15,23,42,0.5);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;",
      onclick: (e) => {
        if (e.target === scrim) close();
      },
    });

    const dialogBox = el("div", {
      "data-testid": "chrx-export-dialog",
      class: "chrx-export-dialog",
      style: "background:#ffffff;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);width:min(680px, 96vw);overflow:hidden;display:flex;flex-direction:column;font-family:system-ui,-apple-system,sans-serif;",
    });

    scrim.appendChild(dialogBox);
    document.body.appendChild(scrim);
    renderContent(dialogBox);

    document.addEventListener("keydown", onKey);
  }

  function close() {
    if (scrim) {
      scrim.remove();
      scrim = null;
    }
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  global.ExportDialog = {
    open,
    close,
    state: () => state,
  };
  APP.exportDialog = global.ExportDialog;

  window.addEventListener("app:export-dialog", open);
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E") && APP.school) {
      e.preventDefault();
      open();
    }
  });
})(typeof window !== "undefined" ? window : globalThis);

export const ExportDialog = typeof window !== "undefined" ? window.ExportDialog : null;
