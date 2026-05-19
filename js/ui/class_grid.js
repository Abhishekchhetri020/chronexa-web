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
    // Header bar with CRUD entry point
    const bar = document.createElement("div");
    bar.className = "flex items-center justify-between mb-3 gap-2 flex-wrap";
    bar.innerHTML = `
      <div class="text-sm text-slate-600">${(S.classes || []).length} class(es).</div>
      <div class="flex gap-2">
        <button data-act="manage" class="px-3 py-1.5 rounded bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800">📋 Manage classes…</button>
        <button data-act="add" class="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700">+ Add class</button>
      </div>`;
    host.innerHTML = "";
    host.appendChild(bar);
    bar.querySelector('[data-act="manage"]').onclick = () => window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind: "classes" } }));
    bar.querySelector('[data-act="add"]').onclick = () => {
      window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind: "classes" } }));
      setTimeout(() => { const newBtn = document.querySelector('.chrx-entity-dialog [data-act="new"], .chrx-entity-dialog button[title="New"]'); if (newBtn) newBtn.click(); }, 120);
    };
    const gridHost = document.createElement("div");
    host.appendChild(gridHost);
    if (!(S.classes || []).length) {
      gridHost.innerHTML = `<div class="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500">
        <div class="text-3xl mb-2">📭</div>
        <div class="text-sm">No classes yet. Click <strong>+ Add class</strong> above to create your first one.</div>
      </div>`;
      return;
    }
    GridView.render(gridHost, {
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
