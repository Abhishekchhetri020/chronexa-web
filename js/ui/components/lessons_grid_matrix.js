/* Lessons grid matrix editor — bulk-entry class×subject weekly count.
 *
 * Ports Swift's LessonGridMatrix.swift. School admin opens a matrix where
 * rows = classes, columns = subjects, each cell = weekly lesson count.
 * Type a number → create/update lesson row. Empty cell → delete lesson.
 *
 * This is 10× faster than the per-lesson dialog when setting up a new
 * school: a typical class has 6-9 subjects, GDGPSD has 23 classes ×
 * 44 subjects = 1,012 cells to consider. The matrix surfaces all of
 * them in one view.
 *
 * window.LessonsGridMatrix.open(school?) — modal grid editor.
 */
(function (global) {
  "use strict";

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

  function findLesson(school, classId, subjectId) {
    return (school.lessons || []).find(l =>
      (l.classIds || []).includes(classId) && l.subjectId === subjectId);
  }

  function open(school) {
    school = school || (window.APP && window.APP.school);
    if (!school) { (window._chrxNotify || console.log)("Open a timetable first.", "error"); return; }
    ensureStyles();

    const classes = school.classes || [];
    const subjects = school.subjects || [];
    if (!classes.length || !subjects.length) {
      (window._chrxNotify || console.log)("Add classes and subjects first.", "warn"); return;
    }

    const root = el("div", { class: "chrx-matrix-root",
      onclick: e => { if (e.target === root) root.remove(); } });
    const panel = el("div", { class: "chrx-matrix-panel" });

    panel.appendChild(el("header", null,
      el("h2", null, `📋 Lessons matrix — type weekly counts (Ctrl+S to save)`),
      el("button", { class: "chrx-matrix-close", "aria-label": "Close", onclick: () => root.remove() }, "×"),
    ));
    panel.appendChild(el("div", { class: "chrx-matrix-hint" },
      "Type a number to set weekly lesson count. Blank = no lesson. Click subject header to set defaults."));

    const wrap = el("div", { class: "chrx-matrix-wrap" });
    const tbl = el("table", { class: "chrx-matrix-table" });
    // Header
    const headRow = el("tr");
    headRow.appendChild(el("th", { class: "chrx-matrix-corner" }, "Class \\ Subject"));
    subjects.forEach(s => {
      const th = el("th", { class: "chrx-matrix-subhead", style: s.color ? `border-bottom:3px solid ${s.color}` : "" },
        s.short || s.name?.slice(0, 6) || "?");
      th.title = s.name;
      headRow.appendChild(th);
    });
    headRow.appendChild(el("th", { class: "chrx-matrix-rowtotal" }, "Σ"));
    tbl.appendChild(el("thead", null, headRow));

    const tbody = el("tbody");
    const cellMap = new Map(); // key = `${classId}_${subjectId}` → input
    classes.forEach(c => {
      const tr = el("tr");
      tr.appendChild(el("td", { class: "chrx-matrix-classhead", style: c.color ? `border-left:4px solid ${c.color}` : "" },
        c.name || c.short || "?"));
      subjects.forEach(s => {
        const lesson = findLesson(school, c.id, s.id);
        const count = lesson ? (lesson.periodsPerWeek || 0) : "";
        const input = el("input", { type: "text", inputmode: "numeric",
          value: String(count), maxlength: "2",
          oninput: e => { e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 2); updateRowTotal(c.id); },
          onkeydown: e => {
            if (e.key === "Tab") return;
            if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); moveCell(c.id, s.id, 1, 0); }
            if (e.key === "ArrowLeft") { e.preventDefault(); moveCell(c.id, s.id, -1, 0); }
            if (e.key === "ArrowDown") { e.preventDefault(); moveCell(c.id, s.id, 0, 1); }
            if (e.key === "ArrowUp") { e.preventDefault(); moveCell(c.id, s.id, 0, -1); }
            if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
          },
        });
        cellMap.set(c.id + "_" + s.id, input);
        tr.appendChild(el("td", { class: "chrx-matrix-cell" }, input));
      });
      tr.appendChild(el("td", { class: "chrx-matrix-rowtotal", "data-class": c.id }, "0"));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    panel.appendChild(wrap);

    panel.appendChild(el("footer", null,
      el("button", { class: "chrx-matrix-save", onclick: save }, "💾 Save matrix"),
      el("button", { class: "chrx-matrix-cancel", onclick: () => root.remove() }, "Cancel"),
    ));

    root.appendChild(panel);
    document.body.appendChild(root);

    function moveCell(classId, subjectId, dx, dy) {
      const ci = classes.findIndex(x => x.id === classId);
      const si = subjects.findIndex(x => x.id === subjectId);
      const ni = Math.max(0, Math.min(classes.length - 1, ci + dy));
      const nj = Math.max(0, Math.min(subjects.length - 1, si + dx));
      const next = cellMap.get(classes[ni].id + "_" + subjects[nj].id);
      next?.focus();
      next?.select();
    }

    function updateRowTotal(classId) {
      let total = 0;
      subjects.forEach(s => {
        const v = parseInt(cellMap.get(classId + "_" + s.id)?.value || "0", 10) || 0;
        total += v;
      });
      const cell = panel.querySelector(`[data-class="${classId}"]`);
      if (cell) cell.textContent = String(total);
    }
    classes.forEach(c => updateRowTotal(c.id));

    function save() {
      let added = 0, updated = 0, removed = 0;
      classes.forEach(c => subjects.forEach(s => {
        const input = cellMap.get(c.id + "_" + s.id);
        const v = parseInt(input?.value || "0", 10) || 0;
        const existing = findLesson(school, c.id, s.id);
        if (v > 0 && !existing) {
          school.lessons.push({
            id: "L_" + Math.random().toString(36).slice(2, 8),
            subjectId: s.id, teacherIds: [], classIds: [c.id],
            periodsPerWeek: v, durationPeriods: 1,
          });
          added++;
        } else if (v > 0 && existing && existing.periodsPerWeek !== v) {
          existing.periodsPerWeek = v;
          updated++;
        } else if (v === 0 && existing) {
          const idx = school.lessons.indexOf(existing);
          if (idx >= 0) school.lessons.splice(idx, 1);
          removed++;
        }
      }));
      if (window.CreateNew?.refreshIndex) window.CreateNew.refreshIndex();
      if (window.APP?.audit?.append) window.APP.audit.append({ entity: "lessons", op: "matrix-save", added, updated, removed });
      (window._chrxNotify || console.log)(`📋 Matrix saved · +${added} new · ~${updated} updated · -${removed} removed`);
      root.remove();
    }
  }

  function ensureStyles() {
    if (document.getElementById("chrx-matrix-styles")) return;
    const s = document.createElement("style");
    s.id = "chrx-matrix-styles";
    s.textContent = `
.chrx-matrix-root{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:18px;z-index:1000;overflow:auto}
.chrx-matrix-panel{background:#fff;border-radius:12px;width:min(1200px,98vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0f172a}
.chrx-matrix-panel header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e2e8f0}
.chrx-matrix-panel h2{margin:0;font-size:16px;color:#1e3a8a}
.chrx-matrix-close{background:none;border:0;font-size:22px;cursor:pointer;color:#64748b}
.chrx-matrix-hint{padding:6px 16px;background:#fef9c3;color:#854d0e;font-size:12px;border-bottom:1px solid #fde68a}
.chrx-matrix-wrap{flex:1;overflow:auto;padding:0 12px 12px}
.chrx-matrix-table{border-collapse:collapse;font-size:11px}
.chrx-matrix-table th,.chrx-matrix-table td{border:1px solid #e2e8f0;padding:0;text-align:center}
.chrx-matrix-corner{position:sticky;left:0;top:0;z-index:3;background:#1e3a8a;color:#fff;font-weight:600;font-size:11px;padding:6px 8px;white-space:nowrap;min-width:120px;text-align:left}
.chrx-matrix-subhead{position:sticky;top:0;z-index:2;background:#f1f5f9;color:#1e3a8a;font-weight:600;padding:6px 4px;writing-mode:vertical-rl;text-orientation:mixed;min-width:24px;height:80px}
.chrx-matrix-classhead{position:sticky;left:0;z-index:1;background:#f8fafc;font-weight:600;padding:4px 8px;text-align:left;white-space:nowrap;min-width:120px}
.chrx-matrix-cell{background:#fff}
.chrx-matrix-cell input{width:36px;height:24px;border:0;text-align:center;font-size:12px;font-family:inherit;background:transparent;outline:none}
.chrx-matrix-cell input:focus{background:#dbeafe}
.chrx-matrix-rowtotal{background:#f1f5f9;font-weight:600;color:#475569;padding:4px 8px;font-size:11px;min-width:24px}
.chrx-matrix-panel footer{display:flex;justify-content:flex-end;gap:8px;padding:10px 16px;border-top:1px solid #e2e8f0}
.chrx-matrix-save{background:#10b981;color:#fff;border:0;padding:6px 16px;border-radius:6px;font-weight:600;cursor:pointer}
.chrx-matrix-cancel{background:#fff;color:#0f172a;border:1px solid #cbd5e1;padding:6px 16px;border-radius:6px;cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  // Wire to event
  window.addEventListener("app:lessons-matrix", () => open());

  global.LessonsGridMatrix = { open };
})(window);
