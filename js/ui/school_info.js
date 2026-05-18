/**
 * Step 2 — School Info: summary cards + bell preview from the parsed XML.
 */
window.SchoolInfo = (function () {
  "use strict";
  const t = (k) => I18N.t(k);

  function render(host) {
    const S = window.APP.school;
    host.innerHTML = "";
    if (!S) {
      host.innerHTML = `<div class="text-sm text-slate-500">${t("needXml")}</div>`;
      return;
    }

    const stats = [
      [t("statSchool"),  S.schoolName || "—"],
      [t("statTeachers"),  S._meta.counts.teachers],
      [t("statClasses"),   S._meta.counts.classes],
      [t("statSubjects"),  S._meta.counts.subjects],
      [t("statRooms"),     S._meta.counts.classrooms],
      [t("statLessons"),   S._meta.counts.lessons],
      [t("statCards"),     S._meta.counts.cards],
      [t("statPeriods"),   S._meta.counts.periods],
    ];

    const cards = stats.map(([k, v]) => `
      <div class="bg-white rounded-lg shadow-sm border border-slate-200 px-4 py-3">
        <div class="text-xs uppercase tracking-wide text-slate-500">${k}</div>
        <div class="text-lg font-semibold text-slate-900 mt-1 truncate" title="${escapeHtml(String(v))}">${escapeHtml(String(v))}</div>
      </div>`).join("");

    const periodRows = S.bell.periods.map(p => `
      <tr>
        <td class="px-3 py-1.5 font-medium">${escapeHtml(p.label)}</td>
        <td class="px-3 py-1.5 text-right tabular-nums">${fmtTime(p.startMin)}</td>
        <td class="px-3 py-1.5 text-right tabular-nums">${fmtTime(p.endMin)}</td>
        <td class="px-3 py-1.5 text-right tabular-nums">${(p.endMin - p.startMin)} min</td>
      </tr>`).join("");

    host.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">${cards}</div>
      <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div class="px-4 py-2 bg-slate-100 border-b border-slate-200 text-sm font-semibold text-slate-700">
          Bell schedule (from XML)
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-slate-500 text-xs uppercase">
              <th class="px-3 py-2 text-left">Period</th>
              <th class="px-3 py-2 text-right">Start</th>
              <th class="px-3 py-2 text-right">End</th>
              <th class="px-3 py-2 text-right">Duration</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">${periodRows}</tbody>
        </table>
      </div>
    `;
  }

  function fmtTime(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  return { render };
})();
