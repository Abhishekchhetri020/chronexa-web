/**
 * Step 4 — Teacher Grid. Rows = teachers, cols = day×period.
 */
window.TeacherGrid = (function () {
  "use strict";
  function render(host) {
    const S = window.APP.school;
    if (!S) {
      host.innerHTML = `<div class="text-sm text-slate-500">${I18N.t("needXml")}</div>`;
      return;
    }
    // Sort teachers alphabetically by name (numerals/honorifics stripped for sort key)
    const teachers = S.teachers.slice().sort((a, b) =>
      sortKey(a.name).localeCompare(sortKey(b.name)));

    GridView.render(host, {
      viewId: "teacher",
      rowHeader: I18N.t("statTeachers"),
      rows: teachers.map(t => ({ id: t.id, label: t.name })),
      periods: S.bell.periods,
      cellEntries: (rowId, day, period) =>
        (S._idx.cardsByTeacher[rowId] || []).filter(e => e.day === day && e.period === period)
          .map(e => ({
            ...e,
            // For the teacher view, show the class instead of the teacher in the cell body
            teachers: e.classes.slice(),
          })),
      rowSearchText: (row) => row.label,
      cellSearchText: (e) => `${e.subject} ${e.subjectAbbr} ${e.teachers.join(" ")} ${e.classroom}`,
      onCellClick: (entry, rowId) => Inspector.open(entry, { context: "teacher", rowId }),
    });
  }
  function sortKey(name) {
    return (name || "").replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, "").toLowerCase();
  }
  return { render };
})();
