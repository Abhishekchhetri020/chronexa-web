/**
 * Step 5 — Room Grid. Rows = classrooms, cols = day×period.
 *
 * Most ASC class slots don't have a `classroomids` (home-room model — class
 * sits in its own room). To make this view useful we *also* show, when a
 * classroom is empty, the home-class that owns it via the `classes.classroomids`
 * back-reference (when populated). Otherwise the row stays sparse — that's
 * fine; the special rooms (Science Lab, Art Room, Maths Lab, Music, MP Hall,
 * Language Room, Activity Room) are exactly what this view is for.
 */
window.RoomGrid = (function () {
  "use strict";
  function render(host) {
    const S = window.APP.school;
    if (!S) {
      host.innerHTML = `<div class="text-sm text-slate-500">${I18N.t("needXml")}</div>`;
      return;
    }
    GridView.render(host, {
      viewId: "room",
      rowHeader: I18N.t("statRooms"),
      rows: S.classrooms.map(r => ({ id: r.id, label: r.name })),
      periods: S.bell.periods,
      cellEntries: (rowId, day, period) =>
        (S._idx.cardsByRoom[rowId] || []).filter(e => e.day === day && e.period === period)
          .map(e => ({
            ...e,
            // For the room view, cell line 2 = the class, line 3 = teacher
            teachers: e.classes.slice(),
            classroom: e.teachers.join(", "),
          })),
      rowSearchText: (row) => row.label,
      cellSearchText: (e) => `${e.subject} ${e.subjectAbbr} ${e.classes.join(" ")} ${e.teachers.join(" ")}`,
      onCellClick: (entry, rowId) => Inspector.open(entry, { context: "room", rowId }),
    });
  }
  return { render };
})();
