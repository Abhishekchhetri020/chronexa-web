/* Classroom supervisions (hall duty) CRUD dialog.
 * window.EntitySupervisions.open()
 * Each row pre-occupies a teacher in a (classroom, day, week, term, period)
 * slot so the solver can't double-book them onto a lesson. Maps to the
 * Classic 'classroomsupervisions' entity. */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat"];

  function ensure() {
    const s = window.APP.school = window.APP.school || {};
    if (!Array.isArray(s.classroomsupervisions)) s.classroomsupervisions = [];
    return s.classroomsupervisions;
  }

  function nameOf(coll, id) {
    return (coll || []).find(x => x.id === id)?.name || "";
  }

  function rows() {
    const s = window.APP.school || {};
    return ensure().map(v => ({
      id: v.id,
      classroom: nameOf(s.classrooms, v.classroomid),
      teacher: nameOf(s.teachers, v.teacherid),
      day: v.day != null ? DAYS[v.day] || ("D"+v.day) : "—",
      week: nameOf(s.weeks, v.week) || v.week || "all",
      term: nameOf(s.terms, v.term) || v.term || "all",
      period: v.period != null ? `P${v.period}` : "—",
      _ref: v,
    }));
  }

  function columns() { return [
    { key:"classroom", label:"Classroom" },
    { key:"teacher",   label:"Teacher" },
    { key:"day",       label:"Day" },
    { key:"period",    label:"Period" },
    { key:"week",      label:"Week" },
    { key:"term",      label:"Term" },
  ]; }

  function makeSelect(items, curId, label, onChange, allowEmpty) {
    const sel = D.el("select", null);
    if (allowEmpty) sel.appendChild(D.el("option", { value:"" }, "—"));
    (items || []).forEach(t => {
      const opt = D.el("option", { value:t.id }, label(t));
      if (t.id === curId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", e => onChange(e.target.value || null));
    return sel;
  }

  function periodOptions() {
    const periods = window.APP.school?.bell?.periods || [];
    const n = periods.length || 8;
    const out = [];
    for (let i = 1; i <= n; i++) out.push({ id: String(i), name: `P${i}` });
    return out;
  }

  function openEdit(r) {
    const isNew = !r;
    const s = window.APP.school;
    const draft = isNew
      ? { classroomid:"", teacherid:"", day:"", period:"", week:"", term:"" }
      : { classroomid:r._ref.classroomid || "", teacherid:r._ref.teacherid || "",
          day: r._ref.day != null ? String(r._ref.day) : "",
          period: r._ref.period != null ? String(r._ref.period) : "",
          week: r._ref.week || "", term: r._ref.term || "" };

    const fRoom = makeSelect(s.classrooms, draft.classroomid,
      x => x.name + (x.abbr ? ` (${x.abbr})` : ""),
      v => draft.classroomid = v, true);
    const fTeach = makeSelect(s.teachers, draft.teacherid,
      x => x.name + (x.abbr ? ` (${x.abbr})` : ""),
      v => draft.teacherid = v, true);
    const fDay = D.el("select", null,
      D.el("option", { value:"" }, "—"),
      ...DAYS.map((d,i) => {
        const opt = D.el("option", { value:String(i) }, d);
        if (String(i) === draft.day) opt.selected = true;
        return opt;
      }));
    fDay.addEventListener("change", e => draft.day = e.target.value);
    const fPeriod = makeSelect(periodOptions(), draft.period,
      x => x.name, v => draft.period = v, true);
    const fWeek = makeSelect(s.weeks, draft.week,
      x => x.name, v => draft.week = v, true);
    const fTerm = makeSelect(s.terms, draft.term,
      x => x.name, v => draft.term = v, true);

    D.buildEditSheet({
      title: isNew ? "New supervision slot" : "Edit supervision",
      fields:[
        { label:"Classroom",   control:fRoom },
        { label:"Teacher",     control:fTeach },
        { label:"Day",         control:fDay },
        { label:"Period",      control:fPeriod },
        { label:"Week (opt)",  control:fWeek },
        { label:"Term (opt)",  control:fTerm },
      ],
      onSave:()=>{
        if (!draft.classroomid) { fRoom.focus(); return; }
        if (!draft.teacherid)   { fTeach.focus(); return; }
        if (draft.day === "")   { fDay.focus(); return; }
        if (draft.period === ""){ fPeriod.focus(); return; }
        const all = ensure();
        const payload = {
          classroomid: draft.classroomid,
          teacherid: draft.teacherid,
          day: parseInt(draft.day, 10),
          period: parseInt(draft.period, 10),
          week: draft.week || undefined,
          term: draft.term || undefined,
        };
        // uniqueness: same (teacher, day, period, week, term) can't be twice
        const dup = all.find(x =>
          x.teacherid === payload.teacherid &&
          x.day === payload.day && x.period === payload.period &&
          (x.week || "") === (payload.week || "") &&
          (x.term || "") === (payload.term || "") &&
          (!r || x.id !== r._ref.id));
        if (dup) {
          alert("This teacher already has a supervision at that slot.");
          fTeach.focus(); return;
        }
        if (!isNew) {
          const ref = r._ref; const before = { ...ref };
          Object.assign(ref, payload);
          window.APP.audit.append({ entity:"classroomsupervisions", op:"update",
            before, after:{...ref} });
        } else {
          payload.id = D.uid("sup");
          all.push(payload);
          window.APP.audit.append({ entity:"classroomsupervisions", op:"add",
            after:{...payload} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    ensure();
    D.open({
      entity:"classroomsupervisions", title:"Hall / break supervisions",
      columns:columns(), rows:rows(),
      onAction:(cmd, row) => {
        if (cmd === "new") return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = ensure();
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i,1)[0];
            window.APP.audit.append({ entity:"classroomsupervisions", op:"remove",
              before:{...removed} });
            D.refresh(rows());
          }
        }
      },
    });
  }

  global.EntitySupervisions = { open };
})(window);
