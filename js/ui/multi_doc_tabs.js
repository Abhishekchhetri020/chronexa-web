/* Multi-document tab bar — audit §8.5.
 *
 * Classic keeps multiple open timetables in tab.apps[]. Chronexa loaded
 * one at a time; this module adds a tab bar that lets the user park
 * several schools side-by-side in localStorage and switch between them
 * with a click. Each tab carries a deep-cloned snapshot of APP.school
 * (its serialised form keyed under `chronexa.tab.<tabId>`).
 *
 * Caveats vs the full Classic model:
 *   - No live two-way sync between tabs (Chronexa is single-user; no
 *     pollChangeEvents wire). Switching tabs swaps the in-memory school.
 *   - Tab snapshots stay in localStorage (~5 MB cap). Large schools should
 *     still use Files → Save As… for permanent storage.
 *   - The undo stack is per-session, not per-tab.
 *
 * Public API:
 *   window.MultiDocTabs.mount(rootEl?)   — inject the tab bar (idempotent)
 *   window.MultiDocTabs.openCurrent(name?) — save current school as a tab
 *   window.MultiDocTabs.list()           — array of { id, name, updatedAt }
 *   window.MultiDocTabs.switchTo(id)     — load that tab as APP.school
 *   window.MultiDocTabs.close(id)        — remove from storage
 */
(function (global) {
  "use strict";
  const APP = global.APP = global.APP || {};
  const STORAGE_INDEX = "chronexa.tabs.index";
  const STORAGE_PREFIX = "chronexa.tab.";

  let barEl = null;
  let activeId = null;

  function uid() { return "tab_" + Math.random().toString(36).slice(2, 9); }

  function loadIndex() {
    try { return JSON.parse(localStorage.getItem(STORAGE_INDEX) || "[]") || []; }
    catch { return []; }
  }
  function persistIndex(idx) {
    try { localStorage.setItem(STORAGE_INDEX, JSON.stringify(idx)); } catch {}
  }
  function loadTab(id) {
    try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + id) || "null"); }
    catch { return null; }
  }
  function persistTab(id, school) {
    try { localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(school)); }
    catch (e) {
      (global._chrxNotify || console.log)("Tab save failed: " + e.message, "error");
    }
  }

  function openCurrent(name) {
    if (!APP.school) return null;
    const id = uid();
    const idx = loadIndex();
    const label = name || APP.school.schoolName || ("Tab " + (idx.length + 1));
    idx.push({ id, name: label, updatedAt: Date.now() });
    persistIndex(idx);
    persistTab(id, APP.school);
    activeId = id;
    render();
    return id;
  }

  // Item 6 — per-tab undo stacks. Store undo/redo alongside the school
  // snapshot so switching tabs restores the per-tab edit history. Each
  // cmd in the stack is a {do, undo} pair; functions don't survive
  // JSON serialisation, so the stack is held in-memory keyed by tabId
  // and only the school payload goes to localStorage.
  const tabUndoStacks = Object.create(null); // id → {undo:[], redo:[]}

  function captureAuditState() {
    if (!APP.audit) return { undo: [], redo: [] };
    return {
      undo: APP.audit.undoStack ? APP.audit.undoStack.slice() : [],
      redo: APP.audit.redoStack ? APP.audit.redoStack.slice() : [],
    };
  }
  function restoreAuditState(s) {
    if (!APP.audit) return;
    APP.audit.undoStack = (s && s.undo) || [];
    APP.audit.redoStack = (s && s.redo) || [];
  }

  function switchTo(id) {
    // Save the currently-active tab back before swapping.
    if (activeId && APP.school) {
      persistTab(activeId, APP.school);
      tabUndoStacks[activeId] = captureAuditState();
    }
    const school = loadTab(id);
    if (!school) { (global._chrxNotify || console.log)("Tab missing or corrupt", "error"); return; }
    APP.school = school;
    activeId = id;
    restoreAuditState(tabUndoStacks[id]);
    global.dispatchEvent(new CustomEvent("app:school-loaded",
      { detail: { school, source: "multi-doc-tab" } }));
    render();
  }

  function close(id) {
    const idx = loadIndex().filter(t => t.id !== id);
    persistIndex(idx);
    try { localStorage.removeItem(STORAGE_PREFIX + id); } catch {}
    if (activeId === id) activeId = idx[0] && idx[0].id;
    if (activeId) switchTo(activeId);
    else render();
  }

  function list() { return loadIndex(); }

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

  function render() {
    if (!barEl) return;
    while (barEl.firstChild) barEl.removeChild(barEl.firstChild);
    const idx = loadIndex();
    for (const t of idx) {
      const isActive = t.id === activeId;
      const tab = el("button", {
        type: "button", "data-tab-id": t.id,
        style: "padding:4px 10px;font-size:11px;border:1px solid #cbd5e1;border-radius:6px;background:" + (isActive ? "#0f172a" : "#fff") + ";color:" + (isActive ? "#fff" : "#0f172a") + ";cursor:pointer;display:flex;align-items:center;gap:6px",
        onclick: () => switchTo(t.id),
      });
      tab.appendChild(document.createTextNode(t.name));
      const x = document.createElement("span");
      x.textContent = "×";
      x.style.cssText = "font-size:14px;line-height:1;cursor:pointer;opacity:.7";
      x.onclick = (e) => { e.stopPropagation(); close(t.id); };
      tab.appendChild(x);
      barEl.appendChild(tab);
    }
    const newBtn = el("button", {
      type: "button",
      style: "padding:4px 10px;font-size:11px;border:1px dashed #cbd5e1;border-radius:6px;background:none;cursor:pointer;color:#475569",
      onclick: () => {
        const name = (window.prompt("New tab name:", "Untitled " + (idx.length + 1)) || "").trim();
        if (!name) return;
        if (!APP.school) APP.school = { schoolName: name, classes: [], teachers: [], subjects: [], classrooms: [], lessons: [], cards: [], bells: [], bell: { periods: [] } };
        openCurrent(name);
      },
    }, "+ New tab");
    barEl.appendChild(newBtn);
  }

  function mount(root) {
    if (barEl) return barEl;
    barEl = el("div", { id: "chrx-tab-bar",
      style: "display:flex;gap:6px;align-items:center;padding:4px 8px;background:#f8fafc;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;font-family:-apple-system,BlinkMacSystemFont,sans-serif" });
    const target = root || document.getElementById("chrx-app") || document.body;
    if (target.firstChild) target.insertBefore(barEl, target.firstChild);
    else target.appendChild(barEl);
    render();
    return barEl;
  }

  global.MultiDocTabs = { mount, openCurrent, switchTo, close, list };

  // Auto-mount on first school-loaded so users see the bar without manual hookup.
  global.addEventListener("app:school-loaded", () => {
    if (!barEl) mount();
    render();
  });
})(window);
