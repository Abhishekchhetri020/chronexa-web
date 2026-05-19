/* Card-relationships dialog. window.EntityRelations.open()
 *
 * Full UI for the 15 decoded EduPage n_X typed constraints. Verbatim labels
 * from EDUPAGE_FEATURE_MAP_WIZARD_6_8_R6.md §10.2.
 *
 * New flow: 3-step wizard (typ → scope → importance/note).
 * Edit flow: single sheet — typ is fixed, only scope + importance/note editable.
 *
 * Storage: window.APP.school.relations[]
 * Field names follow EduPage wire shape (lowercase): subjectids, classids,
 * subject2ids, teacherids, classroomids, positions, positions2, param1, param2,
 * filter, filter2, applyto, importance, note, disabled, typ.
 */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  // ---------- 15 decoded typs, grouped, verbatim labels ----------
  const TYP_CATALOGUE = [
    { code:"n_0",  label:"cannot follow.",
      category:"Same / different day",
      help:"These subjects cannot be scheduled in consecutive periods." },
    { code:"n_1",  label:"cannot be the same day.",
      category:"Same / different day",
      help:"These subjects cannot be placed on the same weekday." },
    { code:"n_4",  label:"Card distribution over the week",
      category:"Same / different day",
      help:"Spread the cards of these subjects evenly across the week." },
    { code:"n_7",  label:"Break cannot be between group of lessons",
      category:"Same / different day",
      help:"Don't allow a break between this group of consecutive lessons." },
    { code:"n_11", label:"Divided cards from one subject must be on one day",
      category:"Same / different day",
      help:"Divided (split) cards for one subject must stay on the same day." },

    { code:"n_5",  label:"Two subjects must follow. (In arbitrary order)",
      category:"Two-subject",
      help:"Subjects A and B must be in consecutive periods (either order)." },
    { code:"n_6",  label:"Two subjects must follow.",
      category:"Two-subject",
      help:"Subject A then Subject B, in that order, in consecutive periods." },
    { code:"n_8",  label:"Two subjects must be in one day (In arbitrary order)",
      category:"Two-subject",
      help:"Subjects A and B must be on the same day (either order)." },
    { code:"n_9",  label:"Two subjects must be in one day (In specified order)",
      category:"Two-subject",
      help:"Subject A must precede Subject B on the same day." },

    { code:"n_10", label:"Group of cards from different classes must be in one day",
      category:"Multi-class",
      help:"All listed classes must run the listed subjects on the same day." },
    { code:"n_12", label:"These subjects for the groups of listed classes must start at the same time.",
      category:"Multi-class",
      help:"For these subjects across these classes, all cards must start at the same time." },
    { code:"n_13", label:"The selected subjects have to be at the same time in all selected classes.",
      category:"Multi-class",
      help:"Synchronise these subjects across all listed classes to the same period." },

    { code:"n_14", label:"This subject must be on the same period each day",
      category:"Position",
      help:"This subject must occupy the same period number on every day it runs." },
    { code:"n_16", label:"Subject must be first or last",
      category:"Position",
      help:"This subject must be the first or the last lesson of the day." },
    { code:"n_17", label:"The selected subjects can be in the afternoon (outside teaching block)",
      category:"Position",
      help:"This subject is allowed in afternoon periods outside the teaching block." },
  ];
  const TYP_BY_CODE = Object.fromEntries(TYP_CATALOGUE.map(t => [t.code, t]));
  const CATEGORY_ORDER = ["Same / different day","Two-subject","Multi-class","Position"];

  // Per-typ field requirements.
  const NEEDS_SUBJECT2 = new Set(["n_5","n_6","n_8","n_9"]);
  const NEEDS_POSITIONS_FIRSTLAST = new Set(["n_16"]);
  const NEEDS_POSITIONS_RANGE     = new Set(["n_17"]);

  const IMPORTANCE_LEVELS = ["low","normal","high","strict","optimize","default"];

  // ---------- Storage ----------
  function ensureRelations() {
    const s = window.APP.school = window.APP.school || {};
    s.relations = s.relations || [];
    return s.relations;
  }

  function idx() {
    return window.APP.school?._idx || {};
  }

  // ---------- Row rendering ----------
  function joinNames(ids, byId) {
    if (!ids || !byId) return "";
    return ids.map(id => byId[id]?.name || id).filter(Boolean).join(", ");
  }

  function summaryRow(r) {
    const i = idx();
    const subj  = joinNames(r.subjectids,  i.subjectById);
    const subj2 = joinNames(r.subject2ids, i.subjectById);
    const cls   = joinNames(r.classids,    i.classById);
    return {
      id: r.id,
      typ: r.typ,
      label: TYP_BY_CODE[r.typ]?.label || r.typ,
      subjects: subj2 ? `${subj} → ${subj2}` : subj,
      classes: cls,
      importance: r.importance || "normal",
      note: (r.note || "").length > 40 ? r.note.slice(0,40) + "…" : (r.note || ""),
      disabled: r.disabled ? "off" : "",
      _ref: r,
    };
  }

  function rowsOf() {
    // Sort by typ ascending (numeric on the n_X tail) for stable default order.
    return ensureRelations()
      .map(summaryRow)
      .sort((a,b) => {
        const an = parseInt((a.typ||"").slice(2),10) || 0;
        const bn = parseInt((b.typ||"").slice(2),10) || 0;
        return an - bn;
      });
  }

  function columns() { return [
    { key:"disabled",   label:"" },
    { key:"typ",        label:"Typ" },
    { key:"label",      label:"Description" },
    { key:"subjects",   label:"Subjects" },
    { key:"classes",    label:"Classes" },
    { key:"importance", label:"Importance" },
    { key:"note",       label:"Note" },
  ]; }

  // ---------- Multi-pickers (private to this module) ----------
  function multiPicker(items, curIds, labelFn, onChange, size) {
    const sel = D.el("select", { multiple:"multiple", size:String(size || 6) });
    (items || []).forEach(t => {
      const opt = D.el("option", { value:t.id }, labelFn(t));
      if ((curIds || []).includes(t.id)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () =>
      onChange(Array.from(sel.selectedOptions).map(o => o.value)));
    return sel;
  }

  function subjectPicker(curIds, onChange) {
    const s = window.APP.school || {};
    return multiPicker(s.subjects, curIds,
      x => x.name + (x.abbr ? ` (${x.abbr})` : ""), onChange, 7);
  }
  function classPicker(curIds, onChange) {
    const s = window.APP.school || {};
    return multiPicker(s.classes, curIds, x => x.name, onChange, 7);
  }
  function teacherPicker(curIds, onChange) {
    const s = window.APP.school || {};
    return multiPicker(s.teachers, curIds,
      x => x.name + (x.abbr ? ` (${x.abbr})` : ""), onChange, 5);
  }
  function classroomPicker(curIds, onChange) {
    const s = window.APP.school || {};
    return multiPicker(s.classrooms, curIds, x => x.name, onChange, 5);
  }

  // ---------- Typ picker (grouped) ----------
  function typPicker(curTyp, onChange) {
    const sel = D.el("select");
    CATEGORY_ORDER.forEach(cat => {
      const grp = D.el("optgroup", { label: cat });
      TYP_CATALOGUE.filter(t => t.category === cat).forEach(t => {
        const opt = D.el("option", { value:t.code },
          `${t.code} — ${t.label}`);
        if (t.code === curTyp) opt.selected = true;
        grp.appendChild(opt);
      });
      sel.appendChild(grp);
    });
    sel.addEventListener("change", e => onChange(e.target.value));
    return sel;
  }

  // ---------- Importance picker ----------
  function importancePicker(cur, onChange) {
    const sel = D.el("select");
    IMPORTANCE_LEVELS.forEach(v => {
      const opt = D.el("option", { value:v }, v);
      if (v === cur) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", e => onChange(e.target.value));
    return sel;
  }

  // ---------- Positions controls (n_16 / n_17) ----------
  function firstLastPicker(cur, onChange) {
    // cur is "first" | "last" | undefined
    const groupName = "chrx-firstlast-" + D.uid("g");
    const wrap = D.el("div", { style:"display:flex; gap:14px; align-items:center;" });
    ["first","last"].forEach(v => {
      const id = groupName + "_" + v;
      const radio = D.el("input", {
        type:"radio", name:groupName, id, value:v,
        checked: cur === v ? "checked" : null,
        onchange:()=>onChange(v),
      });
      const lbl = D.el("label", { for:id, style:"margin-left:4px;" }, v);
      wrap.appendChild(D.el("span", { style:"display:inline-flex; align-items:center;" }, radio, lbl));
    });
    return wrap;
  }

  function rangePicker(cur, onChange) {
    // cur is { from, to } | undefined
    const state = { from: cur?.from ?? 5, to: cur?.to ?? 8 };
    const fromI = D.el("input", { type:"number", min:"1", max:"20",
      value:String(state.from), style:"width:70px;",
      oninput:(e)=>{ state.from = parseInt(e.target.value,10) || 0; onChange({...state}); } });
    const toI = D.el("input", { type:"number", min:"1", max:"20",
      value:String(state.to), style:"width:70px;",
      oninput:(e)=>{ state.to = parseInt(e.target.value,10) || 0; onChange({...state}); } });
    return D.el("div", { style:"display:flex; gap:6px; align-items:center;" },
      D.el("span", null, "From P"), fromI,
      D.el("span", null, "to P"), toI);
  }

  // ---------- Draft helpers ----------
  function newDraft() {
    return {
      typ: "n_1",
      importance: "normal",
      note: "",
      disabled: false,
      subjectids: [], subject2ids: [], classids: [],
      teacherids: [], classroomids: [],
      positions: undefined, positions2: undefined,
      param1: undefined, param2: undefined,
      filter: undefined, filter2: undefined,
      applyto: undefined,
    };
  }

  function draftFromRef(ref) {
    return {
      typ: ref.typ,
      importance: ref.importance || "normal",
      note: ref.note || "",
      disabled: !!ref.disabled,
      subjectids:  (ref.subjectids  || []).slice(),
      subject2ids: (ref.subject2ids || []).slice(),
      classids:    (ref.classids    || []).slice(),
      teacherids:  (ref.teacherids  || []).slice(),
      classroomids:(ref.classroomids|| []).slice(),
      positions:   clonePositions(ref.positions),
      positions2:  ref.positions2,
      param1:      ref.param1,
      param2:      ref.param2,
      filter:      ref.filter,
      filter2:     ref.filter2,
      applyto:     ref.applyto,
    };
  }

  function clonePositions(p) {
    if (p == null) return undefined;
    if (typeof p === "string") return p;
    if (typeof p === "object") return { ...p };
    return p;
  }

  function packPayload(draft) {
    // Strip empties so storage stays compact and matches wire shape.
    const out = {
      typ: draft.typ,
      importance: draft.importance || "normal",
      disabled: !!draft.disabled,
      subjectids: draft.subjectids.slice(),
      classids:   draft.classids.slice(),
    };
    if (draft.note) out.note = draft.note;
    if (draft.teacherids?.length)   out.teacherids   = draft.teacherids.slice();
    if (draft.classroomids?.length) out.classroomids = draft.classroomids.slice();
    if (NEEDS_SUBJECT2.has(draft.typ)) {
      out.subject2ids = draft.subject2ids.slice();
    }
    if (NEEDS_POSITIONS_FIRSTLAST.has(draft.typ) && draft.positions) {
      out.positions = draft.positions;       // "first" | "last"
    }
    if (NEEDS_POSITIONS_RANGE.has(draft.typ) && draft.positions
        && typeof draft.positions === "object") {
      out.positions = { from: draft.positions.from, to: draft.positions.to };
    }
    if (draft.positions2 != null) out.positions2 = draft.positions2;
    if (draft.param1     != null) out.param1     = draft.param1;
    if (draft.param2     != null) out.param2     = draft.param2;
    if (draft.filter)             out.filter     = draft.filter;
    if (draft.filter2)            out.filter2    = draft.filter2;
    if (draft.applyto)            out.applyto    = draft.applyto;
    return out;
  }

  // ---------- Scope panel (rebuildable when typ changes) ----------
  function buildScopePanel(draft) {
    const wrap = D.el("div");

    function rebuild() {
      wrap.innerHTML = "";
      const typInfo = TYP_BY_CODE[draft.typ];
      if (typInfo) {
        wrap.appendChild(D.el("p", { class:"chrx-ent-help" }, typInfo.help));
      }

      // Subjects — always required.
      const subjLabel = NEEDS_SUBJECT2.has(draft.typ) ? "Subject A" : "Subjects";
      wrap.appendChild(D.buildField(subjLabel,
        subjectPicker(draft.subjectids, v => { draft.subjectids = v; })));

      // Subject 2 — only for n_5/6/8/9.
      if (NEEDS_SUBJECT2.has(draft.typ)) {
        wrap.appendChild(D.buildField("Subject B",
          subjectPicker(draft.subject2ids, v => { draft.subject2ids = v; })));
      }

      // Classes — always required.
      wrap.appendChild(D.buildField("Classes",
        classPicker(draft.classids, v => { draft.classids = v; })));

      // Positions (n_16 / n_17).
      if (NEEDS_POSITIONS_FIRSTLAST.has(draft.typ)) {
        if (typeof draft.positions !== "string") draft.positions = "first";
        wrap.appendChild(D.buildField("Position",
          firstLastPicker(draft.positions,
            v => { draft.positions = v; })));
      } else if (NEEDS_POSITIONS_RANGE.has(draft.typ)) {
        if (!draft.positions || typeof draft.positions === "string") {
          draft.positions = { from: 5, to: 8 };
        }
        wrap.appendChild(D.buildField("Afternoon range",
          rangePicker(draft.positions,
            v => { draft.positions = v; })));
      } else if (draft.positions !== undefined) {
        // Clear stale positions if the user switched away from a positions typ.
        draft.positions = undefined;
      }

      // Optional narrowing: teachers + classrooms (universal).
      const opt = D.el("details", { style:"margin-top:6px;" },
        D.el("summary", { style:"cursor:pointer; color:var(--chrx-fg-secondary);" },
          "Optional narrowing (teachers / classrooms)"));
      opt.appendChild(D.buildField("Teachers",
        teacherPicker(draft.teacherids, v => { draft.teacherids = v; })));
      opt.appendChild(D.buildField("Classrooms",
        classroomPicker(draft.classroomids, v => { draft.classroomids = v; })));
      wrap.appendChild(opt);
    }
    rebuild();
    return { node: wrap, rebuild };
  }

  // ---------- Importance / note / disabled panel ----------
  function buildMetaPanel(draft) {
    const wrap = D.el("div");
    wrap.appendChild(D.buildField("Importance",
      importancePicker(draft.importance, v => draft.importance = v)));
    const noteArea = D.el("textarea", { rows:"3", placeholder:"Optional note",
      oninput:(e)=>draft.note = e.target.value }, draft.note || "");
    wrap.appendChild(D.buildField("Note", noteArea));
    const disChk = D.el("input", { type:"checkbox",
      checked: draft.disabled ? "checked" : null,
      onchange:(e)=>draft.disabled = e.target.checked });
    wrap.appendChild(D.buildField("Disabled", disChk));
    return wrap;
  }

  // ---------- Wizard step indicator ----------
  function buildIndicator(currentStep, totalSteps) {
    const STEP_LABELS = ["Type","Scope","Importance"];
    const wrap = D.el("div", {
      style:"display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;" });
    for (let i = 1; i <= totalSteps; i++) {
      const isActive = i === currentStep;
      const isDone   = i < currentStep;
      const bg = isActive ? "var(--chrx-accent, #007AFF)"
               : isDone   ? "var(--chrx-green, #34C759)"
               : "var(--chrx-bg-input, #f2f2f7)";
      const fg = isActive || isDone ? "#fff" : "var(--chrx-fg-secondary, #6e6e73)";
      wrap.appendChild(D.el("span", {
        style: `padding:6px 12px; border-radius:999px; background:${bg}; color:${fg};
                font-size:var(--chrx-font-small, 12px); font-weight:600;`,
      }, `${i}. ${STEP_LABELS[i-1]}`));
    }
    return wrap;
  }

  // ---------- New: 3-step wizard ----------
  function openWizard() {
    const draft = newDraft();
    let step = 1;
    const totalSteps = 3;

    let scope = null;
    const indicatorHost = D.el("div");
    const stepHost = D.el("div");
    const foot = D.el("div", { class:"chrx-ent-form__foot" });

    function renderIndicator() {
      indicatorHost.innerHTML = "";
      indicatorHost.appendChild(buildIndicator(step, totalSteps));
    }

    function renderStep() {
      renderIndicator();
      stepHost.innerHTML = "";
      if (step === 1) {
        const fTyp = typPicker(draft.typ, v => {
          draft.typ = v;
          renderTypCard();
        });
        stepHost.appendChild(D.buildField("Type", fTyp));
        const cardHost = D.el("div");
        stepHost.appendChild(cardHost);
        function renderTypCard() {
          cardHost.innerHTML = "";
          const info = TYP_BY_CODE[draft.typ];
          if (!info) return;
          const card = D.el("div", {
            style:`margin-top:10px; padding:12px; background:var(--chrx-bg-input, #f2f2f7);
                   border:1px solid var(--chrx-line, #d2d2d7);
                   border-radius:var(--chrx-radius-md, 8px);`,
          });
          card.appendChild(D.el("div", {
            style:"font-size:var(--chrx-font-small, 12px); color:var(--chrx-fg-secondary, #6e6e73); text-transform:uppercase; letter-spacing:0.5px;",
          }, info.category));
          card.appendChild(D.el("div", {
            style:"font-weight:600; margin:4px 0; color:var(--chrx-fg, #1d1d1f);",
          }, `${info.code} — ${info.label}`));
          card.appendChild(D.el("p", { class:"chrx-ent-help", style:"margin:0;" }, info.help));
          cardHost.appendChild(card);
        }
        renderTypCard();
      } else if (step === 2) {
        scope = buildScopePanel(draft);
        stepHost.appendChild(scope.node);
      } else if (step === 3) {
        stepHost.appendChild(buildMetaPanel(draft));
      }
      renderFoot();
    }

    function validateStep() {
      if (step === 2) {
        if (!draft.subjectids.length) {
          alert("Pick at least one subject."); return false;
        }
        if (NEEDS_SUBJECT2.has(draft.typ) && !draft.subject2ids.length) {
          alert("Pick at least one subject in 'Subject B'."); return false;
        }
        if (!draft.classids.length) {
          alert("Pick at least one class."); return false;
        }
      }
      return true;
    }

    function renderFoot() {
      foot.innerHTML = "";
      foot.appendChild(D.el("button", { type:"button", class:"chrx-btn",
        onclick: () => D.closeSheet() }, "Cancel"));
      foot.appendChild(D.el("div", { style:"flex:1;" }));
      if (step > 1) {
        foot.appendChild(D.el("button", { type:"button", class:"chrx-btn",
          onclick: () => { step--; renderStep(); } }, "Back"));
      }
      if (step < totalSteps) {
        foot.appendChild(D.el("button", { type:"button", class:"chrx-btn chrx-btn--primary",
          onclick: () => { if (!validateStep()) return; step++; renderStep(); } }, "Next"));
      } else {
        foot.appendChild(D.el("button", { type:"button", class:"chrx-btn chrx-btn--primary",
          onclick: () => saveNew(draft) }, "Save"));
      }
    }

    const form = D.el("div", { class:"chrx-ent-form" },
      indicatorHost, stepHost, foot);
    D.openSheet(form, { title:"New relation" });
    renderStep();
  }

  function saveNew(draft) {
    if (!draft.subjectids.length) { alert("Pick at least one subject."); return; }
    if (NEEDS_SUBJECT2.has(draft.typ) && !draft.subject2ids.length) {
      alert("Pick at least one subject in 'Subject B'."); return;
    }
    if (!draft.classids.length) { alert("Pick at least one class."); return; }
    const all = ensureRelations();
    const payload = { id: D.uid("rel"), ...packPayload(draft) };
    all.push(payload);
    window.APP.audit.append({ entity:"relations", op:"add", after:{...payload} });
    D.closeSheet();
    D.refresh(rowsOf());
  }

  // ---------- Edit: single sheet (typ is fixed) ----------
  function openEdit(row) {
    const ref = row._ref;
    const draft = draftFromRef(ref);
    const before = { ...ref };

    const typInfo = TYP_BY_CODE[draft.typ]
      || { code: draft.typ, label: "(unknown)", category: "" };

    const typBadge = D.el("div", {
      style:`display:flex; gap:10px; align-items:center; padding:8px 12px;
             background:var(--chrx-bg-input, #f2f2f7);
             border:1px solid var(--chrx-line, #d2d2d7);
             border-radius:var(--chrx-radius-md, 8px); margin-bottom:6px;`,
    });
    typBadge.appendChild(D.el("span", {
      style:`font: var(--chrx-fw-semibold, 600) 13px/1 var(--chrx-font-mono, monospace);
             padding:3px 8px; background:var(--chrx-accent, #007AFF); color:#fff;
             border-radius:var(--chrx-radius-xs, 4px);`,
    }, typInfo.code));
    typBadge.appendChild(D.el("span", null, typInfo.label));

    const scope = buildScopePanel(draft);
    const meta  = buildMetaPanel(draft);

    D.buildEditSheet({
      title: `Edit relation — ${typInfo.code}`,
      fields: [
        { label: null, control: typBadge },
        { label: null, control: scope.node },
        { label: null, control: meta },
      ],
      onSave: () => {
        if (!draft.subjectids.length) { alert("Pick at least one subject."); return; }
        if (NEEDS_SUBJECT2.has(draft.typ) && !draft.subject2ids.length) {
          alert("Pick at least one subject in 'Subject B'."); return;
        }
        if (!draft.classids.length) { alert("Pick at least one class."); return; }
        const next = packPayload(draft);
        // typ is immutable in edit mode — guard against accidental change.
        next.typ = ref.typ;
        // Wipe stale optional keys so the in-memory shape matches packPayload.
        for (const k of Object.keys(ref)) {
          if (k !== "id" && !(k in next)) delete ref[k];
        }
        Object.assign(ref, next);
        window.APP.audit.append({ entity:"relations", op:"update", before, after:{...ref} });
        D.closeSheet();
        D.refresh(rowsOf());
      },
    });
  }

  // ---------- List dialog ----------
  function open() {
    ensureRelations();
    D.open({
      entity:"relations", title:"Card relationships",
      columns: columns(), rows: rowsOf(),
      onAction: (cmd, row) => {
        if (cmd === "new") return openWizard();
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
