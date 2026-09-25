// [vite-esm] imports
import "../state.js";

/**
 * CSV Exporter — exports timetable data as RFC 4180 compliant CSV.
 * Supports whole school, single class, single teacher, or single room scope.
 */
const APP = (typeof window !== "undefined" ? window.APP : null) || {};
const notify = (typeof window !== "undefined" && window._chrxNotify) || console.log;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function escCsv(s) {
  if (s == null) return "";
  const str = String(s);
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function minToTime(m) {
  if (m == null || m < 0) return "";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

function indexes(school) {
  return {
    lessonById:  Object.fromEntries((school.lessons    || []).map(l => [l.id, l])),
    subjectById: Object.fromEntries((school.subjects   || []).map(s => [s.id, s])),
    teacherById: Object.fromEntries((school.teachers   || []).map(t => [t.id, t])),
    classById:   Object.fromEntries((school.classes    || []).map(c => [c.id, c])),
    roomById:    Object.fromEntries((school.classrooms || []).map(r => [r.id, r])),
  };
}

function resolveCard(c, school, idx) {
  const lesson = idx.lessonById[c.lessonId] || idx.lessonById[String(c.lessonId).replace(/#\d+$/, "")] || {};
  const subj = idx.subjectById[lesson.subjectId] || {};
  const teachers = (lesson.teacherIds || []).map(id => idx.teacherById[id]?.name || id).join("; ");
  const classes = (lesson.classIds || []).map(id => idx.classById[id]?.name || id).join("; ");
  const room = c.classroomId ? (idx.roomById[c.classroomId]?.name || c.classroomId) : "";
  const periods = school.bell?.periods || [];
  const p = periods.find(pp => (pp.index | 0) === (c.period | 0)) || { index: c.period };
  const startTime = minToTime(p.startMin);
  const endTime = minToTime(p.endMin);

  return {
    dayIdx: c.day,
    dayName: DAYS[c.day] || ("Day " + (c.day + 1)),
    period: c.period,
    periodLabel: p.label ? `P${p.index} (${p.label})` : `P${p.index}`,
    startTime,
    endTime,
    subjectName: subj.name || lesson.subjectId || "",
    subjectAbbr: subj.abbr || subj.short || subj.name || "",
    teachers,
    classes,
    room,
    lesson,
    card: c,
  };
}

export function buildCsvExport(school, scope = { type: "all" }) {
  if (!school) return "";
  const idx = indexes(school);
  const periods = (school.bell?.periods || []).slice().sort((a, b) => a.index - b.index);
  const allCards = school.cards || [];
  const resolvedCards = allCards.map(c => resolveCard(c, school, idx));

  const scopeType = typeof scope === "string" ? scope : (scope.type || "all");
  const scopeId = typeof scope === "object" ? scope.id : arguments[2];

  const lines = [];

  if (scopeType === "class" && scopeId) {
    const cls = idx.classById[scopeId] || { name: scopeId };
    lines.push(escCsv(`Timetable: ${cls.name}`));
    lines.push("");

    // 1. Grid
    const gridHeader = ["Day", ...periods.map(p => {
      const time = p.startMin != null && p.endMin != null ? ` (${minToTime(p.startMin)}-${minToTime(p.endMin)})` : "";
      return `P${p.index}${time}`;
    })];
    lines.push(gridHeader.map(escCsv).join(","));

    const classCards = resolvedCards.filter(rc => (rc.lesson.classIds || []).includes(scopeId));
    for (let d = 0; d < 6; d++) {
      const row = [DAYS[d]];
      for (const p of periods) {
        const hit = classCards.find(rc => rc.dayIdx === d && rc.period === p.index);
        if (hit) {
          const parts = [hit.subjectName];
          if (hit.teachers) parts.push(hit.teachers);
          if (hit.room) parts.push(hit.room);
          row.push(parts.join(" · "));
        } else {
          row.push("");
        }
      }
      lines.push(row.map(escCsv).join(","));
    }

    lines.push("");
    lines.push(escCsv("Detailed Lessons"));
    lines.push(["Day", "Period", "Start", "End", "Class", "Subject", "Teacher", "Room"].map(escCsv).join(","));
    classCards.sort((a, b) => (a.dayIdx - b.dayIdx) || (a.period - b.period));
    for (const rc of classCards) {
      lines.push([rc.dayName, rc.period, rc.startTime, rc.endTime, rc.classes, rc.subjectName, rc.teachers, rc.room].map(escCsv).join(","));
    }
  } else if (scopeType === "teacher" && scopeId) {
    const t = idx.teacherById[scopeId] || { name: scopeId };
    lines.push(escCsv(`Teacher: ${t.name}`));
    lines.push("");

    const gridHeader = ["Day", ...periods.map(p => `P${p.index}`)];
    lines.push(gridHeader.map(escCsv).join(","));

    const teacherCards = resolvedCards.filter(rc => (rc.lesson.teacherIds || []).includes(scopeId));
    for (let d = 0; d < 6; d++) {
      const row = [DAYS[d]];
      for (const p of periods) {
        const hit = teacherCards.find(rc => rc.dayIdx === d && rc.period === p.index);
        if (hit) {
          const parts = [hit.subjectName];
          if (hit.classes) parts.push(hit.classes);
          if (hit.room) parts.push(hit.room);
          row.push(parts.join(" · "));
        } else {
          row.push("");
        }
      }
      lines.push(row.map(escCsv).join(","));
    }

    lines.push("");
    lines.push(escCsv("Detailed Lessons"));
    lines.push(["Day", "Period", "Start", "End", "Class", "Subject", "Teacher", "Room"].map(escCsv).join(","));
    teacherCards.sort((a, b) => (a.dayIdx - b.dayIdx) || (a.period - b.period));
    for (const rc of teacherCards) {
      lines.push([rc.dayName, rc.period, rc.startTime, rc.endTime, rc.classes, rc.subjectName, rc.teachers, rc.room].map(escCsv).join(","));
    }
  } else if (scopeType === "room" && scopeId) {
    const r = idx.roomById[scopeId] || { name: scopeId };
    lines.push(escCsv(`Room: ${r.name}`));
    lines.push("");

    const gridHeader = ["Day", ...periods.map(p => `P${p.index}`)];
    lines.push(gridHeader.map(escCsv).join(","));

    const roomCards = resolvedCards.filter(rc => rc.card.classroomId === scopeId || rc.lesson.preferredRoomId === scopeId);
    for (let d = 0; d < 6; d++) {
      const row = [DAYS[d]];
      for (const p of periods) {
        const hit = roomCards.find(rc => rc.dayIdx === d && rc.period === p.index);
        if (hit) {
          const parts = [hit.subjectName];
          if (hit.teachers) parts.push(hit.teachers);
          if (hit.classes) parts.push(hit.classes);
          row.push(parts.join(" · "));
        } else {
          row.push("");
        }
      }
      lines.push(row.map(escCsv).join(","));
    }

    lines.push("");
    lines.push(escCsv("Detailed Lessons"));
    lines.push(["Day", "Period", "Start", "End", "Class", "Subject", "Teacher", "Room"].map(escCsv).join(","));
    roomCards.sort((a, b) => (a.dayIdx - b.dayIdx) || (a.period - b.period));
    for (const rc of roomCards) {
      lines.push([rc.dayName, rc.period, rc.startTime, rc.endTime, rc.classes, rc.subjectName, rc.teachers, rc.room].map(escCsv).join(","));
    }
  } else {
    // Whole school list
    lines.push(["Day", "Period", "Start", "End", "Class", "Subject", "Teacher", "Room"].map(escCsv).join(","));
    const sorted = resolvedCards.slice().sort((a, b) => (a.dayIdx - b.dayIdx) || (a.period - b.period) || (a.classes || "").localeCompare(b.classes || ""));
    for (const rc of sorted) {
      lines.push([rc.dayName, rc.period, rc.startTime, rc.endTime, rc.classes, rc.subjectName, rc.teachers, rc.room].map(escCsv).join(","));
    }
  }

  return lines.join("\r\n") + "\r\n";
}

export function exportCsv(scope = { type: "all" }) {
  const school = (typeof window !== "undefined" && window.APP && window.APP.school) || APP.school;
  if (!school) { notify("Open a timetable first.", "error"); return; }
  const scopeType = typeof scope === "string" ? scope : (scope.type || "all");
  const scopeId = typeof scope === "object" ? scope.id : arguments[1];

  const csv = buildCsvExport(school, { type: scopeType, id: scopeId });
  const base = (school._meta?.sourceFilename || school.schoolName || "chronexa").replace(/\.xml$/i, "").replace(/[^\w.-]+/g, "-");
  let suffix = "all";
  if (scopeType === "class" && scopeId) {
    const c = (school.classes || []).find(x => x.id === scopeId);
    suffix = (c?.short || c?.name || scopeId).replace(/[^\w.-]+/g, "-");
  } else if (scopeType === "teacher" && scopeId) {
    const t = (school.teachers || []).find(x => x.id === scopeId);
    suffix = (t?.short || t?.name || scopeId).replace(/[^\w.-]+/g, "-");
  } else if (scopeType === "room" && scopeId) {
    const r = (school.classrooms || []).find(x => x.id === scopeId);
    suffix = (r?.short || r?.name || scopeId).replace(/[^\w.-]+/g, "-");
  }

  const filename = `${base}-${suffix}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  notify("Exported " + filename);
  return filename;
}

if (typeof window !== "undefined") {
  window.APP = window.APP || {};
  window.APP.io = window.APP.io || {};
  window.APP.io.buildCsvExport = buildCsvExport;
  window.APP.io.exportCsv = exportCsv;
  window.addEventListener("app:export-csv", (e) => {
    exportCsv(e.detail?.scope || e.detail || { type: "all" });
  });
}
