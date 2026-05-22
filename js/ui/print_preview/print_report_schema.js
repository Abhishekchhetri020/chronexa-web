/* PrintReport schema — Phase 0 of the print-system rewrite.
 *
 * Defines the JSON shape that drives the pivot print engine. Every print
 * dialog (Modify-Structure, per-card style, filter, extras, sizes/widths,
 * design, colors) edits a piece of this same document.
 *
 * Architecture map: see /Users/abhishekchhetri/Developer/chronexa_web/Chronexa-PRINT-MAP.md
 *
 * Usage:
 *   const r = APP.PrintReportSchema.create();          // blank report
 *   APP.PrintReportSchema.applyPreset(r, "class");     // load a preset
 *   APP.PrintReportSchema.DIMENSIONS                   // 9 dims
 *   APP.PrintReportSchema.ELEMENT_KEYS                 // 7 element keys
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});

  const DIMENSIONS = ["day","period","week","term","class","teacher","subject","classroom","student"];
  const DIM_LABEL = {
    "day": "Day", "period": "Period", "week": "Week", "term": "Term",
    "class": "Class", "teacher": "Teacher", "subject": "Subject",
    "classroom": "Classroom", "student": "Student",
  };
  const ELEMENT_KEYS = ["subject","teacher","class","group","classroom","count","bellTimes"];
  const CELL_KINDS = [
    { id: "draw-lessons",            label: "Draw lessons" },
    { id: "count-placed",            label: "Print count of placed cards" },
    { id: "count-lessons",           label: "Print count of lessons" },
    { id: "teacher-list-with-count", label: "Teacher list + count" },
  ];
  const ANCHORS = [
    "top-left","top-center","top-right",
    "middle-left","middle-center","middle-right",
    "bottom-left","bottom-center","bottom-right",
  ];

  // Context-aware default visibility per report type (H2 — confirmed in
  // screenshots 5, 30, 32, 34: whatever's in the page title is hidden).
  // reportContext is derived from the first page-axis dim of the report.
  const DEFAULT_VISIBILITY = {
    // Class report: page title = class → hide Class
    "class":     { subject:true,  teacher:true,  class:false, group:false, classroom:true,  count:false, bellTimes:false },
    // Teacher report: page title = teacher → hide Teacher
    "teacher":   { subject:true,  teacher:false, class:true,  group:false, classroom:false, count:false, bellTimes:false },
    // Classroom report: page title = classroom → hide Classroom
    "classroom": { subject:false, teacher:true,  class:true,  group:true,  classroom:false, count:false, bellTimes:false },
    // Subject report: page title = subject → hide Subject
    "subject":   { subject:false, teacher:true,  class:true,  group:false, classroom:false, count:false, bellTimes:false },
    // Summary / no specific entity: show subject + teacher + class
    "summary":   { subject:true,  teacher:true,  class:true,  group:false, classroom:false, count:false, bellTimes:false },
    // Wall poster: subject + teacher (compact)
    "poster":    { subject:true,  teacher:true,  class:false, group:false, classroom:false, count:false, bellTimes:false },
    // Day report: subject + teacher + class
    "day":       { subject:true,  teacher:true,  class:true,  group:false, classroom:false, count:false, bellTimes:false },
  };

  // Default size % per element (matches aSc values from screenshots 5, 30, 32, 34).
  const DEFAULT_SIZE = {
    subject: 19, teacher: 14, class: 24, group: 10,
    classroom: 10, count: 20, bellTimes: 6,
  };
  // Default anchor per element + context (Class report has Subject top-center, Teacher report has Subject top-left).
  const DEFAULT_ANCHOR = {
    "class":     { subject:"top-center",  teacher:"bottom-left",  class:"middle-center", group:"middle-center", classroom:"top-right",  count:"middle-center", bellTimes:"middle-center" },
    "teacher":   { subject:"top-left",    teacher:"middle-center", class:"bottom-center", group:"middle-center", classroom:"top-right",  count:"middle-center", bellTimes:"middle-center" },
    "classroom": { subject:"middle-center", teacher:"top-left",   class:"bottom-center", group:"middle-center", classroom:"middle-center", count:"middle-center", bellTimes:"middle-center" },
    "subject":   { subject:"middle-center", teacher:"top-left",   class:"bottom-left",   group:"middle-center", classroom:"middle-center", count:"middle-center", bellTimes:"middle-center" },
    "summary":   { subject:"top-center",  teacher:"bottom-center", class:"middle-center", group:"middle-center", classroom:"middle-center", count:"middle-center", bellTimes:"middle-center" },
    "poster":    { subject:"top-center",  teacher:"bottom-center", class:"middle-center", group:"middle-center", classroom:"middle-center", count:"middle-center", bellTimes:"middle-center" },
    "day":       { subject:"top-center",  teacher:"bottom-center", class:"middle-center", group:"middle-center", classroom:"middle-center", count:"middle-center", bellTimes:"middle-center" },
  };

  function makeElementStyle(elementKey, ctx) {
    const visible = (DEFAULT_VISIBILITY[ctx] || DEFAULT_VISIBILITY.summary)[elementKey];
    const anchor  = (DEFAULT_ANCHOR[ctx]     || DEFAULT_ANCHOR.summary    )[elementKey];
    return {
      key: elementKey,
      enabled: !!visible,
      anchor: anchor || "middle-center",
      size: DEFAULT_SIZE[elementKey] || 14,
      font: "system-ui",
      bold: elementKey === "class" || elementKey === "subject",
      italic: false,
      underline: false,
      textFormat: "abbreviation",
      conditional: {
        printGroupInsteadOfClass: false,
        doNotPrintIfEntireClass: elementKey === "group",
        doNotPrintIfHomeClassroom: elementKey === "classroom",
      },
      labelOverride: null,  // per-card text override; null = use entity name
    };
  }

  /** Create a blank PrintReport with default values. */
  function create(opts) {
    opts = opts || {};
    const ctx = opts.context || "summary";
    return {
      id: opts.id || "report_" + Date.now(),
      name: opts.name || "Untitled report",
      context: ctx,
      version: 1,

      // Pivot axes — each is up to 3-level nested; "-" = unused
      pages: opts.pages || ["-", "-", "-"],
      rows:  opts.rows  || ["day", "-", "-"],
      cols:  opts.cols  || ["period", "-", "-"],
      cells: opts.cells || "draw-lessons",

      // Fit + visibility toggles
      fitWidth:       opts.fitWidth        != null ? opts.fitWidth        : true,
      fitHeight:      opts.fitHeight       != null ? opts.fitHeight       : true,
      hideEmptyCols:  opts.hideEmptyCols   != null ? opts.hideEmptyCols   : false,
      hideEmptyRows:  opts.hideEmptyRows   != null ? opts.hideEmptyRows   : false,

      // 7 per-element card styles
      elementStyles: ELEMENT_KEYS.map(k => makeElementStyle(k, ctx)),

      // Filters (Phase 3 — empty array = include all)
      filters: { classes:[], teachers:[], rooms:[], subjects:[], periods:[], days:[] },

      // Extras axis (Phase 4)
      extraCols: opts.extraCols || [],
      extraRows: opts.extraRows || [],

      // Page setup (Phase 5)
      pageSetup: {
        orientation: "landscape",
        pagesPerSheet: "normal",   // normal | 4to1 | specify
        copies: 1,
        addClassroomTimetable: false,
      },

      // Design (Phase 5)
      design: {
        logoEnabled: true,
        logoDataUrl: null,
        headerText: "",            // school name; filled at render time
        footerText: "",
      },

      // Colors (Phase 5)
      colors: {
        cardOn: false,
        cardKey: "subject",         // subject | teacher | class | group | classroom | building
        cardColor1: null,
        cardColor2: null,
        rowHeaderOn: false,
        rowBg1: null, rowBg2: null, rowFont: null,
        colHeaderOn: false,
        colBg1: null, colBg2: null, colFont: null,
      },

      // Header (Periods) sub-config (Phase 8)
      periodHeader: {
        anchor: "top-center",
        size: 40,
        font: "system-ui",
        bold: true,
        italic: false,
        underline: false,
        showTimeIntervals: true,
        timeAnchor: "bottom-center",
        timeSize: 17,
        timeFont: "system-ui",
        timeTwoLines: false,
      },
    };
  }

  function clone(report) {
    return JSON.parse(JSON.stringify(report));
  }

  /** Apply a preset's axis config onto an existing report (preserves user
   *  overrides on per-element styles, filters, etc). */
  function applyPreset(report, preset) {
    if (!preset) return report;
    report.name = preset.name || report.name;
    report.context = preset.context || report.context;
    report.pages = (preset.pages || []).slice(0, 3);
    while (report.pages.length < 3) report.pages.push("-");
    report.rows = (preset.rows || []).slice(0, 3);
    while (report.rows.length < 3) report.rows.push("-");
    report.cols = (preset.cols || []).slice(0, 3);
    while (report.cols.length < 3) report.cols.push("-");
    report.cells = preset.cells || "draw-lessons";
    if (preset.fitWidth != null) report.fitWidth = preset.fitWidth;
    if (preset.fitHeight != null) report.fitHeight = preset.fitHeight;
    if (preset.hideEmptyCols != null) report.hideEmptyCols = preset.hideEmptyCols;
    if (preset.hideEmptyRows != null) report.hideEmptyRows = preset.hideEmptyRows;
    if (preset.extraCols) report.extraCols = preset.extraCols.slice();
    if (preset.extraRows) report.extraRows = preset.extraRows.slice();
    // Re-derive element-style defaults for the new context
    report.elementStyles = ELEMENT_KEYS.map(k => makeElementStyle(k, report.context));
    return report;
  }

  /** Resolve the active dimensions of an axis (drop "-" placeholders). */
  function activeDims(axis) {
    return (axis || []).filter(d => d && d !== "-");
  }

  APP.PrintReportSchema = {
    DIMENSIONS, DIM_LABEL, ELEMENT_KEYS, CELL_KINDS, ANCHORS,
    DEFAULT_VISIBILITY, DEFAULT_SIZE, DEFAULT_ANCHOR,
    create, clone, applyPreset, activeDims, makeElementStyle,
  };
})();
