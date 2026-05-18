/* CourseGroups CRUD dialog. window.EntityCourseGroups.open()
 * High-school elective groups — e.g. Science / Commerce / Humanities
 * streams in classes XI–XII. A course-group bundles the subjects that
 * its students choose. Fields: name, short, subjectids[]. */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function ensure() {
    const s = window.APP.school = window.APP.school || {};
    if (!Array.isArray(s.coursegroups)) s.coursegroups = [];
    return s.coursegroups;
  }

  function subjMap() { return window.APP.school?._idx?.subjectById || {}; }

  function subjLabels(ids) {
    const m = subjMap();
    return (ids || []).map(id => m[id]?.abbr || m[id]?.name || id)
      .filter(Boolean).join(", ");
  }

  function rows() {
    return ensure().map(g => ({
      id: g.id, name: g.name || "(unnamed)",
      short: g.short || "",
      subjects: subjLabels(g.subjectids),
      count: (g.subjectids || []).length,
      _ref: g,
    }));
  }

  function columns() { return [
    { key:"name",     label:"Name" },
    { key:"short",    label:"Short" },
    { key:"count",    label:"# Subjects" },
    { key:"subjects", label:"Subjects" },
  ]; }

  function openEdit(r) {
    const isNew = !r;
    const ref = r ? r._ref : null;
    const draft = isNew
      ? { name:"", short:"", subjectids:[] }
      : { name:ref.name || "", short:ref.short || "",
          subjectids:(ref.subjectids || []).slice() };

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"40", oninput:(e)=>draft.name = e.target.value });
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"10",
      oninput:(e)=>draft.short = e.target.value });

    const fSubj = D.el("select", { multiple:"multiple", size:"8" });
    ((window.APP.school?.subjects) || []).forEach(s => {
      const opt = D.el("option", { value:s.id },
        s.name + (s.abbr ? ` (${s.abbr})` : ""));
      if (draft.subjectids.includes(s.id)) opt.selected = true;
      fSubj.appendChild(opt);
    });
    fSubj.addEventListener("change", () => {
      draft.subjectids = Array.from(fSubj.selectedOptions).map(o => o.value);
    });

    D.buildEditSheet({
      title: isNew ? "New course group" : `Edit course group — ${draft.name}`,
      fields:[
        { label:"Name",     control:fName },
        { label:"Short",    control:fShort },
        { label:"Subjects", control:fSubj },
      ],
      onSave:()=>{
        if (!draft.name.trim()) { fName.focus(); return; }
        const all = ensure();
        const payload = {
          name: draft.name.trim(),
          short: draft.short.trim() || undefined,
          subjectids: draft.subjectids.slice(),
        };
        if (!isNew) {
          const before = { ...ref };
          Object.assign(ref, payload);
          window.APP.audit.append({ entity:"coursegroups", op:"update",
            before, after:{...ref} });
        } else {
          if (all.some(x => x.name === payload.name)) { fName.focus(); return; }
          payload.id = D.uid("cg");
          all.push(payload);
          window.APP.audit.append({ entity:"coursegroups", op:"add", after:{...payload} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    ensure();
    D.open({
      entity:"coursegroups", title:"Course groups",
      columns:columns(), rows:rows(),
      onAction:(cmd, row) => {
        if (cmd === "new") return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = ensure();
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i,1)[0];
            window.APP.audit.append({ entity:"coursegroups", op:"remove",
              before:{...removed} });
            D.refresh(rows());
          }
        }
      },
    });
  }

  global.EntityCourseGroups = { open };
})(window);
