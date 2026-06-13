/* Groups CRUD dialog. window.EntityGroups.open()
 * A group is a sub-grouping of a class — either the full class
 * (entireClass=true) or a fraction taking an elective. Canonical fields:
 * classId, entireClass, divisionTag, name. Legacy lowercase fields remain
 * readable so older in-browser projects can be repaired on their next edit. */
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
  function classId(g) { return g.classId || g.classid || ""; }
  function entireClass(g) { return !!(g.entireClass || g.entireclass); }

  function rows() {
    const cm = classMap();
    return ensure().map(g => ({
      id: g.id, name: g.name || "(unnamed)",
      classname: cm[classId(g)]?.name || "(unassigned)",
      divisionTag: g.divisionTag || "",
      entire: entireClass(g) ? "✔" : "—",
      _ref: g,
    }));
  }

  function columns() { return [
    { key:"name",          label:"Name" },
    { key:"classname",     label:"Class" },
    { key:"divisionTag", label:"Division" },
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
      ? { name:"", classId:"", entireClass:false, divisionTag:"" }
      : { name:ref.name || "", classId:classId(ref),
          entireClass:entireClass(ref),
          divisionTag:ref.divisionTag || "" };

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"30", oninput:(e)=>draft.name = e.target.value });
    const fClass = makeClassSelect(draft.classId, v => draft.classId = v);
    const fEntire = D.el("input", { type:"checkbox",
      checked: draft.entireClass ? "checked" : null,
      onchange:(e)=>draft.entireClass = e.target.checked });
    const fDiv = D.el("input", { type:"number", min:"0", max:"65534", value:draft.divisionTag,
      placeholder:"e.g. 1",
      oninput:(e)=>draft.divisionTag = e.target.value });

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
        if (!draft.classId) { fClass.focus(); return; }
        const all = ensure();
        const payload = {
          name: draft.name.trim(),
          classId: draft.classId,
          entireClass: !!draft.entireClass,
          divisionTag: parseInt(draft.divisionTag, 10) || 0,
        };
        if (!isNew) {
          const before = { ...ref };
          Object.assign(ref, payload);
          delete ref.classid;
          delete ref.entireclass;
          window.APP.audit.append({ entity:"groups", op:"update",
            before, after:{...ref} });
        } else {
          payload.id = D.uid("g");
          all.push(payload);
          window.APP.audit.append({ entity:"groups", op:"add", after:{...payload} });
        }
        D.closeSheet(); D.refresh(rows());
        document.dispatchEvent(new CustomEvent("entity:changed", { detail: { entity:"groups" } }));
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
            document.dispatchEvent(new CustomEvent("entity:changed", { detail: { entity:"groups" } }));
          }
        }
      },
    });
  }

  global.EntityGroups = { open };
})(window);

// Chronexa Web
