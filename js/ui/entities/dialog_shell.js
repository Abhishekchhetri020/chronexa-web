/* Chronexa entity-CRUD dialog shell. window.EntityDialog. */
(function (global) {
  "use strict";
  if (!window.APP) window.APP = {};
  if (!window.APP.audit) window.APP.audit = {
    _log: [], append(r){ this._log.push({ t:Date.now(), ...r }); },
    pop(){ return this._log.pop(); },
  };

  const SWATCHES = ["#007AFF","#34C759","#FF3B30","#FF9F0A","#FFCC00",
    "#AF52DE","#FF2D55","#5AC8FA","#A2845E","#8E8E93"];

  let host=null, sheet=null, cfg=null;
  let selectedId=null, sortKey=null, sortDir=1;
  let filterText="", filterTimer=null, lastFocused=null;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false) {
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function uid(p) { return p + "_" + Math.random().toString(36).slice(2,9); }

  // ---- open / close -------------------------------------------------------
  function open(c) {
    cfg = c;
    sortKey = (c.columns[0] && c.columns[0].key) || null;
    sortDir = 1; filterText = ""; selectedId = null;
    lastFocused = document.activeElement;
    if (host) host.remove();
    host = buildShell();
    document.body.appendChild(host);
    document.addEventListener("keydown", onKey, true);
    renderRows();
    setTimeout(() => { if (host) host.querySelector(".chrx-ent-search")?.focus(); }, 30);
  }
  function close() {
    document.removeEventListener("keydown", onKey, true);
    closeSheet();
    if (host) { host.remove(); host = null; }
    cfg = null;
    if (lastFocused) try { lastFocused.focus(); } catch(e) {}
  }
  function refresh(rows) { if (!cfg) return; if (rows) cfg.rows = rows; renderRows(); }
  function openSheet(node, opts) {
    closeSheet();
    sheet = el("div", { class:"chrx-ent-sheet-scrim",
      onclick:(e)=>{ if (e.target === sheet) closeSheet(); } },
      el("div", { class:"chrx-ent-sheet", role:"dialog", "aria-modal":"true" },
        opts && opts.title ? el("header", { class:"chrx-ent-sheet__head" },
          el("h3", null, opts.title),
          el("button", { class:"chrx-ent-sheet__x", "aria-label":"Close", onclick:closeSheet }, "×"),
        ) : null,
        el("div", { class:"chrx-ent-sheet__body" }, node),
      ),
    );
    host.appendChild(sheet);
  }
  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } }

  // ---- shell --------------------------------------------------------------
  function buildShell() {
    const root = el("div", { class:"chrx-ent-dialog", role:"dialog", "aria-modal":"true",
      onclick:(e)=>{ if (e.target === root) close(); } });
    const panel = el("div", { class:"chrx-ent-panel" });

    panel.appendChild(el("header", { class:"chrx-ent-head" },
      el("h2", null, cfg.title || cfg.entity),
      el("div", { class:"chrx-ent-counts" }, `${cfg.rows.length} items`),
      el("input", { class:"chrx-ent-search", type:"search", placeholder:"Search…",
        "aria-label":"Filter rows",
        oninput:(e)=>{
          clearTimeout(filterTimer);
          filterTimer = setTimeout(() => {
            filterText = (e.target.value || "").toLowerCase();
            renderRows();
          }, 120);
        },
      }),
    ));

    const body = el("div", { class:"chrx-ent-body" });
    body.appendChild(el("div", { class:"chrx-ent-table-wrap" },
      el("table", { class:"chrx-ent-table" },
        el("thead", null, headerRow()),
        el("tbody", { class:"chrx-ent-rows" }),
      ),
    ));
    body.appendChild(buildSidebar());
    panel.appendChild(body);

    panel.appendChild(el("footer", { class:"chrx-ent-foot" },
      el("button", { class:"chrx-btn", onclick:()=>fireAction("undo") }, "↺ Undo"),
      el("button", { class:"chrx-btn", onclick:()=>fireAction("redo") }, "↻ Redo"),
      el("button", { class:"chrx-btn", onclick:()=>fireAction("help") }, "?"),
      el("div", { class:"chrx-ent-foot-spacer" }),
      el("span", { class:"chrx-ent-hint" },
        el("span", { class:"chrx-kbd" }, "⌘N"), " new ",
        el("span", { class:"chrx-kbd" }, "↵"), " edit ",
        el("span", { class:"chrx-kbd" }, "esc"), " close",
      ),
      el("button", { class:"chrx-btn chrx-btn--primary", onclick:close }, "Close"),
    ));
    root.appendChild(panel);
    return root;
  }

  function headerRow() {
    const tr = el("tr");
    cfg.columns.forEach(col => {
      const isSorted = sortKey === col.key;
      const sortable = col.sortable !== false;
      tr.appendChild(el("th", {
        class: "chrx-ent-th" + (isSorted ? " is-sorted" : "") + (sortable ? " is-sortable" : ""),
        onclick: !sortable ? null : () => {
          if (sortKey === col.key) sortDir = -sortDir; else { sortKey = col.key; sortDir = 1; }
          renderRows();
        },
      }, col.label, isSorted ? (sortDir === 1 ? " ▲" : " ▼") : ""));
    });
    return tr;
  }

  function buildSidebar() {
    const buttons = [
      { id:"new",    label:"New",    primary:true, kbd:"⌘N", always:true },
      { id:"edit",   label:"Edit",   needRow:true },
      { id:"delete", label:"Delete", needRow:true, danger:true },
    ];
    (cfg.extras || []).forEach(x => buttons.push({ ...x, needRow: x.needRow !== false }));

    const aside = el("aside", { class:"chrx-ent-aside" });
    buttons.forEach(b => {
      const cls = ["chrx-ent-btn"];
      if (b.primary) cls.push("chrx-ent-btn--primary");
      if (b.danger) cls.push("chrx-ent-btn--danger");
      aside.appendChild(el("button", {
        class: cls.join(" "), "data-act": b.id,
        "data-needs-row": b.needRow ? "1" : null,
        onclick: () => fireAction(b.id),
      }, b.label, b.kbd ? el("span", { class:"chrx-kbd" }, b.kbd) : null));
    });
    return aside;
  }

  function updateSidebarState() {
    if (!host) return;
    const hasRow = !!selectedId;
    host.querySelectorAll(".chrx-ent-btn[data-needs-row='1']").forEach(b => {
      b.disabled = !hasRow;
      b.classList.toggle("is-disabled", !hasRow);
    });
  }

  // ---- rows ---------------------------------------------------------------
  function renderRows() {
    if (!host) return;
    const tbody = host.querySelector(".chrx-ent-rows");
    if (!tbody) return;

    const all = cfg.rows || [];
    const rows = filterSort(all);
    host.querySelector(".chrx-ent-counts").textContent = `${rows.length} of ${all.length}`;
    const thead = host.querySelector(".chrx-ent-table thead");
    thead.innerHTML = "";
    thead.appendChild(headerRow());

    tbody.innerHTML = "";
    rows.forEach(r => {
      const tr = el("tr", {
        class: "chrx-ent-tr" + (r.id === selectedId ? " is-selected" : ""),
        "data-id": r.id, tabindex: "0",
        onclick: () => selectRow(r.id),
        ondblclick: () => { selectRow(r.id); fireAction("edit"); },
        onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); selectRow(r.id); fireAction("edit"); } },
      });
      cfg.columns.forEach(col => {
        const v = col.render ? col.render(r) : r[col.key];
        const td = el("td", { class:"chrx-ent-td" });
        if (v instanceof Node) td.appendChild(v);
        else td.textContent = (v == null ? "" : String(v));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    updateSidebarState();
  }

  function filterSort(rows) {
    let out = rows;
    if (filterText) {
      out = out.filter(r => {
        for (const k in r) {
          const v = r[k];
          if (typeof v === "string" && v.toLowerCase().includes(filterText)) return true;
          if (typeof v === "number" && String(v).includes(filterText)) return true;
        }
        return false;
      });
    }
    if (sortKey) {
      out = out.slice().sort((a,b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
        return String(av).localeCompare(String(bv), undefined, { numeric:true }) * sortDir;
      });
    }
    return out;
  }

  function selectRow(id) {
    selectedId = id;
    host.querySelectorAll(".chrx-ent-tr").forEach(tr => {
      tr.classList.toggle("is-selected", tr.dataset.id === id);
    });
    updateSidebarState();
    if (cfg.onSelect) cfg.onSelect(currentRow());
  }
  function currentRow() { return (cfg.rows || []).find(r => r.id === selectedId) || null; }

  function fireAction(cmd) {
    if (!cfg) return;
    if (cmd === "delete" && selectedId) {
      const r = currentRow();
      if (!confirm(`Delete ${(r && (r.name||r.id)) || "this row"}?`)) return;
    }
    if (cfg.onAction) cfg.onAction(cmd, currentRow());
  }

  function onKey(e) {
    if (!host) return;
    if (e.key === "Escape") {
      if (sheet) { e.preventDefault(); closeSheet(); return; }
      e.preventDefault(); close(); return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === "n" || e.key === "N")) {
      e.preventDefault(); fireAction("new"); return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault(); fireAction(e.shiftKey ? "redo" : "undo");
    }
  }

  // ---- form helpers (shared by entity modules) ---------------------------
  function buildField(label, control) {
    return el("label", { class:"chrx-ent-field" },
      el("span", { class:"chrx-ent-field__lbl" }, label),
      control,
    );
  }

  function buildSwatchPicker(value, onChange) {
    const wrap = el("div", { class:"chrx-ent-swatch" });
    const hex = el("input", { type:"text", value:value||"", maxlength:"7",
      class:"chrx-ent-swatch__hex",
      oninput:(e)=> onChange(e.target.value),
    });
    SWATCHES.forEach(c => wrap.appendChild(el("button", {
      type:"button", class:"chrx-ent-swatch__dot",
      title:c, style:`background:${c}`,
      onclick:()=>{ hex.value = c; onChange(c); },
    })));
    wrap.appendChild(hex);
    return wrap;
  }

  function buildEditSheet(opts) {
    const form = el("form", { class:"chrx-ent-form",
      onsubmit:(e)=>{ e.preventDefault(); opts.onSave && opts.onSave(); } });
    (opts.fields || []).forEach(f => {
      form.appendChild(f.label === null ? f.control : buildField(f.label, f.control));
    });
    form.appendChild(el("div", { class:"chrx-ent-form__foot" },
      el("button", { type:"button", class:"chrx-btn", onclick:()=>{
        opts.onCancel ? opts.onCancel() : closeSheet();
      } }, "Cancel"),
      el("button", { type:"submit", class:"chrx-btn chrx-btn--primary" }, "Save"),
    ));
    openSheet(form, { title: opts.title });
    setTimeout(()=> { if (form && form.isConnected) form.querySelector("input,select,textarea")?.focus(); }, 30);
    return form;
  }

  function buildTimeOffMini(timeOff, days, periods) {
    // Accepts two shapes:
    //   1. 2D array timeOff[day][period] = 0|1|2 (current TimeOffMatrix output)
    //   2. Legacy object map { "d_p": "available|preferred|unavailable" }
    const grid = el("div", { class:"chrx-ent-tomini" });
    grid.style.gridTemplateColumns = `repeat(${periods}, 1fr)`;
    const is2D = Array.isArray(timeOff);
    for (let d = 0; d < days; d++) {
      for (let p = 0; p < periods; p++) {
        let cls;
        if (is2D) {
          const v = (timeOff[d] && timeOff[d][p]) | 0;
          cls = v === 1 ? "is-conditional" : v === 2 ? "is-blocked" : "is-available";
        } else {
          const state = (timeOff && timeOff[`${d}_${p + 1}`]) || "available";
          cls = `is-${state}`;
        }
        grid.appendChild(el("span", { class:`chrx-ent-tomini__c ${cls}`,
          title:`D${d+1} P${p+1}` }));
      }
    }
    return grid;
  }

  // Full editable time-off matrix sub-dialog (shared across entities).
  const TO_STATES = ["available","preferred","unavailable"];
  const TO_DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat"];
  function openTimeOffSheet(ref, entity, onSave) {
    const N = ((window.APP.school?.bell?.periods) || []).length || 8;
    const s = Object.assign({}, ref.timeOff || {});
    const g = el("div", { class:"chrx-ent-tomatrix" });
    g.style.gridTemplateColumns = `60px repeat(${N}, 1fr)`;
    g.appendChild(el("div", { class:"chrx-ent-tomatrix__corner" }));
    for (let p = 1; p <= N; p++) g.appendChild(el("div", { class:"chrx-ent-tomatrix__h" }, `P${p}`));
    for (let d = 0; d < 6; d++) {
      g.appendChild(el("div", { class:"chrx-ent-tomatrix__h" }, TO_DAYS[d]));
      for (let p = 1; p <= N; p++) {
        const k = `${d}_${p}`;
        g.appendChild(el("button", { type:"button",
          class:`chrx-ent-tomatrix__c is-${s[k] || "available"}`,
          onclick:(e)=>{
            const nx = TO_STATES[(TO_STATES.indexOf(s[k] || "available")+1) % 3];
            s[k] = nx; e.target.className = `chrx-ent-tomatrix__c is-${nx}`;
          },
        }));
      }
    }
    openSheet(el("div", null, g,
      el("div", { class:"chrx-ent-form__foot" },
        el("button", { type:"button", class:"chrx-btn", onclick:closeSheet }, "Cancel"),
        el("button", { type:"button", class:"chrx-btn chrx-btn--primary", onclick:()=>{
          const before = ref.timeOff; ref.timeOff = s;
          window.APP.audit.append({ entity, op:"timeoff", id:ref.id, before, after:s });
          closeSheet(); if (onSave) onSave();
        } }, "Save"),
      ),
    ), { title:`Time off — ${ref.name}` });
  }

  global.EntityDialog = {
    open, close, refresh, openSheet, closeSheet,
    SWATCHES, el, esc, uid,
    buildField, buildSwatchPicker, buildEditSheet,
    buildTimeOffMini, openTimeOffSheet,
  };
})(window);
