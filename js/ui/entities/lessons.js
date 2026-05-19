/* Lessons CRUD dialog. window.EntityLessons.open() */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function names(idx, ids) {
    if (!idx || !ids) return "";
    return ids.map(id => idx[id]?.name).filter(Boolean).join(", ");
  }

  // Display string for the lesson's room column. Per-card overrides win,
  // then the expansion mode label, then the single preferredRoomId.
  function classroomDisplay(l, idxR) {
    if (Array.isArray(l.classroomIdsByCard) && l.classroomIdsByCard.length) {
      const sets = l.classroomIdsByCard
        .map(ids => (ids || []).map(id => idxR[id]?.abbr || idxR[id]?.name)
          .filter(Boolean).join("/")).filter(Boolean);
      const uniq = Array.from(new Set(sets));
      return uniq.length === 1 ? uniq[0] : sets.join(" · ");
    }
    if (l.classroomIdsExpansion) {
      const lbl = { home:"Home", shared:"Shared",
        teacher:"Teacher's", subject:"Subject's" }[l.classroomIdsExpansion];
      return lbl ? `[${lbl}]` : "";
    }
    return l.preferredRoomId ? (idxR[l.preferredRoomId]?.name || "") : "";
  }

  function rows() {
    const s = window.APP.school; if (!s) return [];
    const idxS = s._idx?.subjectById || {};
    const idxT = s._idx?.teacherById || {};
    const idxC = s._idx?.classById   || {};
    const idxR = s._idx?.classroomById || {};
    return (s.lessons || []).map(l => ({
      id: l.id,
      subject: idxS[l.subjectId]?.name || l.subjectId,
      classes: names(idxC, l.classIds),
      teachers: names(idxT, l.teacherIds),
      count: l.periodsPerWeek || 0,
      duration: l.isLabDouble ? "Double" : "Single",
      classroom: classroomDisplay(l, idxR),
      term: l.term || "",
      week: l.week || "",
      days: l.fixedDay != null ? `Day ${l.fixedDay + 1}` : "Any",
      _ref: l,
    }));
  }

  function columns() { return [
    { key:"subject",  label:"Subject" },
    { key:"classes",  label:"Classes" },
    { key:"teachers", label:"Teachers" },
    { key:"count",    label:"Count" },
    { key:"duration", label:"Duration" },
    { key:"classroom",label:"Classroom" },
    { key:"term",     label:"Term" },
    { key:"week",     label:"Week" },
    { key:"days",     label:"Days" },
  ]; }

  function makeSelect(items, curId, label, onChange, allowEmpty) {
    const sel = D.el("select", null);
    if (allowEmpty) sel.appendChild(D.el("option", { value:"" }, "—"));
    (items || []).forEach(t => {
      const opt = D.el("option", { value:t.id }, label(t));
      if (t.id === curId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", e => onChange(e.target.value || null));
    return sel;
  }

  function makeMulti(items, curIds, label, onChange, size) {
    const sel = D.el("select", { multiple:"multiple", size: String(size || 4) });
    (items || []).forEach(t => {
      const opt = D.el("option", { value:t.id }, label(t));
      if ((curIds || []).includes(t.id)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => {
      onChange(Array.from(sel.selectedOptions).map(o => o.value));
    });
    return sel;
  }

  /* Compute the expanded classroom set for a given expansion mode.
   * EduPage's `metaclassroomidss_expanded` semantics. */
  function expandRooms(mode, draft) {
    const s = window.APP.school || {};
    const all = s.classrooms || [];
    const idxC = s._idx?.classById || {};
    const idxT = s._idx?.teacherById || {};
    if (mode === "home") {
      const ids = new Set();
      (draft.classIds || []).forEach(cid => {
        const c = idxC[cid] || (s.classes || []).find(x => x.id === cid);
        (c && (c.classroomIds || c._classroomIds) || []).forEach(id => ids.add(id));
      });
      return Array.from(ids);
    }
    if (mode === "shared") {
      return all.filter(rm => rm.isShared).map(rm => rm.id);
    }
    if (mode === "teacher") {
      const ids = new Set();
      (draft.teacherIds || []).forEach(tid => {
        const t = idxT[tid] || (s.teachers || []).find(x => x.id === tid);
        ((t && t.classroomIds) || []).forEach(id => ids.add(id));
      });
      return Array.from(ids);
    }
    if (mode === "subject") {
      const sid = draft.subjectId;
      if (!sid) return [];
      return all.filter(rm => (rm.allowedSubjectIds || []).includes(sid)).map(rm => rm.id);
    }
    return [];
  }

  function openEdit(r) {
    const isNew = !r;
    const s = window.APP.school;
    const draft = isNew
      ? { subjectId:"", classIds:[], teacherIds:[], periodsPerWeek:1,
          isLabDouble:false, preferredRoomId:"",
          classroomIdsByCard:null,         // null = use single preferredRoomId
          classroomIdsExpansion:null,      // null|"home"|"shared"|"teacher"|"subject"
          fixedDay:"", fixedPeriod:"" }
      : { subjectId:r._ref.subjectId, classIds:r._ref.classIds.slice(),
          teacherIds:r._ref.teacherIds.slice(),
          periodsPerWeek:r._ref.periodsPerWeek || 1,
          isLabDouble: !!r._ref.isLabDouble,
          preferredRoomId: r._ref.preferredRoomId || "",
          classroomIdsByCard: Array.isArray(r._ref.classroomIdsByCard)
            ? r._ref.classroomIdsByCard.map(a => (a || []).slice())
            : null,
          classroomIdsExpansion: r._ref.classroomIdsExpansion || null,
          fixedDay: r._ref.fixedDay != null ? r._ref.fixedDay : "",
          fixedPeriod: r._ref.fixedPeriod != null ? r._ref.fixedPeriod : "" };

    const fSubj = makeSelect(s.subjects, draft.subjectId,
      x => x.name + (x.abbr ? ` (${x.abbr})` : ""),
      v => { draft.subjectId = v; refreshRoomBlock(); }, true);
    const fClasses = makeMulti(s.classes, draft.classIds,
      x => x.name, v => { draft.classIds = v; refreshRoomBlock(); }, 5);
    const fTeach = makeMulti(s.teachers, draft.teacherIds,
      x => x.name + (x.abbr ? ` (${x.abbr})` : ""),
      v => { draft.teacherIds = v; refreshRoomBlock(); }, 5);
    const fCount = D.el("input", { type:"number", min:"1", max:"20",
      value:draft.periodsPerWeek,
      oninput:(e)=>{
        draft.periodsPerWeek = parseFloat(e.target.value) || 1;
        refreshRoomBlock();
      } });
    const fLab = D.el("input", { type:"checkbox",
      checked: draft.isLabDouble ? "checked" : null,
      onchange:(e)=>draft.isLabDouble = e.target.checked });
    const fDay = D.el("input", { type:"number", min:"0", max:"5",
      placeholder:"any", value:draft.fixedDay,
      oninput:(e)=>draft.fixedDay = e.target.value });
    const fPeriod = D.el("input", { type:"number", min:"1", max:"10",
      placeholder:"any", value:draft.fixedPeriod,
      oninput:(e)=>draft.fixedPeriod = e.target.value });

    // ── Classroom block (per-card + expansion shortcuts) ──────────────────
    const roomBlock = D.el("div", { class:"chrx-ent-room-block",
      style:"display:flex;flex-direction:column;gap:8px" });

    function roomSelectEl(currentId, onChange) {
      const sel = D.el("select", null, D.el("option", { value:"" }, "—"));
      (s.classrooms || []).forEach(rm => {
        const opt = D.el("option", { value:rm.id },
          rm.name + (rm.abbr ? ` (${rm.abbr})` : ""));
        if (rm.id === currentId) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", e => onChange(e.target.value || ""));
      return sel;
    }

    function readonlyExpandedList(ids) {
      const idxR = s._idx?.classroomById || {};
      const names = (ids || []).map(id => idxR[id]?.name || id);
      const box = D.el("div", { class:"chrx-ent-readonly-rooms",
        style:"padding:6px 8px;border:1px dashed var(--chrx-border,#d1d5db);border-radius:6px;background:#f9fafb;font-size:13px" });
      if (!names.length) {
        box.appendChild(D.el("span", { style:"opacity:.6" },
          "No rooms match this rule yet."));
      } else {
        box.textContent = names.join(", ");
      }
      return box;
    }

    function refreshRoomBlock() {
      roomBlock.innerHTML = "";
      const cards = Math.max(1, parseInt(draft.periodsPerWeek, 10) || 1);

      // 1. Expansion checkboxes (mutually exclusive, clears per-card mode).
      const exModes = [
        { id:"home",    label:"Home classroom",
          help:"Use the class's home rooms" },
        { id:"shared",  label:"Shared",
          help:"Any classroom marked as Shared" },
        { id:"teacher", label:"Teacher's classroom",
          help:"Rooms assigned to the lesson's teacher" },
        { id:"subject", label:"Subject's classroom",
          help:"Rooms whose 'For subjects' list includes this subject" },
      ];
      const exRow = D.el("div", { class:"chrx-ent-expansion",
        style:"display:flex;gap:12px;flex-wrap:wrap" });
      exModes.forEach(m => {
        const cb = D.el("input", { type:"checkbox",
          checked: draft.classroomIdsExpansion === m.id ? "checked" : null,
          onchange:(e)=>{
            if (e.target.checked) {
              draft.classroomIdsExpansion = m.id;
              draft.classroomIdsByCard = null;   // mutually exclusive
            } else if (draft.classroomIdsExpansion === m.id) {
              draft.classroomIdsExpansion = null;
            }
            refreshRoomBlock();
          },
        });
        exRow.appendChild(D.el("label", {
          style:"display:inline-flex;gap:4px;align-items:center;cursor:pointer",
          title: m.help },
          cb, D.el("span", null, m.label)));
      });
      roomBlock.appendChild(exRow);

      // 2. Per-card toggle — only meaningful when count > 1.
      if (cards > 1) {
        const perCardOn = Array.isArray(draft.classroomIdsByCard);
        const cb = D.el("input", { type:"checkbox",
          checked: perCardOn ? "checked" : null,
          onchange:(e)=>{
            if (e.target.checked) {
              const seed = draft.preferredRoomId
                ? [draft.preferredRoomId] : [];
              draft.classroomIdsByCard = Array.from({ length:cards },
                () => seed.slice());
              draft.classroomIdsExpansion = null;  // mutually exclusive
            } else {
              draft.classroomIdsByCard = null;
            }
            refreshRoomBlock();
          },
        });
        roomBlock.appendChild(D.el("label", {
          style:"display:inline-flex;gap:4px;align-items:center;cursor:pointer",
          title:"Pick a different classroom for each card of the week" },
          cb, D.el("span", null,
            `Per-card classrooms (${cards} cards)`)));
      }

      // 3. Body — depends on which mode is active.
      if (draft.classroomIdsExpansion) {
        const ids = expandRooms(draft.classroomIdsExpansion, draft);
        roomBlock.appendChild(D.el("p", {
          style:"margin:4px 0;font-size:12px;opacity:.7" },
          "Expanded classroom list (read-only — solver picks one of these per card):"));
        roomBlock.appendChild(readonlyExpandedList(ids));
      } else if (Array.isArray(draft.classroomIdsByCard)) {
        // Reconcile array length when count changes.
        if (draft.classroomIdsByCard.length < cards) {
          while (draft.classroomIdsByCard.length < cards) {
            draft.classroomIdsByCard.push([]);
          }
        } else if (draft.classroomIdsByCard.length > cards) {
          draft.classroomIdsByCard.length = cards;
        }
        for (let i = 0; i < cards; i++) {
          const current = (draft.classroomIdsByCard[i] || [])[0] || "";
          const row = D.el("div", {
            style:"display:flex;gap:8px;align-items:center" },
            D.el("span", { style:"width:64px;font-size:12px;opacity:.7" },
              `Card ${i+1}`),
            roomSelectEl(current, (v) => {
              draft.classroomIdsByCard[i] = v ? [v] : [];
            }));
          roomBlock.appendChild(row);
        }
      } else {
        // Single-room mode — original behaviour.
        const sel = roomSelectEl(draft.preferredRoomId, (v) => {
          draft.preferredRoomId = v;
        });
        roomBlock.appendChild(sel);
      }
    }
    refreshRoomBlock();

    D.buildEditSheet({
      title: isNew ? "New lesson" : "Edit lesson",
      fields:[
        { label:"Subject", control:fSubj },
        { label:"Classes (multi)", control:fClasses },
        { label:"Teachers (multi)", control:fTeach },
        { label:"Periods/week",     control:fCount },
        { label:"Double-period",    control:fLab },
        { label:"Classroom",        control:roomBlock },
        { label:"Fixed day (0–5)",  control:fDay },
        { label:"Fixed period",     control:fPeriod },
      ],
      onSave:()=>{
        if (!draft.subjectId) { fSubj.focus(); return; }
        if (!draft.classIds.length) { fClasses.focus(); return; }
        const all = s.lessons;

        // Materialize the room fields per draft state. Per-card and expansion
        // are mutually exclusive; single mode uses preferredRoomId only.
        const roomFields = {
          preferredRoomId: undefined,
          classroomIdsByCard: undefined,
          classroomIdsExpansion: undefined,
          classroomIdsExpanded: undefined,
        };
        if (Array.isArray(draft.classroomIdsByCard) && draft.periodsPerWeek > 1) {
          roomFields.classroomIdsByCard = draft.classroomIdsByCard.map(a => a.slice());
        } else if (draft.classroomIdsExpansion) {
          roomFields.classroomIdsExpansion = draft.classroomIdsExpansion;
          roomFields.classroomIdsExpanded = expandRooms(draft.classroomIdsExpansion, draft);
        } else if (draft.preferredRoomId) {
          roomFields.preferredRoomId = draft.preferredRoomId;
        }

        if (!isNew) {
          const l = r._ref;
          const before = { ...l };
          l.subjectId = draft.subjectId;
          l.classIds = draft.classIds.slice();
          l.teacherIds = draft.teacherIds.slice();
          l.periodsPerWeek = draft.periodsPerWeek;
          l.isLabDouble = !!draft.isLabDouble || undefined;
          l.preferredRoomId = roomFields.preferredRoomId;
          l.classroomIdsByCard = roomFields.classroomIdsByCard;
          l.classroomIdsExpansion = roomFields.classroomIdsExpansion;
          l.classroomIdsExpanded = roomFields.classroomIdsExpanded;
          l.fixedDay = draft.fixedDay !== "" ? parseInt(draft.fixedDay, 10) : undefined;
          l.fixedPeriod = draft.fixedPeriod !== "" ? parseInt(draft.fixedPeriod, 10) : undefined;
          window.APP.audit.append({ entity:"lessons", op:"update", before, after:{...l} });
        } else {
          const nl = { id:D.uid("l"),
            subjectId:draft.subjectId, classIds:draft.classIds.slice(),
            teacherIds:draft.teacherIds.slice(),
            periodsPerWeek:draft.periodsPerWeek,
            isLabDouble: draft.isLabDouble || undefined,
            preferredRoomId: roomFields.preferredRoomId,
            classroomIdsByCard: roomFields.classroomIdsByCard,
            classroomIdsExpansion: roomFields.classroomIdsExpansion,
            classroomIdsExpanded: roomFields.classroomIdsExpanded,
            fixedDay: draft.fixedDay !== "" ? parseInt(draft.fixedDay, 10) : undefined,
            fixedPeriod: draft.fixedPeriod !== "" ? parseInt(draft.fixedPeriod, 10) : undefined };
          all.push(nl);
          if (s._idx) s._idx.lessonById[nl.id] = nl;
          window.APP.audit.append({ entity:"lessons", op:"add", after:{...nl} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    D.open({
      entity:"lessons", title:"Lessons",
      columns:columns(), rows:rows(),
      extras:[
        { id:"copy", label:"Copy to" },
      ],
      onAction:(cmd, row) => {
        if (cmd === "new")  return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = window.APP.school.lessons;
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i, 1)[0];
            window.APP.audit.append({ entity:"lessons", op:"remove", before:{...removed} });
            D.refresh(rows());
          }
          return;
        }
        if (cmd === "copy" && row) {
          // Duplicate the row with a new id
          const src = row._ref;
          const dup = { ...src, id: D.uid("l"),
            classIds: src.classIds.slice(), teacherIds: src.teacherIds.slice() };
          window.APP.school.lessons.push(dup);
          if (window.APP.school._idx) window.APP.school._idx.lessonById[dup.id] = dup;
          window.APP.audit.append({ entity:"lessons", op:"copy", after:{...dup} });
          D.refresh(rows());
        }
      },
    });
  }

  global.EntityLessons = { open };
})(window);
