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

  // ── Smart-grid helpers (aSc parity+) ──────────────────────────────────────

  // Total weekly load per teacher id = Σ periodsPerWeek of every lesson they
  // teach. Shown beside each teacher in the assignment dropdown so the admin
  // balances workload as they assign (aSc shows the bare number; we add a bar).
  function teacherLoadMap(school) {
    const m = Object.create(null);
    for (const l of (school.lessons || [])) {
      const n = l.periodsPerWeek || 0;
      for (const tid of (l.teacherIds || [])) m[tid] = (m[tid] || 0) + n;
    }
    return m;
  }

  // Periods a full week can hold = periodsPerDay × daysPerWeek. The per-class Σ
  // should reach this; short = red, over = red.
  function requiredPeriods(school) {
    const ppd = (school.bell && Array.isArray(school.bell.periods))
      ? school.bell.periods.length
      : (school.periodsPerDay | 0) || 8;
    const days = Math.max(1, Math.min(6, (school.daysPerWeek | 0) || 6));
    return ppd * days;
  }

  // Parallel-elective detection without a formal division model: two lessons of
  // the SAME class whose placed cards land in the SAME {day,period} run in
  // parallel for different groups (Sanskrit|Urdu). They must be counted ONCE in
  // the class total (the star rule), not summed. Returns a Set of lessonIds that
  // are "secondary" (already represented by another lesson in their parallel
  // group) so the row total skips them, plus a Set of ALL parallel lessonIds
  // (to render the star).
  function parallelInfo(school) {
    const cards = school.cards || [];
    const byClassSlot = new Map();         // `${classId}@${d}_${p}` → [lessonId,…]
    const lessonById = Object.create(null);
    for (const l of (school.lessons || [])) lessonById[l.id] = l;
    for (const c of cards) {
      const l = lessonById[c.lessonId];
      if (!l) continue;
      for (const cid of (l.classIds || [])) {
        const k = cid + "@" + c.day + "_" + c.period;
        (byClassSlot.get(k) || byClassSlot.set(k, []).get(k)).push(c.lessonId);
      }
    }
    const starred = new Set();             // any lesson that shares a slot
    const secondary = new Set();           // skip in the row sum
    for (const ids of byClassSlot.values()) {
      const uniq = [...new Set(ids)];
      if (uniq.length >= 2) {
        uniq.forEach(id => starred.add(id));
        uniq.slice(1).forEach(id => secondary.add(id));  // keep first, skip rest
      }
    }
    return { starred, secondary };
  }

  function open(school) {
    school = school || (window.APP && window.APP.school);
    if (!school) { (window._chrxNotify || console.log)("Open a timetable first.", "error"); return; }
    ensureStyles();

    const classes = school.classes || [];
    const subjects = school.subjects || [];
    const teachers = school.teachers || [];
    if (!classes.length || !subjects.length) {
      (window._chrxNotify || console.log)("Add classes and subjects first.", "warn"); return;
    }

    const required = requiredPeriods(school);
    let loadMap = teacherLoadMap(school);
    const { starred, secondary } = parallelInfo(school);
    let selected = null;            // { classId, subjectId }

    // Track whether the user changed anything so close-without-save can warn.
    let dirty = false;
    function tryClose() {
      if (!dirty || confirm("Discard changes to the lesson matrix?")) root.remove();
    }
    const root = el("div", { class: "chrx-matrix-root",
      onclick: e => { if (e.target === root) tryClose(); } });
    const panel = el("div", { class: "chrx-matrix-panel" });

    panel.appendChild(el("header", null,
      el("h2", null, `📋 Lessons matrix — type weekly counts`),
      el("button", { class: "chrx-matrix-close", "aria-label": "Close", onclick: tryClose }, "×"),
    ));
    panel.appendChild(el("div", { class: "chrx-matrix-hint" },
      "Type a number to set the weekly count. Click a cell to assign its teacher. Red number = no teacher yet. ★ = parallel elective (counted once). Σ shows class total / capacity."));

    // Selection bar (aSc-style): shows the clicked cell and its teacher picker
    // with live per-teacher load.
    const selBar = el("div", { class: "chrx-matrix-selbar" });
    panel.appendChild(selBar);
    renderSelBar();

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
          onfocus: () => selectCell(c.id, s.id),
          oninput: e => {
            dirty = true;
            e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
            updateRowTotal(c.id); paintCell(td, c.id, s.id);
          },
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
        const td = el("td", { class: "chrx-matrix-cell", "data-class": c.id, "data-subject": s.id }, input);
        tr.appendChild(td);
        paintCell(td, c.id, s.id);
      });
      tr.appendChild(el("td", { class: "chrx-matrix-rowtotal", "data-class": c.id }, "0"));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    panel.appendChild(wrap);

    panel.appendChild(el("footer", null,
      el("button", { class: "chrx-matrix-cancel", onclick: tryClose }, "Cancel"),
      el("button", { class: "chrx-matrix-save", onclick: save }, "💾 Save matrix"),
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
        if (!v) return;
        const lesson = findLesson(school, classId, s.id);
        // Parallel electives (Sanskrit|Urdu) share a slot → count ONCE: skip the
        // secondary lesson(s) so the class total isn't double-counted.
        if (lesson && secondary.has(lesson.id)) return;
        total += v;
      });
      const cell = panel.querySelector(`.chrx-matrix-rowtotal[data-class="${classId}"]`);
      if (cell) {
        cell.textContent = `${total}/${required}`;
        cell.classList.toggle("is-bad", total !== required);
      }
    }
    classes.forEach(c => updateRowTotal(c.id));

    // Paint one cell's teacher colour strip, red "no-teacher" state, and ★.
    function paintCell(td, classId, subjectId) {
      const v = parseInt(cellMap.get(classId + "_" + subjectId)?.value || "0", 10) || 0;
      const lesson = findLesson(school, classId, subjectId);
      const tids = (lesson && lesson.teacherIds) || [];
      const t = tids.length ? teachers.find(x => x.id === tids[0]) : null;
      td.style.boxShadow = t && t.color ? `inset 4px 0 0 ${t.color}` : "";
      td.classList.toggle("is-short", v > 0 && tids.length === 0);
      let star = td.querySelector(".chrx-matrix-star");
      const isStar = !!(lesson && starred.has(lesson.id));
      if (isStar && !star) td.appendChild(el("span", { class: "chrx-matrix-star" }, "★"));
      else if (!isStar && star) star.remove();
    }

    function selectCell(classId, subjectId) {
      selected = { classId, subjectId };
      panel.querySelectorAll("td.chrx-matrix-cell.is-selected")
        .forEach(td => td.classList.remove("is-selected"));
      const td = panel.querySelector(
        `td.chrx-matrix-cell[data-class="${classId}"][data-subject="${subjectId}"]`);
      if (td) td.classList.add("is-selected");
      renderSelBar();
    }

    function renderSelBar() {
      selBar.innerHTML = "";
      if (!selected) {
        selBar.appendChild(el("span", { class: "chrx-matrix-selhint" },
          "Click a cell to assign its teacher — the dropdown shows each teacher's current load."));
        return;
      }
      const c = classes.find(x => x.id === selected.classId);
      const s = subjects.find(x => x.id === selected.subjectId);
      const lesson = findLesson(school, selected.classId, selected.subjectId);
      selBar.appendChild(el("span", { class: "chrx-matrix-sellabel" },
        `${(s && s.name) || "?"} · ${(c && c.name) || "?"}`));
      const sel = el("select", { class: "chrx-matrix-teachersel",
        onchange: e => assignTeacher(e.target.value) });
      sel.appendChild(el("option", { value: "" }, "— no teacher —"));
      const curr = (lesson && (lesson.teacherIds || [])[0]) || "";
      teachers.slice()
        .sort((a, b) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0))
        .forEach(t => {
          const opt = el("option", { value: t.id },
            `${t.name || t.abbr || "?"}  ·  ${loadMap[t.id] || 0} pd/wk`);
          if (t.id === curr) opt.selected = true;
          sel.appendChild(opt);
        });
      selBar.appendChild(sel);
      if (!lesson) selBar.appendChild(el("span", { class: "chrx-matrix-selnote" },
        "type a weekly count first, then pick a teacher"));
    }

    function assignTeacher(tid) {
      if (!selected) return;
      let lesson = findLesson(school, selected.classId, selected.subjectId);
      const input = cellMap.get(selected.classId + "_" + selected.subjectId);
      const v = parseInt((input && input.value) || "0", 10) || 0;
      if (!lesson) {
        if (v <= 0) { renderSelBar(); return; }
        lesson = { id: "L_" + Math.random().toString(36).slice(2, 8),
          subjectId: selected.subjectId, teacherIds: [], classIds: [selected.classId],
          periodsPerWeek: v, durationPeriods: 1 };
        school.lessons.push(lesson);
      }
      lesson.teacherIds = tid ? [tid] : [];
      dirty = true;
      loadMap = teacherLoadMap(school);   // loads shift → refresh dropdown numbers
      const td = panel.querySelector(
        `td.chrx-matrix-cell[data-class="${selected.classId}"][data-subject="${selected.subjectId}"]`);
      if (td) paintCell(td, selected.classId, selected.subjectId);
      renderSelBar();
    }

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
.chrx-matrix-cell{position:relative}
.chrx-matrix-cell.is-selected{outline:2px solid #2563eb;outline-offset:-2px;z-index:1}
.chrx-matrix-cell.is-short input{color:#dc2626;font-weight:700}
.chrx-matrix-star{position:absolute;top:0;right:1px;font-size:8px;line-height:1;color:#b45309;pointer-events:none}
.chrx-matrix-rowtotal{white-space:nowrap}
.chrx-matrix-rowtotal.is-bad{color:#dc2626}
.chrx-matrix-selbar{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;min-height:38px;flex-wrap:wrap}
.chrx-matrix-selhint{color:#64748b;font-size:12px}
.chrx-matrix-sellabel{font-weight:700;color:#1e3a8a;font-size:13px}
.chrx-matrix-teachersel{padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;font-family:inherit;min-width:220px;background:#fff;cursor:pointer}
.chrx-matrix-selnote{color:#b45309;font-size:11px}
    `;
    document.head.appendChild(s);
  }

  // Wire to event
  window.addEventListener("app:lessons-matrix", () => open());

  global.LessonsGridMatrix = { open };
})(window);
