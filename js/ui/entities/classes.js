/* Classes CRUD dialog. window.EntityClasses.open() */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function rows() {
    const idxT = window.APP.school?._idx?.teacherById || {};
    const idxR = window.APP.school?._idx?.classroomById || {};
    return ((window.APP.school?.classes) || []).map(c => ({
      id: c.id, name: c.name || "", short: c.abbr || c.short || c.name || "",
      teacher: idxT[c.teacherId || c._teacherId]?.name || "",
      classrooms: (c.classroomIds || c._classroomIds || [])
        .map(id => idxR[id]?.name).filter(Boolean).join(", "),
      bell: c.bell || "default", color: c.color || "",
      divCount: (c.divisions || []).length || 0, _ref: c,
    }));
  }

  function columns() { return [
    { key:"name",  label:"Name" },
    { key:"short", label:"Short" },
    { key:"teacher", label:"Class teacher" },
    { key:"classrooms", label:"Rooms" },
    { key:"bell",  label:"Bell" },
    { key:"color", label:"Color", sortable:false,
      render:(r)=>D.el("span", { class:"chrx-ent-swatch-dot",
        style:`background:${r.color || "transparent"}` }) },
    { key:"divCount", label:"Divisions" },
  ]; }

  function makeSelect(items, curId, label, onChange) {
    const sel = D.el("select", null, D.el("option", { value:"" }, "—"));
    (items || []).forEach(t => {
      const opt = D.el("option", { value:t.id }, label(t));
      if (t.id === curId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", e => onChange(e.target.value || null));
    return sel;
  }

  function openEdit(r) {
    const isNew = !r;
    const draft = isNew
      ? { name:"", short:"", color:"", teacherId:"", classroomIds:[], bell:"" }
      : { name:r.name, short:r.short, color:r.color,
          teacherId: r._ref.teacherId || r._ref._teacherId || "",
          classroomIds: (r._ref.classroomIds || r._ref._classroomIds || []).slice(),
          bell: r._ref.bell || "" };

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"30", oninput:(e)=>draft.name = e.target.value });
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"10",
      oninput:(e)=>draft.short = e.target.value });
    const fTeacher = makeSelect(window.APP.school?.teachers, draft.teacherId,
      t => t.name + (t.abbr ? ` (${t.abbr})` : ""), v => draft.teacherId = v);
    const fBell = D.el("input", { type:"text", value:draft.bell, placeholder:"default",
      oninput:(e)=>draft.bell = e.target.value });
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);

    const fRooms = D.el("select", { multiple:"multiple", size:"4" });
    ((window.APP.school?.classrooms) || []).forEach(rm => {
      const opt = D.el("option", { value:rm.id }, rm.name);
      if (draft.classroomIds.includes(rm.id)) opt.selected = true;
      fRooms.appendChild(opt);
    });
    fRooms.addEventListener("change", () => {
      draft.classroomIds = Array.from(fRooms.selectedOptions).map(o => o.value);
    });

    D.buildEditSheet({
      title: isNew ? "New class" : `Edit class — ${r.name}`,
      fields:[
        { label:"Name", control:fName },
        { label:"Short", control:fShort },
        { label:"Class teacher", control:fTeacher },
        { label:"Home classrooms", control:fRooms },
        { label:"Bell", control:fBell },
        { label:"Color", control:fColor },
      ],
      onSave:()=>{
        if (!draft.name.trim()) { fName.focus(); return; }
        const all = window.APP.school.classes;
        if (!isNew) {
          const c = r._ref;
          const before = { ...c };
          c.name = draft.name.trim();
          c.abbr = draft.short.trim() || undefined;
          c.color = draft.color || undefined;
          c.teacherId = draft.teacherId || undefined;
          c.classroomIds = draft.classroomIds.slice();
          c.bell = draft.bell || undefined;
          window.APP.audit.append({ entity:"classes", op:"update", before, after:{...c} });
        } else {
          const nc = { id:D.uid("c"), name:draft.name.trim(),
            abbr:draft.short.trim() || undefined, color:draft.color || undefined,
            teacherId:draft.teacherId || undefined,
            classroomIds:draft.classroomIds.slice(),
            bell:draft.bell || undefined };
          if (all.some(x => x.name === nc.name)) { fName.focus(); return; }
          all.push(nc);
          if (window.APP.school._idx) window.APP.school._idx.classById[nc.id] = nc;
          window.APP.audit.append({ entity:"classes", op:"add", after:{...nc} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function openConstraints(r) {
    const ref = r._ref;
    const c = Object.assign({ minPerDay:"", maxPerDay:"", maxGaps:"" }, ref.constraints || {});
    const f1 = D.el("input", { type:"number", min:"0", value:c.minPerDay,
      oninput:(e)=> c.minPerDay = e.target.value });
    const f2 = D.el("input", { type:"number", min:"0", value:c.maxPerDay,
      oninput:(e)=> c.maxPerDay = e.target.value });
    const f3 = D.el("input", { type:"number", min:"0", value:c.maxGaps,
      oninput:(e)=> c.maxGaps = e.target.value });
    D.buildEditSheet({
      title:`Constraints — ${ref.name}`,
      fields:[
        { label:"Min periods per day", control:f1 },
        { label:"Max periods per day", control:f2 },
        { label:"Max gaps per day",    control:f3 },
      ],
      onSave:()=>{
        const before = ref.constraints; ref.constraints = c;
        window.APP.audit.append({ entity:"classes", op:"constraints", id:ref.id, before, after:c });
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function openDivisions(r) {
    const ref = r._ref;
    const divs = (ref.divisions = ref.divisions || []);
    const list = D.el("ul", { class:"chrx-ent-list" });
    function render() {
      list.innerHTML = "";
      if (!divs.length) list.appendChild(D.el("li", null, "No divisions."));
      divs.forEach((d, i) => list.appendChild(D.el("li", null,
        `${d.name} (${(d.groups || []).length || 0} groups)`,
        D.el("button", { type:"button", class:"chrx-btn chrx-btn--danger",
          style:"margin-left:8px", onclick:()=>{ divs.splice(i,1); render(); } }, "Delete"),
      )));
    }
    render();
    const fName = D.el("input", { type:"text", placeholder:"e.g. mu / da", maxlength:"20" });
    D.openSheet(D.el("div", null, list,
      D.el("div", { class:"chrx-ent-row" }, fName,
        D.el("button", { type:"button", class:"chrx-btn", onclick:()=>{
          const n = fName.value.trim();
          if (!n) return;
          divs.push({ id:D.uid("div"), name:n, groups:[] });
          fName.value = ""; render();
        } }, "Add"),
      ),
      D.el("div", { class:"chrx-ent-form__foot" },
        D.el("button", { type:"button", class:"chrx-btn chrx-btn--primary", onclick:()=>{
          window.APP.audit.append({ entity:"classes", op:"divisions", id:ref.id, after:divs.slice() });
          D.closeSheet(); D.refresh(rows());
        } }, "Done"),
      ),
    ), { title: `Divisions — ${ref.name}` });
  }

  function openSubjectsOf(r) {
    const ref = r._ref;
    const lessons = ((window.APP.school?.lessons) || []).filter(l => l.classIds.includes(ref.id));
    const subjMap = window.APP.school?._idx?.subjectById || {};
    const seen = new Set();
    lessons.forEach(l => seen.add(l.subjectId));
    const list = D.el("ul", { class:"chrx-ent-list" });
    if (!seen.size) list.appendChild(D.el("li", null, "No subjects scheduled for this class."));
    Array.from(seen).forEach(sid => {
      const s = subjMap[sid];
      list.appendChild(D.el("li", null, s ? s.name : sid));
    });
    D.openSheet(list, { title: `Subjects of ${ref.name} (${seen.size})` });
  }

  function open() {
    D.open({
      entity:"classes", title:"Classes",
      columns:columns(), rows:rows(),
      extras:[
        { id:"timeoff",     label:"Time off" },
        { id:"constraints", label:"Constraints" },
        { id:"divisions",   label:"Divisions" },
        { id:"subjects",    label:"Subjects" },
      ],
      onAction:(cmd, row) => {
        if (cmd === "new")  return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = window.APP.school.classes;
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i, 1)[0];
            window.APP.audit.append({ entity:"classes", op:"remove", before:{...removed} });
            D.refresh(rows());
          }
          return;
        }
        if (cmd === "timeoff" && row)
          return D.openTimeOffSheet(row._ref, "classes", () => D.refresh(rows()));
        if (cmd === "constraints" && row) return openConstraints(row);
        if (cmd === "divisions" && row)   return openDivisions(row);
        if (cmd === "subjects" && row)    return openSubjectsOf(row);
      },
    });
  }

  global.EntityClasses = { open };
})(window);
