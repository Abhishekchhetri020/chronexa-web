/* Subjects CRUD dialog. window.EntitySubjects.open() */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function rows() {
    return ((window.APP.school && window.APP.school.subjects) || []).map(s => ({
      id: s.id, name: s.name || "", short: s.abbr || s.short || "",
      color: s.color || "",
      contractWeight: s.contractWeight != null ? s.contractWeight : 1,
      pictureUrl: s.pictureUrl || "", _ref: s,
    }));
  }

  function columns() { return [
    { key:"color", label:"", sortable:false,
      render:(r)=>D.el("span", { class:"chrx-ent-swatch-dot",
        style:`background:${r.color || "transparent"}`, "aria-hidden":"true" }) },
    { key:"name",   label:"Name" },
    { key:"short",  label:"Short" },
    { key:"contractWeight", label:"Weight" },
    { key:"pictureUrl", label:"Picture", render:(r)=> r.pictureUrl ? "✔" : "—" },
  ]; }

  function openEdit(r) {
    const isNew = !r;
    const draft = isNew
      ? { name:"", short:"", color:"", contractWeight:1, pictureUrl:"" }
      : { name:r.name, short:r.short, color:r.color,
          contractWeight:r.contractWeight, pictureUrl:r.pictureUrl };

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"60", oninput:(e)=>draft.name = e.target.value });
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"10",
      oninput:(e)=>draft.short = e.target.value });
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);
    const fWeight = D.el("input", { type:"number", min:"0", max:"5", step:"0.1",
      value:draft.contractWeight,
      oninput:(e)=>draft.contractWeight = parseFloat(e.target.value) || 0 });
    const fPic = D.el("input", { type:"text", placeholder:"https://…",
      value:draft.pictureUrl, oninput:(e)=>draft.pictureUrl = e.target.value });

    D.buildEditSheet({
      title: isNew ? "New subject" : `Edit subject — ${r.name}`,
      fields: [
        { label:"Name", control:fName },
        { label:"Abbreviation", control:fShort },
        { label:"Color", control:fColor },
        { label:"Contract weight", control:fWeight },
        { label:"Picture URL", control:fPic },
      ],
      onSave: () => {
        if (!draft.name.trim()) { fName.focus(); return; }
        const all = window.APP.school.subjects;
        if (!isNew) {
          const subj = r._ref;
          const before = { ...subj };
          subj.name = draft.name.trim();
          subj.abbr = draft.short.trim() || undefined;
          subj.color = draft.color || undefined;
          subj.contractWeight = draft.contractWeight;
          subj.pictureUrl = draft.pictureUrl || undefined;
          window.APP.audit.append({ entity:"subjects", op:"update", before, after:{...subj} });
        } else {
          const ns = { id:D.uid("s"), name:draft.name.trim(),
            abbr:draft.short.trim() || undefined, color:draft.color || undefined,
            contractWeight:draft.contractWeight, pictureUrl:draft.pictureUrl || undefined };
          if (all.some(x => x.name === ns.name)) { fName.focus(); return; }
          all.push(ns);
          if (window.APP.school._idx) window.APP.school._idx.subjectById[ns.id] = ns;
          window.APP.audit.append({ entity:"subjects", op:"add", after:{...ns} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function openTimeOff(r) {
    D.openTimeOffSheet(r._ref, "subjects", () => D.refresh(rows()));
  }

  function openConstraints(r) {
    const ref = r._ref;
    const c = Object.assign({ maxPerDay:"", requiresLab:false }, ref.constraints || {});
    const fMax = D.el("input", { type:"number", min:"0", max:"9", value:c.maxPerDay,
      oninput:(e)=> c.maxPerDay = e.target.value });
    const fLab = D.el("input", { type:"checkbox", checked: c.requiresLab ? "checked" : null,
      onchange:(e)=> c.requiresLab = e.target.checked });
    D.buildEditSheet({
      title:`Constraints — ${ref.name}`,
      fields:[
        { label:"Max periods per day", control:fMax },
        { label:"Requires lab",        control:fLab },
      ],
      onSave:()=>{
        const before = ref.constraints;
        ref.constraints = c;
        window.APP.audit.append({ entity:"subjects", op:"constraints", id:ref.id, before, after:c });
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function openLessonsOf(r) {
    const lessons = ((window.APP.school && window.APP.school.lessons) || [])
      .filter(l => l.subjectId === r._ref.id);
    const list = D.el("ul", { class:"chrx-ent-list" });
    if (!lessons.length) list.appendChild(D.el("li", null, "No lessons for this subject."));
    lessons.forEach(l => list.appendChild(D.el("li", null,
      `${l.periodsPerWeek}× — classes ${l.classIds.length}, teachers ${l.teacherIds.length}`)));
    D.openSheet(list, { title: `Lessons of ${r._ref.name} (${lessons.length})` });
  }

  function open() {
    D.open({
      entity:"subjects", title:"Subjects",
      columns: columns(), rows: rows(),
      extras: [
        { id:"lessons",     label:"Lessons" },
        { id:"timeoff",     label:"Time off" },
        { id:"constraints", label:"Constraints" },
      ],
      onAction: (cmd, row) => {
        if (cmd === "new") return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = window.APP.school.subjects;
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i, 1)[0];
            window.APP.audit.append({ entity:"subjects", op:"remove", before:{...removed} });
            D.refresh(rows());
          }
          return;
        }
        if (cmd === "timeoff" && row) return openTimeOff(row);
        if (cmd === "constraints" && row) return openConstraints(row);
        if (cmd === "lessons" && row) return openLessonsOf(row);
      },
    });
  }

  global.EntitySubjects = { open };
})(window);
