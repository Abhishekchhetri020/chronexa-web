/* Print preview — swaps the ribbon into preview mode, renders one of 5
 * starter report templates onto A4 pages, prints via window.print().
 *
 * Five templates:
 *   class    — Timetable for each class (one A4 per class)
 *   teacher  — Timetable for each teacher
 *   room     — Timetable for each classroom
 *   summary  — Summary of all classes on one grid
 *   poster   — Wall poster (landscape, big cells)
 *
 * Defers the 19 other CLASSIC templates.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat"];

  let overlay = null;
  let docShell = null;
  let pageIdx = 0;
  let pages = [];
  let currentTemplate = "class";

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "chrx-preview-overlay";
    overlay.innerHTML = '<div class="chrx-preview-shell"></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) { if (c == null) continue; n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    return n;
  }

  function buildPreviewBar() {
    const bar = el("div", { class: "chrx-preview-controls",
      style: "display:flex;gap:6px;align-items:center;padding:8px 12px;background:var(--chrx-bg-panel);border-bottom:1px solid var(--chrx-line);flex-wrap:wrap" });

    const prev   = el("button", { class: "chrx-tb-btn", type: "button", onclick: () => stepPage(-1) }, "◀ Prev");
    const next   = el("button", { class: "chrx-tb-btn", type: "button", onclick: () => stepPage(1)  }, "Next ▶");
    const print  = el("button", { class: "chrx-tb-btn chrx-tb-btn--primary", type: "button",
      onclick: printAllPages }, "🖨 Print");
    const indicator = el("span", { class: "chrx-pp-indicator", style: "min-width:80px;text-align:center;font-variant-numeric:tabular-nums" }, "Page 1 / 1");

    const sel = el("select", { class: "chrx-tb-btn", "aria-label": "Report template",
      onchange: (e) => render(e.target.value) });
    // Pull the full template list from the registry if it loaded; fall back
    // to the legacy 5-template hardcoded list otherwise.
    const reg = APP.printTemplates;
    const templates = reg ? reg.list() : [
      { id: "class",   name: "Timetable for each class" },
      { id: "teacher", name: "Timetable for each teacher" },
      { id: "room",    name: "Timetable for each room" },
      { id: "summary", name: "Summary of classes" },
      { id: "poster",  name: "Wall poster (landscape)" },
    ];
    templates.forEach(t => sel.appendChild(el("option", { value: t.id }, t.name)));
    sel.value = currentTemplate;

    const filterBtn  = el("button", { class: "chrx-tb-btn", type: "button",
      title: "Filter rows shown in this preview",
      onclick: () => {
        const q = prompt("Filter rows (subject / teacher / class — leave empty to clear):", APP.printFilter || "");
        if (q == null) return;
        APP.printFilter = q.trim();
        render(currentTemplate);
        notify(q ? ("Filter: " + q) : "Filter cleared");
      } }, "⚙︎ Filter");
    const sizeBtn    = el("button", { class: "chrx-tb-btn", type: "button",
      title: "Page size & scale",
      onclick: () => {
        const cur = APP.printScale || 100;
        const next = prompt("Print scale percent (50–200):", String(cur));
        const v = Math.max(50, Math.min(200, parseInt(next, 10) || cur));
        APP.printScale = v;
        const stage = host.querySelector(".chrx-pp-stage");
        if (stage) stage.style.zoom = (v / 100).toString();
        notify("Scale " + v + "%");
      } }, "📐 Sizes");
    const designBtn  = el("button", { class: "chrx-tb-btn", type: "button",
      title: "Cell style — anchor, fields, font, colors",
      onclick: () => {
        if (!window.CellStyleDialog) { notify("Cell-style dialog not loaded", "error"); return; }
        const cur = (APP.printCellStyles || {})[currentTemplate];
        window.CellStyleDialog.open(currentTemplate, cur, () => {
          // Re-render the active template so the new style takes effect.
          render(currentTemplate);
        });
      } }, "🎨 Cell style…");
    const colorBtn   = el("button", { class: "chrx-tb-btn", type: "button",
      title: "Edit per-subject colours",
      onclick: () => { closePreview(); window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind: "subjects" } })); } }, "🌈 Colors");
    const structBtn  = el("button", { class: "chrx-tb-btn", type: "button",
      title: "Days, periods, breaks, holidays — opens School Hub",
      onclick: () => { closePreview(); document.dispatchEvent(new CustomEvent("nav:goto-step", { detail: { step: 2 } })); } }, "🧩 Structure");
    const extraBtn   = el("button", { class: "chrx-tb-btn", type: "button",
      title: "Toggle extra header / footer / class-total rows",
      onclick: () => {
        APP.printExtras = !APP.printExtras;
        host.classList.toggle("chrx-pp-extras", !!APP.printExtras);
        render(currentTemplate);
        notify(APP.printExtras ? "Extras: on" : "Extras: off");
      } }, "➕ Extra");
    const globalBtn  = el("button", { class: "chrx-tb-btn", type: "button",
      title: "School-wide settings — opens School Hub",
      onclick: () => { closePreview(); document.dispatchEvent(new CustomEvent("nav:goto-step", { detail: { step: 2 } })); } }, "🛠 Global");

    const close = el("button", { class: "chrx-tb-btn chrx-tb-btn--danger", type: "button",
      style: "margin-left:auto", onclick: closePreview }, "✕ Close preview");

    [prev, next, print, indicator, sel, filterBtn, structBtn, extraBtn, sizeBtn, designBtn, colorBtn, globalBtn, close]
      .forEach(c => bar.appendChild(c));
    bar._indicator = indicator;
    return bar;
  }

  function openPreview() {
    if (!APP.school) { notify("Open a timetable first.", "error"); return; }
    ensureOverlay();
    const shell = overlay.querySelector(".chrx-preview-shell");
    shell.innerHTML = "";
    const bar = buildPreviewBar();
    shell.appendChild(bar);
    docShell = el("div", { class: "chrx-preview-doc" });
    shell.appendChild(docShell);
    overlay.classList.add("is-open");

    // Set ribbon mode (other agents may want to know)
    const host = document.getElementById("chrx-ribbon");
    if (host) host.setAttribute("data-ribbon-mode", "preview");

    render(currentTemplate);

    document.addEventListener("keydown", onKey);
  }

  function closePreview() {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    const host = document.getElementById("chrx-ribbon");
    if (host) host.removeAttribute("data-ribbon-mode");
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (!overlay || !overlay.classList.contains("is-open")) return;
    if (e.key === "Escape")     { e.preventDefault(); closePreview(); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); stepPage(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); stepPage(1); }
    if ((e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "P")) {
      e.preventDefault(); printAllPages();
    }
  }

  function stepPage(delta) {
    if (!pages.length) return;
    pageIdx = Math.max(0, Math.min(pages.length - 1, pageIdx + delta));
    showPage(pageIdx);
  }

  // The previewer keeps a single page in the DOM at a time, but window.print()
  // only sends whatever is currently in the DOM to the printer. Without this
  // helper, clicking 🖨 Print would drop every page except the one on screen —
  // surfacing as "only Monday / only the first class printed". Mount every
  // page into docShell for the duration of print(), then restore single-page
  // view afterwards. .chrx-preview-page already has page-break-after:always
  // in the print CSS so each page gets its own physical sheet.
  function printAllPages() {
    if (!pages.length || !docShell) { window.print(); return; }
    if (pages.length === 1) { window.print(); return; }
    const saved = pageIdx;
    while (docShell.firstChild) docShell.removeChild(docShell.firstChild);
    for (const p of pages) docShell.appendChild(p);
    try { window.print(); }
    finally { showPage(saved); }
  }
  function showPage(i) {
    docShell.innerHTML = "";
    docShell.appendChild(pages[i]);
    const ind = overlay.querySelector(".chrx-pp-indicator");
    if (ind) ind.textContent = `Page ${i + 1} / ${pages.length}`;
  }

  // ─── Render templates ────────────────────────────────────────────────────
  function render(template) {
    currentTemplate = template;
    pageIdx = 0;
    pages = [];
    const s = APP.school;
    const periods = s.bell?.periods || [];

    if (template === "class")        pages = perEntityPages(s, "class",   periods, s.classes,    s._idx?.cardsByClass);
    else if (template === "teacher") pages = perEntityPages(s, "teacher", periods, s.teachers,   s._idx?.cardsByTeacher);
    else if (template === "room")    pages = perEntityPages(s, "room",    periods, s.classrooms, s._idx?.cardsByRoom);
    else if (template === "summary") pages = [summaryPage(s, periods)];
    else if (template === "poster")  pages = [posterPage(s, periods)];
    else {
      // Registry-delegated render. Modules return Array<Node> (one node per
      // A4 page). If render throws or returns non-array, show a fallback page.
      const reg = APP.printTemplates;
      const def = reg ? reg.get(template) : null;
      if (def && typeof def.render === "function") {
        try {
          const out = def.render(s);
          if (Array.isArray(out))      pages = out.filter(Boolean);
          else if (out instanceof Node) pages = [out];
        } catch (err) {
          console.error("[print_preview] template", template, "threw:", err);
          pages = [el("div", { class: "chrx-preview-page" },
            el("h2", null, "Template error"),
            el("pre", { style: "white-space:pre-wrap;color:#900;font-size:11px" }, String(err && err.message || err)))];
        }
      }
    }

    if (!pages.length) pages = [el("div", { class: "chrx-preview-page" }, el("h2", null, "No data"))];
    showPage(0);
  }

  function pageHeader(title, subtitle) {
    return el("div", { style: "display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #333;padding-bottom:4px;margin-bottom:8px" },
      el("h2", null, title),
      el("div", { style: "font-size:9.5px;color:#555" }, subtitle || ""));
  }

  function gridTable(periods, daysIn, cellFn) {
    const tbl = el("table");
    const tr0 = el("tr"); tr0.appendChild(el("th", null, ""));
    periods.forEach(p => tr0.appendChild(el("th", null, "P" + p.index + "  " + p.label)));
    tbl.appendChild(el("thead", null, tr0));
    const tb = el("tbody");
    daysIn.forEach((d, di) => {
      const tr = el("tr");
      tr.appendChild(el("th", null, DAYS[di]));
      periods.forEach(p => tr.appendChild(cellFn(di, p)));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    return tbl;
  }

  function cellFromCard(card) {
    if (!card) return el("td", { class: "pp-cell-empty" }, "—");
    const style = (APP.printCellStyles || {})[currentTemplate];
    if (!style) {
      // Default rendering — preserves legacy look.
      return el("td", null,
        el("div", { class: "pp-cell-subj" }, card.subjectAbbr || card.subject || ""),
        el("div", { class: "pp-cell-meta" }, (card.teachers || []).join(", ")),
        el("div", { class: "pp-cell-meta" }, card.classroom || ""));
    }
    // Styled rendering — apply anchor, card-types, font, colors.
    const [v, h] = style.anchor.split("-");
    const items = v === "top" ? "flex-start" : v === "bottom" ? "flex-end" : "center";
    const just  = h === "left" ? "flex-start" : h === "right" ? "flex-end" : "center";
    const ta    = h === "left" ? "left" : h === "right" ? "right" : "center";
    const td = el("td", {
      style: `background:${style.colors.bg};color:${style.colors.fg};` +
        `font-family:${style.font.family};font-size:${style.font.size}px;vertical-align:top` });
    const box = el("div", {
      style: `display:flex;flex-direction:column;justify-content:${items};align-items:${just};text-align:${ta};height:100%;gap:1px` });
    const ct = style.cardTypes || {};
    if (ct.subject)   box.appendChild(el("div", { style:"font-weight:600" }, card.subjectAbbr || card.subject || ""));
    if (ct.teacher)   box.appendChild(el("div", null, (card.teachers || []).join(", ")));
    if (ct.class)     box.appendChild(el("div", null, (card.classes  || card.class || []).toString()));
    if (ct.group)     box.appendChild(el("div", null, (card.groups   || card.group || []).toString()));
    if (ct.classroom) box.appendChild(el("div", { style:"opacity:.75" }, card.classroom || ""));
    if (ct.count)     box.appendChild(el("div", { style:"opacity:.6;font-size:0.9em" }, String(card.count || "")));
    if (ct.bellTimes) box.appendChild(el("div", { style:"opacity:.6;font-size:0.9em" }, card.bellTimes || ""));
    td.appendChild(box);
    return td;
  }

  function perEntityPages(school, kind, periods, entities, byIdx) {
    if (!entities || !entities.length) return [];
    return entities.map(ent => {
      const page = el("div", { class: "chrx-preview-page" });
      page.appendChild(pageHeader(
        ent.name + (kind === "class" ? "" : kind === "teacher" ? " (Teacher)" : " (Room)"),
        school.schoolName || ""));
      const list = (byIdx && byIdx[ent.id]) || [];
      const tbl = gridTable(periods, DAYS, (di, p) => {
        let card = null;
        if (kind === "class")        card = list.find(c => c.day === di && c.period === p.index);
        else if (kind === "teacher") card = list.find(c => c.day === di && c.period === p.index);
        else                          card = list.find(c => c.day === di && c.period === p.index);
        return cellFromCard(card);
      });
      page.appendChild(tbl);
      page.appendChild(el("div", { style: "font-size:9px;color:#999;text-align:right;margin-top:6px" },
        "Chronexa · " + new Date().toLocaleDateString()));
      return page;
    });
  }

  function summaryPage(school, periods) {
    const page = el("div", { class: "chrx-preview-page" });
    page.appendChild(pageHeader("Summary of classes", school.schoolName || ""));
    const tbl = el("table");
    const tr0 = el("tr"); tr0.appendChild(el("th", null, "Class"));
    DAYS.forEach((d) => tr0.appendChild(el("th", null, d)));
    tbl.appendChild(el("thead", null, tr0));
    const tb = el("tbody");
    const byClass = school._idx?.cardsByClass || {};
    for (const c of school.classes) {
      const tr = el("tr");
      tr.appendChild(el("th", null, c.name));
      const list = byClass[c.id] || [];
      DAYS.forEach((_, di) => {
        const subjects = periods.map(p => {
          const card = list.find(x => x.day === di && x.period === p.index);
          return card ? (card.subjectAbbr || card.subject || "·").slice(0, 5) : "·";
        }).join(" ");
        tr.appendChild(el("td", { style: "font-size:8.5px;font-family:monospace;letter-spacing:0.5px" }, subjects));
      });
      tb.appendChild(tr);
    }
    tbl.appendChild(tb); page.appendChild(tbl);
    return page;
  }

  function posterPage(school, periods) {
    const page = el("div", { class: "chrx-preview-page",
      style: "width:297mm;min-height:210mm;padding:10mm 12mm" });
    page.appendChild(pageHeader("Wall poster · " + (school.schoolName || ""), new Date().toLocaleDateString()));
    const byClass = school._idx?.cardsByClass || {};
    const grid = el("div", { style: "display:grid;grid-template-columns:repeat(" + (school.classes.length + 1) + ",1fr);gap:1px;background:#999;border:1px solid #444" });
    grid.appendChild(headerCell("Period"));
    school.classes.forEach(c => grid.appendChild(headerCell(c.name)));
    for (let di = 0; di < DAYS.length; di++) {
      for (const p of periods) {
        grid.appendChild(headerCell(DAYS[di] + " P" + p.index));
        for (const c of school.classes) {
          const list = byClass[c.id] || [];
          const card = list.find(x => x.day === di && x.period === p.index);
          grid.appendChild(posterCell(card));
        }
      }
    }
    page.appendChild(grid);
    return page;
  }
  function headerCell(s) { return el("div", { style: "background:#eee;padding:3px 5px;font-size:8px;font-weight:600;text-align:center" }, s); }
  function posterCell(card) {
    if (!card) return el("div", { style: "background:#fff;padding:2px;min-height:18px" });
    return el("div", { style: "background:#fff;padding:2px;min-height:18px;font-size:8px;line-height:1.1" },
      el("div", { style: "font-weight:600" }, card.subjectAbbr || card.subject || ""),
      el("div", { style: "color:#666" }, (card.teachers || []).join(",").slice(0, 12)));
  }

  // ─── Wire events ─────────────────────────────────────────────────────────
  window.addEventListener("app:print-preview", openPreview);
  window.addEventListener("app:preview-close", closePreview);
  window.addEventListener("app:preview-prev",  () => stepPage(-1));
  window.addEventListener("app:preview-next",  () => stepPage(1));
  window.addEventListener("app:preview-template", (e) => render(e.detail?.template || "class"));
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "P") && !overlay?.classList.contains("is-open")) {
      e.preventDefault(); openPreview();
    }
  });

  APP.printPreview = { open: openPreview, close: closePreview, render };
})();
