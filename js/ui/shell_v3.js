/* Studio v3 shell — wraps the existing app DOM in the 3-column layout
 * (sidebar nav + topbar with wordmark + ⌘K palette + main + right rail
 * with solver/faults + status bar). DOM-only; reuses the existing
 * EntityX.open() and event surface so no module changes required.
 *
 * Auto-mounts on DOMContentLoaded. Idempotent.
 */
(function (global) {
  "use strict";
  const APP = global.APP = global.APP || {};

  let mounted = false;
  let lastFaults = [];

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }
  function fire(name, detail) {
    global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  // Sidebar nav entries — each fires an app:open-entity event or routes
  // to an existing handler. Replaces the ribbon menu drilling.
  const NAV = [
    { section: "Workspace" },
    { icon: "G", label: "Editor",    active: true, on: () => focusEditor() },
    { icon: "R", label: "Reports",   on: () => fire("app:print-preview") },
    { icon: "S", label: "Substitutions", on: () => fire("app:substitutions") },
    { section: "Entities" },
    { icon: "s", label: "Subjects",   on: () => fire("app:open-entity", { kind: "subjects" }) },
    { icon: "t", label: "Teachers",   on: () => fire("app:open-entity", { kind: "teachers" }) },
    { icon: "c", label: "Classes",    on: () => fire("app:open-entity", { kind: "classes" }) },
    { icon: "r", label: "Rooms",      on: () => fire("app:open-entity", { kind: "classrooms" }) },
    { icon: "l", label: "Lessons",    on: () => fire("app:open-entity", { kind: "lessons" }) },
    { icon: "d", label: "Divisions",  on: () => fire("app:open-entity", { kind: "divisions" }) },
    { icon: "g", label: "Grades",     on: () => fire("app:open-entity", { kind: "grades" }) },
    { icon: "u", label: "Students",   on: () => fire("app:open-entity", { kind: "students" }) },
    { section: "Structure" },
    { icon: "b", label: "Bells",      on: () => fire("app:open-entity", { kind: "bells" }) },
    { icon: "d", label: "Days",       on: () => fire("app:open-entity", { kind: "days" }) },
    { icon: "w", label: "Weeks",      on: () => fire("app:open-entity", { kind: "weeks" }) },
    { icon: "t", label: "Terms",      on: () => fire("app:open-entity", { kind: "terms" }) },
    { icon: "B", label: "Buildings",  on: () => fire("app:open-entity", { kind: "buildings" }) },
    { icon: "⁂", label: "Relations",  on: () => fire("app:open-entity", { kind: "relations" }) },
    { icon: "⚙", label: "School settings", on: () => fire("app:open-entity", { kind: "school" }) },
    { icon: "🎚", label: "Solver params",  on: () => fire("app:solver-params") },
    { section: "Files" },
    { icon: "↗", label: "Import…",    on: () => fire("app:import-timetable-xml") },
    { icon: "↘", label: "Export XML", on: () => fire("app:export-timetable-xml") },
    { icon: "📆", label: "Calendar (ICS)", on: () => fire("app:export-ics") },
    { icon: "💾", label: "Save",      on: () => fire("app:save") },
    { icon: "🕘", label: "Snapshots", on: () => fire("app:open-snapshot") },
  ];

  function buildSidebar() {
    const side = el("aside", { class: "chrx-sidebar" });
    for (const item of NAV) {
      if (item.section) {
        side.appendChild(el("div", { class: "chrx-side-section" }, item.section));
        continue;
      }
      const link = el("a", { class: "chrx-side-link" + (item.active ? " is-active" : ""),
        onclick: (e) => { e.preventDefault(); try { item.on(); } catch (er) { console.error(er); } } });
      link.appendChild(el("span", { class: "chrx-side-link__icon" }, item.icon));
      link.appendChild(document.createTextNode(item.label));
      side.appendChild(link);
    }
    return side;
  }

  function buildWordmark() {
    return el("header", { class: "chrx-wordmark" },
      el("div", { class: "chrx-stamp" }, "C"),
      el("div", { class: "chrx-word" }, "Chronexa"));
  }

  function buildTopbar() {
    const crumbs = el("div", { class: "chrx-crumbs", id: "chrx-crumbs" });
    crumbs.appendChild(el("span", null, "Untitled"));
    crumbs.appendChild(el("span", { class: "chrx-crumbs__sep" }, "/"));
    crumbs.appendChild(el("span", { class: "chrx-crumbs__current" }, "Editor"));

    const search = el("div", { class: "chrx-kbd-search",
      onclick: () => openPalette() });
    search.appendChild(el("span", { class: "chrx-kbd-search__icon" }, "Q"));
    search.appendChild(el("span", null, "Search anything…"));
    search.appendChild(el("span", { class: "chrx-kbd-search__kbd" }, "⌘K"));

    const actions = el("div", { class: "chrx-action-row", style: "display:flex; gap:8px" },
      el("button", { class: "chrx-btn", onclick: () => fire("app:test") }, "Test"),
      el("button", { class: "chrx-btn chrx-btn--primary", onclick: () => fire("app:generate") }, "Generate"));

    return el("header", { class: "chrx-topbar" },
      crumbs,
      el("div", { class: "chrx-topbar__spacer" }),
      search,
      actions);
  }

  function buildRail() {
    const rail = el("aside", { class: "chrx-rail" });

    // Solver section
    const solverSec = el("div", { class: "chrx-rail-section" });
    solverSec.appendChild(el("div", { class: "chrx-rail-section__head" }, "Solver"));
    const card = el("div", { class: "chrx-solver-card", id: "chrx-rail-solver" });
    function statRow(label, valueId, klass) {
      const r = el("div", { class: "chrx-solver-stat" });
      r.appendChild(el("span", { class: "chrx-solver-stat__label" }, label));
      r.appendChild(el("span", { class: "chrx-solver-stat__value" + (klass ? " " + klass : ""), id: valueId }, "—"));
      return r;
    }
    card.appendChild(statRow("Status",     "chrx-rail-status",     "is-good"));
    card.appendChild(statRow("Placed",     "chrx-rail-placed"));
    card.appendChild(statRow("Conflicts",  "chrx-rail-conflicts",  "is-good"));
    card.appendChild(statRow("Soft score", "chrx-rail-soft"));
    card.appendChild(statRow("Wall time",  "chrx-rail-wall"));
    solverSec.appendChild(card);
    rail.appendChild(solverSec);

    // Faults section
    const faultsSec = el("div", { class: "chrx-rail-section" });
    faultsSec.appendChild(el("div", { class: "chrx-rail-section__head" }, "Currently stuck"));
    faultsSec.appendChild(el("ul", { class: "chrx-faults-list", id: "chrx-rail-faults" }));
    rail.appendChild(faultsSec);

    // Quick actions
    const qaSec = el("div", { class: "chrx-rail-section" });
    qaSec.appendChild(el("div", { class: "chrx-rail-section__head" }, "Quick actions"));
    const qa = el("div", { class: "chrx-quick-actions" });
    [
      { icon: "⁂", label: "Improve schedule", hint: "⌘I", fire: "app:improve" },
      { icon: "↻", label: "Verify all",      hint: "⌘V", fire: "app:verify" },
      { icon: "⊕", label: "Snapshot",         hint: "⌘S", fire: "app:save-as" },
      { icon: "↘", label: "Export XML",       hint: "⌘E", fire: "app:export-timetable-xml" },
      { icon: "℞", label: "Print preview",    hint: "⌘P", fire: "app:print-preview" },
    ].forEach(a => {
      const b = el("button", { class: "chrx-quick-action",
        onclick: () => fire(a.fire) });
      b.appendChild(el("span", { class: "chrx-quick-action__icon" }, a.icon));
      b.appendChild(document.createTextNode(a.label));
      b.appendChild(el("span", { class: "chrx-quick-action__hint" }, a.hint));
      qa.appendChild(b);
    });
    qaSec.appendChild(qa);
    rail.appendChild(qaSec);

    return rail;
  }

  function buildStatus() {
    const right = el("div", { class: "chrx-status__right" },
      el("span", null, "Studio"),
      el("span", { class: "chrx-status__divider" }, "·"),
      el("span", null, "Abhishek"));
    return el("footer", { class: "chrx-status" },
      el("span", { class: "chrx-status__dot" }),
      el("span", { id: "chrx-status-saved" }, "Ready"),
      el("span", { class: "chrx-status__divider" }, "·"),
      el("span", null, "v " + (global.APP_VER || "dev")),
      el("span", { class: "chrx-status__divider" }, "·"),
      el("span", { id: "chrx-status-perf" }, "WASM ready"),
      right);
  }

  function focusEditor() {
    const stepBtn = document.querySelector('.step-btn[data-step="2"]');
    if (stepBtn) stepBtn.click();
  }

  // ───────── Command palette (⌘K) ─────────
  function buildPalette() {
    const scrim = el("div", { class: "chrx-palette-scrim", id: "chrx-palette",
      onclick: (e) => { if (e.target.id === "chrx-palette") closePalette(); } });
    const box = el("div", { class: "chrx-palette" });
    const input = el("input", { type: "text", placeholder: "Type a name…",
      oninput: (e) => renderPaletteList(e.target.value) });
    const list = el("div", { class: "chrx-palette-list", id: "chrx-palette-list" });
    box.appendChild(input);
    box.appendChild(list);
    scrim.appendChild(box);
    document.body.appendChild(scrim);
    scrim._input = input;
    scrim._list  = list;
    return scrim;
  }
  function paletteItems() {
    const items = [];
    for (const n of NAV) {
      if (n.section) continue;
      items.push({ icon: n.icon, label: n.label, sub: "open", run: n.on });
    }
    items.push({ icon: "⚡", label: "Generate timetable",  sub: "⌘G", run: () => fire("app:generate") });
    items.push({ icon: "🧪", label: "Test timetable",      sub: "⌘T", run: () => fire("app:test") });
    items.push({ icon: "↻",  label: "Improve schedule",    sub: "⌘I", run: () => fire("app:improve") });
    items.push({ icon: "💾", label: "Save",                sub: "⌘S", run: () => fire("app:save") });
    items.push({ icon: "↘",  label: "Export XML",          sub: "⌘E", run: () => fire("app:export-timetable-xml") });
    items.push({ icon: "📊", label: "Statistics",          sub: "",   run: () => fire("app:statistics") });
    items.push({ icon: "💡", label: "Advisor",             sub: "",   run: () => fire("app:advisor") });
    return items;
  }
  let activeIdx = 0;
  function renderPaletteList(query) {
    const scrim = document.getElementById("chrx-palette");
    if (!scrim) return;
    const list = scrim._list;
    while (list.firstChild) list.removeChild(list.firstChild);
    const q = (query || "").toLowerCase().trim();
    const all = paletteItems();
    const hits = q
      ? all.filter(i => i.label.toLowerCase().includes(q))
      : all;
    activeIdx = 0;
    hits.slice(0, 15).forEach((it, idx) => {
      const row = el("div", { class: "chrx-palette-item" + (idx === activeIdx ? " is-active" : ""),
        onclick: () => { closePalette(); try { it.run(); } catch (e) { console.error(e); } } });
      row.appendChild(el("span", { class: "chrx-palette-item__icon" }, it.icon));
      row.appendChild(document.createTextNode(it.label));
      if (it.sub) row.appendChild(el("span", { class: "chrx-palette-item__sub" }, it.sub));
      list.appendChild(row);
    });
    scrim._hits = hits;
  }
  function openPalette() {
    let p = document.getElementById("chrx-palette");
    if (!p) p = buildPalette();
    p.classList.add("is-open");
    setTimeout(() => { p._input.value = ""; p._input.focus(); renderPaletteList(""); }, 20);
  }
  function closePalette() {
    const p = document.getElementById("chrx-palette");
    if (p) p.classList.remove("is-open");
  }
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openPalette();
    } else if (e.key === "Escape") {
      const p = document.getElementById("chrx-palette");
      if (p && p.classList.contains("is-open")) closePalette();
    } else if (e.key === "Enter") {
      const p = document.getElementById("chrx-palette");
      if (p && p.classList.contains("is-open")) {
        const hits = p._hits || [];
        if (hits[activeIdx]) { closePalette(); try { hits[activeIdx].run(); } catch (er) {} }
      }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const p = document.getElementById("chrx-palette");
      if (p && p.classList.contains("is-open")) {
        e.preventDefault();
        const items = p._list.children;
        if (!items.length) return;
        items[activeIdx]?.classList.remove("is-active");
        activeIdx = (activeIdx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[activeIdx]?.classList.add("is-active");
      }
    }
  });

  // ───────── Mount ─────────
  function mount() {
    if (mounted) return;
    const body = document.body;
    if (!body) return;

    const existing = Array.from(body.children).filter(n =>
      n.tagName !== "SCRIPT" && n.tagName !== "STYLE" &&
      !(n.classList && n.classList.contains("chrx-palette-scrim")));

    const shell = el("div", { class: "chrx-shell", id: "chrx-shell" });
    shell.appendChild(buildWordmark());
    shell.appendChild(buildTopbar());
    shell.appendChild(buildSidebar());
    const main = el("main", { class: "chrx-main", id: "chrx-main" });
    shell.appendChild(main);
    shell.appendChild(buildRail());
    shell.appendChild(buildStatus());

    body.insertBefore(shell, body.firstChild);
    // Move existing app content into main
    for (const node of existing) main.appendChild(node);

    mounted = true;
  }

  // ───────── Live data wiring ─────────
  function updateCrumbs() {
    const crumbs = document.getElementById("chrx-crumbs");
    if (!crumbs) return;
    const name = (APP.school && APP.school.schoolName) || "Untitled";
    while (crumbs.firstChild) crumbs.removeChild(crumbs.firstChild);
    crumbs.appendChild(el("span", null, name));
    crumbs.appendChild(el("span", { class: "chrx-crumbs__sep" }, "/"));
    crumbs.appendChild(el("span", { class: "chrx-crumbs__current" }, "Editor"));
  }
  function updateSolverPanel(r) {
    function set(id, val, klass) {
      const e = document.getElementById(id);
      if (!e) return;
      e.textContent = val;
      if (klass != null) {
        e.classList.remove("is-good","is-warn","is-bad");
        if (klass) e.classList.add(klass);
      }
    }
    if (!r) {
      const sch = APP.school || {};
      set("chrx-rail-status",    sch.cards ? "READY" : "—", "");
      set("chrx-rail-placed",    String((sch.cards || []).length));
      set("chrx-rail-conflicts", "—", "");
      set("chrx-rail-soft",      "—");
      set("chrx-rail-wall",      "—");
      return;
    }
    const klass = r.status === "FEASIBLE" ? "is-good"
                : r.status === "ERROR"    ? "is-bad"
                : "is-warn";
    set("chrx-rail-status",    r.status || "—", klass);
    set("chrx-rail-placed",    String(r.stats ? r.stats.placed : 0));
    set("chrx-rail-conflicts", String(r.stats ? r.stats.hardConflicts : 0),
      r.stats && r.stats.hardConflicts === 0 ? "is-good" : "is-warn");
    set("chrx-rail-soft",      String(r.stats ? r.stats.softScore : 0));
    set("chrx-rail-wall",      r.stats ? (r.stats.durationMs / 1000).toFixed(2) + "s" : "—");
  }
  function updateFaults(items) {
    const list = document.getElementById("chrx-rail-faults");
    if (!list) return;
    lastFaults = items || [];
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!lastFaults.length) {
      const li = el("li", { class: "chrx-fault-item", style: "background:transparent; border-left:0; color:var(--ink-3); font-style:italic" }, "All clear.");
      list.appendChild(li);
      return;
    }
    lastFaults.slice(0, 5).forEach(v => {
      const li = el("li", { class: "chrx-fault-item" });
      // Try to extract a subject name from description.
      const desc = (v.description || v.ruleId || "violation");
      const m = desc.match(/^([^—·:]+?)(?:\s*[—·:].*)?$/);
      const head = m ? m[1].trim() : desc;
      li.appendChild(el("span", { class: "chrx-fault-item__subj" }, head));
      if (desc !== head) li.appendChild(document.createTextNode(" — " + desc.slice(head.length).replace(/^[\s—·:]+/, "")));
      list.appendChild(li);
    });
  }
  function statusSaved(msg) {
    const s = document.getElementById("chrx-status-saved");
    if (s) s.textContent = msg;
  }

  global.addEventListener("app:school-loaded", () => { updateCrumbs(); updateSolverPanel(null); });
  global.addEventListener("app:solver-result", (e) => updateSolverPanel(e.detail));
  global.addEventListener("app:solver-progress", (e) => {
    if (e.detail && Array.isArray(e.detail.latestViolations)) updateFaults(e.detail.latestViolations);
  });
  global.addEventListener("entity:changed", () => statusSaved("Saved · " + new Date().toLocaleTimeString().slice(0,5)));

  // Mount as early as possible
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }

  global.ChrxShell = { mount, openPalette, closePalette, refresh: () => { updateCrumbs(); updateSolverPanel(null); updateFaults(lastFaults); } };
})(window);
