/* Teachers CRUD dialog. window.EntityTeachers.open() */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function splitName(full) {
    // last token = last name, rest = first name.
    const parts = String(full || "").trim().split(/\s+/);
    if (!parts.length) return { first:"", last:"" };
    if (parts.length === 1) return { first:"", last:parts[0] };
    return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
  }

  function constraintsCount(t) {
    let n = 0;
    if (t.constraints) for (const k in t.constraints) if (t.constraints[k] !== "" && t.constraints[k] != null) n++;
    return n;
  }

  function rows() {
    return ((window.APP.school?.teachers) || []).map(t => {
      const split = t.firstName != null || t.lastName != null
        ? { first: t.firstName || "", last: t.lastName || "" }
        : splitName(t.name);
      return {
        id: t.id,
        firstName: split.first,
        lastName:  split.last,
        abbr: t.abbr || "",
        color: t.color || "",
        timeOff: t.timeOff || {},
        maxGaps: t.maxGapsPerDay != null ? t.maxGapsPerDay : "",
        maxConsec: t.maxConsecutivePeriods != null ? t.maxConsecutivePeriods : "",
        constraintsN: constraintsCount(t),
        _ref: t,
      };
    });
  }

  function columns() { return [
    { key:"lastName",  label:"Last name" },
    { key:"firstName", label:"First name" },
    { key:"abbr",      label:"Short" },
    { key:"color",     label:"Color", sortable:false,
      render:(r)=>D.el("span", { class:"chrx-ent-swatch-dot",
        style:`background:${r.color || "transparent"}` }) },
    { key:"timeOff",   label:"Time off", sortable:false,
      render:(r)=>D.buildTimeOffMini(r.timeOff, 6, 8) },
    { key:"maxGaps",   label:"Max gaps" },
    { key:"maxConsec", label:"Max consec." },
    { key:"constraintsN", label:"Constraints" },
  ]; }

  function openEdit(r) {
    const isNew = !r;
    const draft = isNew
      ? { firstName:"", lastName:"", abbr:"", color:"",
          maxGapsPerDay:"", maxConsecutivePeriods:"" }
      : { firstName:r.firstName, lastName:r.lastName, abbr:r.abbr, color:r.color,
          maxGapsPerDay: r._ref.maxGapsPerDay != null ? r._ref.maxGapsPerDay : "",
          maxConsecutivePeriods: r._ref.maxConsecutivePeriods != null ? r._ref.maxConsecutivePeriods : "" };

    const fFirst = D.el("input", { type:"text", value:draft.firstName, maxlength:"40",
      oninput:(e)=>draft.firstName = e.target.value });
    const fLast = D.el("input", { type:"text", value:draft.lastName, required:"required",
      maxlength:"40", oninput:(e)=>draft.lastName = e.target.value });
    const fAbbr = D.el("input", { type:"text", value:draft.abbr, maxlength:"10",
      oninput:(e)=>draft.abbr = e.target.value });
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);
    const fGaps = D.el("input", { type:"number", min:"0", value:draft.maxGapsPerDay,
      oninput:(e)=>draft.maxGapsPerDay = e.target.value });
    const fConsec = D.el("input", { type:"number", min:"0", value:draft.maxConsecutivePeriods,
      oninput:(e)=>draft.maxConsecutivePeriods = e.target.value });

    function save() {
      if (!draft.lastName.trim()) { fLast.focus(); return false; }
      const all = window.APP.school.teachers;
      const fullName = `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim();
      if (!isNew) {
        const t = r._ref;
        const before = { ...t };
        t.firstName = draft.firstName.trim() || undefined;
        t.lastName  = draft.lastName.trim();
        t.name = fullName;
        t.abbr = draft.abbr.trim() || undefined;
        t.color = draft.color || undefined;
        t.maxGapsPerDay = draft.maxGapsPerDay !== "" ? parseInt(draft.maxGapsPerDay, 10) : undefined;
        t.maxConsecutivePeriods = draft.maxConsecutivePeriods !== "" ? parseInt(draft.maxConsecutivePeriods, 10) : undefined;
        window.APP.audit.append({ entity:"teachers", op:"update", before, after:{...t} });
      } else {
        const nt = { id:D.uid("t"),
          firstName:draft.firstName.trim() || undefined,
          lastName:draft.lastName.trim(),
          name: fullName,
          abbr:draft.abbr.trim() || undefined,
          color:draft.color || undefined,
          maxGapsPerDay: draft.maxGapsPerDay !== "" ? parseInt(draft.maxGapsPerDay, 10) : undefined,
          maxConsecutivePeriods: draft.maxConsecutivePeriods !== "" ? parseInt(draft.maxConsecutivePeriods, 10) : undefined };
        if (all.some(x => x.name === nt.name)) { fLast.focus(); return false; }
        all.push(nt);
        if (window.APP.school._idx) window.APP.school._idx.teacherById[nt.id] = nt;
        window.APP.audit.append({ entity:"teachers", op:"add", after:{...nt} });
      }
      D.closeSheet(); D.refresh(rows());
      return true;
    }

    D.buildEditSheet({
      title: isNew ? "New teacher" : `Edit teacher — ${r.lastName}`,
      fields:[
        { label:"First name", control:fFirst },
        { label:"Last name",  control:fLast },
        { label:"Abbreviation", control:fAbbr },
        { label:"Color", control:fColor },
        { label:"Max gaps/day", control:fGaps },
        { label:"Max consecutive periods", control:fConsec },
      ],
      onSave: save,
      siblingRows: isNew ? null : rows(),
      currentRowId: isNew ? null : r.id,
      onNavigate: openEdit,
    });
  }

  // Copy entry (P2#10)
  const COPYABLE_KEYS = ["color", "timeOff", "constraints",
    "maxGapsPerDay", "maxConsecutivePeriods"];
  function deepClone(v) {
    if (Array.isArray(v)) return v.map(deepClone);
    if (v && typeof v === "object") {
      const out = {}; for (const k in v) out[k] = deepClone(v[k]); return out;
    }
    return v;
  }
  function openCopy(r) {
    if (!r) return;
    const srcRef = r._ref;
    const srcSnapshot = { ...srcRef };
    function applySettings(targetRef) {
      const before = { ...targetRef };
      COPYABLE_KEYS.forEach(k => {
        if (srcSnapshot[k] !== undefined) targetRef[k] = deepClone(srcSnapshot[k]);
      });
      window.APP.audit.append({ entity:"teachers", op:"copy", id:targetRef.id, before, after:{...targetRef} });
    }
    const all = rows();
    const others = all.filter(x => x.id !== r.id).map(x => ({
      id:x.id, name:x._ref.name || `${x.firstName} ${x.lastName}`.trim() || x.id, _ref:x._ref,
    }));
    D.openCopyChooser({
      title: `Copy — ${r._ref.name || r.lastName}`,
      source: srcRef, others,
      onDuplicate: () => {
        const list = window.APP.school.teachers;
        const copy = { ...srcRef, id:D.uid("t"),
          name: (srcRef.name || "") + " (copy)",
          lastName: (srcRef.lastName || "") + " (copy)" };
        if (Array.isArray(srcRef.timeOff)) copy.timeOff = srcRef.timeOff.map(row => row.slice());
        if (srcRef.constraints) copy.constraints = { ...srcRef.constraints };
        list.push(copy);
        if (window.APP.school._idx) window.APP.school._idx.teacherById[copy.id] = copy;
        window.APP.audit.append({ entity:"teachers", op:"add", after:{...copy} });
        D.refresh(rows());
      },
      onCopyToOne: (targetRef) => { applySettings(targetRef); D.refresh(rows()); },
      onCopyToMany: (targetRefs) => { targetRefs.forEach(applySettings); D.refresh(rows()); },
    });
  }

  // Batch edit (P2#11)
  function openBatch() {
    const all = rows();
    D.openBatchEditSheet({
      title: "Batch edit — Teachers",
      rows: all.map(r => ({ id:r.id,
        name:r._ref.name || `${r.firstName} ${r.lastName}`.trim() || r.id,
        _ref:r._ref })),
      fields: [
        { id:"color", label:"Color",
          build:(onChange) => D.buildSwatchPicker("", v => onChange(v || "")) },
        { id:"maxGapsPerDay", label:"Max gaps/day",
          build:(onChange) => D.el("input", { type:"number", min:"0",
            oninput:(e)=>onChange(parseInt(e.target.value, 10) || 0) }) },
        { id:"maxConsecutivePeriods", label:"Max consecutive periods",
          build:(onChange) => D.el("input", { type:"number", min:"0",
            oninput:(e)=>onChange(parseInt(e.target.value, 10) || 0) }) },
      ],
      onApply: (fieldId, value, ids) => {
        const byId = {}; all.forEach(r => byId[r.id] = r._ref);
        ids.forEach(id => {
          const ref = byId[id]; if (!ref) return;
          const before = { ...ref };
          if (fieldId === "color") ref.color = value || undefined;
          else if (fieldId === "maxGapsPerDay") ref.maxGapsPerDay = value;
          else if (fieldId === "maxConsecutivePeriods") ref.maxConsecutivePeriods = value;
          window.APP.audit.append({ entity:"teachers", op:"batch", field:fieldId, id, before, after:{...ref} });
        });
        D.refresh(rows());
      },
    });
  }

  function openConstraints(r) {
    const ref = r._ref;
    if (!window.TeacherConstraintsDialog) return;
    window.TeacherConstraintsDialog.open(ref, (next) => {
      const before = ref.constraints;
      ref.constraints = next;
      window.APP.audit.append({ entity:"teachers", op:"constraints", id:ref.id, before, after:next });
      D.refresh(rows());
    });
  }

  function openTimeOff(r) {
    const ref = r._ref;
    if (!window.TimeOffMatrix) return;
    window.TimeOffMatrix.open(ref, "teachers", (newTimeOff) => {
      const before = ref.timeOff;
      ref.timeOff = newTimeOff;
      window.APP.audit.append({ entity:"teachers", op:"timeoff", id:ref.id, before, after:newTimeOff });
      D.refresh(rows());
    });
  }

  function openLessonsOf(r) {
    const ref = r._ref;
    const lessons = ((window.APP.school?.lessons) || [])
      .filter(l => l.teacherIds.includes(ref.id));
    const subjMap = window.APP.school?._idx?.subjectById || {};
    const list = D.el("ul", { class:"chrx-ent-list" });
    if (!lessons.length) list.appendChild(D.el("li", null, "No lessons for this teacher."));
    lessons.forEach(l => {
      const s = subjMap[l.subjectId];
      list.appendChild(D.el("li", null,
        `${s ? s.name : l.subjectId} — ${l.periodsPerWeek}× — ${l.classIds.length} class(es)`));
    });
    D.openSheet(list, { title: `Lessons of ${ref.name} (${lessons.length})` });
  }

  function open() {
    D.open({
      entity:"teachers", title:"Teachers",
      columns:columns(), rows:rows(),
      extras:[
        { id:"lessons",     label:"Lessons" },
        { id:"timeoff",     label:"Time off" },
        { id:"constraints", label:"Constraints" },
        { id:"copy",        label:"Copy" },
        { id:"batch",       label:"Batch edit", needRow:false },
      ],
      onAction:(cmd, row) => {
        if (cmd === "new")  return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = window.APP.school.teachers;
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i, 1)[0];
            window.APP.audit.append({ entity:"teachers", op:"remove", before:{...removed} });
            D.refresh(rows());
          }
          return;
        }
        if (cmd === "timeoff" && row)     return openTimeOff(row);
        if (cmd === "constraints" && row) return openConstraints(row);
        if (cmd === "lessons" && row)     return openLessonsOf(row);
        if (cmd === "copy" && row)        return openCopy(row);
        if (cmd === "batch")              return openBatch();
      },
    });
  }

  global.EntityTeachers = { open };
})(window);
