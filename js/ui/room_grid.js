/**
 * Step 5 — Room Grid. Rows = classrooms, cols = day×period.
 *
 * Most CLASSIC class slots don't have a `classroomids` (home-room model — class
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
    // Header bar with CRUD entry point
    host.innerHTML = "";
    const bar = document.createElement("div");
    bar.className = "flex items-center justify-between mb-3 gap-2 flex-wrap";
    bar.innerHTML = `
      <div class="text-sm text-slate-600">${(S.classrooms || []).length} room(s).</div>
      <div class="flex gap-2">
        <button data-act="manage" class="px-3 py-1.5 rounded bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800">📋 Manage rooms…</button>
        <button data-act="add" class="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">+ Add room</button>
      </div>`;
    host.appendChild(bar);
    bar.querySelector('[data-act="manage"]').onclick = () => window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind: "classrooms" } }));
    bar.querySelector('[data-act="add"]').onclick = () => {
      window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind: "classrooms" } }));
      setTimeout(() => { const newBtn = document.querySelector('.chrx-entity-dialog [data-act="new"], .chrx-entity-dialog button[title="New"]'); if (newBtn) newBtn.click(); }, 120);
    };
    const gridHost = document.createElement("div");
    host.appendChild(gridHost);
    if (!(S.classrooms || []).length) {
      gridHost.innerHTML = `<div class="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500">
        <div class="text-3xl mb-2">📭</div>
        <div class="text-sm">No rooms yet. Click <strong>+ Add room</strong> above to create your first one.</div>
      </div>`;
      return;
    }
    GridView.render(gridHost, {
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
