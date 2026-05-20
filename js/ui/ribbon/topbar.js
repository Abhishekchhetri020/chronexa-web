/* Persistent action bar + shared ChrxMenu helper.
 * Builds menubar shell + topbar into the ribbon host. Menu files register themselves.
 * Events on window: app:save save-as test generate generate-cloud verify print-preview
 *   close open-file open-snapshot undo redo search(query) zoom(zoom) perspective(kind). */
(function () {
  "use strict";
  const APP = window.APP || (window.APP = {});

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids) { if (c == null || c === false) continue;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    return n;
  }
  function dispatch(name, detail) { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); }
  function notify(msg, level) {
    const t = el("div", { class: "chrx-toast",
      style: "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);"
        + "background:var(--chrx-bg-elev);color:var(--chrx-fg);padding:8px 14px;"
        + "border:1px solid " + (level === "error" ? "var(--chrx-red)" : "var(--chrx-line)")
        + ";border-radius:8px;box-shadow:var(--chrx-shadow-sheet);z-index:9999;font-size:13px;" });
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
  }
  window._chrxNotify = notify;

  function buildMenuPanel(entries) {
    const panel = el("div", { class: "chrx-menu-panel", role: "menu" });
    for (const e of entries) {
      if (!e) continue;
      if (e.sep)     { panel.appendChild(el("div", { class: "chrx-menu-sep" })); continue; }
      if (e.section) { panel.appendChild(el("div", { class: "chrx-menu-section" }, e.section)); continue; }
      const cls = "chrx-menu-item" + (e.soon ? " chrx-menu-item--soon" : "");
      const item = el("div", { class: cls, role: "menuitem", "aria-disabled": e.disabled ? "true" : null });
      if (e.icon != null) item.appendChild(el("span", { class: "chrx-menu-item__icon" }, e.icon));
      item.appendChild(el("span", { class: "chrx-menu-item__label" }, e.label));
      if (e.hint) item.appendChild(el("span", { class: "chrx-menu-item__hint" }, e.hint));
      if (e.sub) {
        item.appendChild(el("span", { class: "chrx-menu-item__arrow" }, "▶"));
        let subEl = null;
        function openSub() {
          if (subEl) return;
          subEl = buildMenuPanel(e.sub);
          subEl.classList.add("chrx-menu-item__sub");
          item.appendChild(subEl);
        }
        item.addEventListener("mouseenter", openSub);
        // Touch + click users couldn't reach Export/Import/Compare submenus
        // until they were also openable via click. Mouseenter alone failed
        // on touch devices and during keyboard nav.
        item.addEventListener("click", (ev) => { ev.stopPropagation(); openSub(); });
      } else if (e.run && !e.disabled) {
        item.addEventListener("click", (ev) => {
          ev.stopPropagation(); closeAllMenus();
          try { e.run(); } catch (err) { console.error(err); notify("Action failed: " + err.message, "error"); }
        });
      } else if (e.soon || e.disabled) {
        item.addEventListener("click", (ev) => { ev.stopPropagation(); if (e.soon) notify("Coming soon: " + e.label); });
      }
      panel.appendChild(item);
    }
    return panel;
  }
  window.ChrxMenu = { buildPanel: buildMenuPanel };

  const MENUS = []; let activeMenu = null, activePanel = null;
  function registerMenu(m) { MENUS.push(m); renderMenubar(); }
  function closeAllMenus() {
    if (activePanel) activePanel.remove();
    if (activeMenu) activeMenu.setAttribute("aria-expanded", "false");
    activePanel = null; activeMenu = null;
  }
  function openMenu(key) {
    closeAllMenus();
    const def = MENUS.find(m => m.key === key); if (!def) return;
    const btn = document.querySelector(`[data-menu="${key}"]`); if (!btn) return;
    const panel = buildMenuPanel(def.build());
    const r = btn.getBoundingClientRect();
    Object.assign(panel.style, { position: "fixed", left: r.left + "px", top: (r.bottom + 2) + "px" });
    document.body.appendChild(panel);
    btn.setAttribute("aria-expanded", "true");
    activeMenu = btn; activePanel = panel;
  }
  document.addEventListener("click", (e) => {
    if (!activePanel) return;
    if (activePanel.contains(e.target)) return;
    if (activeMenu && activeMenu.contains(e.target)) return;
    closeAllMenus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus();
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "s") { e.preventDefault(); dispatch("app:save"); }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "S" || e.key === "s")) { e.preventDefault(); dispatch("app:save-as"); }
    if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) { e.preventDefault(); dispatch("app:undo"); }
    if ((e.metaKey || e.ctrlKey) && ((e.key === "y" || e.key === "Y") || (e.shiftKey && (e.key === "Z" || e.key === "z")))) {
      e.preventDefault(); dispatch("app:redo");
    }
  });

  let _perspective = "class", _zoom = 100;
  function setPerspective(p) {
    _perspective = p;
    document.querySelectorAll(".chrx-tb-pill button").forEach(b =>
      b.classList.toggle("is-on", b.dataset.persp === p));
    dispatch("app:perspective", { kind: p });
  }
  function setZoom(z) {
    _zoom = z;
    const lbl = document.querySelector(".chrx-tb-zoom__label");
    if (lbl) lbl.textContent = z + "%";
    dispatch("app:zoom", { zoom: z });
  }
  function toggleTheme() {
    const html = document.documentElement, cur = html.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    try { localStorage.setItem("chronexa.theme", next); } catch {}
    notify("Theme: " + next);
  }
  try { const t = localStorage.getItem("chronexa.theme"); if (t) document.documentElement.setAttribute("data-theme", t); } catch {}

  function mount(host) {
    if (!host) return;
    host.innerHTML = ""; host.classList.add("chrx-ribbon-host");
    host.appendChild(el("nav", { class: "chrx-menubar", role: "menubar" }));

    const tb = el("div", { class: "chrx-topbar" });
    host.appendChild(tb);

    tb.appendChild(group([
      splitBtn("💾 Save", () => dispatch("app:save"), [
        { icon: "💾", label: "Save", hint: "⌘S", run: () => dispatch("app:save") },
        { icon: "📋", label: "Save as…", hint: "⇧⌘S", run: () => dispatch("app:save-as") },
        { sep: true },
        { icon: "🕘", label: "Version history…", run: () => dispatch("app:open-snapshot") },
      ]),
      iconBtn("📂 Open", () => dispatch("app:open-file"), "⌘O"),
    ]));
    tb.appendChild(group([
      iconBtn("🧪 Test", () => dispatch("app:test")),
      primaryBtn("⚡ Generate", () => dispatch("app:generate")),
      iconBtn("☁︎ Cloud", () => dispatch("app:generate-cloud"), null, "Generate in cloud"),
      iconBtn("✓ Verify", () => dispatch("app:verify")),
    ]));
    tb.appendChild(group([
      iconBtn("🖨 Print", () => dispatch("app:print-preview")),
      iconBtn("✕ Close", () => dispatch("app:close"), null, null, "danger"),
    ]));
    tb.appendChild(group([searchBox()]));
    tb.appendChild(group([zoomBtn()]));
    tb.appendChild(group([perspectivePill()]));
    tb.appendChild(group([meBtn()]));

    renderMenubar();
  }

  function group(kids) { const g = el("div", { class: "chrx-topbar__group" }); kids.forEach(k => g.appendChild(k)); return g; }
  function iconBtn(label, fn, hint, title, variant) {
    const b = el("button", { class: "chrx-tb-btn" + (variant === "danger" ? " chrx-tb-btn--danger" : ""),
      type: "button", title: title || label, onclick: fn });
    b.appendChild(el("span", null, label));
    if (hint) b.appendChild(el("span", { class: "chrx-kbd", style: "margin-left:6px" }, hint));
    return b;
  }
  function primaryBtn(label, fn) {
    return el("button", { class: "chrx-tb-btn chrx-tb-btn--primary", type: "button", onclick: fn }, label);
  }
  function splitBtn(label, primaryFn, dropEntries) {
    const wrap = el("div", { class: "chrx-tb-btn--split" });
    wrap.appendChild(el("button", { class: "chrx-tb-btn", type: "button", title: label + " (⌘S)", onclick: primaryFn }, label));
    const drop = el("button", { class: "chrx-tb-btn", type: "button", "aria-label": "More save options" }, "▼");
    drop.addEventListener("click", (ev) => {
      ev.stopPropagation(); closeAllMenus();
      const panel = buildMenuPanel(dropEntries);
      const r = drop.getBoundingClientRect();
      Object.assign(panel.style, { position: "fixed", left: r.left + "px", top: (r.bottom + 2) + "px" });
      document.body.appendChild(panel); activePanel = panel;
    });
    wrap.appendChild(drop); return wrap;
  }
  function searchBox() {
    const wrap = el("div", { class: "chrx-tb-search" });
    const inp = el("input", { type: "search", placeholder: "Search anything…", "aria-label": "Search" });
    let st; inp.addEventListener("input", () => {
      clearTimeout(st); st = setTimeout(() => dispatch("app:search", { query: inp.value.trim() }), 120);
    });
    wrap.appendChild(inp); return wrap;
  }
  function zoomBtn() {
    const lbl = el("span", { class: "chrx-tb-zoom__label" }, _zoom + "%");
    const btn = el("button", { class: "chrx-tb-btn", type: "button", title: "Zoom" }, "🔍 ", lbl, " ▾");
    btn.addEventListener("click", () => {
      closeAllMenus();
      const panel = buildMenuPanel([25,50,75,100,125,150,200].map(z => ({
        icon: z === _zoom ? "✓" : " ", label: z + "%", run: () => setZoom(z),
      })));
      const r = btn.getBoundingClientRect();
      Object.assign(panel.style, { position: "fixed", left: r.left + "px", top: (r.bottom + 2) + "px" });
      document.body.appendChild(panel); activePanel = panel;
    });
    return btn;
  }
  function perspectivePill() {
    const pill = el("div", { class: "chrx-tb-pill", role: "tablist", "aria-label": "Perspective" });
    [["class","Class"],["teacher","Teacher"],["room","Room"],["lesson","Lesson"]].forEach(([k, lbl]) => {
      pill.appendChild(el("button", {
        type: "button", "data-persp": k, role: "tab",
        class: k === _perspective ? "is-on" : "", onclick: () => setPerspective(k),
      }, lbl));
    });
    return pill;
  }
  function meBtn() {
    const init = (APP.user && APP.user.initials) || "ME";
    const b = el("button", { class: "chrx-tb-me", type: "button", title: "Account" });
    b.appendChild(el("span", { class: "chrx-tb-me__avatar" }, init));
    b.appendChild(el("span", null, " Me ▾"));
    b.addEventListener("click", () => {
      closeAllMenus();
      const panel = buildMenuPanel([
        { icon: "👤", label: APP.user?.name || "Me", disabled: true },
        { sep: true },
        { icon: "⚙︎", label: "Preferences",  run: () => openMenu("options") },
        { icon: "🎨", label: "Toggle theme", run: toggleTheme },
        { sep: true },
        { icon: "↩", label: "Sign out", disabled: true },
      ]);
      const r = b.getBoundingClientRect();
      Object.assign(panel.style, { position: "fixed", left: (r.right - 220) + "px", top: (r.bottom + 2) + "px" });
      document.body.appendChild(panel); activePanel = panel;
    });
    return b;
  }

  function renderMenubar() {
    const mb = document.querySelector(".chrx-menubar"); if (!mb) return;
    mb.innerHTML = "";
    for (const def of MENUS) {
      const b = el("button", {
        class: "chrx-menubar__item", "data-menu": def.key, type: "button",
        "aria-haspopup": "menu", "aria-expanded": "false",
        onclick: (e) => { e.stopPropagation(); openMenu(def.key); },
        onmouseenter: () => { if (activeMenu && activeMenu !== document.querySelector(`[data-menu="${def.key}"]`)) openMenu(def.key); },
      }, def.label);
      mb.appendChild(b);
    }
  }

  APP.ribbon = {
    mount, registerMenu, openMenu, closeMenu: closeAllMenus,
    setPerspective, getPerspective: () => _perspective,
    setZoom, getZoom: () => _zoom, notify,
    // Read-only accessor for command palette / cross-module consumers.
    // Returns the live menu definition list (each: { key, label, build() }).
    menus: MENUS,
  };
})();
