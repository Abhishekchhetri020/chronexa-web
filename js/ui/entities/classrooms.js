/* Classrooms CRUD dialog. window.EntityClassrooms.open() */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function rows() {
    return ((window.APP.school?.classrooms) || []).map(rm => ({
      id: rm.id, name: rm.name || "", short: rm.abbr || rm.short || "",
      building: rm.building || "", capacity: rm.capacity != null ? rm.capacity : "",
      color: rm.color || "",
      needsSupervision: rm.needsSupervision ? "Yes" : "",
      bell: rm.bell || "default", _ref: rm,
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
    { key:"needsSupervision", label:"Supervised" },
    { key:"bell", label:"Bell" },
  ]; }

  function openEdit(r) {
    const isNew = !r;
    const draft = isNew
      ? { name:"", short:"", building:"", capacity:"", color:"",
          needsSupervision:false, bell:"" }
      : { name:r.name, short:r.short, building:r.building,
          capacity:r.capacity, color:r.color,
          needsSupervision: !!r._ref.needsSupervision, bell:r.bell === "default" ? "" : r.bell };

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"40", oninput:(e)=>draft.name = e.target.value });
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"10",
      oninput:(e)=>draft.short = e.target.value });
    const fBuilding = D.el("input", { type:"text", value:draft.building,
      oninput:(e)=>draft.building = e.target.value });
    const fCap = D.el("input", { type:"number", min:"0", value:draft.capacity,
      oninput:(e)=>draft.capacity = e.target.value });
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);
    const fSup = D.el("input", { type:"checkbox",
      checked: draft.needsSupervision ? "checked" : null,
      onchange:(e)=>draft.needsSupervision = e.target.checked });
    const fBell = D.el("input", { type:"text", value:draft.bell, placeholder:"default",
      oninput:(e)=>draft.bell = e.target.value });

    D.buildEditSheet({
      title: isNew ? "New classroom" : `Edit classroom — ${r.name}`,
      fields:[
        { label:"Name", control:fName },
        { label:"Short", control:fShort },
        { label:"Building", control:fBuilding },
        { label:"Capacity", control:fCap },
        { label:"Color", control:fColor },
        { label:"Needs supervision", control:fSup },
        { label:"Bell", control:fBell },
      ],
      onSave:()=>{
        if (!draft.name.trim()) { fName.focus(); return; }
        const all = window.APP.school.classrooms;
        if (!isNew) {
          const rm = r._ref;
          const before = { ...rm };
          rm.name = draft.name.trim();
          rm.abbr = draft.short.trim() || undefined;
          rm.building = draft.building.trim() || undefined;
          rm.capacity = draft.capacity ? parseInt(draft.capacity, 10) : undefined;
          rm.color = draft.color || undefined;
          rm.needsSupervision = !!draft.needsSupervision;
          rm.bell = draft.bell || undefined;
          window.APP.audit.append({ entity:"classrooms", op:"update", before, after:{...rm} });
        } else {
          const nr = { id:D.uid("r"), name:draft.name.trim(),
            abbr:draft.short.trim() || undefined,
            building:draft.building.trim() || undefined,
            capacity:draft.capacity ? parseInt(draft.capacity, 10) : undefined,
            color:draft.color || undefined,
            needsSupervision: !!draft.needsSupervision,
            bell:draft.bell || undefined };
          if (all.some(x => x.name === nr.name)) { fName.focus(); return; }
          all.push(nr);
          if (window.APP.school._idx) window.APP.school._idx.classroomById[nr.id] = nr;
          window.APP.audit.append({ entity:"classrooms", op:"add", after:{...nr} });
        }
        D.closeSheet(); D.refresh(rows());
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
        if (cmd === "timeoff" && row)
          return D.openTimeOffSheet(row._ref, "classrooms", () => D.refresh(rows()));
        if (cmd === "constraints" && row) return openConstraints(row);
      },
    });
  }

  global.EntityClassrooms = { open };
})(window);
