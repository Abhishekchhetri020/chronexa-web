/* Groups CRUD dialog. window.EntityGroups.open()
 * A group is a sub-grouping of a class — either the full class
 * (entireclass=true) or a fraction taking an elective. Fields:
 * classid, entireclass, ascttdivision, name. */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function ensure() {
    const s = window.APP.school = window.APP.school || {};
    if (!Array.isArray(s.groups)) s.groups = [];
    return s.groups;
  }

  function classMap() { return window.APP.school?._idx?.classById || {}; }

  function rows() {
    const cm = classMap();
    return ensure().map(g => ({
      id: g.id, name: g.name || "(unnamed)",
      classname: cm[g.classid]?.name || "(unassigned)",
      ascttdivision: g.ascttdivision || "",
      entire: g.entireclass ? "✔" : "—",
      _ref: g,
    }));
  }

  function columns() { return [
    { key:"name",          label:"Name" },
    { key:"classname",     label:"Class" },
    { key:"ascttdivision", label:"Division" },
    { key:"entire",        label:"Entire?" },
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
      ? { name:"", classid:"", entireclass:false, ascttdivision:"" }
      : { name:ref.name || "", classid:ref.classid || "",
          entireclass:!!ref.entireclass,
          ascttdivision:ref.ascttdivision || "" };

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"30", oninput:(e)=>draft.name = e.target.value });
    const fClass = makeClassSelect(draft.classid, v => draft.classid = v);
    const fEntire = D.el("input", { type:"checkbox",
      checked: draft.entireclass ? "checked" : null,
      onchange:(e)=>draft.entireclass = e.target.checked });
    const fDiv = D.el("input", { type:"text", value:draft.ascttdivision,
      maxlength:"20", placeholder:"e.g. mu / da",
      oninput:(e)=>draft.ascttdivision = e.target.value });

    D.buildEditSheet({
      title: isNew ? "New group" : `Edit group — ${draft.name}`,
      fields:[
        { label:"Name",         control:fName },
        { label:"Class",        control:fClass },
        { label:"Entire class", control:fEntire },
        { label:"Division",     control:fDiv },
      ],
      onSave:()=>{
        if (!draft.name.trim()) { fName.focus(); return; }
        if (!draft.classid) { fClass.focus(); return; }
        const all = ensure();
        const payload = {
          name: draft.name.trim(),
          classid: draft.classid,
          entireclass: !!draft.entireclass,
          ascttdivision: draft.ascttdivision.trim() || undefined,
        };
        if (!isNew) {
          const before = { ...ref };
          Object.assign(ref, payload);
          window.APP.audit.append({ entity:"groups", op:"update",
            before, after:{...ref} });
        } else {
          payload.id = D.uid("g");
          all.push(payload);
          window.APP.audit.append({ entity:"groups", op:"add", after:{...payload} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    ensure();
    D.open({
      entity:"groups", title:"Class groups",
      columns:columns(), rows:rows(),
      onAction:(cmd, row) => {
        if (cmd === "new") return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = ensure();
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i,1)[0];
            window.APP.audit.append({ entity:"groups", op:"remove",
              before:{...removed} });
            D.refresh(rows());
          }
        }
      },
    });
  }

  global.EntityGroups = { open };
})(window);
