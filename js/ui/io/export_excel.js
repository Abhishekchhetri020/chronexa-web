/* Excel exports — Contracts / Available teachers / Room supervision / Timetable.
 * Uses SheetJS (window.XLSX). Index.html loads SheetJS via CDN.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;
  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat"];

  function need(name) {
    if (typeof window.XLSX === "undefined") {
      notify(name + " export needs SheetJS — check internet connection.", "error");
      return false;
    }
    if (!APP.school) { notify("Open a timetable first.", "error"); return false; }
    return true;
  }

  function save(wb, fname) {
    window.XLSX.writeFile(wb, fname);
    notify("Exported " + fname);
  }

  function sheet(rows) { return window.XLSX.utils.aoa_to_sheet(rows); }

  // ─── Contracts — teacher × (subject + class) period counts ───────────────
  function exportContracts() {
    if (!need("Contracts")) return;
    const s = APP.school;
    const teacherById = {}, subjectById = {}, classById = {};
    s.teachers.forEach(t => teacherById[t.id] = t);
    s.subjects.forEach(x => subjectById[x.id] = x);
    s.classes.forEach(c => classById[c.id] = c);

    // Aggregate periods per (teacher, subject, class)
    const agg = new Map();
    for (const l of (s.lessons || [])) {
      for (const tid of (l.teacherIds || [])) {
        for (const cid of (l.classIds || [])) {
          const k = tid + "|" + l.subjectId + "|" + cid;
          agg.set(k, (agg.get(k) || 0) + (l.periodsPerWeek || 0));
        }
      }
    }
    const rows = [["Teacher", "Subject", "Class", "Periods/week"]];
    [...agg.entries()].sort().forEach(([k, v]) => {
      const [tid, sid, cid] = k.split("|");
      rows.push([
        teacherById[tid]?.name || tid,
        subjectById[sid]?.name || sid,
        classById[cid]?.name || cid,
        v,
      ]);
    });
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, sheet(rows), "Contracts");
    save(wb, fileName(s, "contracts"));
  }

  // ─── Available teachers — day-by-day free/booked grid ────────────────────
  function exportAvailable() {
    if (!need("Available teachers")) return;
    const s = APP.school;
    const periods = s.bell?.periods || [];
    const head = ["Teacher", "Day"];
    periods.forEach(p => head.push("P" + p.index + " (" + p.label + ")"));
    const rows = [head];
    const cardsByTeacher = s._idx?.cardsByTeacher || {};
    for (const t of s.teachers) {
      for (let d = 0; d < DAYS.length; d++) {
        const row = [t.name, DAYS[d]];
        periods.forEach(p => {
          const hit = (cardsByTeacher[t.id] || []).some(c => c.day === d && c.period === p.index);
          row.push(hit ? "booked" : "free");
        });
        rows.push(row);
      }
    }
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, sheet(rows), "Available");
    save(wb, fileName(s, "available_teachers"));
  }

  // ─── Room supervision — room × day × period (teacher present?) ───────────
  function exportSupervision() {
    if (!need("Room supervision")) return;
    const s = APP.school;
    const periods = s.bell?.periods || [];
    const head = ["Room", "Day"];
    periods.forEach(p => head.push("P" + p.index));
    const rows = [head];
    const cardsByRoom = s._idx?.cardsByRoom || {};
    for (const r of s.classrooms) {
      for (let d = 0; d < DAYS.length; d++) {
        const row = [r.name, DAYS[d]];
        periods.forEach(p => {
          const hit = (cardsByRoom[r.id] || []).find(c => c.day === d && c.period === p.index);
          row.push(hit ? (hit.teachers || []).join(", ") : "");
        });
        rows.push(row);
      }
    }
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, sheet(rows), "RoomSupervision");
    save(wb, fileName(s, "room_supervision"));
  }

  // ─── Timetable — 5-sheet workbook (p4-w11). ──────────────────────────────
  //   1. Class Schedule    classes × days × periods (one big sheet, blocked)
  //   2. Teacher Schedule  teachers × days × periods
  //   3. Room Schedule     rooms × days × periods
  //   4. Lessons           flat lesson list with subject/teacher/class/etc.
  //   5. Statistics        per-teacher load + per-room utilisation + gaps
  function exportTimetable() {
    if (!need("Timetable")) return;
    const s = APP.school;
    const periods = s.bell?.periods || [];
    const wb = window.XLSX.utils.book_new();
    const totalSlots = DAYS.length * periods.length;

    // Resolver maps — used across multiple sheets.
    const tById = Object.fromEntries((s.teachers   || []).map(t => [t.id, t]));
    const sById = Object.fromEntries((s.subjects   || []).map(x => [x.id, x]));
    const cById = Object.fromEntries((s.classes    || []).map(c => [c.id, c]));
    const rById = Object.fromEntries((s.classrooms || []).map(r => [r.id, r]));

    // ── Sheet 1 — Class Schedule ───────────────────────────────────────────
    {
      const head = ["Class", "Day"];
      periods.forEach(p => head.push("P" + p.index + (p.label ? " " + p.label : "")));
      const rows = [head];
      const byClass = s._idx?.cardsByClass || {};
      for (const c of (s.classes || [])) {
        const list = byClass[c.id] || [];
        for (let d = 0; d < DAYS.length; d++) {
          const row = [c.name, DAYS[d]];
          for (const p of periods) {
            const card = list.find(x => x.day === d && x.period === p.index);
            row.push(card
              ? `${card.subjectAbbr || card.subject || ""}\n${(card.teachers || []).join(", ")}\n${card.classroom || ""}`.trim()
              : "");
          }
          rows.push(row);
        }
      }
      window.XLSX.utils.book_append_sheet(wb, sheet(rows), "Class Schedule");
    }

    // ── Sheet 2 — Teacher Schedule ─────────────────────────────────────────
    {
      const head = ["Teacher", "Day"];
      periods.forEach(p => head.push("P" + p.index));
      const rows = [head];
      const byTeacher = s._idx?.cardsByTeacher || {};
      for (const t of (s.teachers || [])) {
        const list = byTeacher[t.id] || [];
        for (let d = 0; d < DAYS.length; d++) {
          const row = [t.name + (t.abbr ? " (" + t.abbr + ")" : ""), DAYS[d]];
          for (const p of periods) {
            const card = list.find(x => x.day === d && x.period === p.index);
            row.push(card
              ? `${card.subjectAbbr || card.subject || ""}\n${(card.classes || []).join(",")}\n${card.classroom || ""}`.trim()
              : "");
          }
          rows.push(row);
        }
      }
      window.XLSX.utils.book_append_sheet(wb, sheet(rows), "Teacher Schedule");
    }

    // ── Sheet 3 — Room Schedule ────────────────────────────────────────────
    {
      const head = ["Room", "Day"];
      periods.forEach(p => head.push("P" + p.index));
      const rows = [head];
      const byRoom = s._idx?.cardsByRoom || {};
      for (const r of (s.classrooms || [])) {
        const list = byRoom[r.id] || [];
        for (let d = 0; d < DAYS.length; d++) {
          const row = [r.name, DAYS[d]];
          for (const p of periods) {
            const card = list.find(x => x.day === d && x.period === p.index);
            row.push(card
              ? `${card.subjectAbbr || card.subject || ""}\n${(card.teachers || []).join(",")}\n${(card.classes || []).join(",")}`.trim()
              : "");
          }
          rows.push(row);
        }
      }
      window.XLSX.utils.book_append_sheet(wb, sheet(rows), "Room Schedule");
    }

    // ── Sheet 4 — Lessons (flat) ───────────────────────────────────────────
    {
      const rows = [["#", "Subject", "Class(es)", "Teacher(s)", "Room pref.",
        "Per/wk", "Card count", "Lab×2", "Pinned"]];
      const cardCountByLesson = {};
      for (const card of (s.cards || [])) {
        cardCountByLesson[card.lessonId] = (cardCountByLesson[card.lessonId] || 0) + 1;
      }
      const sorted = (s.lessons || []).slice().sort((a, b) => {
        const sa = (sById[a.subjectId]?.name || "").localeCompare(sById[b.subjectId]?.name || "");
        if (sa) return sa;
        return (cById[a.classIds?.[0]]?.name || "").localeCompare(cById[b.classIds?.[0]]?.name || "");
      });
      sorted.forEach((l, idx) => {
        rows.push([
          idx + 1,
          sById[l.subjectId]?.name || l.subjectId || "",
          (l.classIds || []).map(id => cById[id]?.name || id).join(", "),
          (l.teacherIds || []).map(id => tById[id]?.name || id).join(", "),
          rById[l.preferredRoomId]?.name || l.preferredRoomId
            || (l.requiredRoomType ? "(" + l.requiredRoomType + ")" : ""),
          l.periodsPerWeek || 0,
          cardCountByLesson[l.id] || 0,
          l.isLabDouble ? "yes" : "",
          (l.fixedDay != null && l.fixedPeriod != null) ? ("D" + l.fixedDay + " P" + l.fixedPeriod) : "",
        ]);
      });
      window.XLSX.utils.book_append_sheet(wb, sheet(rows), "Lessons");
    }

    // ── Sheet 5 — Statistics ───────────────────────────────────────────────
    {
      const rows = [];
      rows.push(["Chronexa — Statistics", "", "", "", ""]);
      rows.push(["School", s.schoolName || "(unnamed)", "", "", ""]);
      rows.push(["Generated", new Date().toISOString(), "", "", ""]);
      rows.push(["Days × Periods", DAYS.length + " × " + periods.length,
        "Total weekly slots", totalSlots, ""]);
      rows.push([]);

      // Teacher load
      rows.push(["Teacher load", "", "", "", ""]);
      rows.push(["Teacher", "Abbr", "Periods/week", "Gaps/week", "Util %"]);
      const byTeacher = s._idx?.cardsByTeacher || {};
      for (const t of (s.teachers || [])) {
        const list = byTeacher[t.id] || [];
        let gaps = 0;
        for (let d = 0; d < DAYS.length; d++) {
          const ps = list.filter(x => x.day === d).map(x => x.period).sort((a, b) => a - b);
          for (let i = 1; i < ps.length; i++) gaps += (ps[i] - ps[i - 1] - 1);
        }
        const util = totalSlots ? Math.round(100 * list.length / totalSlots) : 0;
        rows.push([t.name, t.abbr || "", list.length, gaps, util + "%"]);
      }
      rows.push([]);

      // Room utilisation
      rows.push(["Room utilisation", "", "", "", ""]);
      rows.push(["Room", "Sessions/week", "Util %", "", ""]);
      const byRoom = s._idx?.cardsByRoom || {};
      for (const r of (s.classrooms || [])) {
        const n = (byRoom[r.id] || []).length;
        const util = totalSlots ? Math.round(100 * n / totalSlots) : 0;
        rows.push([r.name, n, util + "%", "", ""]);
      }
      rows.push([]);

      // Totals
      rows.push(["Counts", "", "", "", ""]);
      rows.push(["Teachers",   (s.teachers   || []).length, "", "", ""]);
      rows.push(["Classes",    (s.classes    || []).length, "", "", ""]);
      rows.push(["Classrooms", (s.classrooms || []).length, "", "", ""]);
      rows.push(["Subjects",   (s.subjects   || []).length, "", "", ""]);
      rows.push(["Lessons",    (s.lessons    || []).length, "", "", ""]);
      rows.push(["Cards",      (s.cards      || []).length, "", "", ""]);

      window.XLSX.utils.book_append_sheet(wb, sheet(rows), "Statistics");
    }

    save(wb, fileName(s, "timetable"));
  }

  function fileName(s, kind) {
    const base = (s._meta?.sourceFilename || s.schoolName || "chronexa").replace(/\.xml$/i, "");
    return base + "-" + kind + ".xlsx";
  }

  window.addEventListener("app:export-excel", (e) => {
    switch (e.detail?.kind) {
      case "contracts":   return exportContracts();
      case "available":   return exportAvailable();
      case "supervision": return exportSupervision();
      case "timetable":   return exportTimetable();
      default:            notify("Unknown export: " + e.detail?.kind, "error");
    }
  });

  APP.io = APP.io || {};
  APP.io.exportContracts   = exportContracts;
  APP.io.exportAvailable   = exportAvailable;
  APP.io.exportSupervision = exportSupervision;
  APP.io.exportTimetable   = exportTimetable;
})();
