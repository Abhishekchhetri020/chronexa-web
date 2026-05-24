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

    // Track whether the user has manually edited the abbreviation
    let abbrManuallySet = !isNew && !!draft.short;

    /** Generate abbreviation from subject name */
    function autoAbbr(name) {
      const words = name.trim().split(/\s+/).filter(Boolean);
      if (!words.length) return "";
      // Single word ≤6 chars: keep as-is (preserves user casing like "IA", "EVS")
      if (words.length === 1) {
        const w = words[0];
        return w.length <= 6 ? w : w.substring(0, 5).toUpperCase();
      }
      // Multi-word: first letter of each word, uppercase
      return words.map(w => w.charAt(0).toUpperCase()).join("");
    }

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"60", oninput:(e) => {
        draft.name = e.target.value;
        // Auto-fill abbreviation only if user hasn't manually changed it
        if (!abbrManuallySet) {
          const auto = autoAbbr(draft.name);
          draft.short = auto;
          fShort.value = auto;
        }
      }});
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"10",
      oninput:(e) => {
        draft.short = e.target.value;
        abbrManuallySet = true;
        // If user clears the field, go back to auto mode
        if (!e.target.value.trim()) abbrManuallySet = false;
      }});
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);
    const fWeight = D.el("input", { type:"number", min:"0", max:"5", step:"0.1",
      value:draft.contractWeight,
      oninput:(e)=>draft.contractWeight = parseFloat(e.target.value) || 0 });
    const fPic = D.el("input", { type:"text", placeholder:"https://…",
      value:draft.pictureUrl, oninput:(e)=>draft.pictureUrl = e.target.value });

    function save() {
      if (!draft.name.trim()) { fName.focus(); return false; }
      // Auto-assign abbreviation if empty
      if (!draft.short.trim()) draft.short = autoAbbr(draft.name);
      // Auto-assign unique color if none selected
      if (!draft.color) draft.color = D.autoPickColor("subjects");
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
    const c = Object.assign({
      cardDistribution: "ideal",
      maxPerDay: "",
      doubleLessonsSpanBreaks: false,
      canBeOverLunch: false,
      homeworkPrepRequired: false,
      maxStudents: "",
      teacherContractLength: "",
      temporarySubject: false,
      requiresLab: false,
    }, ref.constraints || {});

    /* ── "Set for more" dual-pane transfer dialog ──
       Single-click toggles: click a row on the left → green ✓ + appears
       on the right. Click again → removed. Matches ASC Timetables. */
    function openSetForMore(fieldKey, fieldLabel, getValue) {
      const allSubjects = (window.APP.school && window.APP.school.subjects) || [];
      const others = allSubjects.filter(s => s.id !== ref.id);
      const chosen = new Set();                 // ids in right pane

      const overlay = D.el("div", {
        style: "position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:10100;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
      });
      const dialog = D.el("div", {
        style: "background:#fff;border-radius:12px;box-shadow:0 24px 64px rgba(15,23,42,.28);width:min(720px,95vw);max-height:85vh;display:flex;flex-direction:column;overflow:hidden"
      });

      // Title bar
      const titleBar = D.el("div", {
        style: "display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#1e6b5a;color:#fff;font-size:14px;font-weight:600"
      });
      titleBar.appendChild(D.el("span", null, "Subjects"));
      const closeBtn = D.el("button", { type: "button",
        style: "background:none;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1;padding:0 4px",
        onclick: () => overlay.remove() }, "✕");
      titleBar.appendChild(closeBtn);
      dialog.appendChild(titleBar);

      // Body: two panes side by side
      const body = D.el("div", {
        style: "display:flex;flex:1;overflow:hidden;min-height:360px"
      });

      // ─── Left pane (all subjects) ───
      const leftPane = D.el("div", { style: "flex:1;display:flex;flex-direction:column;border-right:1px solid #e2e8f0" });
      const leftHead = D.el("div", { style: "display:flex;gap:4px;padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;color:#475569" });
      leftHead.appendChild(D.el("span", { style: "width:28px" }, ""));  // checkmark col
      leftHead.appendChild(D.el("span", { style: "width:100px" }, "Abbreviation"));
      leftHead.appendChild(D.el("span", null, "Name"));
      leftPane.appendChild(leftHead);
      const leftList = D.el("div", { style: "flex:1;overflow-y:auto" });
      leftPane.appendChild(leftList);
      body.appendChild(leftPane);

      // ─── Center: ↔ indicator (decorative, like ASC) ───
      const center = D.el("div", {
        style: "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 6px;gap:6px"
      });
      center.appendChild(D.el("span", {
        style: "font-size:20px;color:#0f766e;user-select:none"
      }, "↔"));
      body.appendChild(center);

      // ─── Right pane (chosen subjects) ───
      const rightPane = D.el("div", { style: "flex:1;display:flex;flex-direction:column" });
      const rightHead = D.el("div", { style: "display:flex;gap:4px;padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;color:#475569" });
      rightHead.appendChild(D.el("span", { style: "width:28px" }, ""));
      rightHead.appendChild(D.el("span", { style: "width:100px" }, "Abbreviation"));
      rightHead.appendChild(D.el("span", null, "Name"));
      rightPane.appendChild(rightHead);
      const rightList = D.el("div", { style: "flex:1;overflow-y:auto" });
      rightPane.appendChild(rightList);
      body.appendChild(rightPane);
      dialog.appendChild(body);

      // ─── Render helpers ───
      function renderBoth() { renderLeft(); renderRight(); }

      function renderLeft() {
        leftList.innerHTML = "";
        for (const s of others) {
          const isChosen = chosen.has(s.id);
          const row = D.el("div", {
            style: `display:flex;align-items:center;gap:4px;padding:6px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid #f1f5f9;transition:background .15s;${isChosen ? "background:#ecfdf5" : ""}`,
            "data-id": s.id,
          });
          row.onmouseenter = () => { if (!chosen.has(s.id)) row.style.background = "#f1f5f9"; };
          row.onmouseleave = () => { row.style.background = chosen.has(s.id) ? "#ecfdf5" : ""; };
          row.onclick = () => {
            if (chosen.has(s.id)) chosen.delete(s.id);
            else chosen.add(s.id);
            renderBoth();
          };
          // Green checkmark column
          const tick = D.el("span", {
            style: `width:22px;text-align:center;font-size:15px;color:#16a34a;${isChosen ? "" : "visibility:hidden"}`
          }, "✓");
          row.appendChild(tick);
          row.appendChild(D.el("span", { style: "width:100px;font-weight:500" }, s.abbr || s.short || ""));
          row.appendChild(D.el("span", null, s.name || ""));
          leftList.appendChild(row);
        }
      }

      function renderRight() {
        rightList.innerHTML = "";
        for (const s of others) {
          if (!chosen.has(s.id)) continue;
          const row = D.el("div", {
            style: "display:flex;align-items:center;gap:4px;padding:6px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid #f1f5f9;background:#f0fdf4;transition:background .15s",
            "data-id": s.id,
          });
          row.onmouseenter = () => row.style.background = "#fef2f2";
          row.onmouseleave = () => row.style.background = "#f0fdf4";
          row.onclick = () => {
            chosen.delete(s.id);
            renderBoth();
          };
          const tick = D.el("span", {
            style: "width:22px;text-align:center;font-size:15px;color:#16a34a"
          }, "✓");
          row.appendChild(tick);
          row.appendChild(D.el("span", { style: "width:100px;font-weight:500" }, s.abbr || s.short || ""));
          row.appendChild(D.el("span", null, s.name || ""));
          rightList.appendChild(row);
        }
      }

      // ─── Footer ───
      const footer = D.el("div", {
        style: "display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-top:1px solid #e2e8f0;background:#f8fafc"
      });
      const leftActions = D.el("div", { style: "display:flex;gap:8px" });
      leftActions.appendChild(D.el("button", { type: "button",
        style: "padding:6px 14px;font-size:12px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer",
        onclick: () => {
          for (const s of others) chosen.add(s.id);
          renderBoth();
        }
      }, "Select all"));
      leftActions.appendChild(D.el("button", { type: "button",
        style: "padding:6px 14px;font-size:12px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer",
        onclick: () => { chosen.clear(); renderBoth(); }
      }, "Clear selection"));
      footer.appendChild(leftActions);

      const okBtn = D.el("button", { type: "button",
        style: "padding:6px 20px;font-size:13px;font-weight:600;border:0;background:#16a34a;color:#fff;border-radius:6px;cursor:pointer",
        onclick: () => {
          const val = getValue();
          const allS = (window.APP.school && window.APP.school.subjects) || [];
          for (const sid of chosen) {
            const subj = allS.find(s => s.id === sid);
            if (!subj) continue;
            const before = subj.constraints ? { ...subj.constraints } : null;
            subj.constraints = Object.assign({}, subj.constraints || {});
            subj.constraints[fieldKey] = val;
            window.APP.audit.append({ entity: "subjects", op: "constraints", id: sid, before, after: { ...subj.constraints } });
          }
          overlay.remove();
          const notify = window._chrxNotify || console.log;
          notify("Applied " + fieldLabel + " to " + chosen.size + " subjects", "info");
        }
      }, "OK");
      footer.appendChild(okBtn);
      dialog.appendChild(footer);

      overlay.appendChild(dialog);
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
      document.body.appendChild(overlay);
      renderBoth();
    }

    // Helper: build a "Set for more" link
    function setForMoreLink(fieldKey, fieldLabel, getValue) {
      return D.el("a", {
        href: "#", style: "font-size:12px;color:#0891b2;text-decoration:none;margin-left:8px;white-space:nowrap",
        onclick: (e) => { e.preventDefault(); openSetForMore(fieldKey, fieldLabel, getValue); }
      }, "Set for more");
    }

    // ─── Card distribution over the week ───
    const distOptions = [
      { value: "none",   label: "No dist."  },
      { value: "low",    label: "Low"       },
      { value: "medium", label: "Medium"    },
      { value: "ideal",  label: "Ideal"     },
      { value: "ideal+", label: "Ideal+"    },
    ];
    const fDist = D.el("select", { style: "min-width:120px",
      onchange: (e) => c.cardDistribution = e.target.value });
    for (const o of distOptions) {
      const opt = D.el("option", { value: o.value }, o.label);
      if (o.value === (c.cardDistribution || "ideal")) opt.selected = true;
      fDist.appendChild(opt);
    }
    const distRow = D.el("div", { style: "display:flex;align-items:center;gap:4px;flex-wrap:wrap" });
    distRow.appendChild(fDist);
    distRow.appendChild(setForMoreLink("cardDistribution", "Card distribution", () => c.cardDistribution));
    distRow.appendChild(D.el("span", { style: "font-size:11px;color:#64748b;margin-left:6px" }, "Can be only once per day"));

    // ─── Max on the question marked ───
    const maxOptions = [
      { value: "",  label: "Any" },
      { value: "1", label: "1" }, { value: "2", label: "2" },
      { value: "3", label: "3" }, { value: "4", label: "4" },
      { value: "5", label: "5" }, { value: "6", label: "6" },
      { value: "7", label: "7" }, { value: "8", label: "8" },
      { value: "9", label: "9" },
    ];
    const fMax = D.el("select", { style: "min-width:80px",
      onchange: (e) => c.maxPerDay = e.target.value });
    for (const o of maxOptions) {
      const opt = D.el("option", { value: o.value }, o.label);
      if (o.value === String(c.maxPerDay || "")) opt.selected = true;
      fMax.appendChild(opt);
    }
    const maxRow = D.el("div", { style: "display:flex;align-items:center;gap:4px" });
    maxRow.appendChild(fMax);
    maxRow.appendChild(setForMoreLink("maxPerDay", "Max per day", () => c.maxPerDay));

    // ─── Checkboxes ───
    const fDoubleBreaks = D.el("input", { type: "checkbox",
      checked: c.doubleLessonsSpanBreaks ? "checked" : null,
      onchange: (e) => c.doubleLessonsSpanBreaks = e.target.checked });
    const fLunch = D.el("input", { type: "checkbox",
      checked: c.canBeOverLunch ? "checked" : null,
      onchange: (e) => c.canBeOverLunch = e.target.checked });
    const fHomework = D.el("input", { type: "checkbox",
      checked: c.homeworkPrepRequired ? "checked" : null,
      onchange: (e) => c.homeworkPrepRequired = e.target.checked });
    const fTemp = D.el("input", { type: "checkbox",
      checked: c.temporarySubject ? "checked" : null,
      onchange: (e) => c.temporarySubject = e.target.checked });

    // ─── Number inputs with Set for more ───
    const fStudents = D.el("input", { type: "number", min: "0", max: "999",
      value: c.maxStudents || "", style: "width:80px",
      oninput: (e) => c.maxStudents = e.target.value });
    const studentsRow = D.el("div", { style: "display:flex;align-items:center;gap:4px" });
    studentsRow.appendChild(fStudents);
    studentsRow.appendChild(setForMoreLink("maxStudents", "Max students", () => c.maxStudents));

    const fContract = D.el("input", { type: "number", min: "0", max: "99",
      value: c.teacherContractLength || "", style: "width:80px",
      oninput: (e) => c.teacherContractLength = e.target.value });
    const contractRow = D.el("div", { style: "display:flex;align-items:center;gap:4px" });
    contractRow.appendChild(fContract);
    contractRow.appendChild(setForMoreLink("teacherContractLength", "Contract length", () => c.teacherContractLength));

    // ─── Separator ───
    const sep = D.el("div", { style: "border-top:1px solid #e2e8f0;margin:4px 0" });

    // ─── Card relations section ───
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
      title: `Constraints — ${ref.name}`,
      fields: [
        { label: "Card distribution over the week", control: distRow },
        { label: "Max. on the question marked",     control: maxRow },
        { label: null,                              control: sep },
        { label: "Doublelessons can span over 'long breaks'", control: fDoubleBreaks },
        { label: "Can be over lunch",               control: fLunch },
        { label: "Homework preparation required",   control: fHomework },
        { label: null,                              control: D.el("div", { style: "border-top:1px solid #e2e8f0;margin:4px 0" }) },
        { label: "Max students on lesson with this subject", control: studentsRow },
        { label: "Length for teacher's contract",    control: contractRow },
        { label: null,                              control: D.el("div", { style: "border-top:1px solid #e2e8f0;margin:4px 0" }) },
        { label: "Temporary subject",               control: fTemp },
        { label: null,                              control: relList },
      ],
      onSave: () => {
        const before = ref.constraints;
        ref.constraints = c;
        window.APP.audit.append({ entity: "subjects", op: "constraints", id: ref.id, before, after: c });
        D.closeSheet(); D.refresh(rows());
      },
      siblingRows: rows(),
      currentRowId: r.id,
      onNavigate: openConstraints,
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
