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
    const s = window.APP && window.APP.school;
    const nP = (s && s.bell && s.bell.periods && s.bell.periods.length) || 8;
    const nD = ((s && s._idx && s._idx.days) || ["Mon","Tue","Wed","Thu","Fri","Sat"]).length;
    return ((window.APP.school?.teachers) || []).map(t => {
      const split = t.firstName != null || t.lastName != null
        ? { first: t.firstName || "", last: t.lastName || "" }
        : splitName(t.name);

      return {
        id: t.id,
        firstName: split.first,
        lastName: split.last,
        abbr: t.abbr || "",
        color: t.color || "",
        timeOff: t.timeOff || {},
        maxGaps: t.maxGapsPerDay != null ? t.maxGapsPerDay : "",
        maxConsec: t.maxConsecutivePeriods != null ? t.maxConsecutivePeriods : "",
        constraintsN: constraintsCount(t),
        _ref: t,
        _nP: nP,
        _nD: nD,
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
      render:(r)=>D.buildTimeOffMini(r.timeOff, r._nD, r._nP) },
    { key:"maxGaps",   label:"Max gaps" },
    { key:"maxConsec", label:"Max consec." },
    { key:"constraintsN", label:"Constraints" },
  ]; }

  function openEdit(r) {
    const isNew = !r;
    const draft = isNew
      ? { firstName:"", lastName:"", abbr:"", color:"",
          maxGapsPerDay:"", maxConsecutivePeriods:"",
          bellId:"", classroomIds:[], printColor:"" }
      : { firstName:r.firstName, lastName:r.lastName, abbr:r.abbr, color:r.color,
          maxGapsPerDay: r._ref.maxGapsPerDay != null ? r._ref.maxGapsPerDay : "",
          maxConsecutivePeriods: r._ref.maxConsecutivePeriods != null ? r._ref.maxConsecutivePeriods : "",
          bellId: r._ref.bellId || "",
          classroomIds: Array.isArray(r._ref.classroomIds) ? r._ref.classroomIds.slice() : [],
          printColor: r._ref.printColor || "" };

    let abbrManuallySet = !isNew && !!draft.abbr;

    /** Generate abbreviation: first letter of first name + first letter of last name */
    function autoAbbr(first, last) {
      const f = (first || "").trim();
      const l = (last || "").trim();
      if (!f && !l) return "";
      const initF = f ? f.charAt(0).toUpperCase() : "";
      const initL = l ? l.charAt(0).toUpperCase() : "";
      // If only last name: use first 2 chars
      if (!initF && initL) return l.substring(0, Math.min(2, l.length)).toUpperCase();
      return initF + initL;
    }

    function updateAutoAbbr() {
      if (!abbrManuallySet) {
        const auto = autoAbbr(draft.firstName, draft.lastName);
        draft.abbr = auto;
        fAbbr.value = auto;
      }
    }

    const fFirst = D.el("input", { type:"text", value:draft.firstName, required:"required", maxlength:"40",
      oninput:(e) => { draft.firstName = e.target.value; updateAutoAbbr(); } });
    const fLast = D.el("input", { type:"text", value:draft.lastName,
      maxlength:"40", oninput:(e) => { draft.lastName = e.target.value; updateAutoAbbr(); } });
    const fAbbr = D.el("input", { type:"text", value:draft.abbr, maxlength:"30",
      oninput:(e) => {
        draft.abbr = e.target.value;
        abbrManuallySet = true;
        if (!e.target.value.trim()) abbrManuallySet = false;
      }});
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);
    const fGaps = D.el("input", { type:"number", min:"0", value:draft.maxGapsPerDay,
      oninput:(e)=>draft.maxGapsPerDay = e.target.value });
    const fConsec = D.el("input", { type:"number", min:"0", value:draft.maxConsecutivePeriods,
      oninput:(e)=>draft.maxConsecutivePeriods = e.target.value });

    // Top-30 #24 — three commonly-used Teacher fields previously absent.
    const S = window.APP && window.APP.school;
    const fBell = D.el("select", null, D.el("option", { value: "" }, "(use school default)"));
    (S && Array.isArray(S.bells) ? S.bells : []).forEach(b => {
      const opt = D.el("option", { value: b.id }, b.name || b.id);
      if (b.id === draft.bellId) opt.selected = true;
      fBell.appendChild(opt);
    });
    fBell.addEventListener("change", e => draft.bellId = e.target.value);

    // ─── Preferred classrooms: multi-select tick/untick ───
    const roomSet = new Set(draft.classroomIds);
    const fRoomWrap = D.el("div", {
      style: "max-height:140px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;background:#fff;padding:4px 0"
    });
    function renderRoomList() {
      fRoomWrap.innerHTML = "";
      const rooms = (S && Array.isArray(S.classrooms) ? S.classrooms : []);
      if (!rooms.length) {
        fRoomWrap.appendChild(D.el("div", { style: "padding:6px 10px;color:#8e8e93;font-size:12px" }, "No classrooms defined"));
        return;
      }
      for (const rm of rooms) {
        const isSelected = roomSet.has(rm.id);
        const row = D.el("label", {
          style: `display:flex;align-items:center;gap:8px;padding:4px 10px;cursor:pointer;font-size:13px;transition:background .1s;${isSelected ? "background:#ecfdf5" : ""}`
        });
        row.onmouseenter = () => { if (!roomSet.has(rm.id)) row.style.background = "#f5f5f4"; };
        row.onmouseleave = () => { row.style.background = roomSet.has(rm.id) ? "#ecfdf5" : ""; };
        const cb = D.el("input", { type: "checkbox", style: "accent-color:#16a34a" });
        cb.checked = isSelected;
        cb.addEventListener("change", () => {
          if (cb.checked) roomSet.add(rm.id); else roomSet.delete(rm.id);
          draft.classroomIds = Array.from(roomSet);
          renderRoomList();
        });
        const label = D.el("span", null, rm.name + (rm.abbr ? ` (${rm.abbr})` : ""));
        const tick = D.el("span", {
          style: `color:#16a34a;font-size:14px;${isSelected ? "" : "visibility:hidden"}`
        }, "✓");
        row.appendChild(cb);
        row.appendChild(label);
        row.appendChild(D.el("span", { style: "flex:1" }));
        row.appendChild(tick);
        fRoomWrap.appendChild(row);
      }
    }
    renderRoomList();

    const fPrintColor = D.el("input", { type: "color",
      value: draft.printColor || "#000000",
      style: "width:50px;height:28px;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer",
      oninput: e => draft.printColor = e.target.value });

    function save() {
      if (!draft.firstName.trim() && !draft.lastName.trim()) { fFirst.focus(); return false; }
      // Auto-assign abbreviation if empty
      if (!draft.abbr.trim()) draft.abbr = autoAbbr(draft.firstName, draft.lastName);
      // Auto-assign unique color if none selected
      if (!draft.color) draft.color = D.autoPickColor("teachers");
      draft.classroomIds = Array.from(roomSet);
      const all = window.APP.school.teachers;
      const fullName = `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim();
      if (!isNew) {
        const t = r._ref;
        const before = { ...t };
        t.firstName = draft.firstName.trim() || undefined;
        t.lastName  = draft.lastName.trim() || undefined;
        t.name = fullName;
        t.abbr = draft.abbr.trim() || undefined;
        t.color = draft.color || undefined;
        t.maxGapsPerDay = draft.maxGapsPerDay !== "" ? parseInt(draft.maxGapsPerDay, 10) : undefined;
        t.maxConsecutivePeriods = draft.maxConsecutivePeriods !== "" ? parseInt(draft.maxConsecutivePeriods, 10) : undefined;
        t.bellId = draft.bellId || undefined;
        t.classroomIds = draft.classroomIds.length ? draft.classroomIds.slice() : undefined;
        t.printColor = draft.printColor || undefined;
        window.APP.audit.append({ entity:"teachers", op:"update", before, after:{...t} });
      } else {
        const nt = { id:D.uid("t"),
          firstName:draft.firstName.trim() || undefined,
          lastName:draft.lastName.trim() || undefined,
          name: fullName,
          abbr:draft.abbr.trim() || undefined,
          color:draft.color || undefined,
          maxGapsPerDay: draft.maxGapsPerDay !== "" ? parseInt(draft.maxGapsPerDay, 10) : undefined,
          maxConsecutivePeriods: draft.maxConsecutivePeriods !== "" ? parseInt(draft.maxConsecutivePeriods, 10) : undefined,
          bellId: draft.bellId || undefined,
          classroomIds: draft.classroomIds.length ? draft.classroomIds.slice() : undefined,
          printColor: draft.printColor || undefined };
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
        { label:"First name", control:fFirst, helpText:"Given name used with the last name in lists, search, and reports." },
        { label:"Last name",  control:fLast, helpText:"Optional family name used to make the teacher easy to identify." },
        { label:"Abbreviation", control:fAbbr, helpText:"Short code shown inside compact timetable cards, such as RKS or AN." },
        { label:"Color", control:fColor, helpText:"Makes this teacher easy to identify when the editor is colored by teacher." },
        { label:"Max gaps/day", control:fGaps, helpText:"Preferred maximum number of free periods between this teacher's lessons in one day." },
        { label:"Max consecutive periods", control:fConsec, helpText:"Limits how many lessons this teacher should teach without a break." },
        { label:"Bell schedule", control:fBell, helpText:"Use this only when the teacher follows a different bell schedule from the school default." },
        { label:"Preferred classrooms", control:fRoomWrap, helpText:"Rooms the solver should prefer when assigning this teacher's lessons." },
        { label:"Print color", control:fPrintColor, helpText:"Optional color override used only in printed reports." },
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
        if (srcRef.timeOff != null)    copy.timeOff = deepClone(srcRef.timeOff);
        if (srcRef.constraints)         copy.constraints = deepClone(srcRef.constraints);
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
