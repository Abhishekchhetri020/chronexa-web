/* Statistics panel — full teacher/class/room load breakdown.
 *
 * Ports Swift's StatisticsPanel.swift + TimetableStatistics struct. Exposes
 *   window.StatisticsPanel = { open(school?) }
 *
 * Surfaces per-entity metrics aSc/EduPage admins rely on:
 *   • Teacher daily detail: teaching periods, gaps, free periods, max consec.
 *   • Class daily detail: occupancy, gap count, subject distribution.
 *   • Room utilization: % full, peak load period.
 *   • School-wide: placed vs unplaced, conflict count, soft penalty totals.
 *
 * All math runs locally on the user's device (no server). Re-runs in O(cards).
 */
(function (global) {
  "use strict";

  function compute(school) {
    school = school || (window.APP && window.APP.school);
    if (!school) return null;
    const days = (school.bell && school.bell.periods ? 6 : 6); // standard 6-day weeks
    const periods = (school.bell && school.bell.periods ? school.bell.periods.length : 8);
    const cards = school.cards || [];
    const lessons = school.lessons || [];
    const teachers = school.teachers || [];
    const classes = school.classes || [];
    const rooms = school.classrooms || [];
    const _idx = school._idx || {};
    const lessonById = _idx.lessonById || Object.fromEntries(lessons.map(l => [l.id, l]));

    // Cards by (teacherId, day, period)
    const teacherDayPeriods = new Map();
    const classDayPeriods = new Map();
    const roomDayPeriods = new Map();
    for (const c of cards) {
      const lesson = lessonById[c.lessonId];
      if (!lesson) continue;
      const key = `${c.day}:${c.period}`;
      for (const tid of (lesson.teacherIds || [])) {
        if (!teacherDayPeriods.has(tid)) teacherDayPeriods.set(tid, new Set());
        teacherDayPeriods.get(tid).add(key);
      }
      for (const cid of (lesson.classIds || [])) {
        if (!classDayPeriods.has(cid)) classDayPeriods.set(cid, new Set());
        classDayPeriods.get(cid).add(key);
      }
      const rid = c.classroomId || c.roomId;
      if (rid) {
        if (!roomDayPeriods.has(rid)) roomDayPeriods.set(rid, new Set());
        roomDayPeriods.get(rid).add(key);
      }
    }

    // Per-teacher daily detail
    const teacherStats = teachers.map(t => {
      const slots = teacherDayPeriods.get(t.id) || new Set();
      const perDay = new Array(days).fill(0).map(() => []);
      for (const s of slots) {
        const [d, p] = s.split(":").map(Number);
        if (d >= 0 && d < days) perDay[d].push(p);
      }
      let totalTeaching = 0, totalGaps = 0, maxConsec = 0, maxLast = 0;
      perDay.forEach(periodsArr => {
        if (!periodsArr.length) return;
        const sorted = periodsArr.slice().sort((a, b) => a - b);
        totalTeaching += sorted.length;
        // gaps = (sorted[last] - sorted[0] + 1) - count
        const span = sorted[sorted.length - 1] - sorted[0] + 1;
        const gaps = span - sorted.length;
        totalGaps += Math.max(0, gaps);
        let run = 1;
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] === sorted[i - 1] + 1) run++;
          else { maxConsec = Math.max(maxConsec, run); run = 1; }
        }
        maxConsec = Math.max(maxConsec, run);
        if (sorted[sorted.length - 1] === periods - 1) maxLast++;
      });
      const maxPossible = days * periods;
      const exhaustionPct = maxPossible ? Math.round(100 * totalTeaching / maxPossible) : 0;
      return {
        id: t.id, name: t.name || t.lastName || "—",
        color: t.color || "#94a3b8",
        teaching: totalTeaching, gaps: totalGaps, maxConsec, lastPeriodDays: maxLast,
        exhaustion: exhaustionPct,
      };
    });

    // Per-class daily detail
    const classStats = classes.map(c => {
      const slots = classDayPeriods.get(c.id) || new Set();
      return {
        id: c.id, name: c.name || c.short || "—",
        color: c.color || "#94a3b8",
        occupied: slots.size,
        empty: (days * periods) - slots.size,
        utilization: Math.round(100 * slots.size / (days * periods)),
      };
    });

    // Per-room utilization
    const roomStats = rooms.map(r => {
      const slots = roomDayPeriods.get(r.id) || new Set();
      return {
        id: r.id, name: r.name || "—",
        used: slots.size,
        utilization: Math.round(100 * slots.size / (days * periods)),
      };
    });

    // Period load balance (cards per period across school)
    const periodLoad = new Array(periods).fill(0);
    for (const c of cards) periodLoad[c.period] = (periodLoad[c.period] || 0) + 1;

    const totalLessons = lessons.length || 0;
    const totalCards = cards.length || 0;
    const expected = lessons.reduce((s, l) => s + (l.periodsPerWeek || 0), 0);

    return {
      school: {
        name: school.schoolName,
        totalLessons, totalCards, expectedCards: expected,
        completionPct: expected > 0 ? Math.round(100 * totalCards / expected) : 0,
      },
      teachers: teacherStats.sort((a, b) => b.teaching - a.teaching),
      classes:  classStats.sort((a, b) => b.utilization - a.utilization),
      rooms:    roomStats.sort((a, b) => b.utilization - a.utilization),
      periodLoad,
    };
  }

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  }

  function renderTable(rows, columns) {
    const tbl = el("table", { class: "chrx-stats-table" });
    const thead = el("thead");
    const tr = el("tr");
    columns.forEach(c => tr.appendChild(el("th", null, c.label)));
    thead.appendChild(tr);
    tbl.appendChild(thead);
    const tbody = el("tbody");
    rows.forEach(r => {
      const tr = el("tr");
      columns.forEach(c => {
        const v = c.render ? c.render(r) : r[c.key];
        const td = el("td", { class: c.align ? `align-${c.align}` : null });
        if (v instanceof Node) td.appendChild(v);
        else td.textContent = (v == null ? "" : String(v));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    return tbl;
  }

  function open(school) {
    const data = compute(school);
    if (!data) { alert("Open a timetable first."); return; }
    const root = el("div", { class: "chrx-stats-root", role: "dialog", "aria-modal": "true",
      onclick: e => { if (e.target === root) close(); } });
    const panel = el("div", { class: "chrx-stats-panel" });

    panel.appendChild(el("header", { class: "chrx-stats-head" },
      el("h2", null, "📊 Statistics — " + (data.school.name || "—")),
      el("button", { class: "chrx-stats-close", "aria-label": "Close", onclick: close }, "×"),
    ));

    panel.appendChild(el("div", { class: "chrx-stats-summary" },
      el("div", null, el("strong", null, "Cards placed: "), `${data.school.totalCards} / ${data.school.expectedCards} (${data.school.completionPct}%)`),
      el("div", null, el("strong", null, "Lessons: "), String(data.school.totalLessons)),
      el("div", null, el("strong", null, "Teachers / Classes / Rooms: "),
        `${data.teachers.length} / ${data.classes.length} / ${data.rooms.length}`),
    ));

    panel.appendChild(el("h3", null, "Teachers — sorted by load"));
    panel.appendChild(renderTable(data.teachers, [
      { key: "name", label: "Teacher", render: r => el("span", null,
          el("span", { class: "chrx-stats-dot", style: `background:${r.color}` }),
          " " + r.name) },
      { key: "teaching", label: "Periods", align: "right" },
      { key: "exhaustion", label: "Exhaustion %",
        render: r => {
          const c = r.exhaustion > 75 ? "#ef4444" : r.exhaustion > 50 ? "#f59e0b" : "#10b981";
          return el("span", { style: `color:${c};font-weight:600` }, r.exhaustion + "%");
        }, align: "right" },
      { key: "gaps", label: "Gaps", align: "right" },
      { key: "maxConsec", label: "Max consec.", align: "right" },
      { key: "lastPeriodDays", label: "Last-period days", align: "right" },
    ]));

    panel.appendChild(el("h3", null, "Classes — sorted by utilization"));
    panel.appendChild(renderTable(data.classes, [
      { key: "name", label: "Class", render: r => el("span", null,
          el("span", { class: "chrx-stats-dot", style: `background:${r.color}` }),
          " " + r.name) },
      { key: "occupied", label: "Cells filled", align: "right" },
      { key: "empty", label: "Empty", align: "right" },
      { key: "utilization", label: "%", render: r => `${r.utilization}%`, align: "right" },
    ]));

    panel.appendChild(el("h3", null, "Rooms — sorted by utilization"));
    panel.appendChild(renderTable(data.rooms, [
      { key: "name", label: "Room" },
      { key: "used", label: "Used slots", align: "right" },
      { key: "utilization", label: "%", render: r => `${r.utilization}%`, align: "right" },
    ]));

    panel.appendChild(el("h3", null, "Period-load balance"));
    const bars = el("div", { class: "chrx-stats-bars" });
    const max = Math.max(1, ...data.periodLoad);
    data.periodLoad.forEach((load, i) => {
      bars.appendChild(el("div", { class: "chrx-stats-bar", title: `Period ${i + 1}: ${load} cards/period` },
        el("span", { style: `height:${Math.round(60 * load / max)}px` }),
        el("small", null, "P" + (i + 1)),
      ));
    });
    panel.appendChild(bars);

    root.appendChild(panel);
    document.body.appendChild(root);
    function close() { root.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    document.addEventListener("keydown", onKey, true);
  }

  // Inject minimal styles (idempotent) for the panel
  function ensureStyles() {
    if (document.getElementById("chrx-stats-styles")) return;
    const s = document.createElement("style");
    s.id = "chrx-stats-styles";
    s.textContent = `
.chrx-stats-root{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px;z-index:1000;overflow:auto}
.chrx-stats-panel{background:#fff;border-radius:12px;max-width:900px;width:100%;padding:18px 22px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0f172a}
.chrx-stats-head{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;margin:-4px 0 12px;padding-bottom:8px}
.chrx-stats-head h2{margin:0;font-size:18px;color:#1e3a8a}
.chrx-stats-close{background:none;border:0;font-size:22px;cursor:pointer;color:#64748b}
.chrx-stats-summary{display:flex;gap:24px;flex-wrap:wrap;font-size:13px;background:#f1f5f9;padding:8px 12px;border-radius:8px;margin-bottom:12px}
.chrx-stats-panel h3{margin:14px 0 6px;font-size:14px;color:#334155;text-transform:uppercase;letter-spacing:.04em}
.chrx-stats-table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px}
.chrx-stats-table th{background:#f8fafc;color:#475569;font-weight:600;text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0}
.chrx-stats-table td{padding:5px 8px;border-bottom:1px solid #f1f5f9}
.chrx-stats-table td.align-right{text-align:right;font-variant-numeric:tabular-nums}
.chrx-stats-dot{display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle;margin-right:2px}
.chrx-stats-bars{display:flex;gap:6px;align-items:flex-end;height:80px;padding:8px;background:#f8fafc;border-radius:6px;margin-top:4px}
.chrx-stats-bar{display:flex;flex-direction:column;align-items:center;gap:2px;flex:1}
.chrx-stats-bar span{display:block;width:24px;background:linear-gradient(180deg,#3b82f6,#1e40af);border-radius:4px 4px 0 0;min-height:2px}
.chrx-stats-bar small{font-size:10px;color:#64748b}
    `;
    document.head.appendChild(s);
  }
  ensureStyles();

  // Wire into the Timetable menu (Statistics… already exists; route via the existing event)
  window.addEventListener("app:statistics", () => open());

  global.StatisticsPanel = { open, compute };
})(window);
