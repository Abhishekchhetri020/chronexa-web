/* Per-element cell-style dialog — Phase 2 of the print-system rewrite.
 *
 * Replaces the flat "anchor + colors" dialog with aSc's exact UX:
 *   - 7 element panels (Subject / Teacher / Class / Group / Classroom
 *     / Count / Bell times)
 *   - Each panel: enabled / 3×3 anchor grid / size slider / font /
 *     B / I / U / text format / conditional toggles
 *   - Live preview swatch top-left
 *   - "Set for more" popup (Selection / Position / Font checkboxes)
 *   - "Edit texts ▼" sub-menu (per-label text overrides)
 *
 * Two modes:
 *   - "defaults"     — Print Setup mode, edits report.elementStyles for
 *                       the active PrintReport
 *   - "single-card"  — Override mode, edits a per-card stylesheet
 *
 * Public API:
 *   APP.CellStyleDialog.open({ mode, report, cards, onSave })
 *
 * Legacy API still supported for existing print_preview.js button:
 *   APP.CellStyleDialog.open(templateId, currentStyle, onSave)
 *   — auto-detects legacy call by argument shape and falls through to the
 *     new per-element dialog editing APP.activePrintReport.
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});

  const ELEMENT_KEYS = ["subject","teacher","class","group","classroom","count","bellTimes"];
  const ELEMENT_LABEL = {
    subject: "Subject", teacher: "Teacher", class: "Class",
    group: "Group", classroom: "Classroom", count: "Count", bellTimes: "Bell times",
  };
  const FONTS = [
    "system-ui", "Bahnschrift", "Arial", "Helvetica", "Times New Roman",
    "Georgia", "Courier New", "Verdana", "Inter Tight", "Fraunces",
  ];
  const TEXT_FORMATS = [
    { id: "abbreviation", label: "Abbreviation" },
    { id: "full",         label: "Full name" },
  ];
  const ANCHORS = [
    "top-left","top-center","top-right",
    "middle-left","middle-center","middle-right",
    "bottom-left","bottom-center","bottom-right",
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

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // ────────────────────────────────────────────────────────────────────
  // Element panel — one of the 7 boxes
  // ────────────────────────────────────────────────────────────────────

  function elementPanel(elementKey, style, onChange) {
    const label = ELEMENT_LABEL[elementKey];
    const panel = el("div", {
      style: "border:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg-tile,#efe9da);" +
             "padding:14px 16px;border-radius:8px;display:flex;flex-direction:column;gap:10px;" +
             "opacity:" + (style.enabled ? "1" : ".55") + ";transition:opacity 120ms ease",
    });

    const headRow = el("label", {
      style: "display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:14px",
    });
    const cb = el("input", { type: "checkbox", style: "accent-color:#0d4f54;width:16px;height:16px;cursor:pointer" });
    if (style.enabled) cb.checked = true;
    cb.addEventListener("change", (e) => {
      style.enabled = e.target.checked;
      panel.style.opacity = style.enabled ? "1" : ".55";
      onChange();
    });
    headRow.appendChild(cb);
    headRow.appendChild(el("span", null, label));
    panel.appendChild(headRow);

    const posWrap = el("div", { style: "display:flex;align-items:flex-start;gap:12px" });
    posWrap.appendChild(el("div", { style: "font-size:12px;color:var(--chrx-fg-secondary,#4a4339);padding-top:8px;min-width:60px" }, "Position:"));
    const grid = el("div", {
      style: "display:grid;grid-template-columns:repeat(3,18px);grid-template-rows:repeat(3,18px);gap:2px",
    });
    ANCHORS.forEach(a => {
      const btn = el("button", {
        type: "button",
        "data-anchor": a,
        title: a,
        style: "width:18px;height:18px;border:1px solid #999;background:#fff;border-radius:3px;cursor:pointer;padding:0;font-size:0",
        onclick: () => { style.anchor = a; paintGrid(); onChange(); },
      });
      grid.appendChild(btn);
    });
    function paintGrid() {
      grid.querySelectorAll("button").forEach(b => {
        const active = b.dataset.anchor === style.anchor;
        b.style.background = active ? "var(--chrx-fg,#1a1714)" : "#fff";
      });
    }
    paintGrid();
    posWrap.appendChild(grid);
    panel.appendChild(posWrap);

    const sizeRow = el("div", { style: "display:flex;align-items:center;gap:12px" });
    sizeRow.appendChild(el("div", { style: "font-size:12px;color:var(--chrx-fg-secondary,#4a4339);min-width:60px" }, "Size:"));
    const slider = el("input", {
      type: "range", min: "5", max: "50", step: "1",
      value: String(style.size || 14),
      style: "flex:1;accent-color:#0d4f54",
    });
    const sizeReadout = el("span", { style: "font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;min-width:36px;text-align:right" }, (style.size || 14) + "%");
    slider.addEventListener("input", (e) => {
      style.size = parseInt(e.target.value, 10);
      sizeReadout.textContent = style.size + "%";
      onChange();
    });
    sizeRow.appendChild(slider);
    sizeRow.appendChild(sizeReadout);
    panel.appendChild(sizeRow);

    const fontRow = el("div", { style: "display:flex;align-items:center;gap:8px;flex-wrap:wrap" });
    fontRow.appendChild(el("div", { style: "font-size:12px;color:var(--chrx-fg-secondary,#4a4339);min-width:60px" }, "Font:"));
    const fontSel = el("select", {
      style: "flex:1;min-width:110px;padding:4px 6px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:5px;font-size:12px;cursor:pointer",
    });
    FONTS.forEach(f => {
      const o = el("option", { value: f }, f);
      if (f === style.font) o.selected = true;
      fontSel.appendChild(o);
    });
    fontSel.addEventListener("change", (e) => { style.font = e.target.value; onChange(); });
    fontRow.appendChild(fontSel);
    fontRow.appendChild(styleToggle("B", () => style.bold, (v) => { style.bold = v; onChange(); }));
    fontRow.appendChild(styleToggle("I", () => style.italic, (v) => { style.italic = v; onChange(); }, "font-style:italic"));
    fontRow.appendChild(styleToggle("U", () => style.underline, (v) => { style.underline = v; onChange(); }, "text-decoration:underline"));
    panel.appendChild(fontRow);

    if (elementKey === "subject" || elementKey === "teacher" || elementKey === "class" ||
        elementKey === "group" || elementKey === "classroom") {
      const textRow = el("div", { style: "display:flex;align-items:center;gap:8px" });
      textRow.appendChild(el("div", { style: "font-size:12px;color:var(--chrx-fg-secondary,#4a4339);min-width:60px" }, "Text:"));
      const sel = el("select", {
        style: "flex:1;padding:4px 6px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:5px;font-size:12px;cursor:pointer",
      });
      TEXT_FORMATS.forEach(tf => {
        const o = el("option", { value: tf.id }, tf.label);
        if (tf.id === style.textFormat) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", (e) => { style.textFormat = e.target.value; onChange(); });
      textRow.appendChild(sel);
      panel.appendChild(textRow);
    }

    style.conditional = style.conditional || {};
    if (elementKey === "class") {
      panel.appendChild(conditionalRow("Print group instead of class",
        style.conditional.printGroupInsteadOfClass,
        (v) => { style.conditional.printGroupInsteadOfClass = v; onChange(); }));
    } else if (elementKey === "group") {
      panel.appendChild(conditionalRow("Do not print if entire class",
        style.conditional.doNotPrintIfEntireClass,
        (v) => { style.conditional.doNotPrintIfEntireClass = v; onChange(); }));
    } else if (elementKey === "classroom") {
      panel.appendChild(conditionalRow("Do not print if home classroom",
        style.conditional.doNotPrintIfHomeClassroom,
        (v) => { style.conditional.doNotPrintIfHomeClassroom = v; onChange(); }));
    }

    return panel;
  }

  function styleToggle(label, getter, setter, extraStyle) {
    const btn = el("button", {
      type: "button",
      style: "width:28px;height:28px;border:1px solid var(--chrx-line,#d8cfbb);border-radius:5px;cursor:pointer;font-size:13px;font-weight:700;font-family:'JetBrains Mono',ui-monospace,monospace;" + (extraStyle || ""),
    }, label);
    function paint() {
      const on = !!getter();
      btn.style.background = on ? "var(--chrx-fg,#1a1714)" : "#fff";
      btn.style.color      = on ? "var(--chrx-bg-sheet,#f6f1e6)" : "var(--chrx-fg,#1a1714)";
    }
    paint();
    btn.addEventListener("click", () => { setter(!getter()); paint(); });
    return btn;
  }

  function conditionalRow(label, on, onChange) {
    const row = el("label", {
      style: "display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;color:var(--chrx-fg-secondary,#4a4339);padding-top:4px",
    });
    const cb = el("input", { type: "checkbox", style: "accent-color:#0d4f54;width:14px;height:14px;cursor:pointer" });
    if (on) cb.checked = true;
    cb.addEventListener("change", (e) => onChange(e.target.checked));
    row.appendChild(cb);
    row.appendChild(el("span", null, label));
    return row;
  }

  // ────────────────────────────────────────────────────────────────────
  // Live preview swatch
  // ────────────────────────────────────────────────────────────────────

  function buildPreviewSwatch(report) {
    const wrap = el("div", {
      style: "border:1px solid var(--chrx-line,#d8cfbb);background:#fff;" +
             "padding:16px;border-radius:8px;display:flex;flex-direction:column;align-items:center;gap:8px",
    });
    wrap.appendChild(el("div", {
      style: "font-size:11px;color:var(--chrx-fg-tertiary,#837a6d);letter-spacing:.06em;text-transform:uppercase",
    }, "Live preview"));

    const swatch = el("div", {
      style: "width:220px;height:140px;position:relative;background:#fff;border:1px solid #999;" +
             "border-radius:4px;box-shadow:0 6px 16px rgba(0,0,0,.18)",
    });

    const SAMPLE = {
      subject: "Maths", teacher: "Ms. Sushmita", class: "X A",
      group: "Group 1", classroom: "Lab-1", count: "5/wk", bellTimes: "08:00–08:40",
    };

    const A2F = {
      "top-left":      { just: "flex-start", align: "flex-start", text: "left" },
      "top-center":    { just: "flex-start", align: "center",     text: "center" },
      "top-right":     { just: "flex-start", align: "flex-end",   text: "right" },
      "middle-left":   { just: "center",     align: "flex-start", text: "left" },
      "middle-center": { just: "center",     align: "center",     text: "center" },
      "middle-right":  { just: "center",     align: "flex-end",   text: "right" },
      "bottom-left":   { just: "flex-end",   align: "flex-start", text: "left" },
      "bottom-center": { just: "flex-end",   align: "center",     text: "center" },
      "bottom-right":  { just: "flex-end",   align: "flex-end",   text: "right" },
    };

    function refresh() {
      clearNode(swatch);
      for (const key of ELEMENT_KEYS) {
        const style = (report.elementStyles || []).find(s => s.key === key);
        if (!style || !style.enabled) continue;
        const text = SAMPLE[key];
        if (!text) continue;
        const a = A2F[style.anchor || "middle-center"];
        const fontStyle = [];
        if (style.bold)      fontStyle.push("font-weight:700");
        if (style.italic)    fontStyle.push("font-style:italic");
        if (style.underline) fontStyle.push("text-decoration:underline");
        if (style.font) fontStyle.push("font-family:'" + style.font + "',system-ui");
        const sizePx = Math.max(7, Math.round((style.size || 14) * 0.8));
        fontStyle.push("font-size:" + sizePx + "px");
        const layer = el("div", {
          style: "position:absolute;inset:0;display:flex;flex-direction:column;" +
                 "justify-content:" + a.just + ";align-items:" + a.align + ";text-align:" + a.text + ";" +
                 "padding:6px 8px;pointer-events:none",
        }, el("div", { style: fontStyle.join(";") + ";line-height:1.15" }, text));
        swatch.appendChild(layer);
      }
    }
    refresh();
    wrap.appendChild(swatch);
    return { node: wrap, refresh };
  }

  // ────────────────────────────────────────────────────────────────────
  // Main dialog
  // ────────────────────────────────────────────────────────────────────

  function open(modeOrLegacyId, optsOrLegacyStyle, legacyCallback) {
    let opts;
    if (typeof modeOrLegacyId === "string" && (optsOrLegacyStyle == null || typeof optsOrLegacyStyle !== "object" || !optsOrLegacyStyle.report)) {
      const Schema = APP.PrintReportSchema;
      const Presets = APP.PrintPresets;
      const tplId = modeOrLegacyId;
      if (!APP.activePrintReport || APP.activePrintReport._presetId !== tplId) {
        const preset = Presets?.get(tplId);
        if (preset && Schema) {
          const r = Schema.create({ context: preset.context });
          Schema.applyPreset(r, preset);
          r._presetId = preset.id;
          APP.activePrintReport = r;
        }
      }
      opts = { mode: "defaults", report: APP.activePrintReport, onSave: legacyCallback };
    } else {
      opts = modeOrLegacyId;
    }
    if (!opts || !opts.report) {
      console.warn("[cell_style_dialog] no report supplied");
      return;
    }
    openInternal(opts);
  }

  function openInternal(opts) {
    const Schema = APP.PrintReportSchema;
    const report = opts.report;
    const mode = opts.mode || "defaults";

    const draft = Schema.clone(report);
    if (!Array.isArray(draft.elementStyles) || draft.elementStyles.length !== 7) {
      draft.elementStyles = Schema.ELEMENT_KEYS.map(k => Schema.makeElementStyle(k, draft.context));
    }

    const scrim = el("div", {
      class: "chrx-cellstyle-scrim",
      style: "position:fixed;inset:0;background:rgba(26,23,20,.42);backdrop-filter:blur(8px);" +
             "z-index:9200;display:flex;align-items:flex-start;justify-content:center;padding-top:4vh",
      onclick: (e) => { if (e.target === scrim) close(); },
    });
    const dialog = el("div", {
      style: "background:var(--chrx-bg-sheet,#f6f1e6);width:min(1100px,96vw);max-height:92vh;overflow:auto;" +
             "border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.25);font-family:system-ui;color:var(--chrx-fg,#1a1714)",
    });
    scrim.appendChild(dialog);

    function close() { scrim.remove(); document.removeEventListener("keydown", onKey, true); }
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
    dialog.appendChild(header);

    const titleSection = el("div", { style: "padding:14px 24px 8px;border-bottom:1px solid var(--chrx-line,#d8cfbb)" });
    const titleText = mode === "defaults"
      ? "Print setup"
      : "Set the print style for the cards where:";
    titleSection.appendChild(el("h2", {
      style: "margin:0;font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:22px;letter-spacing:-.01em",
    }, titleText));
    if (mode === "single-card" && Array.isArray(opts.cards)) {
      titleSection.appendChild(el("div", {
        style: "margin-top:6px;font-size:12px;color:var(--chrx-fg-secondary,#4a4339)",
      }, "Length: 1, Size: " + opts.cards.length + "/" + (report.cards?.length || opts.cards.length)));
    }
    dialog.appendChild(titleSection);

    const body = el("div", { style: "padding:16px 24px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px" });
    dialog.appendChild(body);

    const preview = buildPreviewSwatch(draft);
    body.appendChild(preview.node);

    function onAnyChange() { preview.refresh(); }

    const ORDER = ["subject","teacher","class","group","classroom","count","bellTimes"];
    for (const key of ORDER) {
      let style = draft.elementStyles.find(s => s.key === key);
      if (!style) {
        style = Schema.makeElementStyle(key, draft.context);
        draft.elementStyles.push(style);
      }
      body.appendChild(elementPanel(key, style, onAnyChange));
    }

    const footer = el("div", {
      style: "padding:14px 24px 18px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg,#f6f1e6);border-radius:0 0 14px 14px",
    });
    const leftBtns = el("div", { style: "display:flex;gap:8px" });
    leftBtns.appendChild(el("button", {
      type: "button",
      style: "padding:8px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:8px;font-size:13px;cursor:pointer;color:var(--chrx-fg,#1a1714)",
      onclick: () => openSetForMore(draft, () => onAnyChange()),
    }, "Set for more"));
    leftBtns.appendChild(el("button", {
      type: "button",
      style: "padding:8px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:8px;font-size:13px;cursor:pointer;color:var(--chrx-fg,#1a1714)",
      onclick: () => openEditTexts(draft, () => onAnyChange()),
    }, "Edit texts ▼"));
    footer.appendChild(leftBtns);
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
        Object.assign(report, draft);
        if (mode === "defaults" && report._presetId) {
          APP.printCellStyles = APP.printCellStyles || {};
          APP.printCellStyles[report._presetId] = draft.elementStyles;
        }
        close();
        if (typeof opts.onSave === "function") opts.onSave(report);
      },
    }, "OK"));
    footer.appendChild(rightBtns);
    dialog.appendChild(footer);

    document.body.appendChild(scrim);
  }

  function openSetForMore(draft, onAfter) {
    const scrim = el("div", {
      style: "position:fixed;inset:0;background:rgba(26,23,20,.42);z-index:9300;display:flex;align-items:center;justify-content:center",
      onclick: (e) => { if (e.target === scrim) close(); },
    });
    const dlg = el("div", {
      style: "background:#fff;border-radius:12px;padding:20px 24px;width:min(420px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:system-ui",
    });
    function close() { scrim.remove(); }
    dlg.appendChild(el("div", {
      style: "font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:18px;margin-bottom:6px",
    }, "Set for more"));
    dlg.appendChild(el("div", { style: "font-size:13px;color:#666;margin-bottom:14px" },
      "Apply the current changes to other cards. Pick which aspects to copy."));
    let state = { selection: true, position: true, font: true };
    function cbRow(label, key) {
      const row = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;padding:6px 0" });
      const cb = el("input", { type: "checkbox", style: "accent-color:#0d4f54;width:16px;height:16px" });
      cb.checked = state[key];
      cb.addEventListener("change", (e) => { state[key] = e.target.checked; });
      row.appendChild(cb); row.appendChild(el("span", null, label));
      return row;
    }
    dlg.appendChild(cbRow("Selection (which elements are enabled)", "selection"));
    dlg.appendChild(cbRow("Position (anchors + sizes)", "position"));
    dlg.appendChild(cbRow("Font (family + B/I/U)", "font"));
    const btnRow = el("div", { style: "display:flex;justify-content:flex-end;gap:8px;margin-top:14px" });
    btnRow.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer",
      onclick: close,
    }, "Cancel"));
    btnRow.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:0;background:#0d4f54;color:#fff;border-radius:6px;cursor:pointer;font-weight:600",
      onclick: () => { close(); if (typeof onAfter === "function") onAfter(); },
    }, "OK"));
    dlg.appendChild(btnRow);
    scrim.appendChild(dlg);
    document.body.appendChild(scrim);
  }

  function openEditTexts(draft, onAfter) {
    const scrim = el("div", {
      style: "position:fixed;inset:0;background:rgba(26,23,20,.42);z-index:9300;display:flex;align-items:center;justify-content:center",
      onclick: (e) => { if (e.target === scrim) close(); },
    });
    const dlg = el("div", {
      style: "background:#fff;border-radius:12px;padding:20px 24px;width:min(480px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:system-ui",
    });
    function close() { scrim.remove(); }
    dlg.appendChild(el("div", {
      style: "font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:18px;margin-bottom:6px",
    }, "Edit texts"));
    dlg.appendChild(el("div", { style: "font-size:13px;color:#666;margin-bottom:14px" },
      "Override what each element shows on the printed card. Leave blank to use the entity's name."));
    for (const key of ELEMENT_KEYS) {
      const style = draft.elementStyles.find(s => s.key === key);
      if (!style) continue;
      const row = el("div", { style: "display:flex;align-items:center;gap:8px;padding:6px 0" });
      row.appendChild(el("label", {
        style: "font-size:12px;color:#4a4339;min-width:88px",
        for: "txt-" + key,
      }, ELEMENT_LABEL[key]));
      const input = el("input", {
        type: "text", id: "txt-" + key,
        placeholder: "(use entity name)",
        value: style.labelOverride || "",
        style: "flex:1;padding:6px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:13px",
      });
      input.addEventListener("input", (e) => {
        style.labelOverride = e.target.value || null;
      });
      row.appendChild(input);
      dlg.appendChild(row);
    }
    const btnRow = el("div", { style: "display:flex;justify-content:flex-end;gap:8px;margin-top:14px" });
    btnRow.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer",
      onclick: close,
    }, "Close"));
    btnRow.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:0;background:#0d4f54;color:#fff;border-radius:6px;cursor:pointer;font-weight:600",
      onclick: () => { close(); if (typeof onAfter === "function") onAfter(); },
    }, "Done"));
    dlg.appendChild(btnRow);
    scrim.appendChild(dlg);
    document.body.appendChild(scrim);
  }

  function defaultStyle() {
    const Schema = APP.PrintReportSchema;
    if (Schema) return Schema.makeElementStyle("subject", "summary");
    return { enabled: true, anchor: "middle-center", size: 14, font: "system-ui", bold: false, italic: false, underline: false, textFormat: "abbreviation" };
  }

  APP.CellStyleDialog = window.CellStyleDialog = { open, defaultStyle };
})();
