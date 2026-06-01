/* Standalone HTML exporter — generates a self-contained HTML file with the
 * full timetable embedded (no external deps, no JS, just print-friendly HTML
 * + CSS). Schools email this to teachers / parents / website.
 *
 * Ports Swift's ClassicHTMLExporter.swift. Triggered via `app:export-html` event.
 * Output filename derives from school.schoolName.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }

  function buildClassGrid(school, classRow) {
    const periods = (school.bell && school.bell.periods) || [];
    const cards = school.cards || [];
    const lessonById = (school._idx && school._idx.lessonById) ||
      Object.fromEntries((school.lessons || []).map(l => [l.id, l]));
    const subjectById = (school._idx && school._idx.subjectById) ||
      Object.fromEntries((school.subjects || []).map(s => [s.id, s]));
    const teacherById = (school._idx && school._idx.teacherById) ||
      Object.fromEntries((school.teachers || []).map(t => [t.id, t]));
    const roomById = (school._idx && school._idx.classroomById) ||
      Object.fromEntries((school.classrooms || []).map(r => [r.id, r]));

    const grid = Array.from({ length: 6 }, () => Array(periods.length).fill(null));
    for (const c of cards) {
      const lesson = lessonById[c.lessonId];
      if (!lesson) continue;
      if (!(lesson.classIds || []).includes(classRow.id)) continue;
      // card.period is 1-based (per DATA_SHAPES + parse_timetable_xml.js);
      // grid columns are 0-based. Without this -1 the first period rendered
      // as the second column and the last period was silently dropped.
      const pIdx = (c.period | 0) - 1;
      if (c.day >= 6 || pIdx < 0 || pIdx >= periods.length) continue;
      const subj = subjectById[lesson.subjectId] || {};
      const teachers = (lesson.teacherIds || []).map(t => teacherById[t]?.short || teacherById[t]?.name || "—").join(", ");
      const room = c.classroomId ? (roomById[c.classroomId]?.short || roomById[c.classroomId]?.name || "") : "";
      grid[c.day][pIdx] = { subject: subj.short || subj.name || "?", color: subj.color || "#94a3b8", teachers, room };
    }

    let html = `<h2>${esc(classRow.name || classRow.short)}</h2><table class="tt">`;
    html += `<thead><tr><th>Day</th>${periods.map((p, i) => `<th>P${i + 1}</th>`).join("")}</tr></thead><tbody>`;
    for (let d = 0; d < 6; d++) {
      html += `<tr><th class="day">${DAYS[d]}</th>`;
      for (let p = 0; p < periods.length; p++) {
        const c = grid[d][p];
        if (c) {
          html += `<td class="cell" style="background:${esc(c.color)}22;border-left:4px solid ${esc(c.color)}"><div class="subj">${esc(c.subject)}</div><div class="meta">${esc(c.teachers)}</div>${c.room ? `<div class="room">${esc(c.room)}</div>` : ""}</td>`;
        } else {
          html += `<td class="cell empty"></td>`;
        }
      }
      html += "</tr>";
    }
    html += "</tbody></table>";
    return html;
  }

  function buildHTML(school) {
    const classes = school.classes || [];
    const title = `${school.schoolName || "Timetable"} — ${new Date().toLocaleDateString()}`;
    const body = classes.map(c => buildClassGrid(school, c)).join("\n");

    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1e293b; margin: 24px; }
  h1 { color: #1e3a8a; margin-bottom: 8px; }
  h2 { color: #1e3a8a; margin-top: 28px; border-bottom: 2px solid #cbd5e1; padding-bottom: 4px; }
  table.tt { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; page-break-inside: avoid; }
  table.tt th, table.tt td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
  table.tt thead th { background: #f1f5f9; color: #475569; font-size: 11px; text-transform: uppercase; }
  table.tt th.day { background: #f8fafc; font-weight: 600; width: 8%; }
  table.tt td.cell { min-height: 36px; }
  table.tt td.empty { background: repeating-linear-gradient(45deg, #fafafa, #fafafa 4px, #f1f5f9 4px, #f1f5f9 8px); }
  .subj { font-weight: 700; color: #0f172a; }
  .meta { color: #475569; font-size: 11px; margin-top: 2px; }
  .room { color: #94a3b8; font-size: 10px; font-style: italic; }
  @media print {
    body { margin: 12mm; }
    h1 { font-size: 18pt; }
    h2 { font-size: 14pt; page-break-before: auto; }
    table.tt { font-size: 9pt; }
  }
  .footer { text-align: center; color: #94a3b8; margin-top: 40px; font-size: 11px; }
</style>
</head><body>
<h1>${esc(school.schoolName || "Timetable")}</h1>
<p style="color:#64748b">Exported ${esc(new Date().toLocaleString())} · Chronexa Web</p>
${body}
<div class="footer">Generated by Chronexa Web — open browser timetable. https://abhishekchhetri020.github.io/chronexa-web/</div>
</body></html>`;
  }

  function exportHTML() {
    const school = APP.school;
    if (!school) { notify("Open a timetable first.", "error"); return; }
    const html = buildHTML(school);
    const base = (school._meta?.sourceFilename || school.schoolName || "chronexa").replace(/\.xml$/i, "");
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = base + ".html";
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    notify("Exported " + base + ".html");
  }

  window.addEventListener("app:export-html", exportHTML);
  APP.io = APP.io || {};
  APP.io.exportHTML = exportHTML;
  APP.io.buildHtmlExport = buildHTML;
})();
