/* Extra columns / rows dialog — Phase 4 of the print-system rewrite.
 *
 * Matches Classic screenshots 45-49. Lets the user add derived side panels
 * alongside the main timetable grid. Each entry has:
 *   - Type dropdown (empty / sum of lessons / teachers / classrooms /
 *                     subjects / sum of covered lessons)
 *   - Header text input
 *   - Width % numeric input
 *   - × delete button
 *
 * State lives on report.extraCols[] and report.extraRows[]. The pivot
 * engine reads both arrays at render time.
 *
 * Public API: APP.PrintExtrasDialog.open(report, onSave)
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});

  const TYPES = [
    { id: "empty",                  label: "Empty" },
    { id: "sum-of-lessons",         label: "Sum of lessons" },
    { id: "teachers-of-lessons",    label: "Teachers who teach these lessons" },
    { id: "classrooms-of-lessons",  label: "Classrooms where these lessons are taught" },
    { id: "subjects-count",         label: "Subjects" },
    { id: "sum-of-covered-lessons", label: "Sum of covered lessons" },
  ];

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false) {
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  }
  function clearNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // ────────────────────────────────────────────────────────────────────
  // One row in either the extra-columns or extra-rows section
  // ────────────────────────────────────────────────────────────────────

  function entryRow(entry, idx, axisName, onRemove, onChange) {
    const row = el("div", {
      style: "display:grid;grid-template-columns:auto 1fr 1fr 70px 32px;gap:10px;align-items:center;padding:8px 4px;font-size:13px",
    });
    row.appendChild(el("div", { style: "font-size:12px;color:var(--chrx-fg-secondary,#4a4339);min-width:64px" },
      (axisName === "col" ? "Column" : "Row") + " " + (idx + 1) + ":"));

    const typeSel = el("select", {
      style: "padding:6px 8px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:5px;font-size:12px;cursor:pointer",
    });
    TYPES.forEach(t => {
      const o = el("option", { value: t.id }, t.label);
      if (t.id === entry.type) o.selected = true;
      typeSel.appendChild(o);
    });
    typeSel.addEventListener("change", (e) => {
      entry.type = e.target.value;
      if (!entry.header || entry.header === "Empty") {
        entry.header = TYPES.find(t => t.id === entry.type)?.label || entry.type;
        headerInput.value = entry.header;
      }
      onChange();
    });
    row.appendChild(typeSel);

    const headerInput = el("input", {
      type: "text",
      value: entry.header || "",
      placeholder: axisName === "col" ? "Column header text" : "Row header text",
      style: "padding:6px 8px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:5px;font-size:12px",
    });
    headerInput.addEventListener("input", (e) => { entry.header = e.target.value; onChange(); });
    row.appendChild(headerInput);

    const widthInput = el("input", {
      type: "number", min: "1", max: "100", step: "1",
      value: String(entry.width || 10),
      style: "padding:6px 8px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:5px;font-size:12px;text-align:right",
    });
    widthInput.addEventListener("input", (e) => { entry.width = parseInt(e.target.value, 10) || 10; onChange(); });
    row.appendChild(widthInput);

    row.appendChild(el("button", {
      type: "button",
      style: "width:30px;height:30px;border-radius:6px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;cursor:pointer;font-size:14px;color:#9c4322",
      title: "Remove this entry",
      onclick: onRemove,
    }, "×"));

    return row;
  }

  function axisSection(axisLabel, axisName, entries, onChange) {
    const wrap = el("div", {
      style: "border:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg-tile,#efe9da);padding:14px 16px;border-radius:8px;display:flex;flex-direction:column;gap:6px",
    });
    const headRow = el("div", { style: "display:flex;justify-content:space-between;align-items:center" });
    headRow.appendChild(el("div", {
      style: "font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:14px",
    }, axisLabel));
    wrap.appendChild(headRow);

    const headersHelp = el("div", {
      style: "display:grid;grid-template-columns:auto 1fr 1fr 70px 32px;gap:10px;font-size:10.5px;color:var(--chrx-fg-tertiary,#837a6d);padding:0 4px",
    },
      el("div", { style: "min-width:64px" }, ""),
      el("div", null, "Type"),
      el("div", null, axisName === "col" ? "Column header text" : "Row header text"),
      el("div", { style: "text-align:right" }, "width"),
      el("div", null, ""));
    wrap.appendChild(headersHelp);

    const rowsHost = el("div", { style: "display:flex;flex-direction:column" });
    wrap.appendChild(rowsHost);

    function paintRows() {
      clearNode(rowsHost);
      entries.forEach((entry, idx) => {
        rowsHost.appendChild(entryRow(entry, idx, axisName, () => {
          entries.splice(idx, 1);
          paintRows();
          onChange();
        }, onChange));
      });
      if (entries.length === 0) {
        rowsHost.appendChild(el("div", {
          style: "padding:14px 4px;font-size:12px;color:var(--chrx-fg-tertiary,#837a6d);font-style:italic",
        }, "No extra " + (axisName === "col" ? "columns" : "rows") + " yet."));
      }
    }
    paintRows();

    const addBtn = el("button", {
      type: "button",
      style: "align-self:flex-start;padding:6px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:6px;cursor:pointer;font-size:13px",
      onclick: () => {
        entries.push({ type: "empty", header: "Empty", width: 10 });
        paintRows();
        onChange();
      },
    }, "+ Add");
    wrap.appendChild(addBtn);

    return wrap;
  }

  function open(report, onSave) {
    if (!report) return;
    const Schema = APP.PrintReportSchema;
    if (!Schema) return;

    const draft = Schema.clone(report);
    draft.extraCols = draft.extraCols || [];
    draft.extraRows = draft.extraRows || [];

    const scrim = el("div", {
      class: "chrx-print-extras-scrim",
      style: "position:fixed;inset:0;background:rgba(26,23,20,.42);backdrop-filter:blur(6px);z-index:9350;display:flex;align-items:flex-start;justify-content:center;padding-top:8vh",
      onclick: (e) => { if (e.target === scrim) close(); },
    });
    const dlg = el("div", {
      style: "background:var(--chrx-bg-sheet,#f6f1e6);width:min(820px,94vw);max-height:88vh;overflow:auto;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.25);font-family:system-ui;color:var(--chrx-fg,#1a1714)",
    });
    scrim.appendChild(dlg);

    let dirty = false;
    function markDirty() { dirty = true; }

    function close() {
      if (dirty) {
        if (!showSaveChangesPrompt(close, () => {
          dirty = false;
          forceClose();
        }, () => commitAndClose())) return;
        return;
      }
      forceClose();
    }
    function forceClose() {
      scrim.remove();
      document.removeEventListener("keydown", onKey, true);
    }
    function commitAndClose() {
      report.extraCols = draft.extraCols;
      report.extraRows = draft.extraRows;
      dirty = false;
      forceClose();
      if (typeof onSave === "function") onSave(report);
    }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    document.addEventListener("keydown", onKey, true);

    const header = el("div", {
      style: "background:#2f3940;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:14px 14px 0 0",
    });
    header.appendChild(el("div", { style: "font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase" }, "Reports"));
    header.appendChild(el("button", {
      type: "button",
      style: "background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;padding:0 6px",
      onclick: close, "aria-label": "Close",
    }, "×"));
    dlg.appendChild(header);

    const titleSection = el("div", { style: "padding:14px 24px 8px;border-bottom:1px solid var(--chrx-line,#d8cfbb)" });
    titleSection.appendChild(el("h2", {
      style: "margin:0;font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:22px;letter-spacing:-.01em",
    }, "Extra columns / rows"));
    titleSection.appendChild(el("p", {
      style: "margin:6px 0 0;font-size:13px;color:var(--chrx-fg-secondary,#4a4339);line-height:1.5",
    }, "Add side panels alongside the main timetable — subject counts, lesson totals, teacher lists. Columns render to the right of the grid, rows render below."));
    dlg.appendChild(titleSection);

    const body = el("div", { style: "padding:18px 24px;display:flex;flex-direction:column;gap:14px" });
    dlg.appendChild(body);

    body.appendChild(axisSection("Extra columns", "col", draft.extraCols, markDirty));
    body.appendChild(axisSection("Extra rows",    "row", draft.extraRows, markDirty));

    const footer = el("div", {
      style: "padding:14px 24px 18px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg,#f6f1e6);border-radius:0 0 14px 14px",
    });
    footer.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:6px;cursor:pointer;font-size:13px",
      onclick: () => { dirty = false; forceClose(); },
    }, "Cancel"));
    footer.appendChild(el("button", {
      type: "button",
      style: "padding:6px 18px;border:0;background:#0d4f54;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600",
      onclick: commitAndClose,
    }, "OK"));
    dlg.appendChild(footer);

    document.body.appendChild(scrim);
  }

  // ────────────────────────────────────────────────────────────────────
  // Shared save-changes prompt (matches Classic screenshot 49)
  // ────────────────────────────────────────────────────────────────────

  function showSaveChangesPrompt(onCancel, onDiscard, onSave) {
    const scrim = el("div", {
      style: "position:fixed;inset:0;background:rgba(26,23,20,.32);z-index:9450;display:flex;align-items:center;justify-content:center",
    });
    const dlg = el("div", {
      style: "background:#fff;border-radius:12px;width:min(420px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:system-ui;overflow:hidden",
    });
    const hd = el("div", {
      style: "background:#2f3940;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center",
    });
    hd.appendChild(el("div", { style: "font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase" }, "Chronexa"));
    hd.appendChild(el("button", {
      type: "button",
      style: "background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer",
      onclick: () => { scrim.remove(); if (typeof onCancel === "function") onCancel(); },
    }, "×"));
    dlg.appendChild(hd);

    const body = el("div", { style: "padding:18px 22px;display:flex;align-items:flex-start;gap:14px" });
    body.appendChild(el("div", { style: "font-size:28px" }, "⚠"));
    body.appendChild(el("div", { style: "font-size:14px;color:#333;line-height:1.5" },
      "There are unsaved changes. Do you want to save them?"));
    dlg.appendChild(body);

    const footer = el("div", { style: "display:flex;justify-content:flex-end;gap:8px;padding:8px 22px 18px" });
    footer.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:0;background:#5b6e3d;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600",
      onclick: () => { scrim.remove(); if (typeof onSave === "function") onSave(); },
    }, "Save changes"));
    footer.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:0;background:#9c4322;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600",
      onclick: () => { scrim.remove(); if (typeof onDiscard === "function") onDiscard(); },
    }, "Discard changes"));
    footer.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:13px",
      onclick: () => { scrim.remove(); if (typeof onCancel === "function") onCancel(); },
    }, "Cancel"));
    dlg.appendChild(footer);

    scrim.appendChild(dlg);
    document.body.appendChild(scrim);
    return true;
  }

  APP.PrintExtrasDialog = { open, showSaveChangesPrompt };
})();
