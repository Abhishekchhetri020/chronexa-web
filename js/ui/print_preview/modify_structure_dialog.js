/* Modify-Structure / Print report properties dialog.
 *
 * Exact reproduction of aSc's pivot-configuration modal (screenshots 19-28).
 * Edits the active PrintReport's pages/rows/cols/cells/fit/hide-empty config.
 *
 * Usage:
 *   APP.ModifyStructureDialog.open(report, onSave)
 *
 *   - `report` is the current PrintReport (will be mutated on Save)
 *   - `onSave(updatedReport)` is called after the user clicks OK
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});

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

  function dimDropdown(currentValue, onChange) {
    const Schema = APP.PrintReportSchema;
    const sel = el("select", {
      style: "width:100%;padding:6px 8px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:6px;font-size:13px;color:var(--chrx-fg,#1a1714);font-family:system-ui;cursor:pointer",
      onchange: (e) => onChange(e.target.value),
    });
    // "-" placeholder first
    const dashOpt = el("option", { value: "-" }, "-");
    if (currentValue === "-" || !currentValue) dashOpt.selected = true;
    sel.appendChild(dashOpt);
    for (const dim of Schema.DIMENSIONS) {
      const opt = el("option", { value: dim }, Schema.DIM_LABEL[dim]);
      if (currentValue === dim) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  function cellsDropdown(currentValue, onChange) {
    const Schema = APP.PrintReportSchema;
    const sel = el("select", {
      style: "width:100%;padding:6px 8px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:6px;font-size:13px;color:var(--chrx-fg,#1a1714);font-family:system-ui;cursor:pointer",
      onchange: (e) => onChange(e.target.value),
    });
    for (const k of Schema.CELL_KINDS) {
      const opt = el("option", { value: k.id }, k.label);
      if (currentValue === k.id) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  function axisSection(title, dimsArr, onDimChange) {
    const wrap = el("div", {
      style: "border:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg-tile,#efe9da);padding:14px 16px;border-radius:8px;display:flex;flex-direction:column;gap:8px",
    });
    wrap.appendChild(el("div", {
      style: "font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:14px;color:var(--chrx-fg,#1a1714)",
    }, title));
    for (let i = 0; i < 3; i++) {
      wrap.appendChild(dimDropdown(dimsArr[i] || "-", (v) => onDimChange(i, v)));
    }
    return wrap;
  }

  function open(report, onSave) {
    if (!report) return;
    const Schema = APP.PrintReportSchema;
    // Work on a deep clone so Cancel really discards changes
    const draft = Schema.clone(report);
    while (draft.pages.length < 3) draft.pages.push("-");
    while (draft.rows.length  < 3) draft.rows.push("-");
    while (draft.cols.length  < 3) draft.cols.push("-");

    const scrim = el("div", {
      class: "chrx-modify-structure-scrim",
      style: "position:fixed;inset:0;background:rgba(26,23,20,.42);backdrop-filter:blur(8px);z-index:9100;display:flex;align-items:flex-start;justify-content:center;padding-top:8vh",
      onclick: (e) => { if (e.target === scrim) close(); },
    });

    const dialog = el("div", {
      style: "background:var(--chrx-bg-sheet,#f6f1e6);width:min(880px,94vw);max-height:84vh;overflow:auto;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.25);font-family:system-ui;color:var(--chrx-fg,#1a1714)",
    });
    scrim.appendChild(dialog);

    function close() { scrim.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    document.addEventListener("keydown", onKey, true);

    // ── Header
    const header = el("div", {
      style: "background:#2f3940;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:14px 14px 0 0",
    });
    header.appendChild(el("div", { style: "font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase" }, "Reports"));
    header.appendChild(el("button", {
      type: "button",
      style: "background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;padding:0 6px",
      onclick: close,
      "aria-label": "Close",
    }, "×"));
    dialog.appendChild(header);

    // ── Title + help text
    const titleSection = el("div", { style: "padding:18px 24px 8px;border-bottom:1px solid var(--chrx-line,#d8cfbb)" });
    titleSection.appendChild(el("h2", {
      style: "margin:0;font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:24px;letter-spacing:-.01em",
    }, "Print report properties"));
    titleSection.appendChild(el("p", {
      style: "margin:8px 0 0;color:var(--chrx-fg-secondary,#4a4339);font-size:13px;line-height:1.5",
    }, "This dialog lets you modify the structure of the report — what is printed in rows, columns, and what is on separate pages. " +
       "If you don't find what you need in this list, customise one of the Custom 1/2/3 reports."));
    dialog.appendChild(titleSection);

    // ── Body
    const body = el("div", { style: "padding:18px 24px 8px;display:flex;flex-direction:column;gap:14px" });

    // Print one page for (pages axis — wide row at top)
    body.appendChild(axisSection("Print one page for", draft.pages, (i, v) => {
      draft.pages[i] = v;
    }));

    // Columns + Rows (side by side on wider viewports)
    const colRow = el("div", {
      style: "display:grid;grid-template-columns:1fr 1fr;gap:14px",
    });
    // Columns block (with hideEmpty/fitWidth toggles)
    const colsWrap = el("div", {
      style: "border:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg-tile,#efe9da);padding:14px 16px;border-radius:8px;display:flex;flex-direction:column;gap:8px",
    });
    colsWrap.appendChild(el("div", {
      style: "font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:14px",
    }, "Columns"));
    for (let i = 0; i < 3; i++) {
      colsWrap.appendChild(dimDropdown(draft.cols[i] || "-", (v) => { draft.cols[i] = v; }));
    }
    colsWrap.appendChild(checkboxRow("Fit width to one page", draft.fitWidth, (v) => { draft.fitWidth = v; }));
    colsWrap.appendChild(checkboxRow("Hide empty columns",     draft.hideEmptyCols, (v) => { draft.hideEmptyCols = v; }));
    colRow.appendChild(colsWrap);

    // Rows block
    const rowsWrap = el("div", {
      style: "border:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg-tile,#efe9da);padding:14px 16px;border-radius:8px;display:flex;flex-direction:column;gap:8px",
    });
    rowsWrap.appendChild(el("div", {
      style: "font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:14px",
    }, "Rows"));
    for (let i = 0; i < 3; i++) {
      rowsWrap.appendChild(dimDropdown(draft.rows[i] || "-", (v) => { draft.rows[i] = v; }));
    }
    rowsWrap.appendChild(checkboxRow("Fit height to one page", draft.fitHeight, (v) => { draft.fitHeight = v; }));
    rowsWrap.appendChild(checkboxRow("Hide empty rows",        draft.hideEmptyRows, (v) => { draft.hideEmptyRows = v; }));
    colRow.appendChild(rowsWrap);
    body.appendChild(colRow);

    // Cells dropdown
    const cellsBlock = el("div", {
      style: "border:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg-tile,#efe9da);padding:14px 16px;border-radius:8px;display:flex;flex-direction:column;gap:8px",
    });
    cellsBlock.appendChild(el("div", {
      style: "font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:14px",
    }, "Cells"));
    cellsBlock.appendChild(cellsDropdown(draft.cells, (v) => { draft.cells = v; }));
    body.appendChild(cellsBlock);

    dialog.appendChild(body);

    // ── Footer
    const footer = el("div", {
      style: "padding:14px 24px 18px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg,#f6f1e6);border-radius:0 0 14px 14px",
    });
    footer.appendChild(el("button", {
      type: "button",
      style: "padding:8px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:8px;font-size:13px;cursor:pointer;color:var(--chrx-fg,#1a1714)",
      onclick: () => {
        // Save as default — Phase 1 stub. Persist to localStorage.
        try {
          localStorage.setItem("chrxPrintDefaults_" + draft.context, JSON.stringify(draft));
          notify("Defaults saved for " + draft.context + " reports");
        } catch (e) { console.warn("defaults save failed", e); }
      },
    }, "Set default print styles"));
    const rightBtns = el("div", { style: "display:flex;gap:8px" });
    rightBtns.appendChild(el("button", {
      type: "button",
      style: "padding:8px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:8px;font-size:13px;cursor:pointer;color:var(--chrx-fg,#1a1714)",
      onclick: close,
    }, "Cancel"));
    rightBtns.appendChild(el("button", {
      type: "button",
      style: "padding:8px 18px;border:0;background:#0d4f54;color:#fff;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600",
      onclick: () => {
        // Commit draft → report
        Object.assign(report, draft);
        close();
        if (typeof onSave === "function") onSave(report);
      },
    }, "OK"));
    footer.appendChild(rightBtns);
    dialog.appendChild(footer);

    document.body.appendChild(scrim);
  }

  function checkboxRow(label, checked, onChange) {
    const id = "chrx-ms-cb-" + Math.random().toString(36).slice(2, 8);
    const wrap = el("label", {
      style: "display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;color:var(--chrx-fg,#1a1714);padding-top:4px",
      for: id,
    });
    const cb = el("input", {
      type: "checkbox",
      id,
      style: "accent-color:#0d4f54;width:16px;height:16px;cursor:pointer",
      onchange: (e) => onChange(e.target.checked),
    });
    if (checked) cb.checked = true;
    wrap.appendChild(cb);
    wrap.appendChild(el("span", null, label));
    return wrap;
  }

  function notify(msg) {
    const fn = window._chrxNotify || console.log;
    try { fn(msg); } catch (e) {}
  }

  APP.ModifyStructureDialog = { open };
})();
