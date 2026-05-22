/* Print presets — 20+ named report configurations that load into the
 * pivot engine. Each preset is a partial PrintReport.
 *
 * IDs are aligned with legacy template-file IDs so that pivot-preset
 * registrations overwrite legacy registrations in the dropdown. The
 * dispatch in print_preview.js prefers registry-registered renders
 * (non-builtin) so the pivot engine wins.
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});

  const PRESETS = [
    // ── Built-in 5 (override legacy hardcoded renderers) ─────────────────
    {
      id: "class",
      name: "Timetable for each class",
      context: "class",
      pages: ["class"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "teacher",
      name: "Timetable for each teacher",
      context: "teacher",
      pages: ["teacher"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "room",
      name: "Timetable for each classroom",
      context: "classroom",
      pages: ["classroom"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "summary",
      name: "Summary timetable of classes",
      context: "summary",
      pages: [], rows: ["class"], cols: ["day","period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "poster",
      name: "Wall poster of classes",
      context: "poster",
      pages: ["day"], rows: ["class"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },

    // ── Per-entity timetables WITH side table ────────────────────────────
    {
      id: "classwise_with_table",
      name: "TimeTable for each class — with table",
      context: "class",
      pages: ["class"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
      extraCols: [
        { type: "subjects-count", header: "Subjects", width: 18 },
        { type: "sum-of-lessons", header: "Count",    width: 7 },
      ],
    },
    {
      id: "teacherwise_with_table",
      name: "TimeTable for each teacher — with table",
      context: "teacher",
      pages: ["teacher"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
      extraCols: [
        { type: "subjects-count", header: "Subjects", width: 18 },
        { type: "sum-of-lessons", header: "Count",    width: 7 },
      ],
    },
    {
      id: "teacherwise_extra",
      name: "TimeTable for each teacher — with extra",
      context: "teacher",
      pages: ["teacher"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
      extraCols: [
        { type: "subjects-count", header: "Subjects", width: 16 },
        { type: "sum-of-lessons", header: "Total",    width: 7 },
      ],
    },

    // ── Per-subject timetable ────────────────────────────────────────────
    {
      id: "timetable_for_each_subject",
      name: "Timetable for each subject",
      context: "subject",
      pages: ["subject"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },

    // ── Per-student timetable ────────────────────────────────────────────
    {
      id: "timetable_for_student",
      name: "Timetable for each student",
      context: "summary",
      pages: ["student"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "timetable_for_each_student",
      name: "Timetable for each student (compact)",
      context: "summary",
      pages: ["student"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },

    // ── Summary timetables (single-page overview) ────────────────────────
    {
      id: "summary_of_teachers",
      name: "Summary timetable of teachers",
      context: "summary",
      pages: [], rows: ["teacher"], cols: ["day","period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "summary_of_classrooms",
      name: "Summary timetable of classrooms",
      context: "summary",
      pages: [], rows: ["classroom"], cols: ["day","period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "summary_of_subjects",
      name: "Summary timetable of subjects",
      context: "summary",
      pages: [], rows: ["subject"], cols: ["day","period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "summary_of_students",
      name: "Summary timetable of students",
      context: "summary",
      pages: [], rows: ["student"], cols: ["day","period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },

    // ── Wall posters (one day per page, all entities stacked) ────────────
    {
      id: "wall_poster_teachers",
      name: "Wall poster of teachers",
      context: "poster",
      pages: ["day"], rows: ["teacher"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "wall_poster_classrooms",
      name: "Wall poster of classrooms",
      context: "poster",
      pages: ["day"], rows: ["classroom"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },

    // ── Lesson grid: Class × Subject matrix ──────────────────────────────
    {
      id: "lesson_grid",
      name: "Lesson grid",
      context: "summary",
      pages: [], rows: ["class"], cols: ["subject"],
      cells: "teacher-list-with-count", fitWidth: true, fitHeight: true,
    },

    // ── Lists (no grid; just enumerate) ──────────────────────────────────
    {
      id: "list_of_teachers",
      name: "List of teachers",
      context: "summary",
      pages: [], rows: ["teacher"], cols: ["subject"],
      cells: "count-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "list_of_classes",
      name: "List of classes",
      context: "summary",
      pages: [], rows: ["class"], cols: ["subject"],
      cells: "count-lessons", fitWidth: true, fitHeight: true,
    },

    // ── Daily attendance / contract overview ─────────────────────────────
    {
      id: "daily_attendance",
      name: "Daily attendance",
      context: "summary",
      pages: ["day"], rows: ["class"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "contract_overview",
      name: "Contract overview",
      context: "summary",
      pages: [], rows: ["teacher"], cols: ["subject"],
      cells: "count-lessons", fitWidth: true, fitHeight: true,
    },

    // ── Custom 1/2/3 — user-editable starting points ─────────────────────
    {
      id: "custom_1",
      name: "Custom 1",
      context: "class",
      pages: ["class"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "custom_2",
      name: "Custom 2",
      context: "teacher",
      pages: ["teacher"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "custom_3",
      name: "Custom 3",
      context: "summary",
      pages: [], rows: ["class"], cols: ["day","period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
  ];

  function list() { return PRESETS.slice(); }

  function get(id) {
    return PRESETS.find(p => p.id === id) || null;
  }

  function registerAll() {
    if (!APP.printTemplates || typeof APP.printTemplates.register !== "function") return;
    if (!APP.PrintPivot || typeof APP.PrintPivot.renderPreset !== "function") {
      return;
    }
    for (const preset of PRESETS) {
      APP.printTemplates.register(preset.id, {
        name: preset.name,
        render: (school, periods) => {
          // If an active PrintReport exists for this preset (because the
          // user opened Modify-Structure and saved), render from it. Else
          // fall back to the static preset.
          const active = APP.activePrintReport;
          if (active && active._presetId === preset.id) {
            return APP.PrintPivot.renderReport(active, school, periods);
          }
          return APP.PrintPivot.renderPreset(preset.id, school, periods);
        },
        builtin: false,
      });
    }
  }

  APP.PrintPresets = { list, get, registerAll };

  registerAll();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", registerAll, { once: true });
  }
})();
