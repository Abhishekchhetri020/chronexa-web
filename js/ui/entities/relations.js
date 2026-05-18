/* Card-relationships (n_X constraints) dialog. window.EntityRelations.open()
 * n_0..n_22 typs (R6 decoded labels where known); n_5/6/8/9 are binary
 * (Pattern B enabled); others fall back to a raw label. */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  // 22 typs (n_0..n_21 + room for n_22 sentinel from advisor) with verbatim
  // labels where decoded, else raw fallback.
  const TYP_LABELS = {
    n_0:  "Cannot follow",
    n_1:  "Cannot be the same day",
    n_2:  "(reserved)",
    n_3:  "(reserved)",
    n_4:  "Card distribution over the week",
    n_5:  "Two subjects must follow (any order)",
    n_6:  "Two subjects must follow (in order)",
    n_7:  "Break cannot be between group of lessons",
    n_8:  "Two subjects must be in one day (any order)",
    n_9:  "Two subjects must be in one day (in order)",
    n_10: "Cross-class group must be in one day",
    n_11: "Divided cards from one subject same day",
    n_12: "Same start time across classes",
    n_13: "Same period across selected classes",
    n_14: "Same period each day",
    n_15: "(reserved — reserve space)",
    n_16: "Subject must be first or last",
    n_17: "Subject in afternoon block",
    n_18: "(custom)",
    n_19: "(custom)",
    n_20: "(custom)",
    n_21: "(custom)",
    n_22: "(custom)",
  };
  const BINARY = new Set(["n_5", "n_6", "n_8", "n_9"]);
  const TYP_LIST = Array.from({ length: 23 }, (_, i) => `n_${i}`);

  function ensureRelations() {
    const s = window.APP.school = window.APP.school || {};
    s.cardrelationships = s.cardrelationships || [];
    return s.cardrelationships;
  }

  function summary(r) {
    const idxS = window.APP.school?._idx?.subjectById || {};
    const idxC = window.APP.school?._idx?.classById   || {};
    const join = (ids, idx) => (ids || []).map(id => idx[id]?.name).filter(Boolean).join("+");
    let s = join(r.subjectIds, idxS); if (r.subject2Ids?.length) s += " / " + join(r.subject2Ids, idxS);
    let c = join(r.classIds, idxC);
    return [s, c].filter(Boolean).join(" — ");
  }

  function rowsOf() {
    return ensureRelations().map(r => ({
      id: r.id,
      typ: r.typ,
      label: TYP_LABELS[r.typ] || r.typ,
      importance: r.importance || "normal",
      summary: summary(r),
      disabled: r.disabled ? "off" : "",
      _ref: r,
    }));
  }

  function columns() { return [
    { key:"typ",        label:"Typ" },
    { key:"label",      label:"Description" },
    { key:"summary",    label:"Scope" },
    { key:"importance", label:"Importance" },
    { key:"disabled",   label:"" },
  ]; }

  function makeMulti(items, curIds, label, onChange) {
    const sel = D.el("select", { multiple:"multiple", size:"5" });
    (items || []).forEach(t => {
      const opt = D.el("option", { value:t.id }, label(t));
      if ((curIds || []).includes(t.id)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () =>
      onChange(Array.from(sel.selectedOptions).map(o => o.value)));
    return sel;
  }

  function openEdit(r) {
    const isNew = !r;
    const s = window.APP.school;
    const draft = isNew
      ? { typ:"n_1", importance:"normal", note:"", disabled:false,
          subjectIds:[], classIds:[], teacherIds:[], classroomIds:[],
          subject2Ids:[], class2Ids:[] }
      : {
          typ: r._ref.typ, importance: r._ref.importance || "normal",
          note: r._ref.note || "", disabled: !!r._ref.disabled,
          subjectIds: (r._ref.subjectIds || []).slice(),
          classIds:   (r._ref.classIds   || []).slice(),
          teacherIds: (r._ref.teacherIds || []).slice(),
          classroomIds: (r._ref.classroomIds || []).slice(),
          subject2Ids: (r._ref.subject2Ids || []).slice(),
          class2Ids:   (r._ref.class2Ids   || []).slice(),
        };

    const fTyp = D.el("select", null);
    TYP_LIST.forEach(t => {
      const opt = D.el("option", { value:t }, `${t} — ${TYP_LABELS[t] || t}`);
      if (t === draft.typ) opt.selected = true;
      fTyp.appendChild(opt);
    });
    const fImp = D.el("select", null);
    ["low","normal","high","strict","optimize","default"].forEach(v => {
      const opt = D.el("option", { value:v }, v);
      if (v === draft.importance) opt.selected = true;
      fImp.appendChild(opt);
    });
    fImp.addEventListener("change", e => draft.importance = e.target.value);

    const fNote = D.el("textarea", { rows:"2", placeholder:"Optional note",
      oninput:(e)=>draft.note = e.target.value }, draft.note);
    const fDis = D.el("input", { type:"checkbox",
      checked: draft.disabled ? "checked" : null,
      onchange:(e)=>draft.disabled = e.target.checked });

    const fSubj = makeMulti(s.subjects, draft.subjectIds,
      x => x.name + (x.abbr ? ` (${x.abbr})` : ""), v => draft.subjectIds = v);
    const fCls = makeMulti(s.classes, draft.classIds, x => x.name, v => draft.classIds = v);
    const fTch = makeMulti(s.teachers, draft.teacherIds, x => x.name, v => draft.teacherIds = v);
    const fRm  = makeMulti(s.classrooms, draft.classroomIds, x => x.name, v => draft.classroomIds = v);

    // Pattern-B (only enabled for binary typs, dual-pattern matcher)
    const fSubj2 = makeMulti(s.subjects, draft.subject2Ids,
      x => x.name + (x.abbr ? ` (${x.abbr})` : ""), v => draft.subject2Ids = v);
    const fCls2 = makeMulti(s.classes, draft.class2Ids, x => x.name, v => draft.class2Ids = v);

    function applyTypUI() {
      const binary = BINARY.has(draft.typ);
      [fSubj2, fCls2].forEach(el => { el.disabled = !binary; el.style.opacity = binary ? 1 : 0.4; });
    }
    fTyp.addEventListener("change", e => { draft.typ = e.target.value; applyTypUI(); });
    applyTypUI();

    const patternA = D.el("fieldset", { class:"chrx-ent-fset" },
      D.el("legend", null, "Pattern A"),
      D.buildField("Subjects", fSubj),
      D.buildField("Classes",  fCls),
      D.buildField("Teachers", fTch),
      D.buildField("Classrooms", fRm),
    );
    const op = D.el("div", { class:"chrx-ent-op" }, "→");
    const patternB = D.el("fieldset", { class:"chrx-ent-fset" },
      D.el("legend", null, "Pattern B (binary typs only)"),
      D.buildField("Subjects (B)", fSubj2),
      D.buildField("Classes (B)",  fCls2),
    );
    const patternRow = D.el("div", { class:"chrx-ent-rels" }, patternA, op, patternB);

    D.buildEditSheet({
      title: isNew ? "New relation" : `Edit relation — ${r.typ}`,
      fields:[
        { label:"Typ",        control:fTyp },
        { label:"Importance", control:fImp },
        { label:null,         control: patternRow },
        { label:"Note",       control:fNote },
        { label:"Disabled",   control:fDis },
      ],
      onSave:()=>{
        const all = ensureRelations();
        const payload = {
          typ: draft.typ, importance: draft.importance,
          note: draft.note || undefined, disabled: !!draft.disabled,
          subjectIds: draft.subjectIds.slice(),
          classIds:   draft.classIds.slice(),
          teacherIds: draft.teacherIds.slice(),
          classroomIds: draft.classroomIds.slice(),
        };
        if (BINARY.has(draft.typ)) {
          payload.subject2Ids = draft.subject2Ids.slice();
          payload.class2Ids   = draft.class2Ids.slice();
        }
        if (!isNew) {
          const ref = r._ref;
          const before = { ...ref };
          Object.assign(ref, payload);
          window.APP.audit.append({ entity:"relations", op:"update", before, after:{...ref} });
        } else {
          payload.id = D.uid("rel");
          all.push(payload);
          window.APP.audit.append({ entity:"relations", op:"add", after:{...payload} });
        }
        D.closeSheet(); D.refresh(rowsOf());
      },
    });
  }

  function open() {
    ensureRelations();
    D.open({
      entity:"relations", title:"Card relationships",
      columns:columns(), rows:rowsOf(),
      onAction:(cmd, row) => {
        if (cmd === "new")  return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = ensureRelations();
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i, 1)[0];
            window.APP.audit.append({ entity:"relations", op:"remove", before:{...removed} });
            D.refresh(rowsOf());
          }
        }
      },
    });
  }

  global.EntityRelations = { open };
})(window);
