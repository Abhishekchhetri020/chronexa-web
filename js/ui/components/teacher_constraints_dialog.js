/* Teacher constraints dialog — EduPage's 11-field teachers.constraints subobject.
 * window.TeacherConstraintsDialog.open(teacherRow, onSave)
 *
 * Verbatim labels from EDUPAGE_FEATURE_MAP_WIZARD_6_8_R6.md §6.3.
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

  function open(teacherRow, onSave) {
    if (!teacherRow) return;
    const c = Object.assign(defaultConstraints(), teacherRow.constraints || {});

    const fields = [
      { label: "Max gaps per week",
        control: intOrEnum(c.teachers_maxgapsweek, v => c.teachers_maxgapsweek = v) },
      { label: "Max gaps per day",
        control: intOrEnum(c.teachers_maxgapsday, v => c.teachers_maxgapsday = v) },
      { label: "Max consecutive periods",
        control: intOrEnum(c.teachers_maxconsecutiveperiods, v => c.teachers_maxconsecutiveperiods = v) },
      { label: "Max. on the question marked",
        control: intOrEnum(c.maxOnConditional, v => c.maxOnConditional = v) },
      { label: "Number of lessons per day — From",
        control: intOrEnum(c.lessonsPerDayMin, v => c.lessonsPerDayMin = v) },
      { label: "Number of lessons per day — Till",
        control: intOrEnum(c.lessonsPerDayMax, v => c.lessonsPerDayMax = v) },
      { label: "Max days per week",
        control: intOrEnum(c.maxDaysPerWeek, v => c.maxDaysPerWeek = v) },
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
