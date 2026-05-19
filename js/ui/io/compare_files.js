/* Compare-with-file — diff two aSc XML timetables side-by-side.
 *
 * Users often need to compare last year's timetable to this year's, or
 * compare two solver runs. This module loads a SECOND XML, parses it
 * with the existing parseAscXml pipeline, and computes a diff against
 * the currently-loaded school.
 *
 * Triggered by `app:compare-with-file`. Files menu wires an entry.
 *
 * Diff produced:
 *   - entities added/removed/renamed (teachers, classes, subjects, rooms)
 *   - lessons added/removed/changed (count, duration, classroom)
 *   - cards added/removed/moved (lesson, day, period)
 *
 * Render: tabbed dialog with summary + per-entity table + per-card grid.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;

  function indexBy(arr, key) {
    const m = new Map();
    for (const r of (arr || [])) {
      if (r && r[key] != null) m.set(r[key], r);
    }
    return m;
  }

  function diffEntities(aArr, bArr, fields) {
    const a = indexBy(aArr, "id"), b = indexBy(bArr, "id");
    const added = [], removed = [], changed = [];
    for (const [id, rec] of b) {
      if (!a.has(id)) { added.push(rec); continue; }
      const ar = a.get(id);
      const diffs = [];
      for (const f of fields) {
        if (JSON.stringify(ar[f]) !== JSON.stringify(rec[f])) {
          diffs.push({ field: f, before: ar[f], after: rec[f] });
        }
      }
      if (diffs.length) changed.push({ id, before: ar, after: rec, diffs });
    }
    for (const [id, rec] of a) {
      if (!b.has(id)) removed.push(rec);
    }
    return { added, removed, changed };
  }

  function diffSchools(a, b) {
    return {
      teachers:   diffEntities(a.teachers,   b.teachers,   ["name", "abbr", "color"]),
      classes:    diffEntities(a.classes,    b.classes,    ["name", "color"]),
      subjects:   diffEntities(a.subjects,   b.subjects,   ["name", "abbr", "color"]),
      classrooms: diffEntities(a.classrooms, b.classrooms, ["name", "abbr", "capacity"]),
      lessons:    diffEntities(a.lessons,    b.lessons,    ["subjectId", "teacherIds", "classIds", "periodsPerWeek"]),
      cards:      diffCards(a, b),
      summary: {
        a_name: a.schoolName || "(current)", b_name: b.schoolName || "(loaded)",
        a_cards: (a.cards || []).length, b_cards: (b.cards || []).length,
      },
    };
  }

  function diffCards(a, b) {
    // Cards are keyed by (lessonId, day, period). Movement = same lesson, different (day,period).
    const aKey = c => `${c.lessonId}|${c.day}|${c.period}`;
    const aMap = new Map((a.cards || []).map(c => [aKey(c), c]));
    const bMap = new Map((b.cards || []).map(c => [aKey(c), c]));
    const added = [], removed = [], moved = [];
    // Lessons in B but not in A at same slot → either added or moved
    for (const [k, c] of bMap) {
      if (aMap.has(k)) continue;
      // Check if same lesson moved
      const aCardForLesson = (a.cards || []).find(x => x.lessonId === c.lessonId);
      if (aCardForLesson && (aCardForLesson.day !== c.day || aCardForLesson.period !== c.period)) {
        moved.push({ lessonId: c.lessonId,
          from: { day: aCardForLesson.day, period: aCardForLesson.period },
          to:   { day: c.day, period: c.period } });
      } else {
        added.push(c);
      }
    }
    for (const [k, c] of aMap) if (!bMap.has(k)) removed.push(c);
    return { added, removed, moved };
  }

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false)
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function esc(s) { return String(s == null ? "" : s); }

  function showDiff(d) {
    const root = el("div", { class: "chrx-diff-root",
      onclick: e => { if (e.target === root) root.remove(); }, role: "dialog", "aria-modal": "true" });
    const panel = el("div", { class: "chrx-diff-panel" });
    panel.appendChild(el("header", null,
      el("h2", null, `🔍 Diff — ${esc(d.summary.a_name)} vs ${esc(d.summary.b_name)}`),
      el("button", { class: "chrx-diff-close", "aria-label": "Close", onclick: () => root.remove() }, "×"),
    ));
    panel.appendChild(el("div", { class: "chrx-diff-summary" },
      `${d.summary.a_cards} cards → ${d.summary.b_cards} cards. ` +
      `Teachers: +${d.teachers.added.length} -${d.teachers.removed.length} ~${d.teachers.changed.length}. ` +
      `Classes: +${d.classes.added.length} -${d.classes.removed.length}. ` +
      `Lessons: +${d.lessons.added.length} -${d.lessons.removed.length} ~${d.lessons.changed.length}. ` +
      `Cards: +${d.cards.added.length} -${d.cards.removed.length} moved=${d.cards.moved.length}.`
    ));

    function section(title, lines) {
      if (!lines.length) return null;
      const wrap = el("section");
      wrap.appendChild(el("h3", null, `${title} (${lines.length})`));
      const list = el("ul", { class: "chrx-diff-list" });
      lines.slice(0, 50).forEach(l => list.appendChild(el("li", null, l)));
      if (lines.length > 50) list.appendChild(el("li", { class: "chrx-diff-more" }, `… ${lines.length - 50} more`));
      wrap.appendChild(list);
      return wrap;
    }

    panel.appendChild(section("Teachers added", d.teachers.added.map(t => `+ ${esc(t.name)}`)));
    panel.appendChild(section("Teachers removed", d.teachers.removed.map(t => `- ${esc(t.name)}`)));
    panel.appendChild(section("Classes added", d.classes.added.map(c => `+ ${esc(c.name)}`)));
    panel.appendChild(section("Classes removed", d.classes.removed.map(c => `- ${esc(c.name)}`)));
    panel.appendChild(section("Subjects changed", d.subjects.changed.map(c => `~ ${esc(c.before.name)} → ${esc(c.after.name)}`)));
    panel.appendChild(section("Lessons added", d.lessons.added.map(l => `+ ${esc(l.subjectId)} × ${l.periodsPerWeek || 0}`)));
    panel.appendChild(section("Lessons removed", d.lessons.removed.map(l => `- ${esc(l.subjectId)} × ${l.periodsPerWeek || 0}`)));
    panel.appendChild(section("Cards moved", d.cards.moved.slice(0, 50).map(m =>
      `Lesson ${esc(m.lessonId.slice(0, 10))}: D${m.from.day + 1}P${m.from.period + 1} → D${m.to.day + 1}P${m.to.period + 1}`)));

    root.appendChild(panel);
    document.body.appendChild(root);
    ensureStyles();
  }

  function ensureStyles() {
    if (document.getElementById("chrx-diff-styles")) return;
    const s = document.createElement("style");
    s.id = "chrx-diff-styles";
    s.textContent = `
.chrx-diff-root{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px;z-index:1000;overflow:auto}
.chrx-diff-panel{background:#fff;border-radius:12px;max-width:900px;width:100%;padding:18px 22px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0f172a}
.chrx-diff-panel header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:12px}
.chrx-diff-panel h2{margin:0;font-size:18px;color:#1e3a8a}
.chrx-diff-close{background:none;border:0;font-size:22px;cursor:pointer;color:#64748b}
.chrx-diff-summary{background:#f1f5f9;padding:10px 14px;border-radius:8px;font-size:13px;line-height:1.5;color:#334155;margin-bottom:14px}
.chrx-diff-panel h3{margin:12px 0 4px;font-size:13px;color:#475569;text-transform:uppercase;letter-spacing:.04em}
.chrx-diff-list{margin:4px 0 12px 16px;font-size:13px;color:#1f2937;list-style:square}
.chrx-diff-list li{padding:2px 0}
.chrx-diff-more{color:#94a3b8;font-style:italic;list-style:none;margin-left:-16px}
    `;
    document.head.appendChild(s);
  }

  async function trigger() {
    if (!APP || !APP.school) { notify("Open a timetable first.", "error"); return; }
    if (!window.parseAscXml) { notify("XML parser not loaded.", "error"); return; }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xml";
    input.style.display = "none";
    input.onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      input.remove();
      if (!f) return;
      try {
        const other = await window.parseAscXml.parseFile(f);
        const d = diffSchools(APP.school, other);
        showDiff(d);
      } catch (err) {
        notify("Compare failed: " + err.message, "error");
      }
    };
    document.body.appendChild(input);
    input.click();
  }

  window.addEventListener("app:compare-with-file", trigger);
  APP.io = APP.io || {};
  APP.io.compareWithFile = trigger;
})();
