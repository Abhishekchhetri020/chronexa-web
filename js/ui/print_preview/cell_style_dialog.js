/* Cell-style editor dialog for print preview.
 *
 *   window.CellStyleDialog.open(templateId, currentStyle, onSave)
 *
 * Lets the user customize how each lesson card looks within a print
 * template. Controls:
 *   - 3×3 anchor grid (which corner of the cell the card sits in)
 *   - 7 card-type checkboxes (subject, teacher, class, group, classroom,
 *     count, bellTimes)
 *   - Font picker (family + size)
 *   - Color pickers (background + foreground)
 *   - Live preview pane (renders a synthetic sample card with the
 *     current settings applied)
 *
 * The settings object shape is:
 *   {
 *     anchor: "top-left" | "top-center" | "top-right" |
 *             "middle-left" | "middle-center" | "middle-right" |
 *             "bottom-left" | "bottom-center" | "bottom-right",
 *     cardTypes: { subject, teacher, class, group, classroom,
 *                  count, bellTimes }   (all booleans)
 *     font: { family: string, size: number }   // size in px
 *     colors: { bg: hex, fg: hex }
 *   }
 *
 * Persistence is in-memory on window.APP.printCellStyles[templateId].
 * print_preview.js consults this in `cellFromCard`.
 */
(function (global) {
  "use strict";
  const APP = (window.APP = window.APP || {});
  APP.printCellStyles = APP.printCellStyles || {};

  const ANCHORS = [
    "top-left", "top-center", "top-right",
    "middle-left", "middle-center", "middle-right",
    "bottom-left", "bottom-center", "bottom-right",
  ];
  const CARD_TYPES = [
    { id:"subject",   label:"Subject" },
    { id:"teacher",   label:"Teacher" },
    { id:"class",     label:"Class" },
    { id:"group",     label:"Group" },
    { id:"classroom", label:"Classroom" },
    { id:"count",     label:"Count" },
    { id:"bellTimes", label:"Bell times" },
  ];
  const FONTS = [
    "system-ui", "Arial", "Helvetica", "Times New Roman",
    "Georgia", "Courier New", "Verdana",
  ];

  function defaultStyle() {
    return {
      anchor: "middle-center",
      cardTypes: {
        subject:true, teacher:true, class:false, group:false,
        classroom:true, count:false, bellTimes:false,
      },
      font: { family:"system-ui", size:11 },
      colors: { bg:"#ffffff", fg:"#111827" },
    };
  }

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

  // Sample card content used by the live preview.
  const SAMPLE = {
    subject:"Math", subjectAbbr:"MA",
    teachers:["Mrs. Sharma"], teacher:"Mrs. Sharma",
    classes:["X-A"], class:"X-A",
    groups:["Group 1"], group:"Group 1",
    classroom:"Lab-1", count:"5/wk", bellTimes:"08:00–08:40",
  };

  function renderCardPreview(style) {
    const align = (() => {
      const [v, h] = style.anchor.split("-");
      const just = h === "left" ? "flex-start" : h === "right" ? "flex-end" : "center";
      const items = v === "top" ? "flex-start" : v === "bottom" ? "flex-end" : "center";
      const ta = h === "left" ? "left" : h === "right" ? "right" : "center";
      return { just, items, ta };
    })();
    const card = el("div", {
      style: `display:flex;flex-direction:column;justify-content:${align.items};align-items:${align.just};text-align:${align.ta};` +
        `width:200px;height:120px;padding:8px;border:1px solid #d1d5db;border-radius:6px;` +
        `background:${style.colors.bg};color:${style.colors.fg};` +
        `font-family:${style.font.family};font-size:${style.font.size}px;line-height:1.25;gap:2px;overflow:hidden`,
    });
    if (style.cardTypes.subject) card.appendChild(el("div", { style:"font-weight:700" }, SAMPLE.subject));
    if (style.cardTypes.teacher) card.appendChild(el("div", null, SAMPLE.teacher));
    if (style.cardTypes.class)   card.appendChild(el("div", null, SAMPLE.class));
    if (style.cardTypes.group)   card.appendChild(el("div", null, SAMPLE.group));
    if (style.cardTypes.classroom) card.appendChild(el("div", { style:"opacity:.75" }, SAMPLE.classroom));
    if (style.cardTypes.count)   card.appendChild(el("div", { style:"opacity:.6;font-size:0.9em" }, SAMPLE.count));
    if (style.cardTypes.bellTimes) card.appendChild(el("div", { style:"opacity:.6;font-size:0.9em" }, SAMPLE.bellTimes));
    return card;
  }

  function open(templateId, currentStyle, onSave) {
    const style = JSON.parse(JSON.stringify(currentStyle || defaultStyle()));
    // ensure shape
    style.cardTypes = Object.assign({}, defaultStyle().cardTypes, style.cardTypes || {});
    style.font = Object.assign({}, defaultStyle().font, style.font || {});
    style.colors = Object.assign({}, defaultStyle().colors, style.colors || {});

    // ─── Scrim + dialog
    const scrim = el("div", {
      class: "chrx-cellstyle-scrim",
      style: "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center",
      onclick: (e) => { if (e.target === scrim) close(); },
    });
    const dlg = el("div", {
      style: "background:#fff;border-radius:12px;width:min(720px,92vw);max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.35);padding:20px",
      role: "dialog", "aria-modal":"true",
    });
    scrim.appendChild(dlg);

    function close() { scrim.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    document.addEventListener("keydown", onKey, true);

    // ─── Header
    dlg.appendChild(el("div", {
      style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid #e5e7eb;padding-bottom:10px" },
      el("h3", { style:"margin:0;font-size:18px" }, "Cell style — " + (templateId || "template")),
      el("button", { type:"button",
        style:"border:0;background:transparent;font-size:24px;cursor:pointer;color:#6b7280",
        onclick: close }, "×")));

    // ─── Body grid: controls (left) + live preview (right)
    const body = el("div", { style:"display:grid;grid-template-columns:1fr 240px;gap:20px" });
    const controls = el("div", null);
    const previewWrap = el("div", { style:"display:flex;flex-direction:column;gap:8px;align-items:center" });
    body.appendChild(controls); body.appendChild(previewWrap);
    dlg.appendChild(body);

    // ─── Live preview
    const previewLabel = el("div", { style:"font-size:11px;opacity:.6;font-weight:600;letter-spacing:0.04em;text-transform:uppercase" }, "Live preview");
    const previewHost = el("div", {
      style:"padding:12px;background:#f9fafb;border-radius:8px;border:1px dashed #d1d5db;display:flex;align-items:center;justify-content:center" });
    function refreshPreview() {
      previewHost.innerHTML = "";
      previewHost.appendChild(renderCardPreview(style));
    }
    previewWrap.appendChild(previewLabel);
    previewWrap.appendChild(previewHost);
    refreshPreview();

    // ─── Section: anchor grid (3×3)
    controls.appendChild(el("div", { style:"font-size:12px;font-weight:600;color:#374151;margin-bottom:6px" }, "Position (3×3 anchor)"));
    const anchorGrid = el("div", {
      style:"display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:14px;max-width:180px" });
    ANCHORS.forEach(a => {
      const btn = el("button", { type:"button",
        "data-anchor": a,
        style:"aspect-ratio:1;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:14px",
        title: a,
        onclick: () => { style.anchor = a; markAnchor(); refreshPreview(); } }, "•");
      anchorGrid.appendChild(btn);
    });
    function markAnchor() {
      anchorGrid.querySelectorAll("button").forEach(b => {
        const active = b.dataset.anchor === style.anchor;
        b.style.background = active ? "#3b82f6" : "#fff";
        b.style.color = active ? "#fff" : "#111";
        b.style.borderColor = active ? "#1d4ed8" : "#d1d5db";
      });
    }
    markAnchor();
    controls.appendChild(anchorGrid);

    // ─── Section: card-type checkboxes (7)
    controls.appendChild(el("div", { style:"font-size:12px;font-weight:600;color:#374151;margin-bottom:6px" }, "Show on card"));
    const cardTypesWrap = el("div", { style:"display:grid;grid-template-columns:repeat(2,1fr);gap:4px 12px;margin-bottom:14px" });
    CARD_TYPES.forEach(ct => {
      const cb = el("input", { type:"checkbox",
        checked: style.cardTypes[ct.id] ? "checked" : null,
        onchange:(e)=>{ style.cardTypes[ct.id] = e.target.checked; refreshPreview(); } });
      cardTypesWrap.appendChild(el("label", {
        style:"display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer" },
        cb, el("span", null, ct.label)));
    });
    controls.appendChild(cardTypesWrap);

    // ─── Section: font picker
    controls.appendChild(el("div", { style:"font-size:12px;font-weight:600;color:#374151;margin-bottom:6px" }, "Font"));
    const fontRow = el("div", { style:"display:flex;gap:8px;margin-bottom:14px;align-items:center" });
    const fontFamily = el("select", { style:"flex:1;padding:4px 6px",
      onchange:(e)=>{ style.font.family = e.target.value; refreshPreview(); } });
    FONTS.forEach(f => {
      const opt = el("option", { value:f }, f);
      if (f === style.font.family) opt.selected = true;
      fontFamily.appendChild(opt);
    });
    const fontSize = el("input", { type:"number", min:"6", max:"48",
      value: String(style.font.size), style:"width:64px;padding:4px 6px",
      oninput:(e)=>{ style.font.size = parseInt(e.target.value, 10) || 11; refreshPreview(); } });
    fontRow.appendChild(fontFamily);
    fontRow.appendChild(fontSize);
    fontRow.appendChild(el("span", { style:"font-size:11px;opacity:.6" }, "px"));
    controls.appendChild(fontRow);

    // ─── Section: colors (bg + fg)
    controls.appendChild(el("div", { style:"font-size:12px;font-weight:600;color:#374151;margin-bottom:6px" }, "Colors"));
    const colorRow = el("div", { style:"display:flex;gap:14px;margin-bottom:14px;align-items:center" });
    function colorField(label, key) {
      const cp = el("input", { type:"color", value: style.colors[key],
        style:"width:36px;height:28px;border:1px solid #d1d5db;border-radius:4px;padding:0;cursor:pointer",
        oninput:(e)=>{ style.colors[key] = e.target.value; refreshPreview(); } });
      return el("label", { style:"display:inline-flex;align-items:center;gap:6px;font-size:13px" },
        el("span", { style:"opacity:.7" }, label), cp);
    }
    colorRow.appendChild(colorField("Background", "bg"));
    colorRow.appendChild(colorField("Foreground", "fg"));
    controls.appendChild(colorRow);

    // ─── Footer
    dlg.appendChild(el("div", {
      style:"display:flex;justify-content:flex-end;gap:8px;margin-top:8px;border-top:1px solid #e5e7eb;padding-top:12px" },
      el("button", { type:"button",
        style:"padding:6px 14px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer",
        onclick: close }, "Cancel"),
      el("button", { type:"button",
        style:"padding:6px 14px;border:0;background:#1d4ed8;color:#fff;border-radius:6px;cursor:pointer;font-weight:600",
        onclick: () => {
          APP.printCellStyles[templateId] = style;
          close();
          if (typeof onSave === "function") onSave(style);
        } }, "Save")));

    document.body.appendChild(scrim);
  }

  global.CellStyleDialog = { open, defaultStyle };
})(window);
