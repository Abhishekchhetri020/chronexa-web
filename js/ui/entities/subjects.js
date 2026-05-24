/* Subjects CRUD dialog. window.EntitySubjects.open() */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function getSubjectNPeriods() {
    const s = window.APP && window.APP.school;
    return (s && s.bell && s.bell.periods && s.bell.periods.length) || 8;
  }
  function getSubjectNDays() {
    const s = window.APP && window.APP.school;
    return ((s && s._idx && s._idx.days) || ["Mon","Tue","Wed","Thu","Fri","Sat"]).length;
  }

  function rows() {
    const nP = getSubjectNPeriods();
    const nD = getSubjectNDays();
    return ((window.APP.school && window.APP.school.subjects) || []).map(s => {
      const norm = window.TimeOffMatrix
        ? window.TimeOffMatrix.normalize(s.timeOff, nD, nP)
        : null;
      return {
        id: s.id, name: s.name || "", short: s.abbr || s.short || "",
        color: s.color || "",
        contractWeight: s.contractWeight != null ? s.contractWeight : 1,
        pictureUrl: s.pictureUrl || "", _ref: s,
        _timeOff: norm, _nP: nP,
      };
    });
  }

  function columns() { return [
    { key:"color", label:"", sortable:false,
      render:(r)=>D.el("span", { class:"chrx-ent-swatch-dot",
        style:`background:${r.color || "transparent"}`, "aria-hidden":"true" }) },
    { key:"name",  label:"Name" },
    { key:"short", label:"Short" },
    { key:"contractWeight", label:"Weight" },
    { key:"timeOff", label:"Time off", sortable:false,
      render:(r) => {
        const wrap = D.el("div", { class:"chrx-subj-tobar", "aria-hidden":"true" });
        for (let p = 0; p < r._nP; p++) {
          let maxState = 0;
          if (r._timeOff) {
            for (let d = 0; d < r._timeOff.length; d++) {
              if (r._timeOff[d][p] > maxState) maxState = r._timeOff[d][p];
            }
          }
          wrap.appendChild(D.el("span", {
            class: "chrx-subj-tobar__dot",
            "data-state": String(maxState),
          }));
        }
        return wrap;
      },
    },
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

    function save() {
      if (!draft.name.trim()) { fName.focus(); return false; }
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
        if (all.some(x => x.name === ns.name)) { fName.focus(); return false; }
        all.push(ns);
        if (window.APP.school._idx) window.APP.school._idx.subjectById[ns.id] = ns;
        window.APP.audit.append({ entity:"subjects", op:"add", after:{...ns} });
      }
      D.closeSheet(); D.refresh(rows());
      return true;
    }

    D.buildEditSheet({
      title: isNew ? "New subject" : `Edit subject — ${r.name}`,
      fields: [
        { label:"Name", control:fName },
        { label:"Abbreviation", control:fShort },
        { label:"Color", control:fColor },
        { label:"Contract weight", control:fWeight },
        { label:"Picture URL", control:fPic },
      ],
      onSave: save,
      siblingRows: isNew ? null : rows(),
      currentRowId: isNew ? null : r.id,
      onNavigate: openEdit,
    });
  }

  function openTimeOff(r) {
    const ref = r._ref;
    if (!window.TimeOffMatrix) return;
    window.TimeOffMatrix.open(ref, "subjects", (newTimeOff) => {
      const before = ref.timeOff;
      ref.timeOff = newTimeOff;
      window.APP.audit.append({ entity:"subjects", op:"timeoff", id:ref.id, before, after:newTimeOff });
      D.refresh(rows());
    });
  }

  function openConstraints(r) {
    const ref = r._ref;
    const c = Object.assign({ maxPerDay:"", requiresLab:false }, ref.constraints || {});
    const fMax = D.el("input", { type:"number", min:"0", max:"9", value:c.maxPerDay,
      oninput:(e)=> c.maxPerDay = e.target.value });
    const fLab = D.el("input", { type:"checkbox", checked: c.requiresLab ? "checked" : null,
      onchange:(e)=> c.requiresLab = e.target.checked });

    // Top-30 #23 — filtered card-relations view inline on the Subject
    // Constraints sheet. Surfaces every n_* relation touching this subject
    // so the admin can see and jump to edit them without scanning the
    // full Relations dialog.
    const S = window.APP && window.APP.school;
    const relations = (S && Array.isArray(S.relations)) ? S.relations : [];
    const touching = relations.filter(rel =>
      Array.isArray(rel.subjectids) && rel.subjectids.includes(ref.id));
    const relList = D.el("div", { style: "margin-top:4px;padding:8px 10px;background:#f8fafc;border-radius:6px" });
    relList.appendChild(D.el("div", { style: "font-size:11px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px" },
      `Card relations touching ${ref.name} (${touching.length})`));
    if (!touching.length) {
      relList.appendChild(D.el("div", { style: "font-size:12px;color:#94a3b8;font-style:italic" },
        "None. Open Specification → Relations to add."));
    } else {
      for (const rel of touching.slice(0, 10)) {
        const li = D.el("div", { style: "font-size:12px;padding:3px 0" },
          (rel.typ || "?") + " · " + (rel.name || ""));
        relList.appendChild(li);
      }
      if (touching.length > 10) {
        relList.appendChild(D.el("div", { style: "font-size:11px;color:#64748b;margin-top:4px" },
          `+ ${touching.length - 10} more — open Relations to see all.`));
      }
      const openRelBtn = D.el("button", { type: "button", class: "chrx-btn",
        style: "margin-top:6px;padding:4px 10px;font-size:11px",
        onclick: () => {
          D.closeSheet();
          window.dispatchEvent(new CustomEvent("app:open-entity",
            { detail: { kind: "relations", filterSubjectId: ref.id } }));
        } }, "Open Relations");
      relList.appendChild(openRelBtn);
    }

    D.buildEditSheet({
      title:`Constraints — ${ref.name}`,
      fields:[
        { label:"Max periods per day", control:fMax },
        { label:"Requires lab",        control:fLab },
        { label:null,                  control:relList },
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

  // Settings copied by "To another…" / "Apply to multiple…" (not name/id/abbr).
  const COPYABLE_KEYS = ["color", "contractWeight", "pictureUrl", "timeOff", "constraints"];
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
      window.APP.audit.append({ entity:"subjects", op:"copy", id:targetRef.id, before, after:{...targetRef} });
    }
    const all = rows();
    const others = all.filter(x => x.id !== r.id).map(x => ({
      id: x.id, name: x.name || x.id, _ref: x._ref,
    }));

    D.openCopyChooser({
      title: `Copy — ${r.name}`,
      source: srcRef,
      others,
      onDuplicate: () => {
        const all = window.APP.school.subjects;
        const copy = { ...srcRef, id: D.uid("s"), name: (srcRef.name || "") + " (copy)" };
        if (srcRef.timeOff != null)   copy.timeOff = deepClone(srcRef.timeOff);
        if (srcRef.constraints)        copy.constraints = deepClone(srcRef.constraints);
        all.push(copy);
        if (window.APP.school._idx) window.APP.school._idx.subjectById[copy.id] = copy;
        window.APP.audit.append({ entity:"subjects", op:"add", after:{...copy} });
        D.refresh(rows());
      },
      onCopyToOne: (targetRef) => {
        applySettings(targetRef);
        D.refresh(rows());
      },
      onCopyToMany: (targetRefs) => {
        targetRefs.forEach(applySettings);
        D.refresh(rows());
      },
    });
  }

  // Batch edit (P2#11)
  function openBatch() {
    const all = rows();
    D.openBatchEditSheet({
      title: "Batch edit — Subjects",
      rows: all.map(r => ({ id:r.id, name:r.name, _ref:r._ref })),
      fields: [
        { id:"color", label:"Color",
          build:(onChange) => D.buildSwatchPicker("", v => onChange(v || "")) },
        { id:"contractWeight", label:"Contract weight",
          build:(onChange) => D.el("input", { type:"number", min:"0", max:"5", step:"0.1",
            oninput:(e)=>onChange(parseFloat(e.target.value) || 0) }) },
      ],
      onApply: (fieldId, value, ids) => {
        const byId = {}; all.forEach(r => byId[r.id] = r._ref);
        ids.forEach(id => {
          const ref = byId[id]; if (!ref) return;
          const before = { ...ref };
          if (fieldId === "color")             ref.color = value || undefined;
          else if (fieldId === "contractWeight") ref.contractWeight = value;
          window.APP.audit.append({ entity:"subjects", op:"batch", field:fieldId, id, before, after:{...ref} });
        });
        D.refresh(rows());
      },
    });
  }

  function open() {
    D.open({
      entity:"subjects", title:"Subjects",
      columns: columns(), rows: rows(),
      extras: [
        { id:"lessons",     label:"Lessons" },
        { id:"timeoff",     label:"Time off" },
        { id:"constraints", label:"Constraints" },
        { id:"copy",        label:"Copy" },
        { id:"batch",       label:"Batch edit", needRow:false },
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
        if (cmd === "copy" && row) return openCopy(row);
        if (cmd === "batch") return openBatch();
      },
    });
  }

  global.EntitySubjects = { open };
})(window);
