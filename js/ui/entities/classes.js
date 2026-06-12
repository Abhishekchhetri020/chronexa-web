/* Classes CRUD dialog. window.EntityClasses.open() */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function rows() {
    const s = window.APP && window.APP.school;
    const nP = (s && s.bell && s.bell.periods && s.bell.periods.length) || 8;
    const nD = ((s && s._idx && s._idx.days) || ["Mon","Tue","Wed","Thu","Fri","Sat"]).length;
    const idxT = window.APP.school?._idx?.teacherById || {};
    const idxR = window.APP.school?._idx?.classroomById || {};
    return ((window.APP.school?.classes) || []).map(c => ({
      id: c.id, name: c.name || "", short: c.abbr || c.short || c.name || "",
      teacher: idxT[c.teacherId || c._teacherId]?.name || "",
      classrooms: (c.classroomIds || c._classroomIds || [])
        .map(id => idxR[id]?.name).filter(Boolean).join(", "),
      bell: c.bell || "default", color: c.color || "",
      divCount: (c.divisions || []).length || 0,
      timeOff: c.timeOff || {},
      _ref: c, _nP: nP, _nD: nD,
    }));
  }

  function columns() { return [
    { key:"name",  label:"Name" },
    { key:"short", label:"Short" },
    { key:"teacher", label:"Class teacher" },
    { key:"classrooms", label:"Rooms" },
    { key:"bell",  label:"Bell" },
    { key:"color", label:"Color", sortable:false,
      render:(r)=>D.el("span", { class:"chrx-ent-swatch-dot",
        style:`background:${r.color || "transparent"}` }) },
    { key:"timeOff", label:"Time off", sortable:false,
      render:(r)=>D.buildTimeOffMini(r.timeOff, r._nD, r._nP) },
    { key:"divCount", label:"Divisions" },
  ]; }

  function makeSelect(items, curId, label, onChange) {
    const sel = D.el("select", null, D.el("option", { value:"" }, "—"));
    (items || []).forEach(t => {
      const opt = D.el("option", { value:t.id }, label(t));
      if (t.id === curId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", e => onChange(e.target.value || null));
    return sel;
  }

  function openEdit(r) {
    const isNew = !r;
    const draft = isNew
      ? { name:"", short:"", color:"", teacherIds:[], classroomIds:[], bellId:"", bell:"" }
      : { name:r.name, short:r.short, color:r.color,
          teacherIds: (r._ref.teacherIds || (r._ref.teacherId ? [r._ref.teacherId] : r._ref._teacherId ? [r._ref._teacherId] : [])).slice(),
          classroomIds: (r._ref.classroomIds || r._ref._classroomIds || []).slice(),
          bellId: r._ref.bellId || "",
          bell: r._ref.bell || "" };

    let abbrManuallySet = !isNew && !!draft.short;

    /** Generate short name from class name */
    function autoShort(name) {
      const n = name.trim();
      if (!n) return "";
      // Already short (≤4 chars): use as-is
      if (n.length <= 4) return n;
      // Remove common words and abbreviate
      const words = n.split(/\s+/).filter(Boolean);
      if (words.length === 1) return n.substring(0, 4);
      // Multi-word: first letters + numbers
      return words.map(w => {
        if (/^\d+$/.test(w)) return w;   // keep numbers intact
        return w.charAt(0).toUpperCase();
      }).join("");
    }

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"30", oninput:(e) => {
        draft.name = e.target.value;
        if (!abbrManuallySet) {
          const auto = autoShort(draft.name);
          draft.short = auto;
          fShort.value = auto;
        }
      }});
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"30",
      oninput:(e) => {
        draft.short = e.target.value;
        abbrManuallySet = true;
        if (!e.target.value.trim()) abbrManuallySet = false;
      }});

    // ─── Class teacher: multi-select tick/untick ───
    const teacherSet = new Set(draft.teacherIds);
    const fTeacherWrap = D.el("div", {
      style: "max-height:140px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;background:#fff;padding:4px 0"
    });
    function renderTeacherList() {
      fTeacherWrap.innerHTML = "";
      const teachers = (window.APP.school?.teachers) || [];
      if (!teachers.length) {
        fTeacherWrap.appendChild(D.el("div", { style: "padding:6px 10px;color:#8e8e93;font-size:12px" }, "No teachers defined"));
        return;
      }
      for (const t of teachers) {
        const isSelected = teacherSet.has(t.id);
        const row = D.el("label", {
          style: `display:flex;align-items:center;gap:8px;padding:4px 10px;cursor:pointer;font-size:13px;transition:background .1s;${isSelected ? "background:#ecfdf5" : ""}`
        });
        row.onmouseenter = () => { if (!teacherSet.has(t.id)) row.style.background = "#f5f5f4"; };
        row.onmouseleave = () => { row.style.background = teacherSet.has(t.id) ? "#ecfdf5" : ""; };
        const cb = D.el("input", { type: "checkbox", style: "accent-color:#16a34a" });
        cb.checked = isSelected;
        cb.addEventListener("change", () => {
          if (cb.checked) teacherSet.add(t.id); else teacherSet.delete(t.id);
          draft.teacherIds = Array.from(teacherSet);
          renderTeacherList();
        });
        const label = D.el("span", null, t.name + (t.abbr ? ` (${t.abbr})` : ""));
        const tick = D.el("span", {
          style: `color:#16a34a;font-size:14px;${isSelected ? "" : "visibility:hidden"}`
        }, "✓");
        row.appendChild(cb);
        row.appendChild(label);
        row.appendChild(D.el("span", { style: "flex:1" }));
        row.appendChild(tick);
        fTeacherWrap.appendChild(row);
      }
    }
    renderTeacherList();

    // ─── Home classrooms: multi-select tick/untick ───
    const roomSet = new Set(draft.classroomIds);
    const fRoomWrap = D.el("div", {
      style: "max-height:140px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:6px;background:#fff;padding:4px 0"
    });
    function renderRoomList() {
      fRoomWrap.innerHTML = "";
      const rooms = (window.APP.school?.classrooms) || [];
      if (!rooms.length) {
        fRoomWrap.appendChild(D.el("div", { style: "padding:6px 10px;color:#8e8e93;font-size:12px" }, "No classrooms defined"));
        return;
      }
      for (const rm of rooms) {
        const isSelected = roomSet.has(rm.id);
        const row = D.el("label", {
          style: `display:flex;align-items:center;gap:8px;padding:4px 10px;cursor:pointer;font-size:13px;transition:background .1s;${isSelected ? "background:#ecfdf5" : ""}`
        });
        row.onmouseenter = () => { if (!roomSet.has(rm.id)) row.style.background = "#f5f5f4"; };
        row.onmouseleave = () => { row.style.background = roomSet.has(rm.id) ? "#ecfdf5" : ""; };
        const cb = D.el("input", { type: "checkbox", style: "accent-color:#16a34a" });
        cb.checked = isSelected;
        cb.addEventListener("change", () => {
          if (cb.checked) roomSet.add(rm.id); else roomSet.delete(rm.id);
          draft.classroomIds = Array.from(roomSet);
          renderRoomList();
        });
        const label = D.el("span", null, rm.name + (rm.abbr ? ` (${rm.abbr})` : ""));
        const tick = D.el("span", {
          style: `color:#16a34a;font-size:14px;${isSelected ? "" : "visibility:hidden"}`
        }, "✓");
        row.appendChild(cb);
        row.appendChild(label);
        row.appendChild(D.el("span", { style: "flex:1" }));
        row.appendChild(tick);
        fRoomWrap.appendChild(row);
      }
    }
    renderRoomList();

    // Per-class bell schedule (Top-30 #3). Empty = use school default.
    const fBell = D.el("select", null,
      D.el("option", { value: "" }, "(school default)"));
    ((window.APP.school?.bells) || []).forEach(b => {
      const opt = D.el("option", { value: b.id },
        b.name + (b.periods ? ` (${b.periods.length} periods)` : ""));
      if (b.id === draft.bellId) opt.selected = true;
      fBell.appendChild(opt);
    });
    fBell.addEventListener("change", e => draft.bellId = e.target.value);
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);

    function save() {
      if (!draft.name.trim()) { fName.focus(); return false; }
      // Auto-assign short name if empty
      if (!draft.short.trim()) draft.short = autoShort(draft.name);
      // Auto-assign unique color if none selected
      if (!draft.color) draft.color = D.autoPickColor("classes");
      draft.classroomIds = Array.from(roomSet);
      draft.teacherIds = Array.from(teacherSet);
      const all = window.APP.school.classes;
      if (!isNew) {
        const c = r._ref;
        const before = { ...c };
        c.name = draft.name.trim();
        c.abbr = draft.short.trim() || undefined;
        c.color = draft.color || undefined;
        c.teacherId = draft.teacherIds[0] || undefined;
        c.teacherIds = draft.teacherIds.length ? draft.teacherIds.slice() : undefined;
        c.classroomIds = draft.classroomIds.slice();
        c.bellId = draft.bellId || undefined;
        c.bell = draft.bell || undefined;
        window.APP.audit.append({ entity:"classes", op:"update", before, after:{...c} });
      } else {
        const nc = { id:D.uid("c"), name:draft.name.trim(),
          abbr:draft.short.trim() || undefined, color:draft.color || undefined,
          teacherId:draft.teacherIds[0] || undefined,
          teacherIds: draft.teacherIds.length ? draft.teacherIds.slice() : undefined,
          classroomIds:draft.classroomIds.slice(),
          bellId: draft.bellId || undefined,
          bell:draft.bell || undefined };
        if (all.some(x => x.name === nc.name)) { fName.focus(); return false; }
        all.push(nc);
        if (window.APP.school._idx) window.APP.school._idx.classById[nc.id] = nc;
        window.APP.audit.append({ entity:"classes", op:"add", after:{...nc} });
      }
      D.closeSheet(); D.refresh(rows());
      return true;
    }

    D.buildEditSheet({
      title: isNew ? "New class" : `Edit class — ${r.name}`,
      fields:[
        { label:"Name", control:fName },
        { label:"Short", control:fShort },
        { label:"Class teacher (optional)", control:fTeacherWrap },
        { label:"Home classrooms (optional)", control:fRoomWrap },
        { label:"Bell schedule", control:fBell },
        { label:"Color", control:fColor },
      ],
      onSave: save,
      siblingRows: isNew ? null : rows(),
      currentRowId: isNew ? null : r.id,
      onNavigate: openEdit,
    });
  }

  // Copy entry (P2#10)
  const COPYABLE_KEYS = ["color", "timeOff", "constraints", "bell"];
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
      window.APP.audit.append({ entity:"classes", op:"copy", id:targetRef.id, before, after:{...targetRef} });
    }
    const all = rows();
    const others = all.filter(x => x.id !== r.id).map(x => ({
      id:x.id, name:x.name || x.id, _ref:x._ref,
    }));
    D.openCopyChooser({
      title: `Copy — ${r.name}`,
      source: srcRef,
      others,
      onDuplicate: () => {
        const all = window.APP.school.classes;
        const copy = { ...srcRef, id:D.uid("c"), name:(srcRef.name || "") + " (copy)" };
        if (srcRef.timeOff != null)     copy.timeOff = deepClone(srcRef.timeOff);
        if (srcRef.constraints)          copy.constraints = deepClone(srcRef.constraints);
        if (srcRef.classroomIds != null) copy.classroomIds = deepClone(srcRef.classroomIds);
        if (srcRef.divisions != null)    copy.divisions = deepClone(srcRef.divisions);
        all.push(copy);
        if (window.APP.school._idx) window.APP.school._idx.classById[copy.id] = copy;
        window.APP.audit.append({ entity:"classes", op:"add", after:{...copy} });
        D.refresh(rows());
      },
      onCopyToOne: (targetRef) => { applySettings(targetRef); D.refresh(rows()); },
      onCopyToMany: (targetRefs) => { targetRefs.forEach(applySettings); D.refresh(rows()); },
    });
  }

  // Batch edit (P2#11)
  function openBatch() {
    const all = rows();
    D.openBatchEditSheet({
      title: "Batch edit — Classes",
      rows: all.map(r => ({ id:r.id, name:r.name, _ref:r._ref })),
      fields: [
        { id:"color", label:"Color",
          build:(onChange) => D.buildSwatchPicker("", v => onChange(v || "")) },
        { id:"bell",  label:"Bell",
          build:(onChange) => D.el("input", { type:"text", placeholder:"default",
            oninput:(e)=>onChange(e.target.value) }) },
      ],
      onApply: (fieldId, value, ids) => {
        const byId = {}; all.forEach(r => byId[r.id] = r._ref);
        ids.forEach(id => {
          const ref = byId[id]; if (!ref) return;
          const before = { ...ref };
          if (fieldId === "color") ref.color = value || undefined;
          else if (fieldId === "bell") ref.bell = value || undefined;
          window.APP.audit.append({ entity:"classes", op:"batch", field:fieldId, id, before, after:{...ref} });
        });
        D.refresh(rows());
      },
    });
  }

  function openConstraints(r) {
    const ref = r._ref;
    if (!window.ClassConstraintsDialog) return;
    window.ClassConstraintsDialog.open(ref, (next) => {
      const before = ref.constraints;
      ref.constraints = next;
      window.APP.audit.append({ entity:"classes", op:"constraints", id:ref.id, before, after:next });
      D.refresh(rows());
    });
  }

  function openTimeOff(r) {
    const ref = r._ref;
    if (!window.TimeOffMatrix) return;
    window.TimeOffMatrix.open(ref, "classes", (newTimeOff) => {
      const before = ref.timeOff;
      ref.timeOff = newTimeOff;
      window.APP.audit.append({ entity:"classes", op:"timeoff", id:ref.id, before, after:newTimeOff });
      D.refresh(rows());
    });
  }

  /* Class divisions — embedded {id, name, groups:[{id,name,studentsCount}]}[].
   * Classic semantic: a lesson taught to one group splits the class hour.
   * Default: single "Entire class" division containing one "Entire class" group. */
  function defaultDivisions() {
    return [{ id:"d_full", name:"Entire class",
      groups:[{ id:"g_full", name:"Entire class", studentsCount:null }] }];
  }
  function cloneDivisions(arr) {
    return (arr || []).map(d => ({ id:d.id, name:d.name,
      groups:(d.groups || []).map(g => ({ id:g.id, name:g.name,
        studentsCount: g.studentsCount == null ? null : g.studentsCount })) }));
  }

  function openDivisions(r) {
    const ref = r._ref;
    // before snapshot reflects the current persisted state (may be empty).
    const before = cloneDivisions(ref.divisions || []);

    // Tree component required — load order is enforced by index.html. If
    // missing, fall back to a tiny inline message so the dialog doesn't
    // open empty.
    if (!window.DivisionsTree) {
      D.openSheet(D.el("div", null,
        D.el("p", null, "Divisions tree component is not loaded."),
        D.el("div", { class:"chrx-ent-form__foot" },
          D.el("button", { type:"button", class:"chrx-btn",
            onclick:()=>D.closeSheet() }, "Close"))),
        { title: `Divisions — ${ref.name}` });
      return;
    }

    // Local draft — committed only on Save. Seed default when class has none
    // so the user immediately sees the "Entire class" baseline; if they hit
    // Cancel, ref.divisions stays untouched.
    const draft = (Array.isArray(ref.divisions) && ref.divisions.length)
      ? cloneDivisions(ref.divisions)
      : window.DivisionsTree.defaultDivisions();

    const lessons = window.APP.school?.lessons || [];

    const wrap = D.el("div", { class:"chrx-ent-divisions" });
    const treeHost = D.el("div", { class:"chrx-ent-divtree-host" });
    window.DivisionsTree.mount(treeHost, ref, draft, lessons);
    wrap.appendChild(treeHost);

    // Add-row controls: name input + "Add" + "Quick-add (Boys, Girls)"
    function rerender() {
      window.DivisionsTree.render(treeHost, draft, lessons);
    }
    const fAddName = D.el("input", { type:"text",
      placeholder:"New division name (e.g. Math/PE split)", maxlength:"30",
      style:"flex:1" });
    const fQuick = D.el("input", { type:"text",
      placeholder:'Quick-add groups: "Boys, Girls"', maxlength:"80",
      style:"flex:1" });

    const addBtn = D.el("button", { type:"button", class:"chrx-btn",
      onclick:()=>{
        const n = fAddName.value.trim();
        if (!n) { fAddName.focus(); return; }
        draft.push({ id:D.uid("div"), name:n,
          groups:[
            { id:D.uid("g"), name:"Group 1", studentsCount:null },
            { id:D.uid("g"), name:"Group 2", studentsCount:null },
          ] });
        fAddName.value = ""; rerender();
      } }, "+ Division");

    const quickBtn = D.el("button", { type:"button", class:"chrx-btn",
      onclick:()=>{
        const raw = fQuick.value.trim();
        if (!raw) { fQuick.focus(); return; }
        const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
        if (!parts.length) return;
        draft.push({ id:D.uid("div"),
          name: parts.join("/"),
          groups: parts.map(p => ({ id:D.uid("g"),
            name:p, studentsCount:null })) });
        fQuick.value = ""; rerender();
      } }, "Quick-add");

    wrap.appendChild(D.el("div", { class:"chrx-ent-row",
      style:"display:flex;gap:8px;margin-top:12px" }, fAddName, addBtn));
    wrap.appendChild(D.el("div", { class:"chrx-ent-row",
      style:"display:flex;gap:8px;margin-top:8px" }, fQuick, quickBtn));
    wrap.appendChild(D.el("p", { style:"opacity:.55;font-size:12px;margin:8px 0 0" },
      "A division splits a class hour: a lesson taught to one group runs in parallel with another group's lesson."));

    D.openSheet(D.el("div", null, wrap,
      D.el("div", { class:"chrx-ent-form__foot" },
        D.el("button", { type:"button", class:"chrx-btn",
          onclick:()=>{ D.closeSheet(); } }, "Cancel"),
        D.el("button", { type:"button", class:"chrx-btn chrx-btn--primary",
          onclick:()=>{
            const err = window.DivisionsTree.validate(draft);
            if (err) { alert(err); return; }
            ref.divisions = draft;
            window.APP.audit.append({ entity:"classes", op:"divisions",
              id:ref.id, before, after:cloneDivisions(draft) });
            D.closeSheet(); D.refresh(rows());
          } }, "Save"),
      ),
    ), { title: `Divisions — ${ref.name}` });
  }

  function openSubjectsOf(r) {
    const ref = r._ref;
    const lessons = ((window.APP.school?.lessons) || []).filter(l => l.classIds.includes(ref.id));
    const subjMap = window.APP.school?._idx?.subjectById || {};
    const seen = new Set();
    lessons.forEach(l => seen.add(l.subjectId));
    const list = D.el("ul", { class:"chrx-ent-list" });
    if (!seen.size) list.appendChild(D.el("li", null, "No subjects scheduled for this class."));
    Array.from(seen).forEach(sid => {
      const s = subjMap[sid];
      list.appendChild(D.el("li", null, s ? s.name : sid));
    });
    D.openSheet(list, { title: `Subjects of ${ref.name} (${seen.size})` });
  }

  function open() {
    D.open({
      entity:"classes", title:"Classes",
      columns:columns(), rows:rows(),
      extras:[
        { id:"timeoff",     label:"Time off" },
        { id:"constraints", label:"Constraints" },
        { id:"divisions",   label:"Divisions" },
        { id:"subjects",    label:"Subjects" },
        { id:"copy",        label:"Copy" },
        { id:"batch",       label:"Batch edit", needRow:false },
      ],
      onAction:(cmd, row) => {
        if (cmd === "new")  return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = window.APP.school.classes;
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i, 1)[0];
            window.APP.audit.append({ entity:"classes", op:"remove", before:{...removed} });
            D.refresh(rows());
          }
          return;
        }
        if (cmd === "timeoff" && row)     return openTimeOff(row);
        if (cmd === "constraints" && row) return openConstraints(row);
        if (cmd === "divisions" && row)   return openDivisions(row);
        if (cmd === "subjects" && row)    return openSubjectsOf(row);
        if (cmd === "copy" && row)        return openCopy(row);
        if (cmd === "batch")              return openBatch();
      },
    });
  }

  global.EntityClasses = { open };
})(window);
