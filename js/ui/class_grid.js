/**
 * Step 3 — Class Grid. Rows = sections, cols = day×period.
 */
window.ClassGrid = (function () {
  "use strict";
  function render(host) {
    const S = window.APP.school;
    if (!S) {
      host.innerHTML = `<div class="text-sm text-slate-500">${I18N.t("needXml")}</div>`;
      return;
    }
    GridView.render(host, {
      viewId: "class",
      rowHeader: I18N.t("statClasses"),
      rows: S.classes.map(c => ({
        id: c.id,
        label: c.name,
        sublabel: classTeacherLabel(S, c.id),
      })),
      periods: S.bell.periods,
      cellEntries: (rowId, day, period) => filterEntries(S._idx.cardsByClass[rowId], day, period),
      rowSearchText: (row) => `${row.label} ${row.sublabel || ""}`,
      cellSearchText: (e) => `${e.subject} ${e.subjectAbbr} ${e.teachers.join(" ")} ${e.classroom}`,
      onCellClick: (entry, rowId) => Inspector.open(entry, { context: "class", rowId }),
    });
  }
  function classTeacherLabel(S, classId) {
    const cls = S.classes.find(c => c.id === classId);
    if (!cls) return "";
    // The parser stripped _teacherId off the canonical record; look up in _idx
    const teacherId = (S._idx.classById[classId] || {})._teacherId;
    if (!teacherId) return "";
    const t = S._idx.teacherById[teacherId];
    return t ? t.name : "";
  }
  function filterEntries(entries, day, period) {
    if (!entries) return [];
    return entries.filter(e => e.day === day && e.period === period);
  }
  return { render };
})();
