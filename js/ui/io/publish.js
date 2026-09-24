/**
 * W2-3 · Publish a timetable — the WRITER side of contract C2
 * ("Published snapshot v1", wave2/CONTRACTS.md).
 *
 *   buildSnapshot(school, edition, options) -> C2 JSON
 *   buildViewerHtml(snapshot, { viewerJs })  -> one self-contained .html
 *   snapshotCounts(snapshot)                 -> the dialog's preview numbers
 *
 * Editions decide CONTENT, not just labels:
 *   staff    — everything (teachers, rooms, changes)
 *   students — class views; teacher names optional (default ON)
 *   public   — class views only; NO teacher names and NO teacher ids anywhere
 *
 * The snapshot is a plain JSON document: no functions, no DOM, no ids of
 * things it does not publish. `renderPublished` (`index.html?view=published`)
 * is owned by W2-2; this module never writes to APP.school.
 *
 * The single-file viewer inlines the built viewer bundle
 * (dist/viewer.js — see the `viewer` entry in vite.config.js) plus the
 * snapshot, and opens from file:// on a phone.
 */
import OFFLINE_VIEWER_SOURCE from "../../viewer/offline_viewer.js?raw";

export const SNAPSHOT_FORMAT = "chronexa-published";
export const SNAPSHOT_VERSION = 1;
export const EDITIONS = ["staff", "students", "public"];

/** What each edition may contain. `teacherNames` = the dialog's default. */
export const EDITION_RULES = {
  staff:    { label: "Staff",              teacherNames: true,  changes: true,  canHideTeachers: false },
  students: { label: "Students & parents", teacherNames: true,  changes: true,  canHideTeachers: true  },
  public:   { label: "Public",             teacherNames: false, changes: false, canHideTeachers: false },
};

const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// --- small helpers ----------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function str(v) { return v == null ? "" : String(v).trim(); }

function toMin(t) {
  const m = String(t == null ? "" : t).match(/^(\d{1,2}):(\d{2})$/);
  return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : -1;
}
function hhmm(min) {
  const n = Number(min);
  if (!Number.isFinite(n) || n <= 0) return null;
  const h = Math.floor(n / 60), m = Math.round(n % 60);
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
function hash(str0) {
  let h = 5381;
  const s = String(str0 == null ? "" : str0);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return Math.abs(h);
}
function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return "#" + f(0) + f(8) + f(4);
}
/** Stable color for a subject that has none — same rule as ColorTaxonomy. */
export function subjectColor(subject) {
  if (subject && subject.color) return subject.color;
  return hslToHex(hash((subject && (subject.id || subject.name)) || "x") % 360, 0.7, 0.55);
}

export function safeFilenameBase(school) {
  const raw = (school && (school._meta?.sourceFilename || school.schoolName)) || "chronexa";
  const base = String(raw).replace(/\.xml$/i, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "chronexa";
}

// --- days / periods / breaks ------------------------------------------------
function publishedDays(school) {
  const out = [];
  const seen = new Set();
  for (const d of school.daysDefs || []) {
    const bits = str(d.bits);
    if (!bits || bits.includes(",")) continue;         // aggregate "any day" defs
    const one = bits.indexOf("1");
    if (one < 0 || bits.split("").filter(c => c === "1").length !== 1) continue;
    if (seen.has(one)) continue;
    seen.add(one);
    // C2 example wants "Monday"/"Mon"; aSc ships 2-letter codes ("Mo"),
    // which are too terse for a published header — keep them only when the
    // school itself used a longer abbreviation.
    const short = str(d.short);
    out.push({
      index: one,
      name: str(d.name) || DAYS_FULL[one] || "Day " + (one + 1),
      short: short.length >= 3 ? short : DAYS_SHORT[one],
    });
  }
  if (!out.length) {
    const n = Math.max(1, Math.min(7, school.daysPerWeek | 0 || 6));
    for (let i = 0; i < n; i++) out.push({ index: i, name: DAYS_FULL[i], short: DAYS_SHORT[i] });
  }
  out.sort((a, b) => a.index - b.index);
  // Never silently drop a placed card because the day table was short.
  for (const card of school.cards || []) {
    const d = card.day | 0;
    if (d >= 0 && !out.some(x => x.index === d)) {
      out.push({ index: d, name: DAYS_FULL[d] || "Day " + (d + 1), short: DAYS_SHORT[d] || "D" + (d + 1) });
    }
  }
  out.sort((a, b) => a.index - b.index);
  return out.map(d => ({ index: d.index, name: d.name, short: d.short }));
}

function publishedPeriods(school) {
  const bell = (school.bell && Array.isArray(school.bell.periods) && school.bell)
    || (Array.isArray(school.bells) && school.bells.find(b => b && Array.isArray(b.periods)))
    || null;
  return ((bell && bell.periods) || [])
    .map(p => {
      const out = { index: p.index | 0, label: str(p.label) || String(p.index | 0) };
      const start = hhmm(p.startMin), end = hhmm(p.endMin);
      if (start) out.start = start;
      if (end) out.end = end;
      return out;
    })
    .sort((a, b) => a.index - b.index);
}

/** Which period does this break follow? 0 = before the first period. */
export function breakAfterPeriod(periods, brk) {
  const bs = toMin(brk && brk.starttime);
  if (bs < 0) return 0;
  let last = 0;
  for (const p of periods || []) {
    const endMin = Number.isFinite(p.endMin) ? p.endMin : toMin(p.end);
    if (endMin > 0 && endMin <= bs) last = p.index | 0;
  }
  return last;
}

function publishedBreaks(school) {
  return (school.breaks || [])
    .map(b => {
      const out = {
        afterPeriod: breakAfterPeriod(school.bell?.periods || [], b),
        label: str(b.name) || str(b.printtext) || "Break",
      };
      if (str(b.starttime)) out.start = str(b.starttime);
      if (str(b.endtime)) out.end = str(b.endtime);
      return out;
    })
    .filter(b => b.label || b.start);
}

// --- lessons ----------------------------------------------------------------
function lessonIndex(school) {
  const byId = (school._idx && school._idx.lessonById) || null;
  if (byId) return byId;
  const out = Object.create(null);
  for (const l of school.lessons || []) out[l.id] = l;
  return out;
}

function publishedLessons(school, opts) {
  const lessonById = lessonIndex(school);
  const classSet = new Set((opts.classes || []).map(c => c.id));
  const roomSet = new Set((opts.classrooms || []).map(c => c.id));
  const keepTeachers = !!opts.teacherNames;
  const seen = new Set();
  const out = [];
  for (const card of school.cards || []) {
    const lesson = lessonById[card.lessonId];
    if (!lesson) continue;
    const classIds = (lesson.classIds || []).filter(id => classSet.has(id));
    if (!classIds.length) continue;
    const day = card.day | 0, period = card.period | 0;
    if (day < 0 || period < 1) continue;
    const key = day + "|" + period + "|" + (lesson.subjectId || "") + "|" + classIds.join("+");
    if (seen.has(key)) continue;
    seen.add(key);
    const classroomIds = (card.classroomId && roomSet.has(card.classroomId)) ? [card.classroomId]
      : (card.classroomId ? [] : []);
    out.push({
      day, period,
      span: Math.max(1, lesson.periodsPerCard | 0 || 1),
      subjectId: lesson.subjectId || "",
      classIds,
      teacherIds: keepTeachers ? (lesson.teacherIds || []).slice() : [],
      classroomIds,
    });
  }
  out.sort((a, b) =>
    a.day - b.day || a.period - b.period ||
    String(a.subjectId).localeCompare(String(b.subjectId)) ||
    String(a.classIds[0]).localeCompare(String(b.classIds[0])));
  return out;
}

// --- changes (dated substitutions, C3) --------------------------------------
/* Edition-filtered view of school.substitutions. `public` gets none, because
 * a change names the absent and the substitute teacher. Student/parent files
 * carry the substitute's NAME only when teacher names are being published. */
function publishedChanges(school, edition, teacherNames) {
  const subs = school.substitutions;
  if (!Array.isArray(subs) || !subs.length) return null;
  if (!EDITION_RULES[edition] || !EDITION_RULES[edition].changes) return null;
  const lessonById = lessonIndex(school);
  const withNames = teacherNames;
  return subs.map(s => {
    const lesson = lessonById[s.cardId] || lessonById[s.lessonId] || null;
    const out = {
      date: str(s.date),
      day: s.day | 0,
      period: s.period | 0,
    };
    if (lesson) {
      out.subjectId = lesson.subjectId || "";
      out.classIds = (lesson.classIds || []).slice();
    } else {
      out.subjectId = s.subjectId || "";
      out.classIds = (s.classIds || []).slice();
    }
    if (withNames) {
      out.absentTeacherId = s.absentTeacherId || null;
      out.substituteTeacherId = s.substituteTeacherId || null;
    }
    if (s.roomId) out.roomId = s.roomId;
    if (s.note) out.note = str(s.note);
    if (s.createdAt) out.createdAt = str(s.createdAt);
    return out;
  });
}

// --- the snapshot -----------------------------------------------------------
/**
 * @param {object} school   APP.school (never mutated)
 * @param {"staff"|"students"|"public"} edition
 * @param {object} [options] { teacherNames, now, appVer }
 */
export function buildSnapshot(school, edition, options) {
  if (!school || typeof school !== "object") throw new Error("buildSnapshot: a school is required.");
  const ed = edition || "staff";
  if (!EDITION_RULES[ed]) throw new Error('buildSnapshot: unknown edition "' + ed + '" (expected ' + EDITIONS.join(", ") + ").");
  const rules = EDITION_RULES[ed];
  const opts = options || {};
  const teacherNames = rules.canHideTeachers && "teacherNames" in opts
    ? !!opts.teacherNames
    : rules.teacherNames;

  const classes = (school.classes || [])
    .filter(c => c && c.id)
    .map(c => ({ id: c.id, name: str(c.name) || str(c.short) || c.id }));
  const classrooms = (school.classrooms || [])
    .filter(r => r && r.id)
    .map(r => ({ id: r.id, name: str(r.name) || str(r.short) || r.id }));
  const teachers = (school.teachers || [])
    .filter(t => t && t.id)
    .map(t => ({ id: t.id, name: str(t.name) || str(t.short) || str(t.abbr) || t.id }));
  const subjects = (school.subjects || [])
    .filter(s => s && s.id)
    .map(s => ({
      id: s.id,
      name: str(s.name) || str(s.abbr) || s.id,
      short: str(s.abbr) || str(s.short) || str(s.name) || s.id,
      color: subjectColor(s),
    }));

  const periods = publishedPeriods(school);
  const snap = {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    edition: ed,
    school: {
      name: str(school.schoolName) || "Timetable",
      year: str(school.settings && school.settings.year),
      generatedAt: str(opts.now) || new Date().toISOString(),
      appVer: str(opts.appVer) || str(
        (typeof window !== "undefined" && window.APP_VER) || "")
        || "dev",
    },
    days: publishedDays(school),
    periods,
    breaks: publishedBreaks(school),
    classes,
    classrooms,
    subjects,
    lessons: publishedLessons(school, { classes, classrooms, teacherNames }),
  };
  if (teacherNames) snap.teachers = teachers;
  const changes = publishedChanges(school, ed, teacherNames);
  if (changes && changes.length) snap.changes = changes;
  return snap;
}

/** The numbers the Publish dialog previews. */
export function snapshotCounts(snapshot) {
  const s = snapshot || {};
  return {
    classes: (s.classes || []).length,
    teachers: (s.teachers || []).length,
    lessons: (s.lessons || []).length,
    days: (s.days || []).length,
    periods: (s.periods || []).length,
  };
}

// --- single-file offline viewer --------------------------------------------
/**
 * One self-contained .html: the viewer bundle (classic script) + the snapshot
 * as <script type="application/json" id="chronexa-snapshot">.
 * @param {object} snapshot
 * @param {{viewerJs: string}} opts  viewerJs = the built viewer bundle text
 */
export function buildViewerHtml(snapshot, opts) {
  const o = opts || {};
  const viewerJs = o.viewerJs;
  if (!viewerJs || typeof viewerJs !== "string") {
    throw new Error("buildViewerHtml: the viewer bundle is missing (viewerJs).");
  }
  const title = (snapshot && snapshot.school && snapshot.school.name ? snapshot.school.name : "Timetable") + " — Timetable";
  // </script> inside any published name would end the JSON block early.
  const json = JSON.stringify(snapshot).replace(/<\/(script)/gi, "<\\/$1");
  const js = viewerJs.replace(/^\/\/#\s*sourceMappingURL=.*$/gm, "");
  // Minimal page shell only — the timetable itself is drawn by the reader, and
  // its stylesheet travels inside the bundle. `chrx-viewer-active` is the class
  // the reader's CSS expects on <body> (boot.js sets it in viewer mode).
  const shell = "html,body{margin:0;background:#f8fafc}" +
    "#chronexa-viewer-root{min-height:100vh}" +
    ".chrx-pub-noscript{padding:16px;font:15px system-ui}";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>${shell}</style>
</head>
<body class="chrx-viewer-active">
<div id="chronexa-viewer-root"></div>
<noscript class="chrx-pub-noscript">This published timetable needs JavaScript to display.</noscript>
<script type="application/json" id="chronexa-snapshot">${json}</script>
<script>${js}</script>
</body>
</html>
`;
}

/** The built viewer bundle ([vue/vite] `viewer` entry). Never throws. */
export async function resolveViewerBundle() {
  try {
    const shared = typeof window !== "undefined" ? window.ChronexaViewer : null;
    if (shared && typeof shared.bundleText === "string" && shared.bundleText) return shared.bundleText;
  } catch (e) { /* ignore */ }
  try {
    const url = new URL("./viewer.js", (typeof location !== "undefined" ? location.href : "http://localhost/"));
    const res = await fetch(url.href, { cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      // A module chunk cannot be inlined as a classic script (file:// blocks
      // module CORS) — fall through to the raw source when it looks like ESM.
      if (text && !/^\s*(import|export)\s/m.test(text)) return text;
    }
  } catch (e) { /* dev server / offline → raw source below */ }
  return OFFLINE_VIEWER_SOURCE;
}

// --- downloads --------------------------------------------------------------
export function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  return filename;
}
export function downloadSnapshot(snapshot, filename) {
  const name = filename || safeFilenameBase(null) + "-" + (snapshot && snapshot.edition) + ".json";
  return downloadText(name, JSON.stringify(snapshot, null, 2), "application/json");
}
export function downloadViewerFile(html, filename) {
  return downloadText(filename || "timetable.html", html, "text/html");
}

/** Publish end to end: build the snapshot, then either download it or wrap it
 *  in the single-file viewer. Returns the filename written. */
export async function publish(school, edition, options) {
  const opts = options || {};
  const snapshot = buildSnapshot(school, edition, opts);
  const base = safeFilenameBase(school) + "-" + edition;
  if (opts.as === "json") return downloadSnapshot(snapshot, base + ".json");
  const viewerJs = await resolveViewerBundle();
  return downloadViewerFile(buildViewerHtml(snapshot, { viewerJs }), base + "-timetable.html");
}

// --- app wiring -------------------------------------------------------------
if (typeof window !== "undefined") {
  window.APP = window.APP || {};
  window.APP.io = window.APP.io || {};
  window.APP.io.buildSnapshot = buildSnapshot;
  window.APP.io.snapshotCounts = snapshotCounts;
  window.APP.io.buildViewerHtml = buildViewerHtml;
  window.APP.io.publish = publish;
  window.APP.io.resolveViewerBundle = resolveViewerBundle;
  window.APP.io.EDITIONS = EDITIONS;
  // Menu Files / Export → "Publish timetable…". The dialog itself lives in
  // js/ui/components/publish_dialog.js and registers window.PublishDialog.
  if (!window.__chrxPublishWired) {
    window.__chrxPublishWired = true;
    window.addEventListener("app:publish-timetable", () => {
      const dlg = window.PublishDialog;
      if (!dlg || typeof dlg.open !== "function") {
        (window._chrxNotify || console.log)("Publish dialog is unavailable.", "error");
        return;
      }
      dlg.open();
    });
  }
}
