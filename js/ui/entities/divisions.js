/* Divisions CRUD dialog. window.EntityDivisions.open()
 * A division splits one class into parallel sub-groups for elective /
 * lab lessons. Classic field 'divisionTag' is the textual label used
 * inside Timetable XML. Fields: classid, divisionTag, groupids[]. */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function ensure() {
    const s = window.APP.school = window.APP.school || {};
    if (!Array.isArray(s.divisions)) s.divisions = [];
    return s.divisions;
  }

  function classMap() { return window.APP.school?._idx?.classById || {}; }
  function groupMap() {
    const m = {}; (window.APP.school?.groups || []).forEach(g => m[g.id] = g);
    return m;
  }

  function rows() {
    const cm = classMap();
    const gm = groupMap();
    return ensure().map(d => ({
      id: d.id,
      classname: cm[d.classid]?.name || "(unassigned)",
      divisionTag: d.divisionTag || "",
      groupCount: (d.groupids || []).length,
      groups: (d.groupids || []).map(id => gm[id]?.name || id)
        .filter(Boolean).join(", "),
      _ref: d,
    }));
  }

  function columns() { return [
    { key:"classname",     label:"Class" },
    { key:"divisionTag", label:"Division" },
    { key:"groupCount",    label:"# Groups" },
    { key:"groups",        label:"Groups" },
  ]; }

  function makeClassSelect(curId, onChange) {
    const sel = D.el("select", null, D.el("option", { value:"" }, "—"));
    ((window.APP.school?.classes) || []).forEach(c => {
      const opt = D.el("option", { value:c.id },
        c.name + (c.abbr ? ` (${c.abbr})` : ""));
      if (c.id === curId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", e => onChange(e.target.value || ""));
    return sel;
  }

  function openEdit(r) {
    const isNew = !r;
    const ref = r ? r._ref : null;
    const draft = isNew
      ? { classid:"", divisionTag:"", groupids:[] }
      : { classid:ref.classid || "", divisionTag:ref.divisionTag || "",
          groupids:(ref.groupids || []).slice() };

    const fClass = makeClassSelect(draft.classid, v => draft.classid = v);
    const fDiv = D.el("input", { type:"text", value:draft.divisionTag,
      maxlength:"20", placeholder:"e.g. mu / da",
      oninput:(e)=>draft.divisionTag = e.target.value });

    const fGroups = D.el("select", { multiple:"multiple", size:"6" });
    ((window.APP.school?.groups) || []).forEach(g => {
      const opt = D.el("option", { value:g.id }, g.name || g.id);
      if (draft.groupids.includes(g.id)) opt.selected = true;
      fGroups.appendChild(opt);
    });
    fGroups.addEventListener("change", () => {
      draft.groupids = Array.from(fGroups.selectedOptions).map(o => o.value);
    });

    D.buildEditSheet({
      title: isNew ? "New division" : "Edit division",
      fields:[
        { label:"Class",    control:fClass },
        { label:"Division", control:fDiv },
        { label:"Groups",   control:fGroups },
      ],
      onSave:()=>{
        if (!draft.classid) { fClass.focus(); return; }
        const all = ensure();
        const payload = {
          classid: draft.classid,
          divisionTag: draft.divisionTag.trim() || undefined,
          groupids: draft.groupids.slice(),
        };
        if (!isNew) {
          const before = { ...ref };
          Object.assign(ref, payload);
          window.APP.audit.append({ entity:"divisions", op:"update",
            before, after:{...ref} });
        } else {
          payload.id = D.uid("div");
          all.push(payload);
          window.APP.audit.append({ entity:"divisions", op:"add", after:{...payload} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    ensure();
    D.open({
      entity:"divisions", title:"Class divisions",
      columns:columns(), rows:rows(),
      onAction:(cmd, row) => {
        if (cmd === "new") return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = ensure();
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i,1)[0];
            window.APP.audit.append({ entity:"divisions", op:"remove",
              before:{...removed} });
            D.refresh(rows());
          }
        }
      },
    });
  }

  global.EntityDivisions = { open };
})(window);
