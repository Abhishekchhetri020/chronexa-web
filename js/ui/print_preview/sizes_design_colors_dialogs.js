/* Sizes/widths + Design + Colors dialogs — Phase 5 of the print rewrite.
 *
 * Three small dialogs bundled in one file (they share boilerplate).
 * Each edits a different slice of the active PrintReport.
 *
 *   APP.PrintSizesDialog.open(report, onSave)   — orientation/pages/copies
 *   APP.PrintDesignDialog.open(report, onSave)  — logo + header text
 *   APP.PrintColorsDialog.open(report, onSave)  — card / row / col colors
 *
 * Matches Classic screenshots 50-56.
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

  // Shared dialog shell
  function modalShell(title, contentBuilder, onOk, onCancel) {
    const scrim = el("div", {
      style: "position:fixed;inset:0;background:rgba(26,23,20,.42);backdrop-filter:blur(6px);z-index:9350;display:flex;align-items:flex-start;justify-content:center;padding-top:10vh",
      onclick: (e) => { if (e.target === scrim) doCancel(); },
    });
    const dlg = el("div", {
      style: "background:var(--chrx-bg-sheet,#f6f1e6);width:min(640px,92vw);max-height:84vh;overflow:auto;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.25);font-family:system-ui;color:var(--chrx-fg,#1a1714)",
    });
    scrim.appendChild(dlg);

    function close() { scrim.remove(); document.removeEventListener("keydown", onKey, true); }
    function doCancel() { close(); if (typeof onCancel === "function") onCancel(); }
    function doOk() { close(); if (typeof onOk === "function") onOk(); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); doCancel(); } }
    document.addEventListener("keydown", onKey, true);

    const header = el("div", {
      style: "background:#2f3940;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:14px 14px 0 0",
    });
    header.appendChild(el("div", { style: "font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase" }, "Reports"));
    header.appendChild(el("button", {
      type: "button",
      style: "background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;padding:0 6px",
      onclick: doCancel, "aria-label": "Close",
    }, "×"));
    dlg.appendChild(header);

    const titleSection = el("div", { style: "padding:14px 24px 8px;border-bottom:1px solid var(--chrx-line,#d8cfbb)" });
    titleSection.appendChild(el("h2", {
      style: "margin:0;font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:22px;letter-spacing:-.01em",
    }, title));
    dlg.appendChild(titleSection);

    const body = el("div", { style: "padding:18px 24px;display:flex;flex-direction:column;gap:14px" });
    contentBuilder(body);
    dlg.appendChild(body);

    const footer = el("div", {
      style: "padding:14px 24px 18px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg,#f6f1e6);border-radius:0 0 14px 14px",
    });
    footer.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:6px;cursor:pointer;font-size:13px",
      onclick: doCancel,
    }, "Cancel"));
    footer.appendChild(el("button", {
      type: "button",
      style: "padding:6px 18px;border:0;background:#0d4f54;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600",
      onclick: doOk,
    }, "OK"));
    dlg.appendChild(footer);

    document.body.appendChild(scrim);
  }

  function sectionBox(title, contentBuilder) {
    const wrap = el("div", {
      style: "border:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg-tile,#efe9da);padding:14px 16px;border-radius:8px;display:flex;flex-direction:column;gap:10px",
    });
    wrap.appendChild(el("div", {
      style: "font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:14px",
    }, title));
    contentBuilder(wrap);
    return wrap;
  }

  function labeledSelect(label, value, options, onChange) {
    const row = el("div", { style: "display:flex;align-items:center;gap:10px" });
    if (label) row.appendChild(el("div", { style: "font-size:12px;color:var(--chrx-fg-secondary,#4a4339);min-width:120px" }, label));
    const sel = el("select", {
      style: "flex:1;padding:6px 8px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:5px;font-size:13px;cursor:pointer",
    });
    options.forEach(o => {
      const opt = el("option", { value: o.id }, o.label);
      if (o.id === value) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", (e) => onChange(e.target.value));
    row.appendChild(sel);
    return row;
  }

  function labeledNumber(label, value, onChange, min, max) {
    const row = el("div", { style: "display:flex;align-items:center;gap:10px" });
    row.appendChild(el("div", { style: "font-size:12px;color:var(--chrx-fg-secondary,#4a4339);min-width:120px" }, label));
    const inp = el("input", {
      type: "number", min: String(min ?? 1), max: String(max ?? 99),
      value: String(value),
      style: "width:80px;padding:6px 8px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:5px;font-size:13px",
    });
    inp.addEventListener("input", (e) => onChange(parseInt(e.target.value, 10) || 1));
    row.appendChild(inp);
    return row;
  }

  function labeledCheckbox(label, on, onChange) {
    const row = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer" });
    const cb = el("input", { type: "checkbox", style: "accent-color:#0d4f54;width:16px;height:16px;cursor:pointer" });
    if (on) cb.checked = true;
    cb.addEventListener("change", (e) => onChange(e.target.checked));
    row.appendChild(cb); row.appendChild(el("span", null, label));
    return row;
  }

  function labeledColor(label, value, onChange) {
    const row = el("div", { style: "display:flex;align-items:center;gap:10px" });
    row.appendChild(el("div", { style: "font-size:12px;color:var(--chrx-fg-secondary,#4a4339);min-width:120px" }, label));
    const inp = el("input", {
      type: "color",
      value: value || "#cccccc",
      style: "width:36px;height:28px;border:1px solid var(--chrx-line,#d8cfbb);border-radius:4px;padding:0;cursor:pointer",
    });
    inp.addEventListener("input", (e) => onChange(e.target.value));
    row.appendChild(inp);
    return row;
  }

  // ────────────────────────────────────────────────────────────────────
  // Sizes/widths dialog (screenshots 50-52)
  // ────────────────────────────────────────────────────────────────────

  function openSizes(report, onSave) {
    if (!report) return;
    const Schema = APP.PrintReportSchema;
    const draft = Schema.clone(report);
    draft.pageSetup = draft.pageSetup || { orientation: "landscape", pagesPerSheet: "normal", copies: 1, addClassroomTimetable: false };

    modalShell("Sizes / widths", (body) => {
      body.appendChild(el("div", {
        style: "font-size:13px;color:var(--chrx-fg-secondary,#4a4339)",
      }, "Define sizes for printout: " + (report.name || "this report")));

      body.appendChild(sectionBox("Page orientation", (s) => {
        s.appendChild(labeledSelect("Orientation", draft.pageSetup.orientation, [
          { id: "portrait", label: "📄 Portrait" },
          { id: "landscape", label: "📃 Landscape" },
        ], (v) => { draft.pageSetup.orientation = v; }));
      }));

      body.appendChild(sectionBox("Pages per sheet", (s) => {
        s.appendChild(labeledSelect("Mode", draft.pageSetup.pagesPerSheet, [
          { id: "normal", label: "Normal — 1 page per sheet" },
          { id: "4to1",   label: "4 → 1 page — 2×2 tiles" },
          { id: "specify", label: "Specify counts per page" },
        ], (v) => { draft.pageSetup.pagesPerSheet = v; }));
      }));

      body.appendChild(labeledNumber("Number of copies", draft.pageSetup.copies || 1, (v) => { draft.pageSetup.copies = v; }, 1, 99));
      body.appendChild(labeledCheckbox("Add classroom timetable", draft.pageSetup.addClassroomTimetable, (v) => { draft.pageSetup.addClassroomTimetable = v; }));
    }, () => {
      report.pageSetup = draft.pageSetup;
      if (typeof onSave === "function") onSave(report);
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Design dialog (screenshot 53)
  // ────────────────────────────────────────────────────────────────────

  function openDesign(report, onSave) {
    if (!report) return;
    const Schema = APP.PrintReportSchema;
    const draft = Schema.clone(report);
    draft.design = draft.design || { logoEnabled: true, logoDataUrl: null, headerText: "", footerText: "" };

    modalShell("Design", (body) => {
      body.appendChild(sectionBox("Print logo", (s) => {
        s.appendChild(labeledCheckbox("Print logo", draft.design.logoEnabled, (v) => { draft.design.logoEnabled = v; }));
        const previewWrap = el("div", {
          style: "padding:10px;background:#fff;border:1px dashed var(--chrx-line,#d8cfbb);border-radius:6px;width:140px;height:140px;display:flex;align-items:center;justify-content:center;overflow:hidden",
        });
        function paintPreview() {
          while (previewWrap.firstChild) previewWrap.removeChild(previewWrap.firstChild);
          if (draft.design.logoDataUrl) {
            const img = el("img", { src: draft.design.logoDataUrl, style: "max-width:100%;max-height:100%;object-fit:contain" });
            previewWrap.appendChild(img);
          } else {
            previewWrap.appendChild(el("div", { style: "color:#999;font-size:11px;text-align:center" }, "Click to upload"));
          }
        }
        paintPreview();
        previewWrap.style.cursor = "pointer";
        previewWrap.addEventListener("click", () => fileInput.click());
        const fileInput = el("input", {
          type: "file", accept: "image/*", style: "display:none",
        });
        fileInput.addEventListener("change", (e) => {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = (ev) => { draft.design.logoDataUrl = ev.target.result; paintPreview(); };
          reader.readAsDataURL(f);
        });
        s.appendChild(previewWrap);
        s.appendChild(fileInput);
      }));

      body.appendChild(sectionBox("Header and Footer", (s) => {
        const headerRow = el("div", { style: "display:flex;flex-direction:column;gap:4px" });
        headerRow.appendChild(el("div", { style: "font-size:12px;color:var(--chrx-fg-secondary,#4a4339)" }, "Header text:"));
        const headerInp = el("input", {
          type: "text",
          value: draft.design.headerText || "",
          placeholder: "School name or report header",
          style: "padding:6px 10px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:5px;font-size:13px",
        });
        headerInp.addEventListener("input", (e) => { draft.design.headerText = e.target.value; });
        headerRow.appendChild(headerInp);
        s.appendChild(headerRow);

        const footerRow = el("div", { style: "display:flex;flex-direction:column;gap:4px" });
        footerRow.appendChild(el("div", { style: "font-size:12px;color:var(--chrx-fg-secondary,#4a4339)" }, "Footer text:"));
        const footerInp = el("input", {
          type: "text",
          value: draft.design.footerText || "",
          placeholder: "e.g. W.E.F. 18.08.2025",
          style: "padding:6px 10px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:5px;font-size:13px",
        });
        footerInp.addEventListener("input", (e) => { draft.design.footerText = e.target.value; });
        footerRow.appendChild(footerInp);
        s.appendChild(footerRow);
      }));
    }, () => {
      report.design = draft.design;
      if (typeof onSave === "function") onSave(report);
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Colors dialog (screenshots 54-56)
  // ────────────────────────────────────────────────────────────────────

  function openColors(report, onSave) {
    if (!report) return;
    const Schema = APP.PrintReportSchema;
    const draft = Schema.clone(report);
    draft.colors = draft.colors || {
      cardOn: false, cardKey: "subject", cardColor1: null, cardColor2: null,
      rowHeaderOn: false, rowBg1: null, rowBg2: null, rowFont: null,
      colHeaderOn: false, colBg1: null, colBg2: null, colFont: null,
    };

    modalShell("Colors", (body) => {
      body.appendChild(sectionBox("Card's color and background", (s) => {
        s.appendChild(labeledCheckbox("Print in color", draft.colors.cardOn, (v) => { draft.colors.cardOn = v; }));
        s.appendChild(labeledColor("Color 1", draft.colors.cardColor1, (v) => { draft.colors.cardColor1 = v; }));
        s.appendChild(labeledColor("Color 2", draft.colors.cardColor2, (v) => { draft.colors.cardColor2 = v; }));
        s.appendChild(labeledSelect("Position (color keyed by)", draft.colors.cardKey, [
          { id: "subject", label: "Subject" },
          { id: "teacher", label: "Teacher" },
          { id: "class",   label: "Class" },
          { id: "group",   label: "Group" },
          { id: "classroom", label: "Classroom" },
          { id: "building", label: "Building" },
        ], (v) => { draft.colors.cardKey = v; }));
      }));

      body.appendChild(sectionBox("Print row header in color", (s) => {
        s.appendChild(labeledCheckbox("Enable row-header colors", draft.colors.rowHeaderOn, (v) => { draft.colors.rowHeaderOn = v; }));
        s.appendChild(labeledColor("Background 1", draft.colors.rowBg1, (v) => { draft.colors.rowBg1 = v; }));
        s.appendChild(labeledColor("Background 2", draft.colors.rowBg2, (v) => { draft.colors.rowBg2 = v; }));
        s.appendChild(labeledColor("Font color", draft.colors.rowFont, (v) => { draft.colors.rowFont = v; }));
      }));

      body.appendChild(sectionBox("Print column header in color", (s) => {
        s.appendChild(labeledCheckbox("Enable column-header colors", draft.colors.colHeaderOn, (v) => { draft.colors.colHeaderOn = v; }));
        s.appendChild(labeledColor("Background 1", draft.colors.colBg1, (v) => { draft.colors.colBg1 = v; }));
        s.appendChild(labeledColor("Background 2", draft.colors.colBg2, (v) => { draft.colors.colBg2 = v; }));
        s.appendChild(labeledColor("Font color", draft.colors.colFont, (v) => { draft.colors.colFont = v; }));
      }));
    }, () => {
      report.colors = draft.colors;
      if (typeof onSave === "function") onSave(report);
    });
  }

  APP.PrintSizesDialog  = { open: openSizes };
  APP.PrintDesignDialog = { open: openDesign };
  APP.PrintColorsDialog = { open: openColors };
})();
