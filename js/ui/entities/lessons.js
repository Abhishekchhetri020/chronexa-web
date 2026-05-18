/* Lessons CRUD dialog. window.EntityLessons.open() */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function names(idx, ids) {
    if (!idx || !ids) return "";
    return ids.map(id => idx[id]?.name).filter(Boolean).join(", ");
  }

  function rows() {
    const s = window.APP.school; if (!s) return [];
    const idxS = s._idx?.subjectById || {};
    const idxT = s._idx?.teacherById || {};
    const idxC = s._idx?.classById   || {};
    const idxR = s._idx?.classroomById || {};
    return (s.lessons || []).map(l => ({
      id: l.id,
      subject: idxS[l.subjectId]?.name || l.subjectId,
      classes: names(idxC, l.classIds),
      teachers: names(idxT, l.teacherIds),
      count: l.periodsPerWeek || 0,
      duration: l.isLabDouble ? "Double" : "Single",
      classroom: l.preferredRoomId ? (idxR[l.preferredRoomId]?.name || "") : "",
      term: l.term || "",
      week: l.week || "",
      days: l.fixedDay != null ? `Day ${l.fixedDay + 1}` : "Any",
      _ref: l,
    }));
  }

  function columns() { return [
    { key:"subject",  label:"Subject" },
    { key:"classes",  label:"Classes" },
    { key:"teachers", label:"Teachers" },
    { key:"count",    label:"Count" },
    { key:"duration", label:"Duration" },
    { key:"classroom",label:"Classroom" },
    { key:"term",     label:"Term" },
    { key:"week",     label:"Week" },
    { key:"days",     label:"Days" },
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

  function makeMulti(items, curIds, label, onChange, size) {
    const sel = D.el("select", { multiple:"multiple", size: String(size || 4) });
    (items || []).forEach(t => {
      const opt = D.el("option", { value:t.id }, label(t));
      if ((curIds || []).includes(t.id)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => {
      onChange(Array.from(sel.selectedOptions).map(o => o.value));
    });
    return sel;
  }

  function openEdit(r) {
    const isNew = !r;
    const s = window.APP.school;
    const draft = isNew
      ? { subjectId:"", classIds:[], teacherIds:[], periodsPerWeek:1,
          isLabDouble:false, preferredRoomId:"", fixedDay:"", fixedPeriod:"" }
      : { subjectId:r._ref.subjectId, classIds:r._ref.classIds.slice(),
          teacherIds:r._ref.teacherIds.slice(),
          periodsPerWeek:r._ref.periodsPerWeek || 1,
          isLabDouble: !!r._ref.isLabDouble,
          preferredRoomId: r._ref.preferredRoomId || "",
          fixedDay: r._ref.fixedDay != null ? r._ref.fixedDay : "",
          fixedPeriod: r._ref.fixedPeriod != null ? r._ref.fixedPeriod : "" };

    const fSubj = makeSelect(s.subjects, draft.subjectId,
      x => x.name + (x.abbr ? ` (${x.abbr})` : ""),
      v => draft.subjectId = v, true);
    const fClasses = makeMulti(s.classes, draft.classIds,
      x => x.name, v => draft.classIds = v, 5);
    const fTeach = makeMulti(s.teachers, draft.teacherIds,
      x => x.name + (x.abbr ? ` (${x.abbr})` : ""), v => draft.teacherIds = v, 5);
    const fCount = D.el("input", { type:"number", min:"1", max:"20",
      value:draft.periodsPerWeek,
      oninput:(e)=>draft.periodsPerWeek = parseFloat(e.target.value) || 1 });
    const fLab = D.el("input", { type:"checkbox",
      checked: draft.isLabDouble ? "checked" : null,
      onchange:(e)=>draft.isLabDouble = e.target.checked });
    const fRoom = makeSelect(s.classrooms, draft.preferredRoomId,
      x => x.name, v => draft.preferredRoomId = v, true);
    const fDay = D.el("input", { type:"number", min:"0", max:"5",
      placeholder:"any", value:draft.fixedDay,
      oninput:(e)=>draft.fixedDay = e.target.value });
    const fPeriod = D.el("input", { type:"number", min:"1", max:"10",
      placeholder:"any", value:draft.fixedPeriod,
      oninput:(e)=>draft.fixedPeriod = e.target.value });

    D.buildEditSheet({
      title: isNew ? "New lesson" : "Edit lesson",
      fields:[
        { label:"Subject", control:fSubj },
        { label:"Classes (multi)", control:fClasses },
        { label:"Teachers (multi)", control:fTeach },
        { label:"Periods/week",     control:fCount },
        { label:"Double-period",    control:fLab },
        { label:"Preferred room",   control:fRoom },
        { label:"Fixed day (0–5)",  control:fDay },
        { label:"Fixed period",     control:fPeriod },
      ],
      onSave:()=>{
        if (!draft.subjectId) { fSubj.focus(); return; }
        if (!draft.classIds.length) { fClasses.focus(); return; }
        const all = s.lessons;
        if (!isNew) {
          const l = r._ref;
          const before = { ...l };
          l.subjectId = draft.subjectId;
          l.classIds = draft.classIds.slice();
          l.teacherIds = draft.teacherIds.slice();
          l.periodsPerWeek = draft.periodsPerWeek;
          l.isLabDouble = !!draft.isLabDouble || undefined;
          l.preferredRoomId = draft.preferredRoomId || undefined;
          l.fixedDay = draft.fixedDay !== "" ? parseInt(draft.fixedDay, 10) : undefined;
          l.fixedPeriod = draft.fixedPeriod !== "" ? parseInt(draft.fixedPeriod, 10) : undefined;
          window.APP.audit.append({ entity:"lessons", op:"update", before, after:{...l} });
        } else {
          const nl = { id:D.uid("l"),
            subjectId:draft.subjectId, classIds:draft.classIds.slice(),
            teacherIds:draft.teacherIds.slice(),
            periodsPerWeek:draft.periodsPerWeek,
            isLabDouble: draft.isLabDouble || undefined,
            preferredRoomId: draft.preferredRoomId || undefined,
            fixedDay: draft.fixedDay !== "" ? parseInt(draft.fixedDay, 10) : undefined,
            fixedPeriod: draft.fixedPeriod !== "" ? parseInt(draft.fixedPeriod, 10) : undefined };
          all.push(nl);
          if (s._idx) s._idx.lessonById[nl.id] = nl;
          window.APP.audit.append({ entity:"lessons", op:"add", after:{...nl} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    D.open({
      entity:"lessons", title:"Lessons",
      columns:columns(), rows:rows(),
      extras:[
        { id:"copy", label:"Copy to" },
      ],
      onAction:(cmd, row) => {
        if (cmd === "new")  return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = window.APP.school.lessons;
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i, 1)[0];
            window.APP.audit.append({ entity:"lessons", op:"remove", before:{...removed} });
            D.refresh(rows());
          }
          return;
        }
        if (cmd === "copy" && row) {
          // Duplicate the row with a new id
          const src = row._ref;
          const dup = { ...src, id: D.uid("l"),
            classIds: src.classIds.slice(), teacherIds: src.teacherIds.slice() };
          window.APP.school.lessons.push(dup);
          if (window.APP.school._idx) window.APP.school._idx.lessonById[dup.id] = dup;
          window.APP.audit.append({ entity:"lessons", op:"copy", after:{...dup} });
          D.refresh(rows());
        }
      },
    });
  }

  global.EntityLessons = { open };
})(window);
