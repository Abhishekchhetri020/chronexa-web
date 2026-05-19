/* Class constraints dialog — Classic's 14-field classes.constraints subobject.
 * window.ClassConstraintsDialog.open(classRow, onSave)
 *
 * Verbatim labels from legacy-research §3b-constraints.
 *
 * Fields written to classRow.constraints (created if absent):
 *   classTeacherPos      — 3-deep bitmap [[["001000000",...x6]]] (1 term × 1 week × 6 days × 9 periods)
 *   maxQuestionMarked    — int_or_enum ("*" = any)
 *   m_nManualnyBlok      — enum "0" | "1" | "2"
 *   m_nMinBlokOd / Do    — int_or_enum
 *   m_nMaxVyucOd / Do    — int_or_enum
 *   m_bDruheHodiny       — bool
 *   m_bKoncitNaraz       — bool
 *   minperiodsday        — int_or_enum
 *   maxperiodsday        — int_or_enum
 *   lunch_periodfrom     — int_or_enum ("d" allowed = school default)
 *   lunch_periodto       — int_or_enum ("d" allowed)
 *   maxneedspreparation  — int_or_enum
 */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;
  const { el } = D;

  const CTPOS_DAYS    = 6;
  const CTPOS_PERIODS = 9;

  function defaultConstraints() {
    return {
      classTeacherPos: emptyCtposMatrix(),
      maxQuestionMarked: "*",
      m_nManualnyBlok: "0",
      m_nMinBlokOd: "*",
      m_nMinBlokDo: "*",
      m_nMaxVyucOd: "*",
      m_nMaxVyucDo: "*",
      m_bDruheHodiny: false,
      m_bKoncitNaraz: false,
      minperiodsday: "*",
      maxperiodsday: "*",
      lunch_periodfrom: "d",
      lunch_periodto: "d",
      maxneedspreparation: "*",
    };
  }

  function emptyCtposMatrix() {
    // Classic wire shape: [term][week][day] where day is a 9-char "0"/"1" string.
    const day = "0".repeat(CTPOS_PERIODS);
    const days = []; for (let d = 0; d < CTPOS_DAYS; d++) days.push(day);
    return [[days]];
  }

  // Coerce arbitrary shape to a normalized 6×9 grid (matches CTPOS_DAYS × CTPOS_PERIODS).
  // Returns a flat boolean[6][9] for UI editing.
  function ctposToGrid(wire) {
    const grid = [];
    for (let d = 0; d < CTPOS_DAYS; d++) {
      const row = [];
      for (let p = 0; p < CTPOS_PERIODS; p++) row.push(false);
      grid.push(row);
    }
    if (!Array.isArray(wire) || !wire[0] || !Array.isArray(wire[0][0])) return grid;
    const days = wire[0][0];
    for (let d = 0; d < CTPOS_DAYS; d++) {
      const s = days[d];
      if (typeof s !== "string") continue;
      for (let p = 0; p < CTPOS_PERIODS && p < s.length; p++) {
        if (s[p] === "1") grid[d][p] = true;
      }
    }
    return grid;
  }
  function gridToCtpos(grid) {
    const out = grid.map(row =>
      row.slice(0, CTPOS_PERIODS).map(b => b ? "1" : "0").join("")
         .padEnd(CTPOS_PERIODS, "0"));
    return [[out]];
  }

  // --- shared int_or_enum helper ---------------------------------------------
  function intOrEnum(value, onChange, opts) {
    opts = opts || {};
    const wrap = el("div", { class: "chrx-ent-ioe" });
    const isInt = typeof value === "number" || (value != null && /^-?\d+$/.test(String(value)));
    const input = el("input", {
      type: "number",
      min: opts.min != null ? String(opts.min) : "0",
      max: opts.max != null ? String(opts.max) : null,
      value: isInt ? String(value) : "",
      oninput: (e) => {
        const v = e.target.value.trim();
        if (v === "") return; // sentinel buttons drive the sentinel state
        const n = parseInt(v, 10);
        if (!isNaN(n)) onChange(n);
        unmarkSentinels();
      },
    });
    function unmarkSentinels() {
      wrap.querySelectorAll(".chrx-ent-ioe__sent.is-on")
          .forEach(b => b.classList.remove("is-on"));
    }
    function setSentinel(token, btn) {
      input.value = "";
      onChange(token);
      unmarkSentinels();
      btn.classList.add("is-on");
    }
    const btnAny = el("button", {
      type: "button",
      class: "chrx-btn chrx-ent-ioe__sent" + (value === "*" ? " is-on" : ""),
      title: "Unconstrained — any value",
      onclick: (e) => setSentinel("*", e.currentTarget),
    }, "Any");
    wrap.appendChild(input);
    wrap.appendChild(btnAny);
    if (opts.allowDefault) {
      const btnDef = el("button", {
        type: "button",
        class: "chrx-btn chrx-ent-ioe__sent" + (value === "d" ? " is-on" : ""),
        title: "Use school default",
        onclick: (e) => setSentinel("d", e.currentTarget),
      }, "Default");
      wrap.appendChild(btnDef);
    }
    return wrap;
  }

  function buildCtposGrid(grid) {
    const wrap = el("div", { class: "chrx-ent-ctpos" });
    wrap.style.gridTemplateColumns = `48px repeat(${CTPOS_PERIODS}, 1fr)`;
    wrap.appendChild(el("div", { class: "chrx-ent-tomatrix__corner" }));
    for (let p = 0; p < CTPOS_PERIODS; p++) {
      wrap.appendChild(el("div", { class: "chrx-ent-tomatrix__h" }, `P${p + 1}`));
    }
    const days = (window.APP && window.APP.school && window.APP.school._idx && window.APP.school._idx.days)
      || ["Mon","Tue","Wed","Thu","Fri","Sat"];
    for (let d = 0; d < CTPOS_DAYS; d++) {
      wrap.appendChild(el("div", { class: "chrx-ent-tomatrix__h" }, days[d] || `D${d + 1}`));
      for (let p = 0; p < CTPOS_PERIODS; p++) {
        const cell = el("button", {
          type: "button",
          class: "chrx-ent-ctpos__c" + (grid[d][p] ? " is-on" : ""),
          "aria-pressed": grid[d][p] ? "true" : "false",
          title: `${days[d] || "D"+(d+1)} P${p+1}`,
          onclick: (e) => {
            grid[d][p] = !grid[d][p];
            e.currentTarget.classList.toggle("is-on", grid[d][p]);
            e.currentTarget.setAttribute("aria-pressed", grid[d][p] ? "true" : "false");
          },
        });
        wrap.appendChild(cell);
      }
    }
    return wrap;
  }

  // "Set for more" — write ONE constraint field's current value to N other
  // classes. Each affected class gets its own audit entry. Mutation is in-place.
  function setForMoreField(srcRow, fieldKey, getValueNow) {
    const others = ((window.APP.school && window.APP.school.classes) || [])
      .filter(c => c.id !== srcRow.id);
    if (!others.length) {
      alert("No other classes to apply this to.");
      return;
    }
    const items = others.map(c => ({ id:c.id, label:c.name || c.id, _ref:c }));
    window.EntityDialog.openPickEntitiesPopover({
      title: `Apply ${fieldKey} to other classes`,
      help: `The current value of "${fieldKey}" will overwrite the same field on every selected class.`,
      items, multi: true,
      confirmLabel: "Apply",
      onConfirm: (ids) => {
        if (!ids.length) return;
        const val = getValueNow();
        ids.forEach(id => {
          const target = others.find(c => c.id === id);
          if (!target) return;
          const before = target.constraints ? { ...target.constraints } : undefined;
          const next = Object.assign(defaultConstraints(), target.constraints || {});
          // Deep-copy 3D ctpos arrays so mutation can't leak.
          if (fieldKey === "classTeacherPos" && Array.isArray(val)) {
            next.classTeacherPos = val.map(t => t.map(w => w.slice()));
          } else {
            next[fieldKey] = val;
          }
          target.constraints = next;
          window.APP.audit.append({
            entity:"classes", op:"constraints-setformore", field: fieldKey,
            id, before, after: { ...next },
          });
        });
      },
    });
  }

  function withSetForMore(control, srcRow, fieldKey, getValueNow) {
    if (!srcRow || !srcRow.id) return control;
    const link = window.EntityDialog.buildSetForMoreLink(
      () => setForMoreField(srcRow, fieldKey, getValueNow),
      { title: "Apply this value to other classes" }
    );
    return el("div", { class: "chrx-ent-row--withlink" }, control, link);
  }

  function open(classRow, onSave) {
    if (!classRow) return;
    const c = Object.assign(defaultConstraints(), classRow.constraints || {});
    const ctposGrid = ctposToGrid(c.classTeacherPos || emptyCtposMatrix());

    // ---- controls ----
    const ctposBox = buildCtposGrid(ctposGrid);

    const fMaxQ      = intOrEnum(c.maxQuestionMarked, v => c.maxQuestionMarked = v);
    const fManual    = el("select", null,
      el("option", { value: "0" }, "Disabled"),
      el("option", { value: "1" }, "Manual"),
      el("option", { value: "2" }, "Auto"),
    );
    fManual.value = c.m_nManualnyBlok != null ? String(c.m_nManualnyBlok) : "0";
    fManual.addEventListener("change", e => c.m_nManualnyBlok = e.target.value);

    const fMinFrom = intOrEnum(c.m_nMinBlokOd, v => c.m_nMinBlokOd = v);
    const fMinTill = intOrEnum(c.m_nMinBlokDo, v => c.m_nMinBlokDo = v);
    const fMaxFrom = intOrEnum(c.m_nMaxVyucOd, v => c.m_nMaxVyucOd = v);
    const fMaxTill = intOrEnum(c.m_nMaxVyucDo, v => c.m_nMaxVyucDo = v);

    const fDruhe = el("input", { type: "checkbox",
      checked: c.m_bDruheHodiny ? "checked" : null,
      onchange: e => c.m_bDruheHodiny = e.target.checked });
    const fKoncit = el("input", { type: "checkbox",
      checked: c.m_bKoncitNaraz ? "checked" : null,
      onchange: e => c.m_bKoncitNaraz = e.target.checked });

    const fMinDay = intOrEnum(c.minperiodsday, v => c.minperiodsday = v);
    const fMaxDay = intOrEnum(c.maxperiodsday, v => c.maxperiodsday = v);

    const fLunchFrom = intOrEnum(c.lunch_periodfrom, v => c.lunch_periodfrom = v, { allowDefault: true });
    const fLunchTill = intOrEnum(c.lunch_periodto,   v => c.lunch_periodto   = v, { allowDefault: true });

    const fPrep = intOrEnum(c.maxneedspreparation, v => c.maxneedspreparation = v);

    const sfm = (control, fieldKey, get) =>
      withSetForMore(control, classRow, fieldKey, get);

    const fields = [
      { label: "Class teacher must teach this class in specific time every day",
        control: sfm(ctposBox, "classTeacherPos", () => gridToCtpos(ctposGrid)) },
      { label: "Max. on the question marked",
        control: sfm(fMaxQ, "maxQuestionMarked", () => c.maxQuestionMarked) },
      { label: "Education block",
        control: sfm(fManual, "m_nManualnyBlok", () => c.m_nManualnyBlok) },
      { label: "Education block - min - from",
        control: sfm(fMinFrom, "m_nMinBlokOd", () => c.m_nMinBlokOd) },
      { label: "Education block - min - till",
        control: sfm(fMinTill, "m_nMinBlokDo", () => c.m_nMinBlokDo) },
      { label: "Education block - max - from",
        control: sfm(fMaxFrom, "m_nMaxVyucOd", () => c.m_nMaxVyucOd) },
      { label: "Education block - max - till",
        control: sfm(fMaxTill, "m_nMaxVyucDo", () => c.m_nMaxVyucDo) },
      { label: "Allow arrival on second lesson.",
        control: sfm(fDruhe, "m_bDruheHodiny", () => !!c.m_bDruheHodiny) },
      { label: "The groups of students have to finish the day in the same time.",
        control: sfm(fKoncit, "m_bKoncitNaraz", () => !!c.m_bKoncitNaraz) },
      { label: "Min periods per day",
        control: sfm(fMinDay, "minperiodsday", () => c.minperiodsday) },
      { label: "Max periods per day",
        control: sfm(fMaxDay, "maxperiodsday", () => c.maxperiodsday) },
      { label: "Lunch - from",
        control: sfm(fLunchFrom, "lunch_periodfrom", () => c.lunch_periodfrom) },
      { label: "Lunch - till",
        control: sfm(fLunchTill, "lunch_periodto", () => c.lunch_periodto) },
      { label: "Max. number of lessons per day requiring preparation",
        control: sfm(fPrep, "maxneedspreparation", () => c.maxneedspreparation) },
    ];

    D.buildEditSheet({
      title: `Constraints — ${classRow.name || classRow.id}`,
      fields,
      onSave: () => {
        c.classTeacherPos = gridToCtpos(ctposGrid);
        // Final write happens here so caller controls audit + persistence.
        D.closeSheet();
        if (typeof onSave === "function") onSave(c);
      },
    });
  }

  global.ClassConstraintsDialog = { open };
})(window);
