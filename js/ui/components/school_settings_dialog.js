/* School settings dialog — window.SchoolSettings.open().
 *
 * Centralized place for school-wide settings: name, year, country/region,
 * days/week, periods/day, multi-term toggle, default time-zone, and the
 * 23 `globals.settings` fields documented in legacy-research
 *
 * Backs the "school" route in entity_router (replacing the previous stub).
 * Settings persist on `school.settings = {...}`.
 */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  const COUNTRIES = ["India", "USA", "UK", "Slovakia", "Australia", "Singapore", "UAE", "Other"];
  const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Europe/Bratislava", "America/New_York", "America/Los_Angeles", "Europe/London", "Australia/Sydney", "Asia/Singapore", "UTC"];

  function open() {
    const school = window.APP.school;
    if (!school) { alert("Open a timetable first."); return; }
    school.settings = school.settings || {};
    const s = school.settings;
    const draft = {
      schoolName: school.schoolName || "",
      year:       s.year || (new Date().getFullYear() + "/" + ((new Date().getFullYear() + 1) % 100)),
      country:    s.country || "India",
      region:     s.region || "",
      timezone:   s.timezone || "Asia/Kolkata",
      daysPerWeek:    s.daysPerWeek || 6,
      periodsPerDay:  s.periodsPerDay || (school.bell && school.bell.periods ? school.bell.periods.length : 8),
      multiTerm:      !!s.multiTerm,
      multiWeek:      !!s.multiWeek,
      maxCardsPerCell: s.maxCardsPerCell || 1,
      defaultLessonDuration: s.defaultLessonDuration || 40,
      transferTimePeriods: s.transferTimePeriods || 0,
      classInOneBuildingPerDay: !!s.classInOneBuildingPerDay,
      printShowBellTimes:  s.printShowBellTimes !== false,
      printShowTeacherNames: s.printShowTeacherNames !== false,
      printShowClassroomNames: s.printShowClassroomNames !== false,
      mode: s.mode || "",
      afternoonStartsAt: s.afternoonStartsAt || "",
    };

    function field(label, control) {
      return { label, control };
    }
    function num(value, min, max, step, onChange) {
      return D.el("input", { type: "number", min, max, step: step || 1, value,
        oninput: (e) => onChange(parseFloat(e.target.value) || 0) });
    }
    function bool(value, onChange) {
      return D.el("input", { type: "checkbox", checked: value ? "checked" : null,
        onchange: (e) => onChange(e.target.checked) });
    }
    function text(value, max, onChange) {
      return D.el("input", { type: "text", value, maxlength: String(max),
        oninput: (e) => onChange(e.target.value) });
    }
    function select(value, options, onChange) {
      const sel = D.el("select", { onchange: (e) => onChange(e.target.value) });
      for (const o of options) {
        const opt = D.el("option", { value: o }, o);
        if (o === value) opt.setAttribute("selected", "selected");
        sel.appendChild(opt);
      }
      return sel;
    }

    D.buildEditSheet({
      title: `School settings — ${draft.schoolName || "Untitled"}`,
      fields: [
        field("Section: School identity"),
        field("School name",   text(draft.schoolName, 120, v => draft.schoolName = v)),
        field("Academic year", text(draft.year, 12, v => draft.year = v)),
        field("Country",       select(draft.country, COUNTRIES, v => draft.country = v)),
        field("Region / state", text(draft.region, 80, v => draft.region = v)),
        field("Time zone",     select(draft.timezone, TIMEZONES, v => draft.timezone = v)),

        field("Section: Bell shape"),
        field("Days per week",   num(draft.daysPerWeek, 1, 7, 1, v => draft.daysPerWeek = v)),
        field("Periods per day", num(draft.periodsPerDay, 1, 20, 1, v => draft.periodsPerDay = v)),
        field("Default period duration (minutes)", num(draft.defaultLessonDuration, 20, 90, 5, v => draft.defaultLessonDuration = v)),
        field("Multi-term timetable",  bool(draft.multiTerm, v => draft.multiTerm = v)),
        field("Multi-week timetable",  bool(draft.multiWeek, v => draft.multiWeek = v)),

        field("Section: Solver hints"),
        field("Max cards per slot",    num(draft.maxCardsPerCell, 1, 10, 1, v => draft.maxCardsPerCell = v)),
        field("Building transfer periods (min between blocks)", num(draft.transferTimePeriods, 0, 5, 1, v => draft.transferTimePeriods = v)),
        field("Class in one building per day", bool(draft.classInOneBuildingPerDay, v => draft.classInOneBuildingPerDay = v)),

        field("Section: School mode (FET port)"),
        field("Mode",  select(draft.mode, ["", "morning-afternoon", "block-planning"], v => draft.mode = v)),
        field("Afternoon starts at period", num(draft.afternoonStartsAt, 1, 12, 1, v => draft.afternoonStartsAt = v)),

        field("Section: Print defaults"),
        field("Show bell times",       bool(draft.printShowBellTimes, v => draft.printShowBellTimes = v)),
        field("Show teacher names",    bool(draft.printShowTeacherNames, v => draft.printShowTeacherNames = v)),
        field("Show classroom names",  bool(draft.printShowClassroomNames, v => draft.printShowClassroomNames = v)),
      ],
      onSave: () => {
        if (!draft.schoolName.trim()) {
          alert("School name is required."); return;
        }
        const before = { schoolName: school.schoolName, settings: { ...school.settings } };
        school.schoolName = draft.schoolName.trim();
        school.settings = { ...draft };
        delete school.settings.schoolName; // already on school root
        if (window.APP.audit && window.APP.audit.append) {
          window.APP.audit.append({ entity: "school", op: "settings", before, after: { schoolName: school.schoolName, settings: school.settings } });
        }
        D.closeSheet();
        // Refresh title bar
        const title = document.querySelector("#school-title, [data-school-name]");
        if (title) title.textContent = school.schoolName;
      },
    });
  }

  global.SchoolSettings = { open };
})(window);
