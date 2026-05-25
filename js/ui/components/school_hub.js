/* School Hub — multi-pane page for step-2. window.SchoolHub.render(host).
 *
 * Replaces the single school_settings_dialog modal with an in-page hub:
 *   ┌─ Sidebar ────┬─ Active pane ───────────────────────┐
 *   │ Identity     │ inline forms, save-on-blur          │
 *   │ Calendar     │                                     │
 *   │ Bell schedule│ collection panes preview rows +     │
 *   │ Breaks       │ delegate "Manage..." to existing    │
 *   │ Holidays     │ EntityBells/Breaks/Holidays/Buildings│
 *   │ Buildings    │                                     │
 *   │ Branding     │                                     │
 *   │ Solver hints │                                     │
 *   └──────────────┴─────────────────────────────────────┘
 *
 * Per CLAUDE.md (instructions): writes commit immediately to school.settings,
 * audit.append() entries fire, entity:changed dispatched so other listeners
 * (undo/redo, editor activator) refresh. Save-pill in bottom-right confirms.
 *
 * The 4 collection panes show preview tables; "Manage..." button opens the
 * existing EntityBells / EntityBreaks / EntityHolidays / EntityBuildings
 * dialogs (which layer over the hub host). When they close + entity:changed
 * fires, the hub re-renders the affected pane so previews stay in sync.
 */
(function (global) {
  "use strict";

  const COUNTRIES = ["India", "USA", "UK", "Slovakia", "Australia", "Singapore", "UAE", "Other"];
  const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Europe/Bratislava", "America/New_York",
    "America/Los_Angeles", "Europe/London", "Australia/Sydney", "Asia/Singapore", "UTC"];
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const PANES = [
    { id: "identity",  icon: "🏫", label: "Identity",        desc: "Name, logo, year, country" },
    { id: "calendar",  icon: "📅", label: "Calendar",        desc: "Days, weekend, multi-week" },
    { id: "bell",      icon: "🔔", label: "Bell schedule",   desc: "Periods + start/end times" },
    { id: "breaks",    icon: "🍎", label: "Breaks",          desc: "Recess, lunch, fruit break" },
    { id: "holidays",  icon: "🎉", label: "Holidays",        desc: "Date ranges (Diwali, exams)" },
    { id: "buildings", icon: "🏢", label: "Buildings",       desc: "Locations + transfer rules" },
    { id: "branding",  icon: "🎨", label: "Branding & print", desc: "Logo, header/footer text" },
    { id: "solver",    icon: "🧠", label: "Solver hints",    desc: "Lesson duration, transfer time" },
  ];

  let activePane = "identity";
  let hostEl = null;
  let mainEl = null;
  let pillEl = null;
  let pillTimer = null;
  let listenersWired = false;

  // ─────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false) {
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  }
  function fmtTime(min) {
    if (min == null) return "—";
    const h = Math.floor(min / 60), m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function school() { return window.APP.school; }
  function settings() {
    const s = school();
    if (!s) return {};
    s.settings = s.settings || {};
    return s.settings;
  }
  function commit(label) {
    flashPill("Saving…", "saving");
    // entity:changed lets undo/redo + editor activator refresh
    document.dispatchEvent(new CustomEvent("entity:changed", { detail: { source: "school-hub" } }));
    clearTimeout(pillTimer);
    pillTimer = setTimeout(() => flashPill(label || "All changes saved", "ok"), 180);
  }
  function audit(op, before, after) {
    if (window.APP.audit && window.APP.audit.append) {
      window.APP.audit.append({ entity: "school", op, before, after });
    }
  }
  function flashPill(text, state) {
    if (!pillEl) return;
    pillEl.textContent = (state === "ok" ? "✓ " : "") + text;
    pillEl.dataset.state = state || "idle";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Field primitives — commit-on-blur for text, commit-on-change for checkbox/select
  // ─────────────────────────────────────────────────────────────────────────
  function textInput(initialValue, onCommit, opts) {
    opts = opts || {};
    const inp = el("input", {
      type: opts.type || "text",
      value: initialValue == null ? "" : initialValue,
      maxlength: opts.maxlength ? String(opts.maxlength) : null,
      placeholder: opts.placeholder || null,
      class: "chrx-hub-input",
    });
    const original = inp.value;
    inp.addEventListener("blur", () => {
      const v = inp.value;
      if (v !== original) onCommit(v);
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    return inp;
  }
  function numInput(initialValue, min, max, step, onCommit) {
    const inp = el("input", {
      type: "number", min, max, step: step || 1,
      value: initialValue == null ? "" : initialValue,
      class: "chrx-hub-input chrx-hub-input--num",
    });
    const original = inp.value;
    inp.addEventListener("blur", () => {
      const v = parseFloat(inp.value);
      if (isNaN(v)) { inp.value = original; return; }
      if (String(v) !== original) onCommit(v);
    });
    return inp;
  }
  function selectInput(initialValue, options, onCommit) {
    const sel = el("select", { class: "chrx-hub-input chrx-hub-input--select" });
    for (const o of options) {
      const opt = el("option", { value: o }, o);
      if (o === initialValue) opt.setAttribute("selected", "selected");
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => onCommit(sel.value));
    return sel;
  }
  function toggle(initialValue, onCommit, opts) {
    opts = opts || {};
    const inp = el("input", {
      type: "checkbox",
      checked: initialValue ? "checked" : null,
      class: "chrx-hub-toggle",
    });
    inp.addEventListener("change", () => onCommit(inp.checked));
    const lbl = el("label", { class: "chrx-hub-toggle-wrap" },
      inp,
      el("span", { class: "chrx-hub-toggle-slider" }),
      opts.label ? el("span", { class: "chrx-hub-toggle-label" }, opts.label) : null,
    );
    return lbl;
  }
  function row(label, control, hint) {
    return el("div", { class: "chrx-hub-row" },
      el("div", { class: "chrx-hub-row__label" },
        el("span", { class: "chrx-hub-row__name" }, label),
        hint ? el("span", { class: "chrx-hub-row__hint" }, hint) : null,
      ),
      el("div", { class: "chrx-hub-row__control" }, control),
    );
  }
  function section(title, ...children) {
    return el("section", { class: "chrx-hub-section" },
      el("h3", { class: "chrx-hub-section__title" }, title),
      el("div", { class: "chrx-hub-section__body" }, ...children),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pane: Identity
  // ─────────────────────────────────────────────────────────────────────────
  function paneIdentity() {
    const S = school();
    const s = settings();
    const wrap = el("div", { class: "chrx-hub-pane" });

    wrap.appendChild(section("School identity",
      row("School name",
        textInput(S.schoolName || "", v => {
          const before = { schoolName: S.schoolName };
          S.schoolName = (v || "").trim();
          audit("rename", before, { schoolName: S.schoolName });
          commit("Name saved");
          const title = document.querySelector("#school-title, [data-school-name]");
          if (title) title.textContent = S.schoolName;
        }, { maxlength: 120, placeholder: "e.g. GD Goenka Public School, Darbhanga" })),
      row("Academic year",
        textInput(s.year || `${new Date().getFullYear()}/${(new Date().getFullYear() + 1) % 100}`,
          v => { s.year = v; commit(); }, { maxlength: 12, placeholder: "2026/27" })),
      row("Country",
        selectInput(s.country || "India", COUNTRIES, v => { s.country = v; commit(); })),
      row("Region / state",
        textInput(s.region || "", v => { s.region = v; commit(); },
          { maxlength: 80, placeholder: "e.g. Bihar" })),
      row("Time zone",
        selectInput(s.timezone || "Asia/Kolkata", TIMEZONES, v => { s.timezone = v; commit(); })),
    ));

    // Logo upload (data URL, optional)
    const logoBox = el("div", { class: "chrx-hub-logo" });
    const logoImg = el("img", {
      class: "chrx-hub-logo__preview",
      src: s.logoDataUrl || "assets/icon-192.png",
      alt: "School logo",
    });
    const fileInput = el("input", { type: "file", accept: "image/*", class: "chrx-hub-logo__file" });
    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (f.size > 256 * 1024) {
        flashPill("Logo too large (max 256 KB)", "err");
        return;
      }
      const r = new FileReader();
      r.onload = () => {
        s.logoDataUrl = r.result;
        logoImg.src = r.result;
        commit("Logo saved");
      };
      r.readAsDataURL(f);
    });
    const clearBtn = el("button", { class: "chrx-hub-btn", type: "button",
      onclick: () => { delete s.logoDataUrl; logoImg.src = "assets/icon-192.png"; commit("Logo cleared"); } },
      "Clear");
    logoBox.appendChild(logoImg);
    logoBox.appendChild(el("div", { class: "chrx-hub-logo__controls" },
      el("label", { class: "chrx-hub-btn chrx-hub-btn--primary" }, "Upload logo", fileInput),
      clearBtn,
      el("p", { class: "chrx-hub-logo__hint" },
        "PNG/JPG, max 256 KB. Used in printouts + PWA install banner."),
    ));
    wrap.appendChild(section("Logo", logoBox));

    return wrap;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pane: Calendar
  // ─────────────────────────────────────────────────────────────────────────
  function paneCalendar() {
    const S = school();
    const s = settings();
    const wrap = el("div", { class: "chrx-hub-pane" });

    const days = parseInt(s.daysPerWeek, 10) || 6;
    s.daysPerWeek = days;
    s.weekendMask = s.weekendMask || ((days === 5) ? [false, false, false, false, false, true, true]
                                                  : [false, false, false, false, false, false, true]);

    wrap.appendChild(section("Working days",
      row("Days per week",
        numInput(s.daysPerWeek, 1, 7, 1, v => {
          s.daysPerWeek = v;
          commit("Days per week saved");
          renderPane(); // toggle strip count
        })),
      row("Period start time",
        textInput(s.periodStartTime || "07:30", v => { s.periodStartTime = v; commit(); },
          { type: "time" }),
        "Time of the first bell (used when generating defaults)"),
    ));

    // Visual day strip
    const strip = el("div", { class: "chrx-hub-daystrip" });
    DAY_LABELS.forEach((label, i) => {
      const off = s.weekendMask[i] === true;
      const cell = el("button", {
        type: "button",
        class: "chrx-hub-daycell" + (off ? " is-off" : " is-on"),
        "aria-pressed": off ? "false" : "true",
        onclick: () => {
          s.weekendMask[i] = !s.weekendMask[i];
          commit("Weekend updated");
          renderPane();
        },
      },
        el("span", { class: "chrx-hub-daycell__name" }, label),
        el("span", { class: "chrx-hub-daycell__state" }, off ? "off" : "on"),
      );
      strip.appendChild(cell);
    });
    wrap.appendChild(section("Weekend pattern",
      el("p", { class: "chrx-hub-help" },
        "Click a day to toggle. Highlighted days are teaching days. Affects solver + grid."),
      strip,
    ));

    wrap.appendChild(section("Display options",
      row("Show day numbers instead of names",
        toggle(!!s.showDayNumbers, v => { s.showDayNumbers = v; commit(); }),
        "Useful for multi-week timetables (Day 1 / Day 2)"),
      row("Multi-week timetable",
        toggle(!!s.multiWeek, v => { s.multiWeek = v; commit(); }),
        "A / B / C week rotations (manage weeks via the Specification menu)"),
      row("Multi-term timetable",
        toggle(!!s.multiTerm, v => { s.multiTerm = v; commit(); }),
        "Different lesson sets per semester / term"),
    ));

    return wrap;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pane: Bell schedule (preview + delegate to EntityBells)
  // ─────────────────────────────────────────────────────────────────────────
  function paneBell() {
    const S = school();
    const s = settings();
    const wrap = el("div", { class: "chrx-hub-pane" });

    const periods = (S.bell && S.bell.periods) || [];
    const bells = Array.isArray(S.bells) ? S.bells : [];

    wrap.appendChild(section("Quick toggles",
      row("Different bells on some days",
        toggle(!!s.bellPerDay, v => { s.bellPerDay = v; commit(); }),
        "Reveals per-weekday overrides for individual periods"),
      row("Different bell schedules for different classes",
        toggle(!!s.bellPerClass, v => { s.bellPerClass = v; commit(); }),
        `Multi-bell mode (${bells.length} schedule${bells.length === 1 ? "" : "s"} defined)`),
    ));

    // Period preview table
    const tbody = el("tbody");
    if (!periods.length) {
      tbody.appendChild(el("tr", null,
        el("td", { colspan: "5", class: "chrx-hub-empty" },
          "No periods yet. Click ‘Manage periods’ below to add some.")));
    } else {
      periods.forEach((p, i) => {
        const flags = [];
        if (p.printinclasses !== false) flags.push("C");
        if (p.printinteachers !== false) flags.push("T");
        if (p.printinclassrooms !== false) flags.push("R");
        if (p.printinbells !== false) flags.push("B");
        tbody.appendChild(el("tr", null,
          el("td", { class: "chrx-hub-num" }, String(i + 1)),
          el("td", { class: "chrx-hub-bold" }, p.label || String(p.index || i + 1)),
          el("td", { class: "chrx-hub-tnum" }, fmtTime(p.startMin)),
          el("td", { class: "chrx-hub-tnum" }, fmtTime(p.endMin)),
          el("td", { class: "chrx-hub-tnum" },
            (p.endMin != null && p.startMin != null) ? `${p.endMin - p.startMin} min` : "—"),
          el("td", { class: "chrx-hub-flags" }, flags.join("") || "—"),
        ));
      });
    }
    const table = el("table", { class: "chrx-hub-table" },
      el("thead", null, el("tr", null,
        el("th", null, "#"),
        el("th", null, "Label"),
        el("th", { class: "chrx-hub-tnum" }, "Start"),
        el("th", { class: "chrx-hub-tnum" }, "End"),
        el("th", { class: "chrx-hub-tnum" }, "Duration"),
        el("th", null, "Print"),
      )),
      tbody,
    );
    wrap.appendChild(section("Current bell schedule (preview)",
      table,
      el("div", { class: "chrx-hub-actions" },
        el("button", {
          class: "chrx-hub-btn chrx-hub-btn--primary", type: "button",
          onclick: () => { if (window.EntityBells) window.EntityBells.open(); },
        }, "Manage periods…"),
        bells.length > 0
          ? el("span", { class: "chrx-hub-help" },
              `${bells.length} multi-bell schedule${bells.length === 1 ? "" : "s"} configured.`)
          : null,
      ),
    ));

    // Per-day override matrix (shown when bellPerDay toggle is on)
    if (s.bellPerDay && periods.length) {
      const matrixHost = el("div", { class: "chrx-hub-matrix-host" });
      wrap.appendChild(section("Per-day bell time overrides",
        el("p", { class: "chrx-hub-help" },
          "Click any cell to set different bell times for a period on a specific day."),
        matrixHost,
      ));
      // Defer render so the host is in the DOM
      setTimeout(() => {
        if (window.PeriodOverrideMatrix && window.PeriodOverrideMatrix.render) {
          window.PeriodOverrideMatrix.render(matrixHost);
        } else {
          matrixHost.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:8px">Per-day override matrix is loading…</div>';
        }
      }, 0);
    }

    return wrap;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pane: Breaks
  // ─────────────────────────────────────────────────────────────────────────
  function paneBreaks() {
    const S = school();
    const breaks = Array.isArray(S.breaks) ? S.breaks : [];
    const wrap = el("div", { class: "chrx-hub-pane" });

    wrap.appendChild(section("Break-specific rules",
      el("p", { class: "chrx-hub-help" },
        "These three rules apply to every break and are SOLVER-IMPACTFUL:"),
      el("ul", { class: "chrx-hub-list" },
        el("li", null, "Double lessons cannot span this break"),
        el("li", null, "Sufficient time for building transition"),
        el("li", null, "Custom printout text"),
      ),
      el("p", { class: "chrx-hub-help" },
        "Set per break via the dialog (each break carries its own flags)."),
    ));

    const tbody = el("tbody");
    if (!breaks.length) {
      tbody.appendChild(el("tr", null,
        el("td", { colspan: "5", class: "chrx-hub-empty" },
          "No breaks defined yet — solver will not enforce mandatory gaps.")));
    } else {
      breaks.forEach(b => {
        const flags = [];
        if (b.doubleNotSpan) flags.push("DBL");
        if (b.transitionOk)  flags.push("TRN");
        tbody.appendChild(el("tr", null,
          el("td", { class: "chrx-hub-bold" }, b.name || "(unnamed)"),
          el("td", null, b.short || "—"),
          el("td", { class: "chrx-hub-tnum" }, b.starttime || "—"),
          el("td", { class: "chrx-hub-tnum" }, b.endtime || "—"),
          el("td", { class: "chrx-hub-flags" }, flags.join(" ") || "—"),
        ));
      });
    }
    wrap.appendChild(section("Breaks (preview)",
      el("table", { class: "chrx-hub-table" },
        el("thead", null, el("tr", null,
          el("th", null, "Name"),
          el("th", null, "Short"),
          el("th", { class: "chrx-hub-tnum" }, "Start"),
          el("th", { class: "chrx-hub-tnum" }, "End"),
          el("th", null, "Flags"),
        )),
        tbody,
      ),
      el("div", { class: "chrx-hub-actions" },
        el("button", {
          class: "chrx-hub-btn chrx-hub-btn--primary", type: "button",
          onclick: () => { if (window.EntityBreaks) window.EntityBreaks.open(); },
        }, "Manage breaks…"),
      ),
    ));
    return wrap;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pane: Holidays
  // ─────────────────────────────────────────────────────────────────────────
  function paneHolidays() {
    const S = school();
    const holidays = Array.isArray(S.holidays) ? S.holidays : [];
    const wrap = el("div", { class: "chrx-hub-pane" });

    const tbody = el("tbody");
    if (!holidays.length) {
      tbody.appendChild(el("tr", null,
        el("td", { colspan: "4", class: "chrx-hub-empty" },
          "No holidays yet. Add Diwali, Christmas, mid-term break, etc.")));
    } else {
      holidays.forEach(h => {
        tbody.appendChild(el("tr", null,
          el("td", null, el("span", {
            class: "chrx-hub-swatch",
            style: `background:${h.color || "transparent"}`,
          })),
          el("td", { class: "chrx-hub-bold" }, h.name || "(unnamed)"),
          el("td", { class: "chrx-hub-tnum" }, h.startDate || "—"),
          el("td", { class: "chrx-hub-tnum" }, h.endDate || h.startDate || "—"),
        ));
      });
    }
    wrap.appendChild(section("Holidays",
      el("table", { class: "chrx-hub-table" },
        el("thead", null, el("tr", null,
          el("th", null, ""),
          el("th", null, "Name"),
          el("th", { class: "chrx-hub-tnum" }, "From"),
          el("th", { class: "chrx-hub-tnum" }, "Till"),
        )),
        tbody,
      ),
      el("div", { class: "chrx-hub-actions" },
        el("button", {
          class: "chrx-hub-btn chrx-hub-btn--primary", type: "button",
          onclick: () => { if (window.EntityHolidays) window.EntityHolidays.open(); },
        }, "Manage holidays…"),
      ),
    ));
    return wrap;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pane: Buildings
  // ─────────────────────────────────────────────────────────────────────────
  function paneBuildings() {
    const S = school();
    const s = settings();
    const buildings = Array.isArray(S.buildings) ? S.buildings : [];
    const wrap = el("div", { class: "chrx-hub-pane" });

    wrap.appendChild(section("Building-aware solving",
      row("Buildings affect solver",
        toggle(!!s.buildingsAffectSolver, v => { s.buildingsAffectSolver = v; commit(); }),
        "When ON, transfer-time + class-in-one-building rules apply"),
    ));

    const tbody = el("tbody");
    if (!buildings.length) {
      tbody.appendChild(el("tr", null,
        el("td", { colspan: "4", class: "chrx-hub-empty" },
          "No buildings defined. Single-campus schools can leave this empty.")));
    } else {
      buildings.forEach(b => {
        tbody.appendChild(el("tr", null,
          el("td", null, el("span", {
            class: "chrx-hub-swatch",
            style: `background:${b.color || "transparent"}`,
          })),
          el("td", { class: "chrx-hub-bold" }, b.name || "(unnamed)"),
          el("td", null, b.short || "—"),
          el("td", null, String(b.floors || 1)),
        ));
      });
    }
    wrap.appendChild(section("Buildings",
      el("table", { class: "chrx-hub-table" },
        el("thead", null, el("tr", null,
          el("th", null, ""),
          el("th", null, "Name"),
          el("th", null, "Short"),
          el("th", null, "Floors"),
        )),
        tbody,
      ),
      el("div", { class: "chrx-hub-actions" },
        el("button", {
          class: "chrx-hub-btn chrx-hub-btn--primary", type: "button",
          onclick: () => { if (window.EntityBuildings) window.EntityBuildings.open(); },
        }, "Manage buildings…"),
      ),
    ));
    return wrap;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pane: Branding & print
  // ─────────────────────────────────────────────────────────────────────────
  function paneBranding() {
    const s = settings();
    const wrap = el("div", { class: "chrx-hub-pane" });

    wrap.appendChild(section("Print headers & footers",
      row("Header text",
        textInput(s.printHeader || "", v => { s.printHeader = v; commit(); },
          { maxlength: 120, placeholder: "e.g. School name — Class timetable" })),
      row("Footer text",
        textInput(s.printFooter || "", v => { s.printFooter = v; commit(); },
          { maxlength: 120, placeholder: "e.g. Issued 19 May 2026 — Principal’s office" })),
      row("Default print font",
        selectInput(s.printFont || "Inter",
          ["Inter", "Helvetica", "Arial", "Times New Roman", "Georgia", "Courier"],
          v => { s.printFont = v; commit(); })),
      row("Print in colour",
        toggle(s.printColor !== false, v => { s.printColor = v; commit(); }),
        "OFF = monochrome (smaller PDFs, no toner-hungry backgrounds)"),
    ));

    wrap.appendChild(section("What to show in printouts",
      row("Show bell times",
        toggle(s.printShowBellTimes !== false, v => { s.printShowBellTimes = v; commit(); })),
      row("Show teacher names",
        toggle(s.printShowTeacherNames !== false, v => { s.printShowTeacherNames = v; commit(); })),
      row("Show classroom names",
        toggle(s.printShowClassroomNames !== false, v => { s.printShowClassroomNames = v; commit(); })),
      row("Show subject short codes",
        toggle(!!s.printShowSubjectShorts, v => { s.printShowSubjectShorts = v; commit(); })),
    ));

    return wrap;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pane: Solver hints
  // ─────────────────────────────────────────────────────────────────────────
  function paneSolver() {
    const s = settings();
    const wrap = el("div", { class: "chrx-hub-pane" });

    wrap.appendChild(section("Lesson basics",
      row("Default lesson duration (min)",
        numInput(s.defaultLessonDuration || 40, 20, 90, 5, v => {
          s.defaultLessonDuration = v; commit(); }),
        "Used when adding new lessons without an explicit duration"),
      row("Max cards per slot",
        numInput(s.maxCardsPerCell || 1, 1, 10, 1, v => {
          s.maxCardsPerCell = v; commit(); }),
        "How many cards can share the same class-period cell (group teaching, splits)"),
      row("Periods per day",
        numInput(s.periodsPerDay || 8, 1, 20, 1, v => {
          s.periodsPerDay = v; commit(); })),
    ));

    wrap.appendChild(section("Building transitions",
      row("Building transfer periods",
        numInput(s.transferTimePeriods || 0, 0, 5, 1, v => {
          s.transferTimePeriods = v; commit(); }),
        "Periods to leave free when a teacher switches buildings (0 = no penalty)"),
      row("Class in one building per day",
        toggle(!!s.classInOneBuildingPerDay, v => {
          s.classInOneBuildingPerDay = v; commit(); }),
        "Prevents a section from ping-ponging between buildings on the same day"),
    ));

    wrap.appendChild(section("Verification thresholds",
      row("Max teaching periods per teacher per day",
        numInput(s.maxPeriodsPerTeacherPerDay || 7, 1, 12, 1, v => {
          s.maxPeriodsPerTeacherPerDay = v; commit(); })),
      row("Max consecutive periods per teacher",
        numInput(s.maxConsecutivePerTeacher || 4, 1, 8, 1, v => {
          s.maxConsecutivePerTeacher = v; commit(); }),
        "Triggers a soft-warning when a teacher has more than N back-to-back lessons"),
    ));

    return wrap;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pane router
  // ─────────────────────────────────────────────────────────────────────────
  const PANE_RENDERERS = {
    identity:  paneIdentity,
    calendar:  paneCalendar,
    bell:      paneBell,
    breaks:    paneBreaks,
    holidays:  paneHolidays,
    buildings: paneBuildings,
    branding:  paneBranding,
    solver:    paneSolver,
  };

  function renderPane() {
    if (!mainEl) return;
    mainEl.innerHTML = "";
    const fn = PANE_RENDERERS[activePane] || paneIdentity;
    const def = PANES.find(p => p.id === activePane) || PANES[0];
    mainEl.appendChild(el("header", { class: "chrx-hub-paneheader" },
      el("h2", null, def.icon + " " + def.label),
      el("p", { class: "chrx-hub-paneheader__desc" }, def.desc),
    ));
    mainEl.appendChild(fn());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Defaults loader (India + CBSE bell + 3 standard breaks)
  // ─────────────────────────────────────────────────────────────────────────
  function applyIndiaDefaults() {
    const S = school();
    const s = settings();
    if (!S) return;
    if (!confirm("Load India / CBSE defaults? This sets working days, bell timing, and 3 standard breaks. Existing fields aren't overwritten unless empty.")) return;

    const before = { settings: { ...s }, breaks: (S.breaks || []).slice(), bell: S.bell };

    s.country = s.country || "India";
    s.region = s.region || s.region;
    s.timezone = s.timezone || "Asia/Kolkata";
    s.daysPerWeek = s.daysPerWeek || 6;
    s.weekendMask = s.weekendMask || [false, false, false, false, false, false, true];
    s.periodStartTime = s.periodStartTime || "07:30";
    s.defaultLessonDuration = s.defaultLessonDuration || 40;
    s.periodsPerDay = s.periodsPerDay || 8;
    s.maxCardsPerCell = s.maxCardsPerCell || 1;

    if (!S.bell || !Array.isArray(S.bell.periods) || !S.bell.periods.length) {
      // CBSE-style 8 periods, 40 min each, with breaks accounted for
      const startM = 7 * 60 + 30;
      const periods = [];
      let cur = startM;
      for (let i = 1; i <= 8; i++) {
        // After period 3, insert a 20-min recess gap; after period 5, 10-min fruit break
        if (i === 4) cur += 20;
        if (i === 6) cur += 10;
        periods.push({
          index: i, label: String(i),
          startMin: cur, endMin: cur + 40,
          isTeaching: true,
          printinbells: true, printinclasses: true,
          printinteachers: true, printinclassrooms: true,
        });
        cur += 40;
      }
      S.bell = { periods };
    }

    if (!Array.isArray(S.breaks) || !S.breaks.length) {
      S.breaks = [
        { id: "br_recess",  name: "Recess",      short: "REC",  starttime: "09:30", endtime: "09:50",
          doubleNotSpan: true,  transitionOk: true,  printtext: "Recess" },
        { id: "br_fruit",   name: "Fruit Break", short: "FRT",  starttime: "11:00", endtime: "11:10",
          doubleNotSpan: false, transitionOk: false, printtext: "Fruit break" },
        { id: "br_lunch",   name: "Lunch",       short: "LUN",  starttime: "12:30", endtime: "13:00",
          doubleNotSpan: true,  transitionOk: true,  printtext: "Lunch" },
      ];
    }

    audit("apply-defaults", before, {
      settings: { ...s }, breaks: S.breaks.slice(), bell: S.bell,
    });
    commit("India defaults loaded");
    renderPane();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Shell
  // ─────────────────────────────────────────────────────────────────────────
  function buildShell() {
    const root = el("div", { class: "chrx-hub" });

    // Sidebar
    const side = el("nav", { class: "chrx-hub__side", "aria-label": "School Hub navigation" });
    PANES.forEach(p => {
      const btn = el("button", {
        type: "button",
        class: "chrx-hub__navbtn" + (p.id === activePane ? " is-active" : ""),
        "data-pane": p.id,
        onclick: () => {
          activePane = p.id;
          side.querySelectorAll(".chrx-hub__navbtn").forEach(b =>
            b.classList.toggle("is-active", b.dataset.pane === activePane));
          renderPane();
        },
      },
        el("span", { class: "chrx-hub__navicon" }, p.icon),
        el("span", { class: "chrx-hub__navlabel" },
          el("strong", null, p.label),
          el("span", { class: "chrx-hub__navdesc" }, p.desc),
        ),
      );
      side.appendChild(btn);
    });

    // Defaults loader bottom of sidebar
    side.appendChild(el("div", { class: "chrx-hub__sidefoot" },
      el("button", {
        type: "button", class: "chrx-hub-btn chrx-hub-btn--ghost",
        onclick: applyIndiaDefaults,
      }, "Load India / CBSE defaults"),
    ));

    // Main pane host
    mainEl = el("div", { class: "chrx-hub__main" });

    // Save pill (sticky bottom-right)
    pillEl = el("div", { class: "chrx-hub__pill", "data-state": "idle" }, "All changes saved");

    root.appendChild(side);
    root.appendChild(mainEl);
    root.appendChild(pillEl);
    return root;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public render
  // ─────────────────────────────────────────────────────────────────────────
  function render(host) {
    hostEl = host;
    if (!school()) {
      host.innerHTML = '<div class="text-sm text-slate-500">Open or build a timetable first.</div>';
      return;
    }
    host.innerHTML = "";
    host.appendChild(buildShell());
    renderPane();

    // Re-render the active pane when entity dialogs commit (their changes can
    // affect preview rows in bell / breaks / holidays / buildings panes).
    if (!listenersWired) {
      document.addEventListener("entity:changed", (e) => {
        if (e.detail && e.detail.source === "school-hub") return; // our own
        // Only refresh if step-2 is currently visible (cheap guard)
        const step2 = document.getElementById("step-2");
        if (step2 && !step2.classList.contains("hidden")) {
          renderPane();
        }
      });
      listenersWired = true;
    }
  }

  global.SchoolHub = { render };
})(window);
