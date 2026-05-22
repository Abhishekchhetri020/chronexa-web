/* StudentSubjects (elective enrollment) — window.EntityStudentSubjects.open()
 * Audit §15.2. Maps student → subjects they take when those subjects aren't
 * automatic from their class (i.e. electives, seminar groups, language
 * choices). Stored on school.studentSubjects as
 * { id, studentId, subjectId, group?, term? }.
 *
 * The dialog is a row-per-enrollment list. For schools without electives
 * this entity stays empty — the bundled class lesson assignment already
 * covers the common case.
 */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function ensure() {
    const s = window.APP.school = window.APP.school || {};
    if (!Array.isArray(s.studentSubjects)) s.studentSubjects = [];
    return s.studentSubjects;
  }
  function studentMap() {
    const m = {};
    ((window.APP.school?.students) || []).forEach(st => m[st.id] = st);
    return m;
  }
  function subjectMap() {
    return window.APP.school?._idx?.subjectById || {};
  }

  function rows() {
    const stM = studentMap();
    const sbM = subjectMap();
    return ensure().map(e => ({
      id: e.id,
      student: stM[e.studentId]
        ? ((stM[e.studentId].firstName || "") + " " + (stM[e.studentId].lastName || "")).trim()
        : e.studentId,
      subject: sbM[e.subjectId]?.name || e.subjectId,
      group: e.group || "",
      term: e.term || "",
      _ref: e,
    }));
  }

  function columns() {
    return [
      { key: "student", label: "Student" },
      { key: "subject", label: "Subject" },
      { key: "group",   label: "Group" },
      { key: "term",    label: "Term" },
    ];
  }

  function openEdit(r) {
    const isNew = !r;
    const draft = isNew
      ? { studentId: "", subjectId: "", group: "", term: "" }
      : { studentId: r._ref.studentId, subjectId: r._ref.subjectId,
          group: r._ref.group || "", term: r._ref.term || "" };

    function selectFrom(list, key, label) {
      const sel = D.el("select", null, D.el("option", { value: "" }, "—"));
      (list || []).forEach(o => {
        const opt = D.el("option", { value: o.id }, label(o));
        if (o.id === draft[key]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", e => draft[key] = e.target.value);
      return sel;
    }

    D.buildEditSheet({
      title: isNew ? "New enrollment" : "Edit enrollment",
      fields: [
        { label: "Student", control: selectFrom(window.APP.school?.students || [], "studentId",
            o => ((o.firstName || "") + " " + (o.lastName || "")).trim()) },
        { label: "Subject", control: selectFrom(window.APP.school?.subjects || [], "subjectId",
            o => o.name + (o.abbr ? ` (${o.abbr})` : "")) },
        { label: "Group",   control: D.el("input", { type: "text", value: draft.group,
            placeholder: "(optional, e.g. Boys / Girls)",
            oninput: e => draft.group = e.target.value }) },
        { label: "Term",    control: selectFrom(window.APP.school?.terms || [], "term",
            o => o.name) },
      ],
      onSave: () => {
        const all = ensure();
        if (!draft.studentId || !draft.subjectId) return false;
        if (!isNew) {
          Object.assign(r._ref, draft);
          window.APP.audit.append({ entity: "studentSubjects", op: "update", after: { ...r._ref } });
        } else {
          const ne = Object.assign({ id: D.uid("ss") }, draft);
          all.push(ne);
          window.APP.audit.append({ entity: "studentSubjects", op: "add", after: { ...ne } });
        }
        D.closeSheet();
        D.refresh(rows());
        return true;
      },
    });
  }

  function open() {
    D.open({
      entity: "studentSubjects", title: "Student elective enrollment",
      columns: columns(), rows: rows(),
      extras: [],
      onRowOpen: openEdit,
      onAdd: () => openEdit(null),
      onDelete: (r) => {
        const list = ensure();
        const i = list.findIndex(x => x.id === r.id);
        if (i !== -1) {
          const removed = list[i];
          list.splice(i, 1);
          window.APP.audit.append({ entity: "studentSubjects", op: "remove", before: { ...removed } });
        }
        D.refresh(rows());
      },
    });
  }

  global.EntityStudentSubjects = { open };
})(window);
