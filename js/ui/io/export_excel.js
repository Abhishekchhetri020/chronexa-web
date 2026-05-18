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

  // ─── Timetable — one sheet per class (day rows × period cols) ────────────
  function exportTimetable() {
    if (!need("Timetable")) return;
    const s = APP.school;
    const periods = s.bell?.periods || [];
    const wb = window.XLSX.utils.book_new();
    const cardsByClass = s._idx?.cardsByClass || {};
    for (const c of s.classes) {
      const head = ["Day"]; periods.forEach(p => head.push("P" + p.index + " " + p.label));
      const rows = [head];
      for (let d = 0; d < DAYS.length; d++) {
        const row = [DAYS[d]];
        for (const p of periods) {
          const card = (cardsByClass[c.id] || []).find(x => x.day === d && x.period === p.index);
          row.push(card ? `${card.subjectAbbr || card.subject}\n${(card.teachers || []).join(",")}\n${card.classroom || ""}` : "");
        }
        rows.push(row);
      }
      const name = c.name.slice(0, 31).replace(/[\\/?*[\]]/g, "_");
      window.XLSX.utils.book_append_sheet(wb, sheet(rows), name);
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
