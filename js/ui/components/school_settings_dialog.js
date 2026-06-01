/* School settings dialog — window.SchoolSettings.open().
 *
 * Centralized place for school-wide settings: name, year, country/region,
 * days/week, periods/day, multi-term toggle, default time-zone, and the
 * 23 `globals.settings` fields documented in legacy-research.
 *
 * Now mirrors the Classic "Settings" dialog layout:
 *   - "Bell times" link → EntityBells
 *   - "Rename days" link → EntityDays
 *   - "Define terms" / "Define weeks" shown when multi-term is checked
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
  const WEEKENDS = [
    "Saturday - Sunday",
    "Sunday",
    "Friday - Saturday",
    "Saturday",
    "None",
  ];

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
      zeroPeriods:    !!s.zeroPeriods,
      showDayNumbers: !!s.showDayNumbers,
      weekend:        s.weekend || "Saturday - Sunday",
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
    function link(label, onClick) {
      const a = D.el("a", { href: "#", style: "color:#3b82f6;font-size:12px;cursor:pointer;text-decoration:underline" }, label);
      a.addEventListener("click", (e) => { e.preventDefault(); onClick(); });
      return a;
    }
    function actionBtn(label, onClick) {
      const btn = D.el("button", {
        type: "button",
        style: "padding:4px 14px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;cursor:pointer;background:#f8fafc;color:#334155",
      }, label);
      btn.addEventListener("click", onClick);
      return btn;
    }

    // Multi-term conditional fields — these will be shown/hidden dynamically
    const termsRow = field("", D.el("div", { style: "display:flex;gap:8px" },
      actionBtn("Define terms", () => { if (window.EntityTerms) window.EntityTerms.open(); }),
      actionBtn("Define weeks", () => { if (window.EntityWeeks) window.EntityWeeks.open(); }),
    ));

    D.buildEditSheet({
      title: `Settings — ${draft.schoolName || "Untitled"}`,
      fields: [
        // ── School identity ──
        field("Name of the school:", text(draft.schoolName, 120, v => draft.schoolName = v)),
        field("School year:", select(draft.year,
          [`${new Date().getFullYear()}/${(new Date().getFullYear() + 1) % 100}`,
           `${new Date().getFullYear() - 1}/${new Date().getFullYear() % 100}`],
          v => draft.year = v)),

        field("Section: "),

        // ── Bell shape ──
        field("Periods per day:", (() => {
          const wrap = D.el("span", { style: "display:flex;align-items:center;gap:8px" });
          wrap.appendChild(num(draft.periodsPerDay, 1, 20, 1, v => draft.periodsPerDay = v));
          wrap.appendChild(link("Bell times", () => {
            if (window.EntityBells) window.EntityBells.open();
          }));
          return wrap;
        })()),
        field("Work with zero periods", bool(draft.zeroPeriods, v => draft.zeroPeriods = v)),

        field("Section: "),

        field("Number of days:", (() => {
          const wrap = D.el("span", { style: "display:flex;align-items:center;gap:8px" });
          wrap.appendChild(num(draft.daysPerWeek, 1, 7, 1, v => draft.daysPerWeek = v));
          wrap.appendChild(link("Rename days", () => {
            if (window.EntityDays) window.EntityDays.open();
          }));
          return wrap;
        })()),
        field("Weekend:", select(draft.weekend, WEEKENDS, v => draft.weekend = v)),

        field("Section: "),

        field("Show day number instead of day name", bool(draft.showDayNumbers, v => draft.showDayNumbers = v)),

        field("Section: "),

        // ── Multi-term/week ──
        field("I want to create multi term or multi-week timetable", (() => {
          const cb = bool(draft.multiTerm, v => {
            draft.multiTerm = v;
            // Toggle visibility of Define terms/weeks buttons
            const btnsRow = document.querySelector("[data-settings-terms]");
            if (btnsRow) btnsRow.style.display = v ? "flex" : "none";
          });
          return cb;
        })()),
        // Conditional buttons
        (() => {
          const r = field("", D.el("div", {
            "data-settings-terms": "1",
            style: `display:${draft.multiTerm ? "flex" : "none"};gap:8px`,
          },
            actionBtn("Define terms", () => { if (window.EntityTerms) window.EntityTerms.open(); }),
            actionBtn("Define weeks", () => { if (window.EntityWeeks) window.EntityWeeks.open(); }),
          ));
          return r;
        })(),

        field("Section: Solver hints"),
        field("Max cards per slot", num(draft.maxCardsPerCell, 1, 10, 1, v => draft.maxCardsPerCell = v)),
        field("Building transfer periods", num(draft.transferTimePeriods, 0, 5, 1, v => draft.transferTimePeriods = v)),
        field("Class in one building per day", bool(draft.classInOneBuildingPerDay, v => draft.classInOneBuildingPerDay = v)),

        field("Section: Print defaults"),
        field("Show bell times", bool(draft.printShowBellTimes, v => draft.printShowBellTimes = v)),
        field("Show teacher names", bool(draft.printShowTeacherNames, v => draft.printShowTeacherNames = v)),
        field("Show classroom names", bool(draft.printShowClassroomNames, v => draft.printShowClassroomNames = v)),
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
        // Fire entity:changed so School Hub refreshes
        document.dispatchEvent(new CustomEvent("entity:changed", { detail: { source: "school-settings-dialog" } }));
      },
    });
  }

  global.SchoolSettings = { open };
})(window);
