/* Snapshot / Version history — ports EduPage's tt_snapshots flow.
 *
 * Two-mode pattern (per EDUPAGE_FEATURE_MAP_WIZARD_6_8_R6.md §8.5):
 *   Mode 1 — initial create / give-name (Save As…)
 *   Mode 2 — snapshot-only checkpoint (ad-hoc save with optional note)
 *
 * Storage: localStorage keyed by school name + an in-memory history list.
 * In the future this should sync to a server / IndexedDB; for v1 it's
 * a per-tab in-browser checkpoint system that survives page reloads.
 *
 * Snapshots store a structured-clone of the entire school object plus
 * metadata (timestamp, note, user-marked tag). Restore swaps in.
 */
(function (global) {
  "use strict";
  const APP = global.APP || (global.APP = {});
  const notify = global._chrxNotify || console.log;
  const KEY = "chronexa.snapshots.v1";

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); }
    catch (e) { notify("Snapshot store full — clear history first.", "warn"); }
  }
  function listForSchool(schoolName) {
    return load().filter(s => s.school === schoolName);
  }

  function take(noteOrOpts) {
    const opts = (typeof noteOrOpts === "string") ? { note: noteOrOpts } : (noteOrOpts || {});
    const school = APP.school;
    if (!school) { notify("Open a timetable first.", "error"); return null; }
    const list = load();
    const snap = {
      id: "ss_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      ts: new Date().toISOString(),
      school: school.schoolName || "(untitled)",
      note: (opts.note || "").trim() || "Untitled checkpoint",
      tag: opts.tag || "",
      cards: (school.cards || []).length,
      lessons: (school.lessons || []).length,
      payload: structuredClone ? structuredClone(school) : JSON.parse(JSON.stringify(school)),
    };
    list.push(snap);
    // Keep only the last 50 snapshots
    while (list.length > 50) list.shift();
    save(list);
    notify(`📸 Snapshot saved — ${snap.note}`);
    return snap;
  }

  function restore(id) {
    const list = load();
    const s = list.find(x => x.id === id);
    if (!s) { notify("Snapshot not found.", "error"); return; }
    if (!confirm(`Restore '${s.note}' from ${new Date(s.ts).toLocaleString()}? Current state will be lost.`)) return;
    APP.school = structuredClone ? structuredClone(s.payload) : JSON.parse(JSON.stringify(s.payload));
    if (window.CreateNew?.refreshIndex) window.CreateNew.refreshIndex();
    window.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { source: "snapshot", id } }));
    if (window.APP.audit?.append) APP.audit.append({ entity: "school", op: "restore-snapshot", id });
    notify(`↶ Restored from snapshot '${s.note}'.`);
  }

  function remove(id) {
    const list = load();
    const i = list.findIndex(x => x.id === id);
    if (i >= 0) { list.splice(i, 1); save(list); notify("Snapshot deleted."); }
  }

  // ─── UI: Version history modal ──────────────────────────────────────────
  function showHistory() {
    const school = APP.school;
    if (!school) { notify("Open a timetable first.", "error"); return; }
    const list = listForSchool(school.schoolName).slice().reverse();
    ensureStyles();
    const root = document.createElement("div");
    root.className = "chrx-snaps-root";
    root.addEventListener("click", e => { if (e.target === root) root.remove(); });
    const panel = document.createElement("div");
    panel.className = "chrx-snaps-panel";

    panel.innerHTML = `
      <header>
        <h2>🕘 Version history — ${escapeHtml(school.schoolName || "Untitled")}</h2>
        <button class="chrx-snaps-close" aria-label="Close">×</button>
      </header>
      <div class="chrx-snaps-actions">
        <button data-act="checkpoint" class="primary">📸 Take checkpoint now</button>
        <span class="chrx-snaps-count">${list.length} snapshot(s) stored locally</span>
      </div>
      <div class="chrx-snaps-list"></div>
    `;
    root.appendChild(panel);
    document.body.appendChild(root);

    const listEl = panel.querySelector(".chrx-snaps-list");
    if (!list.length) {
      listEl.innerHTML = `<div class="chrx-snaps-empty">No snapshots yet. Click <em>Take checkpoint now</em> to save the current state.</div>`;
    } else {
      list.forEach(s => {
        const item = document.createElement("div");
        item.className = "chrx-snaps-item";
        item.innerHTML = `
          <div class="chrx-snaps-meta">
            <strong>${escapeHtml(s.note)}</strong>
            <span class="chrx-snaps-time">${new Date(s.ts).toLocaleString()}</span>
            <span class="chrx-snaps-stat">${s.cards} cards · ${s.lessons} lessons${s.tag ? " · #" + escapeHtml(s.tag) : ""}</span>
          </div>
          <div class="chrx-snaps-buttons">
            <button data-act="restore" data-id="${s.id}">↶ Restore</button>
            <button data-act="delete"  data-id="${s.id}" class="danger">Delete</button>
          </div>`;
        listEl.appendChild(item);
      });
    }

    panel.querySelector(".chrx-snaps-close").onclick = () => root.remove();
    panel.querySelector('[data-act="checkpoint"]').onclick = () => {
      const note = prompt("Optional note for this snapshot:") || "";
      const s = take({ note });
      if (s) root.remove(), showHistory();
    };
    listEl.querySelectorAll('[data-act="restore"]').forEach(b =>
      b.onclick = () => { restore(b.dataset.id); root.remove(); });
    listEl.querySelectorAll('[data-act="delete"]').forEach(b =>
      b.onclick = () => { if (confirm("Delete this snapshot?")) { remove(b.dataset.id); root.remove(); showHistory(); } });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function ensureStyles() {
    if (document.getElementById("chrx-snaps-styles")) return;
    const s = document.createElement("style");
    s.id = "chrx-snaps-styles";
    s.textContent = `
.chrx-snaps-root{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px;z-index:1000;overflow:auto}
.chrx-snaps-panel{background:#fff;border-radius:12px;max-width:680px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0f172a}
.chrx-snaps-panel header{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #e2e8f0}
.chrx-snaps-panel h2{margin:0;font-size:17px;color:#1e3a8a}
.chrx-snaps-close{background:none;border:0;font-size:22px;cursor:pointer;color:#64748b}
.chrx-snaps-actions{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;background:#f8fafc;border-bottom:1px solid #e2e8f0}
.chrx-snaps-actions button.primary{background:#10b981;color:#fff;border:0;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer}
.chrx-snaps-count{font-size:12px;color:#64748b}
.chrx-snaps-list{padding:8px 18px 16px;max-height:60vh;overflow-y:auto}
.chrx-snaps-empty{padding:24px;text-align:center;color:#94a3b8;font-size:13px}
.chrx-snaps-item{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9}
.chrx-snaps-meta strong{display:block;color:#0f172a;font-size:14px}
.chrx-snaps-time{font-size:11px;color:#64748b;display:block}
.chrx-snaps-stat{font-size:11px;color:#94a3b8}
.chrx-snaps-buttons button{margin-left:6px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;padding:4px 10px;border-radius:5px;font-size:12px;cursor:pointer}
.chrx-snaps-buttons button.danger{color:#b91c1c;border-color:#fecaca}
.chrx-snaps-buttons button:hover{background:#f1f5f9}
    `;
    document.head.appendChild(s);
  }

  // Wire to ribbon events
  global.addEventListener("app:snapshot", () => {
    const note = prompt("Snapshot note (optional):") || "";
    take({ note });
  });
  global.addEventListener("app:version-history", showHistory);

  global.Snapshots = { take, restore, remove, list: load, listForSchool, showHistory };
})(window);
