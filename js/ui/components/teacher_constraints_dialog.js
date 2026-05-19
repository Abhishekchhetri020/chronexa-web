/* Teacher constraints dialog — Classic's 11-field teachers.constraints subobject.
 * window.TeacherConstraintsDialog.open(teacherRow, onSave)
 *
 * Verbatim labels from legacy-research §6.3.
 *
 * Fields written to teacherRow.constraints (created if absent):
 *   teachers_maxgapsweek           — int_or_enum ("*" = any)
 *   teachers_maxgapsday            — int_or_enum
 *   teachers_maxconsecutiveperiods — int_or_enum
 *   maxOnConditional               — int_or_enum
 *   lessonsPerDayMin               — int_or_enum
 *   lessonsPerDayMax               — int_or_enum
 *   maxDaysPerWeek                 — int_or_enum
 *   supervisionMinCount            — int
 *   supervisionMaxCount            — int
 *   supervisionMinMinutes          — int
 *   supervisionMaxMinutes          — int
 */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;
  const { el } = D;

  function defaultConstraints() {
    return {
      teachers_maxgapsweek: "*",
      teachers_maxgapsday: "*",
      teachers_maxconsecutiveperiods: "*",
      maxOnConditional: "*",
      lessonsPerDayMin: "*",
      lessonsPerDayMax: "*",
      maxDaysPerWeek: "*",
      supervisionMinCount: "",
      supervisionMaxCount: "",
      supervisionMinMinutes: "",
      supervisionMaxMinutes: "",
    };
  }

  function intOrEnum(value, onChange) {
    const wrap = el("div", { class: "chrx-ent-ioe" });
    const isInt = typeof value === "number" || (value != null && /^-?\d+$/.test(String(value)));
    const input = el("input", {
      type: "number",
      min: "0",
      value: isInt ? String(value) : "",
      oninput: (e) => {
        const v = e.target.value.trim();
        if (v === "") return;
        const n = parseInt(v, 10);
        if (!isNaN(n)) onChange(n);
        unmark();
      },
    });
    function unmark() {
      wrap.querySelectorAll(".chrx-ent-ioe__sent.is-on")
          .forEach(b => b.classList.remove("is-on"));
    }
    const btn = el("button", {
      type: "button",
      class: "chrx-btn chrx-ent-ioe__sent" + (value === "*" ? " is-on" : ""),
      title: "Any (no cap)",
      onclick: (e) => {
        input.value = "";
        onChange("*");
        unmark();
        e.currentTarget.classList.add("is-on");
      },
    }, "Any");
    wrap.appendChild(input);
    wrap.appendChild(btn);
    return wrap;
  }

  function plainInt(value, onChange) {
    return el("input", {
      type: "number",
      min: "0",
      value: value != null && value !== "" ? String(value) : "",
      oninput: (e) => {
        const v = e.target.value.trim();
        if (v === "") onChange("");
        else {
          const n = parseInt(v, 10);
          if (!isNaN(n)) onChange(n);
        }
      },
    });
  }

  function setForMoreField(srcRow, fieldKey, getValueNow) {
    const others = ((window.APP.school && window.APP.school.teachers) || [])
      .filter(t => t.id !== srcRow.id);
    if (!others.length) {
      alert("No other teachers to apply this to.");
      return;
    }
    const nameOf = (t) => t.name
      || `${t.firstName || ""} ${t.lastName || ""}`.trim()
      || t.id;
    const items = others.map(t => ({ id:t.id, label:nameOf(t), _ref:t }));
    window.EntityDialog.openPickEntitiesPopover({
      title: `Apply ${fieldKey} to other teachers`,
      help: `The current value of "${fieldKey}" will overwrite the same field on every selected teacher.`,
      items, multi: true,
      confirmLabel: "Apply",
      onConfirm: (ids) => {
        if (!ids.length) return;
        const val = getValueNow();
        ids.forEach(id => {
          const target = others.find(t => t.id === id);
          if (!target) return;
          const before = target.constraints ? { ...target.constraints } : undefined;
          const next = Object.assign(defaultConstraints(), target.constraints || {});
          next[fieldKey] = val;
          target.constraints = next;
          window.APP.audit.append({
            entity:"teachers", op:"constraints-setformore", field: fieldKey,
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
      { title: "Apply this value to other teachers" }
    );
    return el("div", { class: "chrx-ent-row--withlink" }, control, link);
  }

  function open(teacherRow, onSave) {
    if (!teacherRow) return;
    const c = Object.assign(defaultConstraints(), teacherRow.constraints || {});

    const sfm = (control, fieldKey) =>
      withSetForMore(control, teacherRow, fieldKey, () => c[fieldKey]);

    const fields = [
      { label: "Max gaps per week",
        control: sfm(intOrEnum(c.teachers_maxgapsweek, v => c.teachers_maxgapsweek = v), "teachers_maxgapsweek") },
      { label: "Max gaps per day",
        control: sfm(intOrEnum(c.teachers_maxgapsday, v => c.teachers_maxgapsday = v), "teachers_maxgapsday") },
      { label: "Max consecutive periods",
        control: sfm(intOrEnum(c.teachers_maxconsecutiveperiods, v => c.teachers_maxconsecutiveperiods = v), "teachers_maxconsecutiveperiods") },
      { label: "Max. on the question marked",
        control: sfm(intOrEnum(c.maxOnConditional, v => c.maxOnConditional = v), "maxOnConditional") },
      { label: "Number of lessons per day — From",
        control: sfm(intOrEnum(c.lessonsPerDayMin, v => c.lessonsPerDayMin = v), "lessonsPerDayMin") },
      { label: "Number of lessons per day — Till",
        control: sfm(intOrEnum(c.lessonsPerDayMax, v => c.lessonsPerDayMax = v), "lessonsPerDayMax") },
      { label: "Max days per week",
        control: sfm(intOrEnum(c.maxDaysPerWeek, v => c.maxDaysPerWeek = v), "maxDaysPerWeek") },
      // Supervisions block intentionally lacks "Set for more" (matches
      // legacy-research §6.3 — supervisions excluded).
      { label: "Supervisions: Min Count",
        control: plainInt(c.supervisionMinCount, v => c.supervisionMinCount = v) },
      { label: "Supervisions: Max Count",
        control: plainInt(c.supervisionMaxCount, v => c.supervisionMaxCount = v) },
      { label: "Supervisions: Min Minutes",
        control: plainInt(c.supervisionMinMinutes, v => c.supervisionMinMinutes = v) },
      { label: "Supervisions: Max Minutes",
        control: plainInt(c.supervisionMaxMinutes, v => c.supervisionMaxMinutes = v) },
    ];

    const title = teacherRow.name
      || `${teacherRow.firstName || ""} ${teacherRow.lastName || ""}`.trim()
      || teacherRow.id;

    D.buildEditSheet({
      title: `Constraints — ${title}`,
      fields,
      onSave: () => {
        D.closeSheet();
        if (typeof onSave === "function") onSave(c);
      },
    });
  }

  global.TeacherConstraintsDialog = { open };
})(window);
