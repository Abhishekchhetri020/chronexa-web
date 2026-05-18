/* Weeks CRUD dialog. window.EntityWeeks.open()
 * Free-form week entity for A/B-week scheduling (Week A, Week B, exam-week …).
 * Lessons / supervisions can scope themselves to a week. Fields: name,
 * short, color. */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function ensure() {
    const s = window.APP.school = window.APP.school || {};
    if (!Array.isArray(s.weeks)) s.weeks = [];
    return s.weeks;
  }

  function rows() {
    return ensure().map(w => ({
      id: w.id, name: w.name || "(unnamed)",
      short: w.short || "", color: w.color || "",
      _ref: w,
    }));
  }

  function columns() { return [
    { key:"color", label:"", sortable:false,
      render:(r)=>D.el("span", { class:"chrx-ent-swatch-dot",
        style:`background:${r.color || "transparent"}`, "aria-hidden":"true" }) },
    { key:"name",  label:"Name" },
    { key:"short", label:"Short" },
  ]; }

  function openEdit(r) {
    const isNew = !r;
    const ref = r ? r._ref : null;
    const draft = isNew
      ? { name:"", short:"", color:"" }
      : { name:ref.name || "", short:ref.short || "", color:ref.color || "" };

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"30", oninput:(e)=>draft.name = e.target.value });
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"10",
      oninput:(e)=>draft.short = e.target.value });
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);

    D.buildEditSheet({
      title: isNew ? "New week" : `Edit week — ${draft.name}`,
      fields:[
        { label:"Name",  control:fName },
        { label:"Short", control:fShort },
        { label:"Color", control:fColor },
      ],
      onSave:()=>{
        if (!draft.name.trim()) { fName.focus(); return; }
        const all = ensure();
        const payload = {
          name: draft.name.trim(),
          short: draft.short.trim() || undefined,
          color: draft.color || undefined,
        };
        if (!isNew) {
          const before = { ...ref };
          Object.assign(ref, payload);
          window.APP.audit.append({ entity:"weeks", op:"update", before, after:{...ref} });
        } else {
          if (all.some(x => x.name === payload.name)) { fName.focus(); return; }
          payload.id = D.uid("wk");
          all.push(payload);
          window.APP.audit.append({ entity:"weeks", op:"add", after:{...payload} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    ensure();
    D.open({
      entity:"weeks", title:"Weeks",
      columns:columns(), rows:rows(),
      onAction:(cmd, row) => {
        if (cmd === "new") return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = ensure();
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i,1)[0];
            window.APP.audit.append({ entity:"weeks", op:"remove", before:{...removed} });
            D.refresh(rows());
          }
        }
      },
    });
  }

  global.EntityWeeks = { open };
})(window);
