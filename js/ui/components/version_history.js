/* W3-1 · Automatic backups + version history (gap study §3 / P2-2 "partial").
 *
 * Two halves, deliberately separated so the policy is unit-testable without a
 * browser:
 *
 *   1. The RING — `createBackupStore(adapter, limits)` keeps the last
 *      MAX_VERSIONS snapshots (20) of the whole school, size-capped
 *      (MAX_TOTAL_BYTES = 50 MB): newest first, oldest dropped. Every write
 *      goes to IndexedDB (`chronexa-backups`), never localStorage — a 1482-card
 *      school is ~280 KB of JSON and localStorage is ~5 MB total. A tiny
 *      `meta` store mirrors each record without `payload` so listing 20
 *      versions does not read 5 MB of payloads.
 *      `components/auto_save.js` drives it on a timer and on meaningful change
 *      (`app:school-changed`); failures are a quiet notice and never touch the
 *      localStorage autosave, so a broken backup ring cannot lose work.
 *
 *   2. The PANEL — list (time · size · label = last undo label), read-only
 *      PREVIEW (C2 snapshot via `io/publish.js` buildSnapshot + the published
 *      viewer), DIFF vs the current timetable (lessons moved / added /
 *      removed), and RESTORE. Restore applies the stored school through
 *      `APP.mutate` (contract C1) so ⌘Z puts the edit back.
 *
 * No new dependencies; IndexedDB is the platform API.
 */
import "../state.js";

export const MAX_VERSIONS = 20;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
/** Editing is bursty — one backup per burst, not one per keystroke. */
export const CHANGE_DEBOUNCE_MS = 800;

const DB_NAME = "chronexa-backups";
const DB_VERSION = 1;
const STORE = "versions";
const META_STORE = "meta";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DEFAULT_LIMITS = { maxVersions: MAX_VERSIONS, maxBytes: MAX_TOTAL_BYTES };

// ─── pure helpers (unit-tested; no DOM, no IndexedDB) ───────────────────────

export function hashString(s) {
  let h = 5381;
  const str = String(s == null ? "" : s);
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function deepClone(value) {
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch (e) { /* fall through to JSON */ }
  return JSON.parse(JSON.stringify(value));
}

/** A copy of the school fit for storage: `_idx` is derived, so it is dropped
 *  (CreateNew.refreshIndex rebuilds it on restore). */
export function stripForBackup(school) {
  if (!school || typeof school !== "object") return null;
  const out = {};
  for (const key of Object.keys(school)) {
    if (key === "_idx") continue;
    out[key] = school[key];
  }
  return deepClone(out);
}

/** Is this school worth a slot in the ring? */
export function isBackupWorthy(school) {
  if (!school || typeof school !== "object") return false;
  return !!(school.schoolName
    || (school.cards || []).length
    || (school.lessons || []).length
    || (school.classes || []).length);
}

/**
 * Which ids must go? Newest-first greedy keep: always keep at least one
 * version, then keep while under BOTH the count cap and the byte cap.
 * @param {Array<{id:string,ts:number,bytes?:number}>} metas
 * @param {{maxVersions?:number,maxBytes?:number}} [limits]
 * @returns {string[]} ids to delete (oldest first)
 */
export function planEvictions(metas, limits) {
  const lim = Object.assign({}, DEFAULT_LIMITS, limits || {});
  const sorted = (metas || []).slice().sort((a, b) =>
    (a.ts - b.ts) || String(a.id).localeCompare(String(b.id)));
  const drop = [];
  let kept = 0;
  let total = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = sorted[i];
    const bytes = Math.max(0, m && Number.isFinite(m.bytes) ? m.bytes : 0);
    const fits = kept === 0 || (kept < lim.maxVersions && total + bytes <= lim.maxBytes);
    if (fits) { kept += 1; total += bytes; }
    else drop.push(m.id);
  }
  return drop.reverse();
}

function placementsByLesson(school) {
  const out = new Map();
  for (const card of (school && school.cards) || []) {
    if (!card || card.lessonId == null) continue;
    const day = card.day | 0;
    const period = card.period | 0;
    if (period < 1) continue;
    const key = String(card.lessonId);
    let slots = out.get(key);
    if (!slots) { slots = new Map(); out.set(key, slots); }
    slots.set(day + "|" + period, { day, period });
  }
  return out;
}

function slotsOf(map, lessonId) {
  const slots = map.get(String(lessonId));
  return slots ? [...slots.values()].sort((a, b) => (a.day - b.day) || (a.period - b.period)) : [];
}

/**
 * What changed between two schools, at the level a coordinator cares about:
 * where each LESSON sits. Slots removed and added for the same lesson are
 * paired into a "move", so a drag reads as one moved lesson, not as
 * removed+added.
 * @returns {{moved:Array,added:Array,removed:Array,counts:object,total:number}}
 */
export function diffSchools(before, after) {
  const b = placementsByLesson(before);
  const a = placementsByLesson(after);
  const ids = new Set([...b.keys(), ...a.keys()]);
  const moved = [], added = [], removed = [];
  for (const id of [...ids].sort()) {
    const bs = slotsOf(b, id);
    const as = slotsOf(a, id);
    const paired = Math.min(bs.length, as.length);
    for (let i = 0; i < paired; i++) {
      if (bs[i].day !== as[i].day || bs[i].period !== as[i].period) {
        moved.push({ lessonId: id, from: bs[i], to: as[i] });
      }
    }
    for (let i = paired; i < bs.length; i++) removed.push({ lessonId: id, day: bs[i].day, period: bs[i].period });
    for (let i = paired; i < as.length; i++) added.push({ lessonId: id, day: as[i].day, period: as[i].period });
  }
  const counts = { moved: moved.length, added: added.length, removed: removed.length };
  return { moved, added, removed, counts, total: counts.moved + counts.added + counts.removed };
}

function findById(list, id) {
  for (const item of list || []) if (item && item.id === id) return item;
  return null;
}

export function lessonLabel(school, lessonId) {
  const lesson = (school && school._idx && school._idx.lessonById
    && school._idx.lessonById[lessonId]) || findById(school && school.lessons, lessonId);
  const subject = lesson ? findById(school && school.subjects, lesson.subjectId) : null;
  const name = subject ? (subject.name || subject.abbr || subject.id) : (lessonId || "lesson");
  const classes = lesson
    ? (lesson.classIds || []).map((id) => {
        const cls = findById(school && school.classes, id);
        return cls ? (cls.name || cls.short || id) : id;
      })
    : [];
  return classes.length ? name + " (" + classes.join(", ") + ")" : String(name);
}

export function dayLabel(school, day) {
  const d = day | 0;
  for (const def of (school && school.daysDefs) || []) {
    const bits = String((def && def.bits) || "");
    if (!bits || bits.includes(",")) continue;
    if (bits.split("").filter((c) => c === "1").length !== 1) continue;
    if (bits.indexOf("1") === d) return String(def.name || DAY_NAMES[d] || "Day " + (d + 1));
  }
  return DAY_NAMES[d] || "Day " + (d + 1);
}

export function periodLabel(school, period) {
  const bell = (school && school.bell && Array.isArray(school.bell.periods) && school.bell)
    || (school && Array.isArray(school.bells) && school.bells.find((b) => b && Array.isArray(b.periods)))
    || null;
  const p = bell ? (bell.periods || []).find((x) => (x.index | 0) === (period | 0)) : null;
  return p && p.label ? String(p.label) : String(period | 0);
}

export function slotLabel(school, slot) {
  return dayLabel(school, slot.day) + " · " + periodLabel(school, slot.period);
}

/** Human-readable diff: a count summary plus one line per change. */
export function describeDiff(school, diff) {
  const d = diff || { moved: [], added: [], removed: [], counts: {} };
  const lines = [];
  for (const m of d.moved || []) {
    lines.push({ kind: "moved", lessonId: m.lessonId,
      text: lessonLabel(school, m.lessonId) + " · moved " + slotLabel(school, m.from) + " → " + slotLabel(school, m.to) });
  }
  for (const a of d.added || []) {
    lines.push({ kind: "added", lessonId: a.lessonId,
      text: lessonLabel(school, a.lessonId) + " · added at " + slotLabel(school, a) });
  }
  for (const r of d.removed || []) {
    lines.push({ kind: "removed", lessonId: r.lessonId,
      text: lessonLabel(school, r.lessonId) + " · removed from " + slotLabel(school, r) });
  }
  const c = d.counts || {};
  const summary = (c.moved | 0) + " moved · " + (c.added | 0) + " added · " + (c.removed | 0) + " removed";
  return { summary, lines, counts: { moved: c.moved | 0, added: c.added | 0, removed: c.removed | 0 } };
}

// ─── adapters ────────────────────────────────────────────────────────────────

function toMeta(rec) {
  return {
    id: rec.id, ts: rec.ts, bytes: rec.bytes, sizeKB: rec.sizeKB, hash: rec.hash,
    label: rec.label, schoolName: rec.schoolName, cards: rec.cards, lessons: rec.lessons,
  };
}

/** In-memory adapter: identical contract to IndexedDB, used by unit tests. */
export function createMemoryAdapter() {
  const rows = new Map();
  return {
    kind: "memory",
    async list() { return [...rows.values()].map(toMeta); },
    async get(id) { const rec = rows.get(id); return rec ? deepClone(rec) : null; },
    async put(rec) { rows.set(rec.id, deepClone(rec)); },
    async remove(id) { rows.delete(id); },
    async clear() { rows.clear(); },
    _size() { return rows.size; },
  };
}

export function createIdbAdapter() {
  let dbPromise = null;

  function openDb() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: "id" });
          os.createIndex("ts", "ts", { unique: false });
        }
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB unavailable"));
      req.onblocked = () => reject(new Error("IndexedDB blocked"));
    });
  }
  function db() { if (!dbPromise) dbPromise = openDb(); return dbPromise; }
  function request(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error("IndexedDB request failed"));
    });
  }
  function settle(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    });
  }
  async function write(work) {
    const d = await db();
    const tx = d.transaction([STORE, META_STORE], "readwrite");
    work(tx.objectStore(STORE), tx.objectStore(META_STORE));
    await settle(tx);
  }

  return {
    kind: "indexeddb",
    async list() {
      const d = await db();
      const tx = d.transaction(META_STORE, "readonly");
      const all = await request(tx.objectStore(META_STORE).getAll());
      return all || [];
    },
    async get(id) {
      const d = await db();
      const tx = d.transaction(STORE, "readonly");
      const rec = await request(tx.objectStore(STORE).get(id));
      return rec || null;
    },
    async put(rec) { await write((full, meta) => { full.put(rec); meta.put(toMeta(rec)); }); },
    async remove(id) { await write((full, meta) => { full.delete(id); meta.delete(id); }); },
    async clear() { await write((full, meta) => { full.clear(); meta.clear(); }); },
  };
}

function noopStore(limits) {
  return {
    limits: limits,
    available: false,
    record: async () => null,
    list: async () => [],
    get: async () => null,
    remove: async () => false,
    clear: async () => false,
  };
}

/**
 * The rolling ring. All calls are serialized: a slow write can never interleave
 * with the next one, and a rejected call cannot poison the chain.
 */
export function createBackupStore(adapter, limits) {
  const lim = Object.assign({}, DEFAULT_LIMITS, limits || {});
  if (!adapter) return noopStore(lim);

  let chain = Promise.resolve();
  function serialize(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(() => {}, () => {});
    return run;
  }

  function newId(ts) {
    return "bk_" + Number(ts).toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  async function recordImpl(school, opts) {
    const o = opts || {};
    if (!isBackupWorthy(school)) return null;
    const payload = stripForBackup(school);
    const json = JSON.stringify(payload);
    const bytes = json.length;   // UTF-16 code units: a close-enough ASCII size
    const hash = hashString(json);
    const metas = await adapter.list();
    const newest = metas.slice().sort((a, b) => (b.ts - a.ts))[0] || null;
    // Nothing changed since the newest version — do not burn a ring slot.
    if (!o.force && newest && newest.hash === hash) return null;
    const ts = Number.isFinite(o.ts) ? o.ts : Date.now();
    const rec = {
      id: newId(ts),
      ts: ts,
      bytes: bytes,
      sizeKB: Math.max(1, Math.round(bytes / 1024)),
      hash: hash,
      label: String(o.label || "Change"),
      schoolName: payload.schoolName || payload.name || "(untitled)",
      cards: (payload.cards || []).length,
      lessons: (payload.lessons || []).length,
      payload: payload,
    };
    await adapter.put(rec);
    const after = await adapter.list();
    for (const id of planEvictions(after, lim)) {
      try { await adapter.remove(id); } catch (e) { /* keep the rest of the ring */ }
    }
    return rec;
  }

  return {
    limits: lim,
    available: true,
    record: (school, opts) => serialize(() => recordImpl(school, opts)),
    list: () => serialize(async () => (await adapter.list()).slice().sort((a, b) => b.ts - a.ts)),
    get: (id) => serialize(() => adapter.get(id)),
    remove: (id) => serialize(() => adapter.remove(id)),
    clear: () => serialize(() => adapter.clear()),
  };
}

// ─── app singleton ───────────────────────────────────────────────────────────

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

function pickAdapter() {
  if (!isBrowser) return null;
  try {
    if (typeof indexedDB !== "undefined" && indexedDB) return createIdbAdapter();
  } catch (e) { /* private mode / blocked storage */ }
  return null;
}

let activeStore = createBackupStore(pickAdapter(), DEFAULT_LIMITS);
let warnMissingOnce = false;

function notify(msg, tone) {
  const fn = (isBrowser && window._chrxNotify) || console.log;
  try { fn(msg, tone); } catch (e) { /* never let a notice break editing */ }
}

/** Swap the store (tests) — returns the new store. */
export function configure(adapter, limits) {
  activeStore = createBackupStore(adapter, limits || DEFAULT_LIMITS);
  return activeStore;
}

export function currentStore() { return activeStore; }

export function record(school, opts) {
  if (!activeStore.available) {
    if (!warnMissingOnce) {
      warnMissingOnce = true;
      notify("Automatic backups are off in this browser — the localStorage autosave still protects your work.", "warn");
    }
    return Promise.resolve(null);
  }
  return activeStore.record(school, opts).catch(() => {
    if (!warnMissingOnce) {
      warnMissingOnce = true;
      notify("Backup skipped (storage error) — your autosave is unaffected.", "warn");
    }
    return null;
  });
}

export function list() { return activeStore.list(); }
export function get(id) { return activeStore.get(id); }
export function remove(id) { return activeStore.remove(id); }
export function clear() { return activeStore.clear(); }
export function available() { return activeStore.available; }

// ─── restore (through APP.mutate, so ⌘Z puts the edit back) ──────────────────

function replaceSchoolContents(target, source) {
  for (const key of Object.keys(target)) {
    if (key !== "_idx") delete target[key];
  }
  for (const key of Object.keys(source || {})) {
    if (key === "_idx") continue;
    target[key] = deepClone(source[key]);
  }
}

/** Undoable re-render of the workspace after a restore / undo / redo. The
 *  editor activator rebuilds the grid on `entity:changed`. */
export function syncWorkspace() {
  if (!isBrowser) return;
  try {
    document.dispatchEvent(new CustomEvent("entity:changed",
      { detail: { entity: "school", source: "version-history" } }));
  } catch (e) { /* no DOM */ }
}

export function applyRestore(payload, label) {
  if (!isBrowser) return false;
  const APP = window.APP;
  if (!APP || !APP.school || !payload) return false;
  if (typeof APP.mutate === "function") {
    APP.mutate(label || "Restore version", (school) => { replaceSchoolContents(school, payload); });
  } else {
    replaceSchoolContents(APP.school, payload);
    if (window.CreateNew && typeof window.CreateNew.refreshIndex === "function") {
      try { window.CreateNew.refreshIndex(); } catch (e) { /* derived index only */ }
    }
  }
  syncWorkspace();
  return true;
}

// ─── panel ───────────────────────────────────────────────────────────────────

const PANEL_ID = "chrx-version-history";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function ensureStyles() {
  if (document.getElementById("chrx-vh-styles")) return;
  const style = document.createElement("style");
  style.id = "chrx-vh-styles";
  style.textContent = `
.chrx-vh-scrim{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px;z-index:1000;overflow:auto}
.chrx-vh-panel{background:#fff;color:#0f172a;border-radius:12px;max-width:820px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;flex-direction:column;max-height:88vh}
.chrx-vh-panel header{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #e2e8f0}
.chrx-vh-panel h2{margin:0;font-size:17px;color:#1e3a8a}
.chrx-vh-close{background:none;border:0;font-size:22px;line-height:1;cursor:pointer;color:#64748b}
.chrx-vh-body{padding:10px 18px 16px;overflow:auto}
.chrx-vh-note{font-size:12px;color:#64748b;margin:0 0 10px}
.chrx-vh-empty{padding:24px;text-align:center;color:#94a3b8;font-size:13px}
.chrx-vh-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f1f5f9}
.chrx-vh-row.is-newest{background:#f8fafc}
.chrx-vh-meta{min-width:0}
.chrx-vh-label{display:block;font-size:14px;font-weight:600}
.chrx-vh-time{display:block;font-size:11px;color:#64748b}
.chrx-vh-stat{display:block;font-size:11px;color:#94a3b8}
.chrx-vh-actions{display:flex;gap:6px;flex-shrink:0}
.chrx-vh-actions button{border:1px solid #cbd5e1;background:#fff;color:#0f172a;padding:4px 10px;border-radius:5px;font-size:12px;cursor:pointer}
.chrx-vh-actions button:hover{background:#f1f5f9}
.chrx-vh-actions button.danger{color:#b91c1c;border-color:#fecaca}
.chrx-vh-preview-head,.chrx-vh-diff-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.chrx-vh-preview-head span,.chrx-vh-diff-head span{font-size:12px;color:#475569}
.chrx-vh-preview-mount{border:1px solid #e2e8f0;border-radius:8px;overflow:auto;max-height:62vh;background:#f8fafc}
.chrx-vh-diff-summary{font-weight:600;color:#1e3a8a}
.chrx-vh-diff-list{list-style:none;margin:6px 0 0;padding:0;font-size:13px}
.chrx-vh-diff__item{padding:6px 8px;border-left:3px solid #cbd5e1;margin-bottom:4px;background:#f8fafc}
.chrx-vh-diff__item--moved{border-left-color:#2563eb}
.chrx-vh-diff__item--added{border-left-color:#059669}
.chrx-vh-diff__item--removed{border-left-color:#dc2626}
.chrx-vh-back{border:1px solid #cbd5e1;background:#fff;border-radius:5px;padding:4px 10px;font-size:12px;cursor:pointer}
`;
  document.head.appendChild(style);
}

function closePanel() {
  const existing = document.getElementById(PANEL_ID);
  if (existing) existing.remove();
}

async function ensureViewer() {
  if (window.ChronexaViewer && typeof window.ChronexaViewer.render === "function") return window.ChronexaViewer;
  try {
    const mod = await import("../../viewer/render.js");
    if (mod && typeof mod.render === "function") return { render: mod.render };
  } catch (e) { /* published viewer not reachable */ }
  return window.ChronexaViewer && typeof window.ChronexaViewer.render === "function" ? window.ChronexaViewer : null;
}

function renderList(body, versions) {
  if (!versions.length) {
    body.innerHTML = '<div class="chrx-vh-empty">'
      + (available()
        ? "No versions yet. Backups are taken automatically as you edit."
        : "Automatic backups are unavailable in this browser. The localStorage autosave still holds your latest state.")
      + "</div>";
    return;
  }
  const rows = versions.map((v, i) => `
    <div class="chrx-vh-row${i === 0 ? " is-newest" : ""}" data-vh-version data-vh-id="${esc(v.id)}"
         data-vh-ts="${v.ts}" data-vh-label="${esc(v.label)}">
      <div class="chrx-vh-meta">
        <strong class="chrx-vh-label">${esc(v.label || "Version")}</strong>
        <span class="chrx-vh-time">${esc(new Date(v.ts).toLocaleString())}${i === 0 ? " · newest" : ""}</span>
        <span class="chrx-vh-stat">${v.sizeKB | 0} KB · ${v.cards | 0} cards · ${v.lessons | 0} lessons</span>
      </div>
      <div class="chrx-vh-actions">
        <button type="button" data-vh-act="preview" data-vh-id="${esc(v.id)}">Preview</button>
        <button type="button" data-vh-act="diff" data-vh-id="${esc(v.id)}">Diff</button>
        <button type="button" data-vh-act="restore" data-vh-id="${esc(v.id)}">↶ Restore</button>
        <button type="button" class="danger" data-vh-act="delete" data-vh-id="${esc(v.id)}" aria-label="Delete version">✕</button>
      </div>
    </div>`).join("");
  const cap = currentStore().limits || DEFAULT_LIMITS;
  body.innerHTML = `<p class="chrx-vh-note">${versions.length} of ${cap.maxVersions} versions kept automatically`
    + (available() ? " (newest first; oldest dropped)" : "") + ".</p>" + rows;
}

function versionHead(extra) {
  return `<button type="button" class="chrx-vh-back" data-vh-act="back">← Back to list</button>`
    + `<span>${esc(extra)}</span>`;
}

async function showPreview(body, rec) {
  body.innerHTML = `<div class="chrx-vh-preview">
      <div class="chrx-vh-preview-head">${versionHead("Read-only preview · " + new Date(rec.ts).toLocaleString())}</div>
      <div class="chrx-vh-preview-mount" data-vh-preview-mount></div>
    </div>`;
  const mount = body.querySelector("[data-vh-preview-mount]");
  const build = window.APP && window.APP.io && window.APP.io.buildSnapshot;
  if (typeof build !== "function") {
    mount.innerHTML = '<div class="chrx-vh-empty">The published-view snapshot builder is unavailable.</div>';
    return;
  }
  let snapshot;
  try { snapshot = build(rec.payload, "staff"); }
  catch (e) {
    mount.innerHTML = '<div class="chrx-vh-empty">This version could not be rendered: ' + esc(e.message) + "</div>";
    return;
  }
  const viewer = await ensureViewer();
  if (!viewer) {
    mount.innerHTML = '<div class="chrx-vh-empty">The timetable viewer is unavailable.</div>';
    return;
  }
  try { viewer.render(mount, snapshot); }
  catch (e) { mount.innerHTML = '<div class="chrx-vh-empty">Preview failed: ' + esc(e.message) + "</div>"; }
}

async function showDiff(body, rec) {
  const current = stripForBackup(window.APP.school) || {};
  const diff = diffSchools(rec.payload, current);
  const described = describeDiff(rec.payload, diff);
  body.innerHTML = `<div class="chrx-vh-diff" data-vh-counts="${esc(described.summary)}">
      <div class="chrx-vh-diff-head">${versionHead("Diff vs the current timetable")}</div>
      <p class="chrx-vh-note">Comparing <em>${esc(rec.label)}</em> (${esc(new Date(rec.ts).toLocaleString())}) with the current timetable.
        <span class="chrx-vh-diff-summary" data-vh-diff-summary>${esc(described.summary)}</span></p>
      ${described.lines.length
        ? `<ul class="chrx-vh-diff-list">${described.lines.map((l) =>
            `<li class="chrx-vh-diff__item chrx-vh-diff__item--${l.kind}">${esc(l.text)}</li>`).join("")}</ul>`
        : '<p class="chrx-vh-empty">No lesson placements changed.</p>'}
    </div>`;
}

async function showRestore(rec) {
  const when = new Date(rec.ts).toLocaleString();
  const ok = window.confirm('Restore "' + (rec.label || "version") + '" from ' + when
    + "?\n\nThe current timetable is replaced and can be brought back with ⌘Z (Undo).");
  if (!ok) return false;
  const applied = applyRestore(rec.payload, "Restore backup · " + (rec.label || "version"));
  closePanel();
  notify(applied
    ? "↶ Restored the version from " + when + " — press ⌘Z to undo."
    : "Restore failed.", applied ? "info" : "error");
  return applied;
}

/**
 * Open the Version history dialog. Reachable from the Files menu
 * (`app:open-version-history`).
 */
export async function open() {
  if (!isBrowser) return null;
  const APP = window.APP;
  if (!APP || !APP.school) { notify("Open a timetable first.", "warn"); return null; }
  closePanel();
  ensureStyles();

  const root = document.createElement("div");
  root.className = "chrx-vh-scrim";
  root.id = PANEL_ID;
  root.innerHTML = `<div class="chrx-vh-panel" role="dialog" aria-modal="true" aria-label="Version history">
      <header><h2>🕘 Version history</h2>
        <button type="button" class="chrx-vh-close" aria-label="Close">×</button></header>
      <div class="chrx-vh-body"></div>
    </div>`;
  document.body.appendChild(root);

  const body = root.querySelector(".chrx-vh-body");
  root.querySelector(".chrx-vh-close").onclick = closePanel;
  root.addEventListener("click", (e) => { if (e.target === root) closePanel(); });

  async function refresh() {
    let versions = [];
    try { versions = await list(); }
    catch (e) { versions = []; }
    renderList(body, versions);
  }

  body.addEventListener("click", async (e) => {
    const btn = e.target && e.target.closest && e.target.closest("[data-vh-act]");
    if (!btn) return;
    const act = btn.getAttribute("data-vh-act");
    if (act === "back") { await refresh(); return; }
    const id = btn.getAttribute("data-vh-id");
    if (!id) return;
    let rec = null;
    try { rec = await get(id); } catch (err) { rec = null; }
    if (!rec) { notify("That version is no longer stored.", "warn"); await refresh(); return; }
    if (act === "preview") showPreview(body, rec);
    else if (act === "diff") showDiff(body, rec);
    else if (act === "restore") showRestore(rec);
    else if (act === "delete") {
      if (!window.confirm("Delete this version (" + new Date(rec.ts).toLocaleString() + ")?")) return;
      await remove(id);
      await refresh();
    }
  });

  await refresh();
  return root;
}

// ─── wiring ──────────────────────────────────────────────────────────────────

const VersionHistory = {
  MAX_VERSIONS, MAX_TOTAL_BYTES, CHANGE_DEBOUNCE_MS,
  record, list, get, remove, clear, available, configure, currentStore,
  applyRestore, syncWorkspace, open,
  hashString, planEvictions, diffSchools, describeDiff, stripForBackup,
  createMemoryAdapter, createIdbAdapter, createBackupStore,
};

if (isBrowser) {
  window.VersionHistory = VersionHistory;
  window.VersionHistoryPanel = { open };
  if (!window.__chrxVersionHistoryWired) {
    window.__chrxVersionHistoryWired = true;
    window.addEventListener("app:open-version-history", () => { open(); });
    // A restore/undo/redo rewrites APP.school in place; the editor activator
    // rebuilds the grid on `entity:changed`, which nothing was sending.
    let refreshTimer = null;
    document.addEventListener("app:school-changed", (e) => {
      const source = e && e.detail && e.detail.source;
      if (source !== "undo" && source !== "redo") return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(syncWorkspace, 60);
    });
  }
}

export { VersionHistory };
