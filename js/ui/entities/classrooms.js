/* Classrooms CRUD dialog. window.EntityClassrooms.open() */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function rows() {
    const s = window.APP && window.APP.school;
    const nP = (s && s.bell && s.bell.periods && s.bell.periods.length) || 8;
    const nD = ((s && s._idx && s._idx.days) || ["Mon","Tue","Wed","Thu","Fri","Sat"]).length;
    const idxS = window.APP.school?._idx?.subjectById || {};
    return ((window.APP.school?.classrooms) || []).map(rm => ({
      id: rm.id, name: rm.name || "", short: rm.abbr || rm.short || "",
      building: rm.building || "", capacity: rm.capacity != null ? rm.capacity : "",
      color: rm.color || "",
      needsSupervision: rm.needsSupervision ? "Yes" : "",
      isShared: rm.isShared ? "Yes" : "",
      subjectsFor: (rm.allowedSubjectIds || [])
        .map(id => idxS[id]?.abbr || idxS[id]?.name).filter(Boolean).join(", "),
      bell: rm.bell || "default",
      timeOff: rm.timeOff || {},
      _ref: rm, _nP: nP, _nD: nD,
    }));
  }

  function columns() { return [
    { key:"name",  label:"Name" },
    { key:"short", label:"Short" },
    { key:"building", label:"Building" },
    { key:"capacity", label:"Capacity" },
    { key:"color", label:"Color", sortable:false,
      render:(r)=>D.el("span", { class:"chrx-ent-swatch-dot",
        style:`background:${r.color || "transparent"}` }) },
    { key:"timeOff", label:"Time off", sortable:false,
      render:(r)=>D.buildTimeOffMini(r.timeOff, r._nD, r._nP) },
    { key:"needsSupervision", label:"Supervised" },
    { key:"isShared", label:"Shared" },
    { key:"subjectsFor", label:"For subjects" },
    { key:"bell", label:"Bell" },
  ]; }

  function openEdit(r) {
    const isNew = !r;
    const draft = isNew
      ? { name:"", short:"", building:"", buildingId:"", capacity:"", color:"",
          needsSupervision:false, isShared:false,
          allowedSubjectIds:[], bell:"" }
      : { name:r.name, short:r.short, building:r.building,
          buildingId: r._ref.buildingId || r._ref.buildingid || "",
          capacity:r.capacity, color:r.color,
          needsSupervision: !!r._ref.needsSupervision,
          isShared: !!r._ref.isShared,
          allowedSubjectIds: (r._ref.allowedSubjectIds || []).slice(),
          bell:r.bell === "default" ? "" : r.bell };

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"40", oninput:(e)=>draft.name = e.target.value });
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"30",
      oninput:(e)=>draft.short = e.target.value });
    const fBuilding = D.el("input", { type:"text", value:draft.building,
      oninput:(e)=>draft.building = e.target.value });
    // FET-port — pick a Building entity (so the solver's
    // teacherBuildingChangesPenalty has structured data). The free-text
    // `building` above is kept for backward-compatibility with older
    // schools that haven't migrated.
    // Tier-B FET — allowedTags. Comma-separated. Lessons whose tags
    // don't overlap with the room's allowedTags get a soft mismatch
    // penalty. Lets schools say "this is the Lab Room — LAB-tagged
    // lessons preferred here."
    const _allowedTags0 = Array.isArray(r && r._ref.allowedTags) ? r._ref.allowedTags.join(", ") : "";
    draft.allowedTags = _allowedTags0;
    const fAllowedTags = D.el("input", { type:"text", value:draft.allowedTags,
      placeholder:"e.g. LAB, MUSIC",
      oninput:(e)=>draft.allowedTags = e.target.value });
    const fBuildingId = D.el("select", null, D.el("option", { value:"" }, "(no building)"));
    ((window.APP.school?.buildings) || []).forEach(b => {
      const opt = D.el("option", { value:b.id }, b.name || b.short || b.id);
      if (b.id === draft.buildingId) opt.selected = true;
      fBuildingId.appendChild(opt);
    });
    fBuildingId.addEventListener("change", e => draft.buildingId = e.target.value);
    const fCap = D.el("input", { type:"number", min:"0", value:draft.capacity,
      oninput:(e)=>draft.capacity = e.target.value });
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);
    const fSup = D.el("input", { type:"checkbox",
      checked: draft.needsSupervision ? "checked" : null,
      onchange:(e)=>draft.needsSupervision = e.target.checked });
    const fShared = D.el("input", { type:"checkbox",
      checked: draft.isShared ? "checked" : null,
      onchange:(e)=>draft.isShared = e.target.checked });
    // Subjects this room is intended for (Lab → Science, Music Room → Music, etc.)
    const fSubjects = D.el("select", { multiple:"multiple", size:"4" });
    ((window.APP.school?.subjects) || []).forEach(sub => {
      const opt = D.el("option", { value:sub.id }, sub.name + (sub.abbr ? ` (${sub.abbr})` : ""));
      if (draft.allowedSubjectIds.includes(sub.id)) opt.selected = true;
      fSubjects.appendChild(opt);
    });
    fSubjects.addEventListener("change", () => {
      draft.allowedSubjectIds = Array.from(fSubjects.selectedOptions).map(o => o.value);
    });
    const fBell = D.el("input", { type:"text", value:draft.bell, placeholder:"default",
      oninput:(e)=>draft.bell = e.target.value });

    function save() {
      if (!draft.name.trim()) { fName.focus(); return false; }
      const all = window.APP.school.classrooms;
      if (!isNew) {
        const rm = r._ref;
        const before = { ...rm };
        rm.name = draft.name.trim();
        rm.abbr = draft.short.trim() || undefined;
        rm.building = draft.building.trim() || undefined;
        rm.buildingId = draft.buildingId || undefined;
        rm.allowedTags = (draft.allowedTags || "").split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
        if (!rm.allowedTags.length) rm.allowedTags = undefined;
        rm.capacity = draft.capacity ? parseInt(draft.capacity, 10) : undefined;
        rm.color = draft.color || undefined;
        rm.needsSupervision = !!draft.needsSupervision;
        rm.isShared = !!draft.isShared;
        rm.allowedSubjectIds = draft.allowedSubjectIds.slice();
        rm.bell = draft.bell || undefined;
        window.APP.audit.append({ entity:"classrooms", op:"update", before, after:{...rm} });
      } else {
        const nr = { id:D.uid("r"), name:draft.name.trim(),
          abbr:draft.short.trim() || undefined,
          building:draft.building.trim() || undefined,
          buildingId: draft.buildingId || undefined,
          allowedTags: (draft.allowedTags || "").split(/[,\s]+/).map(s => s.trim()).filter(Boolean).length
            ? (draft.allowedTags || "").split(/[,\s]+/).map(s => s.trim()).filter(Boolean) : undefined,
          capacity:draft.capacity ? parseInt(draft.capacity, 10) : undefined,
          color:draft.color || undefined,
          needsSupervision: !!draft.needsSupervision,
          isShared: !!draft.isShared,
          allowedSubjectIds: draft.allowedSubjectIds.slice(),
          bell:draft.bell || undefined };
        if (all.some(x => x.name === nr.name)) { fName.focus(); return false; }
        all.push(nr);
        if (window.APP.school._idx) window.APP.school._idx.classroomById[nr.id] = nr;
        window.APP.audit.append({ entity:"classrooms", op:"add", after:{...nr} });
      }
      D.closeSheet(); D.refresh(rows());
      return true;
    }

    D.buildEditSheet({
      title: isNew ? "New classroom" : `Edit classroom — ${r.name}`,
      fields:[
        { label:"Name", control:fName, helpText:"The room name shown in schedules and reports, such as Chemistry Lab." },
        { label:"Short", control:fShort, helpText:"Compact room code used in timetable cells, such as LAB-2." },
        { label:"Building (text)", control:fBuilding, helpText:"Free-text building or floor label for quick organization." },
        { label:"Building (entity)", control:fBuildingId, helpText:"Link this room to a formal building record when your school uses multiple buildings." },
        { label:"Allowed tags", control:fAllowedTags, helpText:"Only lessons carrying one of these activity tags may use this room." },
        { label:"Capacity", control:fCap, helpText:"Maximum students the room can safely hold." },
        { label:"Color", control:fColor, helpText:"Used when the editor or printout is colored by classroom." },
        { label:"Needs supervision", control:fSup, helpText:"Marks spaces that require an assigned supervisor while occupied." },
        { label:"Shared room", control:fShared, helpText:"Allows compatible lessons to share the room instead of treating every overlap as a hard conflict." },
        { label:"For subjects", control:fSubjects, helpText:"Restrict this room to selected subjects, such as Science for a laboratory." },
        { label:"Bell", control:fBell, helpText:"Use only when lessons in this room follow a different bell schedule." },
      ],
      onSave: save,
      siblingRows: isNew ? null : rows(),
      currentRowId: isNew ? null : r.id,
      onNavigate: openEdit,
    });
  }

  // Copy entry (P2#10)
  const COPYABLE_KEYS = ["color", "timeOff", "constraints", "bell",
    "needsSupervision", "capacity", "building"];
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
      window.APP.audit.append({ entity:"classrooms", op:"copy", id:targetRef.id, before, after:{...targetRef} });
    }
    const all = rows();
    const others = all.filter(x => x.id !== r.id).map(x => ({
      id:x.id, name:x.name || x.id, _ref:x._ref,
    }));
    D.openCopyChooser({
      title: `Copy — ${r.name}`,
      source: srcRef, others,
      onDuplicate: () => {
        const list = window.APP.school.classrooms;
        const copy = { ...srcRef, id:D.uid("r"), name:(srcRef.name || "") + " (copy)" };
        if (srcRef.timeOff != null)          copy.timeOff = deepClone(srcRef.timeOff);
        if (srcRef.constraints)               copy.constraints = deepClone(srcRef.constraints);
        if (srcRef.allowedSubjectIds != null) copy.allowedSubjectIds = deepClone(srcRef.allowedSubjectIds);
        list.push(copy);
        if (window.APP.school._idx) window.APP.school._idx.classroomById[copy.id] = copy;
        window.APP.audit.append({ entity:"classrooms", op:"add", after:{...copy} });
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
      title: "Batch edit — Classrooms",
      rows: all.map(r => ({ id:r.id, name:r.name, _ref:r._ref })),
      fields: [
        { id:"color", label:"Color",
          build:(onChange) => D.buildSwatchPicker("", v => onChange(v || "")) },
        { id:"building", label:"Building",
          build:(onChange) => D.el("input", { type:"text",
            oninput:(e)=>onChange(e.target.value) }) },
        { id:"capacity", label:"Capacity",
          build:(onChange) => D.el("input", { type:"number", min:"0",
            oninput:(e)=>onChange(parseInt(e.target.value, 10) || 0) }) },
        { id:"needsSupervision", label:"Needs supervision",
          build:(onChange) => D.el("input", { type:"checkbox",
            onchange:(e)=>onChange(!!e.target.checked) }) },
      ],
      onApply: (fieldId, value, ids) => {
        const byId = {}; all.forEach(r => byId[r.id] = r._ref);
        ids.forEach(id => {
          const ref = byId[id]; if (!ref) return;
          const before = { ...ref };
          if (fieldId === "color")            ref.color = value || undefined;
          else if (fieldId === "building")    ref.building = value || undefined;
          else if (fieldId === "capacity")    ref.capacity = value;
          else if (fieldId === "needsSupervision") ref.needsSupervision = !!value;
          window.APP.audit.append({ entity:"classrooms", op:"batch", field:fieldId, id, before, after:{...ref} });
        });
        D.refresh(rows());
      },
    });
  }

  function openConstraints(r) {
    const ref = r._ref;
    const c = Object.assign({ maxCardsPos:1, maxStudentsPos:"" }, ref.constraints || {});
    const f1 = D.el("input", { type:"number", min:"1", value:c.maxCardsPos,
      oninput:(e)=> c.maxCardsPos = parseInt(e.target.value, 10) || 1 });
    const f2 = D.el("input", { type:"number", min:"0", value:c.maxStudentsPos,
      oninput:(e)=> c.maxStudentsPos = e.target.value });
    D.buildEditSheet({
      title:`Constraints — ${ref.name}`,
      fields:[
        { label:"Max simultaneous lessons", control:f1 },
        { label:"Max students",            control:f2 },
      ],
      onSave:()=>{
        const before = ref.constraints; ref.constraints = c;
        window.APP.audit.append({ entity:"classrooms", op:"constraints", id:ref.id, before, after:c });
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    D.open({
      entity:"classrooms", title:"Classrooms",
      columns:columns(), rows:rows(),
      extras:[
        { id:"timeoff",     label:"Time off" },
        { id:"constraints", label:"Constraints" },
        { id:"copy",        label:"Copy" },
        { id:"batch",       label:"Batch edit", needRow:false },
      ],
      onAction:(cmd, row) => {
        if (cmd === "new")  return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = window.APP.school.classrooms;
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i, 1)[0];
            window.APP.audit.append({ entity:"classrooms", op:"remove", before:{...removed} });
            D.refresh(rows());
          }
          return;
        }
        if (cmd === "timeoff" && row) {
          const ref = row._ref;
          if (!window.TimeOffMatrix) return;
          return window.TimeOffMatrix.open(ref, "classrooms", (newTimeOff) => {
            const before = ref.timeOff;
            ref.timeOff = newTimeOff;
            window.APP.audit.append({ entity:"classrooms", op:"timeoff", id:ref.id, before, after:newTimeOff });
            D.refresh(rows());
          });
        }
        if (cmd === "constraints" && row) return openConstraints(row);
        if (cmd === "copy" && row)         return openCopy(row);
        if (cmd === "batch")               return openBatch();
      },
    });
  }

  global.EntityClassrooms = { open };
})(window);
