/* TimeOff matrix sub-dialog (shared across subjects/classes/classrooms/teachers).
 * window.TimeOffMatrix.open(entity, kind, onSave)
 *
 * Cell states: 0=available (green), 1=conditional (blue), 2=blocked (red).
 * Serialization: 2D array, timeOff[day][period] = 0|1|2.
 * Days come from window.APP.school._idx.days; periods from window.APP.school.bell.periods.
 *
 * Backward compatibility: when an entity arrives with the legacy object-map shape
 * ({"d_p":"available|preferred|unavailable"}), normalize() converts it to 2D once.
 */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;
  const { el } = D;

  const KIND_NOUN = {
    subjects:   "subject",
    classes:    "class",
    classrooms: "classroom",
    teachers:   "teacher",
  };
  const KIND_PLURAL = {
    subjects:   "subjects",
    classes:    "classes",
    classrooms: "classrooms",
    teachers:   "teachers",
  };

  function getDays() {
    const idx = window.APP && window.APP.school && window.APP.school._idx;
    const days = (idx && idx.days) || ["Mon","Tue","Wed","Thu","Fri","Sat"];
    return days;
  }
  function getPeriodCount() {
    const s = window.APP && window.APP.school;
    const ps = (s && s.bell && s.bell.periods) || [];
    return ps.length || 8;
  }

  // Convert legacy {"d_p":"available|preferred|unavailable"} to 2D 0|1|2.
  // 2D shape is kept as a plain Array of Arrays so JSON round-trips cleanly.
  function normalize(raw, nDays, nPeriods) {
    const out = [];
    for (let d = 0; d < nDays; d++) {
      const row = [];
      for (let p = 0; p < nPeriods; p++) row.push(0);
      out.push(row);
    }
    if (!raw) return out;
    if (Array.isArray(raw)) {
      for (let d = 0; d < nDays; d++) {
        const src = raw[d];
        if (!Array.isArray(src)) continue;
        for (let p = 0; p < nPeriods; p++) {
          const v = src[p];
          if (v === 0 || v === 1 || v === 2) out[d][p] = v;
        }
      }
      return out;
    }
    if (typeof raw === "object") {
      // Legacy keys "0_1" (1-indexed period) → 2D 0|1|2 (0-indexed period).
      for (const k in raw) {
        const m = /^(\d+)_(\d+)$/.exec(k);
        if (!m) continue;
        const d = parseInt(m[1], 10);
        const p1 = parseInt(m[2], 10);
        if (d < 0 || d >= nDays) continue;
        const p = p1 - 1; // legacy was 1-indexed
        if (p < 0 || p >= nPeriods) continue;
        const v = raw[k];
        if (v === "preferred" || v === "conditional") out[d][p] = 1;
        else if (v === "unavailable" || v === "blocked") out[d][p] = 2;
        else out[d][p] = 0;
      }
    }
    return out;
  }

  function listForKind(kind) {
    const s = window.APP && window.APP.school;
    if (!s) return [];
    if (kind === "subjects")   return s.subjects   || [];
    if (kind === "classes")    return s.classes    || [];
    if (kind === "classrooms") return s.classrooms || [];
    if (kind === "teachers")   return s.teachers   || [];
    return [];
  }
  function nameOf(e) {
    return e.name || (e.lastName && e.firstName ? `${e.firstName} ${e.lastName}` : "") || e.lastName || e.id;
  }

  function getPeriodLabel(pIdx) {
    const s = window.APP && window.APP.school;
    const ps = (s && s.bell && s.bell.periods) || [];
    const p = ps.find(x => x.index === pIdx + 1);
    return (p && p.label) || `P${pIdx + 1}`;
  }

  function getPlacedSlots(entity, kind, nDays, nPeriods) {
    const s = window.APP && window.APP.school;
    const idx = s && s._idx;
    if (!idx) return null;
    const id = entity && entity.id;
    let cardList = [];
    if (kind === "teachers")        cardList = (idx.cardsByTeacher || {})[id] || [];
    else if (kind === "classes")    cardList = (idx.cardsByClass || {})[id] || [];
    else if (kind === "classrooms") cardList = (idx.cardsByRoom || {})[id] || [];
    else if (kind === "subjects") {
      const seen = new Set();
      for (const list of Object.values(idx.cardsByClass || {})) {
        for (const c of list) {
          const k = c.day + "_" + c.period;
          if (c.subjectId === id && !seen.has(k)) { seen.add(k); cardList.push(c); }
        }
      }
    }
    const placed = Array.from({length: nDays}, () => new Array(nPeriods).fill(false));
    for (const c of cardList) {
      const d = c.day, p = c.period - 1;
      if (d >= 0 && d < nDays && p >= 0 && p < nPeriods) placed[d][p] = true;
    }
    return placed;
  }

  function open(entity, kind, onSave) {
    const days = getDays();
    const nDays = days.length;
    const nPeriods = getPeriodCount();
    const noun = KIND_NOUN[kind] || "item";

    const state = normalize(entity && entity.timeOff, nDays, nPeriods);
    const placed = getPlacedSlots(entity, kind, nDays, nPeriods);

    // ---- grid ----
    const grid = el("div", { class: "chrx-ent-tomatrix" });
    grid.style.gridTemplateColumns = `64px repeat(${nPeriods}, 1fr)`;

    function toggleCol(p) {
      const allBlocked = days.every((_, d) => state[d][p] === 2);
      const nxt = allBlocked ? 0 : 2;
      for (let d = 0; d < nDays; d++) state[d][p] = nxt;
      buildGrid();
    }
    function toggleRow(d) {
      const allBlocked = Array.from({length: nPeriods}, (_, p) => state[d][p]).every(v => v === 2);
      const nxt = allBlocked ? 0 : 2;
      for (let p = 0; p < nPeriods; p++) state[d][p] = nxt;
      buildGrid();
    }

    function buildGrid() {
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      grid.appendChild(el("div", { class: "chrx-ent-tomatrix__corner" }));
      for (let p = 0; p < nPeriods; p++) {
        const lbl = getPeriodLabel(p);
        grid.appendChild(el("button", {
          type: "button",
          class: "chrx-ent-tomatrix__h chrx-ent-tomatrix__h--btn",
          title: `Toggle period ${lbl} for all days`,
          onclick: () => toggleCol(p),
        }, lbl));
      }
      for (let d = 0; d < nDays; d++) {
        grid.appendChild(el("button", {
          type: "button",
          class: "chrx-ent-tomatrix__h chrx-ent-tomatrix__h--btn",
          title: `Toggle ${days[d]} for all periods`,
          onclick: () => toggleRow(d),
        }, days[d] || `D${d + 1}`));
        for (let p = 0; p < nPeriods; p++) {
          const isPlaced = placed && placed[d][p];
          const cell = el("button", {
            type: "button",
            class: cellClass(state[d][p]) + (isPlaced ? " is-placed" : ""),
            "data-d": d, "data-p": p,
            "aria-label": `${days[d]} P${p + 1}: ${stateName(state[d][p])}`,
            title: `${days[d]} P${p + 1} — ${stateName(state[d][p])}${isPlaced ? " · lesson placed here" : ""}`,
            onclick: (e) => {
              const nx = (state[d][p] + 1) % 3;
              state[d][p] = nx;
              e.currentTarget.className = cellClass(nx) + (isPlaced ? " is-placed" : "");
              e.currentTarget.title = `${days[d]} P${p + 1} — ${stateName(nx)}${isPlaced ? " · lesson placed here" : ""}`;
              e.currentTarget.setAttribute("aria-label", `${days[d]} P${p + 1}: ${stateName(nx)}`);
            },
          });
          grid.appendChild(cell);
        }
      }
    }
    buildGrid();

    // ---- tip ----
    const tip = el("p", { class: "chrx-ent-tomatrix__tip" },
      `Click a cell to cycle its state. Click a day or period header to toggle the whole row/column. Cells with a white border have a lesson placed there.`);

    // ---- legend ----
    const legend = el("div", { class: "chrx-ent-tomatrix__legend" },
      el("span", { class: "chrx-ent-tomatrix__lg is-available" }, "Available"),
      el("span", { class: "chrx-ent-tomatrix__lg is-conditional" }, "Conditional"),
      el("span", { class: "chrx-ent-tomatrix__lg is-blocked" }, "Blocked"),
    );

    // ---- quick actions ----
    function resetAll() {
      for (let d = 0; d < nDays; d++)
        for (let p = 0; p < nPeriods; p++) state[d][p] = 0;
      buildGrid();
    }
    function blockWeekend() {
      // Treat Sat (index 5) and any 7th day (Sun) as weekend; weekday list is school-defined.
      // We block any day whose label starts with "Sat" or "Sun".
      for (let d = 0; d < nDays; d++) {
        const lbl = (days[d] || "").toLowerCase();
        if (lbl.startsWith("sat") || lbl.startsWith("sun")) {
          for (let p = 0; p < nPeriods; p++) state[d][p] = 2;
        }
      }
      buildGrid();
    }

    // "Set for more" — apply current matrix to N other entities of same kind.
    function openSetForMore() {
      const plural = KIND_PLURAL[kind] || (noun + "s");
      const others = listForKind(kind).filter(e => e.id !== (entity && entity.id));
      if (!others.length) {
        alert(`No other ${plural} to apply this matrix to.`);
        return;
      }
      const items = others.map(e => ({ id:e.id, label:nameOf(e), _ref:e }));
      window.EntityDialog.openPickEntitiesPopover({
        title: `Apply this matrix to other ${plural}`,
        help: `The selected ${plural} will have their entire time-off matrix replaced with the current one.`,
        items, multi: true,
        confirmLabel: "Apply matrix",
        onConfirm: (ids) => {
          if (!ids.length) return;
          const snapshot = state.map(row => row.slice());
          ids.forEach(id => {
            const target = others.find(e => e.id === id);
            if (!target) return;
            const before = target.timeOff;
            target.timeOff = snapshot.map(row => row.slice());
            window.APP.audit.append({ entity: kind, op:"timeoff", id, before, after:target.timeOff });
          });
        },
      });
    }

    const actions = el("div", { class: "chrx-ent-tomatrix__actions" },
      el("button", { type: "button", class: "chrx-btn", onclick: resetAll }, "Reset all"),
      el("button", { type: "button", class: "chrx-btn", onclick: blockWeekend }, "Block weekend"),
      el("button", { type: "button", class: "chrx-btn", onclick: openSetForMore }, "Set for more…"),
    );

    // ---- body + footer ----
    const body = el("div", { class: "chrx-timeoff-body" }, tip, actions, grid, legend);
    const foot = el("div", { class: "chrx-ent-form__foot" },
      el("button", { type: "button", class: "chrx-btn", onclick: D.closeSheet }, "Cancel"),
      el("button", { type: "button", class: "chrx-btn chrx-btn--primary",
        onclick: () => {
          // Deep-clone so future edits to local state can't mutate saved data.
          const out = state.map(row => row.slice());
          D.closeSheet();
          if (typeof onSave === "function") onSave(out);
        },
      }, "Save"),
    );

    const titleName = (entity && (entity.name || entity.id)) || noun;
    D.openSheet(el("div", null, body, foot), { title: `Time off — ${titleName}` });
  }

  function cellClass(v) {
    if (v === 1) return "chrx-ent-tomatrix__c is-conditional";
    if (v === 2) return "chrx-ent-tomatrix__c is-blocked";
    return "chrx-ent-tomatrix__c is-available";
  }
  function stateName(v) {
    return v === 1 ? "Conditional" : v === 2 ? "Blocked" : "Available";
  }

  global.TimeOffMatrix = { open, normalize };
})(window);
