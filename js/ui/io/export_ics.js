/* Calendar (ICS) exporter — emits a single .ics that recurs weekly so any
 * teacher / student / parent can subscribe in Google Calendar, Apple
 * Calendar, Outlook, etc.
 *
 * Trigger: window dispatchEvent("app:export-ics", { detail: { kind, id? } }).
 *   kind = "all"      → every card in the school (default if no detail)
 *   kind = "class"    → cards for one class (detail.id = classId)
 *   kind = "teacher"  → cards for one teacher (detail.id = teacherId)
 *
 * Output: <schoolName>-<scope>.ics download.
 *
 * Time math: anchor on the upcoming Monday at the school's local timezone
 * (defaults to floating time — no TZID, calendars treat the times as
 * local-to-the-viewer). Each card becomes one VEVENT with FREQ=WEEKLY,
 * COUNT=40 (one academic year).
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;
  const DAYS_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat"];

  function need() {
    if (!APP.school) { notify("Open a timetable first.", "error"); return false; }
    if (!(APP.school.cards || []).length) { notify("No placed cards to export.", "error"); return false; }
    return true;
  }

  // ── Date helpers ──────────────────────────────────────────────────────────
  function nextMonday(now) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();                     // 0=Sun..6=Sat
    const delta = (8 - dow) % 7 || 7;          // days until next Monday (always future)
    d.setDate(d.getDate() + delta);
    return d;
  }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function fmtLocal(d) {
    // ICS local time: YYYYMMDDTHHMMSS (no Z = floating)
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
  }
  function fmtUtc(d) {
    return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
  }
  function escIcs(s) {
    // RFC 5545: backslash, comma, semicolon, newline must be escaped.
    return String(s == null ? "" : s)
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }
  function fold(line) {
    // RFC 5545 line folding: 75-octet limit, continuation = CRLF + space.
    if (line.length <= 75) return line;
    const parts = [line.slice(0, 75)];
    for (let i = 75; i < line.length; i += 74) parts.push(" " + line.slice(i, i + 74));
    return parts.join("\r\n");
  }

  // ── Indexers ──────────────────────────────────────────────────────────────
  function indexes(school) {
    return {
      lessonById:   Object.fromEntries((school.lessons   || []).map(l => [l.id, l])),
      subjectById:  Object.fromEntries((school.subjects  || []).map(s => [s.id, s])),
      teacherById:  Object.fromEntries((school.teachers  || []).map(t => [t.id, t])),
      classById:    Object.fromEntries((school.classes   || []).map(c => [c.id, c])),
      roomById:     Object.fromEntries((school.classrooms|| []).map(r => [r.id, r])),
    };
  }

  function cardMatchesScope(card, lesson, scope, scopeId) {
    if (scope === "all") return true;
    if (scope === "class")   return (lesson.classIds   || []).includes(scopeId);
    if (scope === "teacher") return (lesson.teacherIds || []).includes(scopeId);
    return false;
  }

  function periodTimes(school, periodIndex1Based) {
    // c.period is 1-based (matches p.index); look up by index, not array slot.
    const periods = (school.bell && school.bell.periods) || [];
    const p = periods.find(pp => (pp.index | 0) === (periodIndex1Based | 0));
    if (!p) return null;
    return { startMin: p.startMin | 0, endMin: p.endMin | 0 };
  }

  // ── Main export ───────────────────────────────────────────────────────────
  function exportIcs(scope, scopeId) {
    if (!need()) return;
    const s = APP.school;
    const idx = indexes(s);
    const monday = nextMonday(new Date());
    const stamp = fmtUtc(new Date());
    const COUNT = 40; // academic year (term × terms-per-year ≈ 40 weeks)

    let scopeLabel = "all";
    if (scope === "class")   scopeLabel = (idx.classById[scopeId]?.short || idx.classById[scopeId]?.name || "class");
    if (scope === "teacher") scopeLabel = (idx.teacherById[scopeId]?.short || idx.teacherById[scopeId]?.name || "teacher");

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Chronexa//Timetable Export//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escIcs(s.schoolName || "Chronexa")} — ${escIcs(scopeLabel)}`,
    ];

    let emitted = 0;
    for (const c of (s.cards || [])) {
      const lesson = idx.lessonById[c.lessonId] || idx.lessonById[String(c.lessonId).replace(/#\d+$/, "")];
      if (!lesson) continue;
      if (!cardMatchesScope(c, lesson, scope, scopeId)) continue;
      const pt = periodTimes(s, c.period | 0);
      if (!pt) continue;
      if (c.day < 0 || c.day > 5) continue;

      const start = new Date(monday);
      start.setDate(start.getDate() + (c.day | 0));
      start.setHours(0, (pt.startMin | 0), 0, 0);
      const end = new Date(monday);
      end.setDate(end.getDate() + (c.day | 0));
      end.setHours(0, (pt.endMin | 0), 0, 0);

      const subj = idx.subjectById[lesson.subjectId];
      const cls  = (lesson.classIds || []).map(cid => idx.classById[cid]?.short || idx.classById[cid]?.name || cid).join(", ");
      const tch  = (lesson.teacherIds || []).map(tid => idx.teacherById[tid]?.short || idx.teacherById[tid]?.name || tid).join(", ");
      const room = c.classroomId ? (idx.roomById[c.classroomId]?.short || idx.roomById[c.classroomId]?.name || "") : "";

      const summaryParts = [];
      if (subj) summaryParts.push(subj.short || subj.name);
      if (cls)  summaryParts.push(cls);
      if (room) summaryParts.push(room);
      const summary = summaryParts.join(" · ") || "Class";

      const descParts = [];
      if (tch)  descParts.push("Teacher: " + tch);
      if (subj?.name) descParts.push("Subject: " + subj.name);
      const description = descParts.join("\n");

      const uid = `${c.lessonId || "card"}-d${c.day}-p${c.period}@chronexa`;

      lines.push("BEGIN:VEVENT");
      lines.push(fold("UID:" + uid));
      lines.push("DTSTAMP:" + stamp);
      lines.push("DTSTART:" + fmtLocal(start));
      lines.push("DTEND:"   + fmtLocal(end));
      lines.push(fold("SUMMARY:" + escIcs(summary)));
      if (description) lines.push(fold("DESCRIPTION:" + escIcs(description)));
      if (room) lines.push(fold("LOCATION:" + escIcs(room)));
      lines.push(`RRULE:FREQ=WEEKLY;COUNT=${COUNT};BYDAY=${["MO","TU","WE","TH","FR","SA"][c.day | 0]}`);
      lines.push("END:VEVENT");
      emitted++;
    }

    lines.push("END:VCALENDAR");
    if (emitted === 0) {
      notify("No cards matched the export scope.", "error");
      return;
    }

    const ics = lines.join("\r\n") + "\r\n";
    const safe = (s.schoolName || "chronexa").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "chronexa";
    const scopeSafe = String(scopeLabel).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "all";
    const fname = `${safe}-${scopeSafe}.ics`;

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    notify(`Exported ${fname} — ${emitted} event${emitted === 1 ? "" : "s"} recurring weekly × ${COUNT}.`);
  }

  window.addEventListener("app:export-ics", (e) => {
    const d = e.detail || {};
    exportIcs(d.kind || "all", d.id || null);
  });

  APP.io = APP.io || {};
  APP.io.exportIcs = exportIcs;
})();
