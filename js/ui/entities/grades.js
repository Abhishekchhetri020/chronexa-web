/* Grades CRUD dialog. window.EntityGrades.open()
 * Grade-level / year-group entity (Grade 1, Grade 2 … or Primary,
 * Secondary). Lets a school bundle classes by grade for analytics
 * and constraint sharing. Fields: name, short, color, classids[]. */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function ensure() {
    const s = window.APP.school = window.APP.school || {};
    if (!Array.isArray(s.grades)) s.grades = [];
    return s.grades;
  }

  function classMap() { return window.APP.school?._idx?.classById || {}; }

  function classLabels(ids) {
    const m = classMap();
    return (ids || []).map(id => m[id]?.abbr || m[id]?.name || id)
      .filter(Boolean).join(", ");
  }

  function rows() {
    return ensure().map(g => ({
      id: g.id, name: g.name || "(unnamed)",
      short: g.short || "", color: g.color || "",
      classes: classLabels(g.classids),
      count: (g.classids || []).length,
      _ref: g,
    }));
  }

  function columns() { return [
    { key:"color", label:"", sortable:false,
      render:(r)=>D.el("span", { class:"chrx-ent-swatch-dot",
        style:`background:${r.color || "transparent"}`, "aria-hidden":"true" }) },
    { key:"name",    label:"Name" },
    { key:"short",   label:"Short" },
    { key:"count",   label:"# Classes" },
    { key:"classes", label:"Classes" },
  ]; }

  function openEdit(r) {
    const isNew = !r;
    const ref = r ? r._ref : null;
    const draft = isNew
      ? { name:"", short:"", color:"", classids:[] }
      : { name:ref.name || "", short:ref.short || "",
          color:ref.color || "", classids:(ref.classids || []).slice() };

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"40", oninput:(e)=>draft.name = e.target.value });
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"10",
      oninput:(e)=>draft.short = e.target.value });
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);

    const fClasses = D.el("select", { multiple:"multiple", size:"8" });
    ((window.APP.school?.classes) || []).forEach(c => {
      const opt = D.el("option", { value:c.id },
        c.name + (c.abbr ? ` (${c.abbr})` : ""));
      if (draft.classids.includes(c.id)) opt.selected = true;
      fClasses.appendChild(opt);
    });
    fClasses.addEventListener("change", () => {
      draft.classids = Array.from(fClasses.selectedOptions).map(o => o.value);
    });

    D.buildEditSheet({
      title: isNew ? "New grade" : `Edit grade — ${draft.name}`,
      fields:[
        { label:"Name",    control:fName },
        { label:"Short",   control:fShort },
        { label:"Color",   control:fColor },
        { label:"Classes", control:fClasses },
      ],
      onSave:()=>{
        if (!draft.name.trim()) { fName.focus(); return; }
        const all = ensure();
        const payload = {
          name: draft.name.trim(),
          short: draft.short.trim() || undefined,
          color: draft.color || undefined,
          classids: draft.classids.slice(),
        };
        if (!isNew) {
          const before = { ...ref };
          Object.assign(ref, payload);
          window.APP.audit.append({ entity:"grades", op:"update",
            before, after:{...ref} });
        } else {
          if (all.some(x => x.name === payload.name)) { fName.focus(); return; }
          payload.id = D.uid("gr");
          all.push(payload);
          window.APP.audit.append({ entity:"grades", op:"add", after:{...payload} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    ensure();
    D.open({
      entity:"grades", title:"Grades",
      columns:columns(), rows:rows(),
      onAction:(cmd, row) => {
        if (cmd === "new") return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = ensure();
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i,1)[0];
            window.APP.audit.append({ entity:"grades", op:"remove",
              before:{...removed} });
            D.refresh(rows());
          }
        }
      },
    });
  }

  global.EntityGrades = { open };
})(window);
