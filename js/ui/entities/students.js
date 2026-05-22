/* Students CRUD dialog — window.EntityStudents.open() (audit §15.1).
 *
 * Individual student records. Each entry: { id, firstName, lastName, classId,
 * grade, gender, dob, email, parentEmail, notes }. Stored on
 * window.APP.school.students. Used by StudentSubjects (elective enrollment)
 * and by the Grades dialog for per-class roster export.
 *
 * Light dialog — primary use case is rostering rather than analytics. Schools
 * that need full SIS features should pair Chronexa with a dedicated SIS.
 * Chronexa's job is to give the timetable tool an awareness of who's in
 * each class so substitution exports and printed class registers come out
 * with real names.
 */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function ensure() {
    const s = window.APP.school = window.APP.school || {};
    if (!Array.isArray(s.students)) s.students = [];
    return s.students;
  }
  function classMap() { return window.APP.school?._idx?.classById || {}; }

  function rows() {
    const cMap = classMap();
    return ensure().map(st => ({
      id: st.id,
      name: ((st.firstName || "") + " " + (st.lastName || "")).trim() || "(unnamed)",
      classLabel: (cMap[st.classId] && (cMap[st.classId].abbr || cMap[st.classId].name)) || "",
      gender: st.gender || "",
      email: st.email || "",
      _ref: st,
    }));
  }

  function columns() {
    return [
      { key: "name",       label: "Name" },
      { key: "classLabel", label: "Class" },
      { key: "gender",     label: "Gender" },
      { key: "email",      label: "Email" },
    ];
  }

  function openEdit(r) {
    const isNew = !r;
    const draft = isNew
      ? { firstName: "", lastName: "", classId: "", gender: "", dob: "",
          email: "", parentEmail: "", notes: "" }
      : { firstName: r._ref.firstName || "", lastName: r._ref.lastName || "",
          classId: r._ref.classId || "", gender: r._ref.gender || "",
          dob: r._ref.dob || "", email: r._ref.email || "",
          parentEmail: r._ref.parentEmail || "", notes: r._ref.notes || "" };

    function textIn(key, opts) {
      const i = D.el("input", { type: (opts && opts.type) || "text",
        value: draft[key], maxlength: String((opts && opts.max) || 80),
        placeholder: (opts && opts.placeholder) || "",
        oninput: e => draft[key] = e.target.value });
      return i;
    }
    function classSelect() {
      const sel = D.el("select", null, D.el("option", { value: "" }, "(unassigned)"));
      ((window.APP.school?.classes) || []).forEach(c => {
        const o = D.el("option", { value: c.id }, c.name);
        if (c.id === draft.classId) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", e => draft.classId = e.target.value);
      return sel;
    }
    function genderSelect() {
      const sel = D.el("select");
      ["", "F", "M", "X"].forEach(g => {
        const o = D.el("option", { value: g }, g || "—");
        if (g === draft.gender) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", e => draft.gender = e.target.value);
      return sel;
    }

    D.buildEditSheet({
      title: isNew ? "New student" : "Edit student — " + ((draft.firstName + " " + draft.lastName).trim() || ""),
      fields: [
        { label: "First name",   control: textIn("firstName") },
        { label: "Last name",    control: textIn("lastName") },
        { label: "Class",        control: classSelect() },
        { label: "Gender",       control: genderSelect() },
        { label: "Date of birth",control: textIn("dob", { type: "date" }) },
        { label: "Email",        control: textIn("email", { type: "email", max: 120 }) },
        { label: "Parent email", control: textIn("parentEmail", { type: "email", max: 120 }) },
        { label: "Notes",        control: textIn("notes", { max: 240 }) },
      ],
      onSave: () => {
        const all = ensure();
        if (!isNew) {
          const st = r._ref;
          const before = { ...st };
          Object.assign(st, draft);
          window.APP.audit.append({ entity: "students", op: "update", before, after: { ...st } });
        } else {
          const ns = Object.assign({ id: D.uid("st") }, draft);
          all.push(ns);
          window.APP.audit.append({ entity: "students", op: "add", after: { ...ns } });
        }
        D.closeSheet();
        D.refresh(rows());
        return true;
      },
      siblingRows: isNew ? null : rows(),
      currentRowId: isNew ? null : r.id,
      onNavigate: openEdit,
    });
  }

  function open() {
    D.open({
      entity: "students", title: "Students",
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
          window.APP.audit.append({ entity: "students", op: "remove", before: { ...removed } });
        }
        D.refresh(rows());
      },
    });
  }

  global.EntityStudents = { open };
})(window);
