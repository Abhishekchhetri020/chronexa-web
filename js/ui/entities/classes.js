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

    function save() {
      if (!draft.name.trim()) { fName.focus(); return false; }
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
        if (all.some(x => x.name === nc.name)) { fName.focus(); return false; }
        all.push(nc);
        if (window.APP.school._idx) window.APP.school._idx.classById[nc.id] = nc;
        window.APP.audit.append({ entity:"classes", op:"add", after:{...nc} });
      }
      D.closeSheet(); D.refresh(rows());
      return true;
    }

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
      onSave: save,
      siblingRows: isNew ? null : rows(),
      currentRowId: isNew ? null : r.id,
      onNavigate: openEdit,
    });
  }

  // Copy entry (P2#10)
  const COPYABLE_KEYS = ["color", "timeOff", "constraints", "bell"];
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
      window.APP.audit.append({ entity:"classes", op:"copy", id:targetRef.id, before, after:{...targetRef} });
    }
    const all = rows();
    const others = all.filter(x => x.id !== r.id).map(x => ({
      id:x.id, name:x.name || x.id, _ref:x._ref,
    }));
    D.openCopyChooser({
      title: `Copy — ${r.name}`,
      source: srcRef,
      others,
      onDuplicate: () => {
        const all = window.APP.school.classes;
        const copy = { ...srcRef, id:D.uid("c"), name:(srcRef.name || "") + " (copy)" };
        if (Array.isArray(srcRef.timeOff)) copy.timeOff = srcRef.timeOff.map(row => row.slice());
        if (srcRef.constraints) copy.constraints = { ...srcRef.constraints };
        if (Array.isArray(srcRef.classroomIds)) copy.classroomIds = srcRef.classroomIds.slice();
        all.push(copy);
        if (window.APP.school._idx) window.APP.school._idx.classById[copy.id] = copy;
        window.APP.audit.append({ entity:"classes", op:"add", after:{...copy} });
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
      title: "Batch edit — Classes",
      rows: all.map(r => ({ id:r.id, name:r.name, _ref:r._ref })),
      fields: [
        { id:"color", label:"Color",
          build:(onChange) => D.buildSwatchPicker("", v => onChange(v || "")) },
        { id:"bell",  label:"Bell",
          build:(onChange) => D.el("input", { type:"text", placeholder:"default",
            oninput:(e)=>onChange(e.target.value) }) },
      ],
      onApply: (fieldId, value, ids) => {
        const byId = {}; all.forEach(r => byId[r.id] = r._ref);
        ids.forEach(id => {
          const ref = byId[id]; if (!ref) return;
          const before = { ...ref };
          if (fieldId === "color") ref.color = value || undefined;
          else if (fieldId === "bell") ref.bell = value || undefined;
          window.APP.audit.append({ entity:"classes", op:"batch", field:fieldId, id, before, after:{...ref} });
        });
        D.refresh(rows());
      },
    });
  }

  function openConstraints(r) {
    const ref = r._ref;
    if (!window.ClassConstraintsDialog) return;
    window.ClassConstraintsDialog.open(ref, (next) => {
      const before = ref.constraints;
      ref.constraints = next;
      window.APP.audit.append({ entity:"classes", op:"constraints", id:ref.id, before, after:next });
      D.refresh(rows());
    });
  }

  function openTimeOff(r) {
    const ref = r._ref;
    if (!window.TimeOffMatrix) return;
    window.TimeOffMatrix.open(ref, "classes", (newTimeOff) => {
      const before = ref.timeOff;
      ref.timeOff = newTimeOff;
      window.APP.audit.append({ entity:"classes", op:"timeoff", id:ref.id, before, after:newTimeOff });
      D.refresh(rows());
    });
  }

  /* Class divisions — embedded {id, name, groups:[{id,name,studentsCount}]}[].
   * EduPage semantic: a lesson taught to one group splits the class hour.
   * Default: single "Entire class" division containing one "Entire class" group. */
  function defaultDivisions() {
    return [{ id:"d_full", name:"Entire class",
      groups:[{ id:"g_full", name:"Entire class", studentsCount:null }] }];
  }
  function cloneDivisions(arr) {
    return (arr || []).map(d => ({ id:d.id, name:d.name,
      groups:(d.groups || []).map(g => ({ id:g.id, name:g.name,
        studentsCount: g.studentsCount == null ? null : g.studentsCount })) }));
  }

  function openDivisions(r) {
    const ref = r._ref;
    // before snapshot reflects the current persisted state (may be empty).
    const before = cloneDivisions(ref.divisions || []);
    // Local draft — committed only on Save. Seed default when class has none
    // so the user immediately sees the "Entire class" baseline; if they hit
    // Cancel, ref.divisions stays untouched.
    const draft = (Array.isArray(ref.divisions) && ref.divisions.length)
      ? cloneDivisions(ref.divisions)
      : defaultDivisions();

    const wrap = D.el("div", { class:"chrx-ent-divisions" });
    const list = D.el("div", { class:"chrx-ent-list" });

    function renderGroupRow(div, g, gi) {
      const fName = D.el("input", { type:"text", value:g.name || "",
        maxlength:"30", placeholder:"Group name",
        oninput:(e)=>{ g.name = e.target.value; } });
      const fCount = D.el("input", { type:"number", min:"0", max:"200",
        value: g.studentsCount == null ? "" : g.studentsCount,
        placeholder:"#",
        style:"width:64px",
        oninput:(e)=>{ const v = e.target.value;
          g.studentsCount = v === "" ? null : (parseInt(v, 10) || 0); } });
      const del = D.el("button", { type:"button", class:"chrx-btn chrx-btn--danger",
        title:"Delete group",
        onclick:()=>{ div.groups.splice(gi, 1); render(); } }, "×");
      return D.el("div", { class:"chrx-ent-row",
        style:"display:flex;gap:8px;margin:4px 0 4px 16px;align-items:center" },
        D.el("span", { style:"opacity:.6;font-size:12px" }, `Group ${gi+1}`),
        fName, fCount, del);
    }

    function renderDivisionCard(div, i) {
      const card = D.el("div", { class:"chrx-ent-div-card",
        style:"border:1px solid var(--chrx-border, #e5e7eb);border-radius:8px;padding:10px;margin-bottom:10px" });

      const fName = D.el("input", { type:"text", value:div.name || "",
        maxlength:"30", placeholder:"Division name (e.g. Math/PE split)",
        style:"flex:1",
        oninput:(e)=>{ div.name = e.target.value; } });
      const delDiv = D.el("button", { type:"button", class:"chrx-btn chrx-btn--danger",
        title:"Delete division",
        onclick:()=>{ draft.splice(i, 1); render(); } }, "Delete");
      card.appendChild(D.el("div", { class:"chrx-ent-row",
        style:"display:flex;gap:8px;align-items:center;margin-bottom:6px" },
        D.el("span", { style:"opacity:.6;font-size:12px" }, `#${i+1}`),
        fName, delDiv));

      (div.groups || []).forEach((g, gi) => card.appendChild(renderGroupRow(div, g, gi)));

      const addGroupBtn = D.el("button", { type:"button", class:"chrx-btn",
        style:"margin:6px 0 0 16px",
        onclick:()=>{
          div.groups = div.groups || [];
          div.groups.push({ id:D.uid("g"),
            name:`Group ${div.groups.length + 1}`, studentsCount:null });
          render();
        } }, "+ Group");
      card.appendChild(addGroupBtn);
      return card;
    }

    function render() {
      list.innerHTML = "";
      if (!draft.length) {
        list.appendChild(D.el("p", { style:"opacity:.6;margin:8px 0" },
          "No divisions yet. Add one below."));
      } else {
        draft.forEach((d, i) => list.appendChild(renderDivisionCard(d, i)));
      }
    }
    render();

    // Add-row controls: name input + "Add" + "Quick-add (Boys, Girls)"
    const fAddName = D.el("input", { type:"text",
      placeholder:"New division name (e.g. Math/PE split)", maxlength:"30",
      style:"flex:1" });
    const fQuick = D.el("input", { type:"text",
      placeholder:'Quick-add groups: "Boys, Girls"', maxlength:"80",
      style:"flex:1" });

    const addBtn = D.el("button", { type:"button", class:"chrx-btn",
      onclick:()=>{
        const n = fAddName.value.trim();
        if (!n) { fAddName.focus(); return; }
        draft.push({ id:D.uid("div"), name:n,
          groups:[
            { id:D.uid("g"), name:"Group 1", studentsCount:null },
            { id:D.uid("g"), name:"Group 2", studentsCount:null },
          ] });
        fAddName.value = ""; render();
      } }, "Add division");

    const quickBtn = D.el("button", { type:"button", class:"chrx-btn",
      onclick:()=>{
        const raw = fQuick.value.trim();
        if (!raw) { fQuick.focus(); return; }
        const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
        if (!parts.length) return;
        draft.push({ id:D.uid("div"),
          name: parts.join("/"),
          groups: parts.map(p => ({ id:D.uid("g"),
            name:p, studentsCount:null })) });
        fQuick.value = ""; render();
      } }, "Quick-add");

    wrap.appendChild(list);
    wrap.appendChild(D.el("div", { class:"chrx-ent-row",
      style:"display:flex;gap:8px;margin-top:8px" }, fAddName, addBtn));
    wrap.appendChild(D.el("div", { class:"chrx-ent-row",
      style:"display:flex;gap:8px;margin-top:8px" }, fQuick, quickBtn));
    wrap.appendChild(D.el("p", { style:"opacity:.55;font-size:12px;margin:8px 0 0" },
      "A division splits a class hour: a lesson taught to one group runs in parallel with another group's lesson."));

    D.openSheet(D.el("div", null, wrap,
      D.el("div", { class:"chrx-ent-form__foot" },
        D.el("button", { type:"button", class:"chrx-btn",
          onclick:()=>{ D.closeSheet(); } }, "Cancel"),
        D.el("button", { type:"button", class:"chrx-btn chrx-btn--primary",
          onclick:()=>{
            // Validate: each division has ≥1 group, every group has a name.
            for (const d of draft) {
              if (!d.name || !d.name.trim()) {
                alert("Each division needs a name."); return;
              }
              if (!d.groups || !d.groups.length) {
                alert(`Division "${d.name}" has no groups.`); return;
              }
              for (const g of d.groups) {
                if (!g.name || !g.name.trim()) {
                  alert(`A group in division "${d.name}" has no name.`); return;
                }
              }
            }
            ref.divisions = draft;
            window.APP.audit.append({ entity:"classes", op:"divisions",
              id:ref.id, before, after:cloneDivisions(draft) });
            D.closeSheet(); D.refresh(rows());
          } }, "Save"),
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
        { id:"copy",        label:"Copy" },
        { id:"batch",       label:"Batch edit", needRow:false },
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
        if (cmd === "timeoff" && row)     return openTimeOff(row);
        if (cmd === "constraints" && row) return openConstraints(row);
        if (cmd === "divisions" && row)   return openDivisions(row);
        if (cmd === "subjects" && row)    return openSubjectsOf(row);
        if (cmd === "copy" && row)        return openCopy(row);
        if (cmd === "batch")              return openBatch();
      },
    });
  }

  global.EntityClasses = { open };
})(window);
