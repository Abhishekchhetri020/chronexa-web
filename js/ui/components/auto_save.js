/* Auto-save — silent localStorage snapshots every 60 seconds.
 *
 * Classic has a reputation for losing work when Windows crashes. Chronexa
 * silently snapshots the entire school to localStorage on a 60-second
 * timer (plus on every entity change beyond a debounce window).
 *
 * Recovery: on app boot, if no school is loaded AND a saved snapshot
 * exists for the user, offers "Restore your last session?" prompt.
 *
 * Storage key: `chronexa.autosave.v1` — separate from the manual
 * Snapshots feature (`chronexa.snapshots.v1`). Keeps ONE latest only.
 */
(function () {
  "use strict";
  const KEY = "chronexa.autosave.v1";
  const PERIOD_MS = 60 * 1000;
  const DEBOUNCE_MS = 2000;

  let saveTimer = null;
  let lastSaveTs = 0;

  function save() {
    const APP = window.APP;
    if (!APP || !APP.school) return;
    const school = APP.school;
    const payload = {
      ts: Date.now(),
      schoolName: school.schoolName || "(untitled)",
      cards: (school.cards || []).length,
      lessons: (school.lessons || []).length,
      payload: structuredClone ? structuredClone(school) : JSON.parse(JSON.stringify(school)),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
      lastSaveTs = payload.ts;
      flashIndicator("✓");
    } catch (e) {
      flashIndicator("⚠", "warn");
      console.warn("[autosave] failed:", e);
    }
  }

  function restore() {
    try {
      const txt = localStorage.getItem(KEY);
      if (!txt) return null;
      const obj = JSON.parse(txt);
      return obj;
    } catch (e) { return null; }
  }

  function discardSaved() {
    try { localStorage.removeItem(KEY); } catch {}
  }

  function schedulePeriodic() {
    if (saveTimer) clearInterval(saveTimer);
    saveTimer = setInterval(() => {
      // Only save if something changed in the last period
      const APP = window.APP;
      if (!APP || !APP.school) return;
      const lastChange = APP.audit?._log?.[APP.audit._log.length - 1]?.ts || 0;
      if (lastChange > lastSaveTs) save();
    }, PERIOD_MS);
  }

  let debounceTimer = null;
  function onEntityChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(save, DEBOUNCE_MS);
  }

  // ─── Indicator pill (bottom-right) ────────────────────────────────────
  function ensureIndicator() {
    if (document.getElementById("chrx-autosave-pill")) return;
    const pill = document.createElement("div");
    pill.id = "chrx-autosave-pill";
    pill.style.cssText = [
      "position:fixed", "bottom:12px", "left:12px",
      "background:#0f172a", "color:#cbd5e1",
      "padding:4px 10px", "border-radius:12px",
      "font-size:11px", "font-family:-apple-system,BlinkMacSystemFont,sans-serif",
      "opacity:0", "pointer-events:none",
      "transition:opacity 200ms ease,background 200ms ease",
      "z-index:998"
    ].join(";");
    pill.textContent = "Auto-saved";
    document.body.appendChild(pill);
  }
  function flashIndicator(prefix = "✓", tone = "info") {
    ensureIndicator();
    const pill = document.getElementById("chrx-autosave-pill");
    if (!pill) return;
    pill.textContent = `${prefix} Auto-saved · ${new Date().toLocaleTimeString()}`;
    pill.style.background = tone === "warn" ? "#b45309" : "#0f172a";
    pill.style.opacity = "1";
    clearTimeout(pill._t);
    pill._t = setTimeout(() => pill.style.opacity = "0", 2500);
  }

  // ─── Recovery prompt on boot ──────────────────────────────────────────
  function maybeOfferRecovery() {
    const APP = window.APP;
    if (APP?.school) return; // already have one loaded
    const saved = restore();
    if (!saved) return;
    const ageMin = Math.round((Date.now() - saved.ts) / 60000);
    const card = document.createElement("div");
    card.style.cssText = [
      "position:fixed", "top:80px", "right:16px",
      "background:#fff", "color:#0f172a",
      "border:1px solid #e2e8f0", "border-radius:10px",
      "padding:14px 16px", "box-shadow:0 8px 24px rgba(0,0,0,.12)",
      "font-family:-apple-system,sans-serif", "font-size:13px",
      "max-width:300px", "z-index:999"
    ].join(";");
    card.innerHTML = `
      <div style="font-weight:600;color:#1e3a8a;margin-bottom:6px">💾 Restore previous session?</div>
      <div style="color:#475569;margin-bottom:10px">
        "${escapeHtml(saved.schoolName)}" · ${saved.cards} cards · saved ${ageMin}m ago
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button data-discard style="background:#fff;border:1px solid #cbd5e1;color:#0f172a;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:12px">Discard</button>
        <button data-restore style="background:#10b981;border:0;color:#fff;padding:4px 12px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">Restore</button>
      </div>`;
    document.body.appendChild(card);
    card.querySelector("[data-restore]").onclick = () => {
      APP.school = saved.payload;
      if (window.CreateNew?.refreshIndex) window.CreateNew.refreshIndex();
      window.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { source: "autosave-restore" } }));
      card.remove();
      flashIndicator("↶ Restored");
    };
    card.querySelector("[data-discard]").onclick = () => { discardSaved(); card.remove(); };
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  // ─── Boot ─────────────────────────────────────────────────────────────
  function boot() {
    schedulePeriodic();
    window.addEventListener("entity:changed", onEntityChange);
    document.addEventListener("entity:changed", onEntityChange);
    window.addEventListener("app:school-loaded", () => { lastSaveTs = 0; save(); });
    // A freshly generated/solved timetable is the most expensive-to-recreate
    // state in the app — snapshot it immediately rather than waiting up to
    // 60s for the periodic timer (a refresh in that window lost the result).
    window.addEventListener("app:solve-applied", () => { lastSaveTs = 0; save(); });
    setTimeout(maybeOfferRecovery, 1500);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }

  window.AutoSave = { save, restore, discard: discardSaved };
})();

// Chronexa Web
