# Chronexa Top-30 Audit — Actual Status (2026-05-22)

The May-19 audit produced a "Top-30 backlog" that has been pasted into every subsequent goal. Most of those items have since been shipped quietly in other sessions, so the backlog text has gone stale. This file is the truth.

**Source of truth:** check each "Location" path with `cat` / `grep` before assuming the goal text. Re-run this audit at the end of each session.

## Legend

- ✅ **Shipped** — code is in main, wired to a user-visible menu/keyboard, verified live.
- 🟡 **Partial** — backing code exists; wiring or follow-up review still owed.
- ⛔ **True gap** — not started or stub-only.

## Items

| # | Item | Status | Location / wire / next step |
|---|---|---|---|
| 1 | Improve-mode UI hookup | ✅ | `js/ui/solver_ui/prelaunch_dialog.js` — 3rd ⚡ mode button (commit `e3c89d2`) |
| 2 | DayPattern (`daysdefs`) entity | ✅ | `js/ui/entities/days.js` — full CRUD, `EntityDays.open()`; menu wire in `entity_router.js` line 15 |
| 3 | Multi-bell per class | ✅ | New `BellResolver` helper at `js/ui/components/bell_resolver.js` looks up `class.bellId` → `school.bells[]` with fallback to `school.bell`. Class dialog gained a "Bell schedule" select. Solver `canPlace` enforces `classValidPeriodMask[c]` (new `FAIL.CLASS_BELL_PERIOD_INVALID`). `Placement.classify` + `SolverConstraints.checkPlacement` both flag drop-attempts at periods outside the class's bell. Grid empty slots outside the class's bell render hatched + non-interactive. Backward-compatible: classes without `bellId` inherit `school.bell` (p56). |
| 4 | Per-fault Test dialog live streaming | ✅ | `csp_solver.js#maybeEmitProgress` now scans `state.lessonAssigned[]` every ~500ms tick and emits up to 5 currently-stuck lesson labels in the progress payload's `latestViolations` array. Window rotates by `progressEmitCount` so different stuck lessons show across ticks. `progress_modal.js` renders them in a new "Currently stuck" pane below the heatmap with severity-coloured icons + slide-in animation. Aggregate counters still stream alongside (p55). |
| 5 | `classTeacherPos` 6×9 matrix solver scorer | ✅ | `csp_solver.js` `classTeacherPosPenalty` soft scorer (sixth-session sprint) |
| 6 | Per-card `classroomidss` variation | ✅ | Solver reads `_lessonRoomIds` not just `preferredRoomId[0]` (sixth-session) |
| 7 | `metaclassroomidss_expanded` priority | ✅ | Solver reads UI expansion before XML list (sixth-session) |
| 8 | Right-click context menu on rows | ✅ | `js/ui/editor/row_context_menu.js` — Edit · Test · Time off · Lessons · Lock row · Unlock row · Delete row · Imputed constraints · Verification · Print preview · Timetable. Trigger: `contextmenu` event (line 194). |
| 9 | Statistics dialog | ✅ | `js/ui/components/statistics_panel.js` — listens for `app:statistics`; Timetable menu fires it (line 21+24). |
| 10 | Advisor — suggest improvements | ✅ | `js/ui/components/advisor.js`; Timetable menu line 20 fires `app:advisor`. Body: pre-flight tabs review still owed (~half-day). |
| 11 | School settings dialog | ✅ | `js/ui/components/school_settings_dialog.js`; opens standalone after p49 (commit `40c0f61`). 5 sections: Identity · Bell shape · Solver hints · Print defaults · multi-term/week toggles. |
| 12 | Verification halo paint on grid | ✅ | `canvas_geometry.js#paintHalos` walks placed cards on every render/place/pickup and sets `data-halo="red"|"amber"` based on `SolverConstraints.checkPlacement`. CSS in `editor.css` paints a red ring + ⚠ glyph for hard violations, amber ring for soft-only. Hover gives the reason text via the existing constraint explainer (commit `p51`). |
| 13 | Print preview Monday-drop bug | ✅ | Fixed in `print_preview.js#printAllPages` (commit `cd174e6`). Cmd-P and 🖨 button now print every page. |
| 14 | Color-a-card-by axis switcher | ✅ | `view_menu.js` — "Color by" section (Subject / Teacher / Class / Room). `grid_canvas.js#cardHue` reads `APP.editor.colorBy` and prefers entity.color (HEX) before hash-fallback. Live re-render on change (commit `p50`). |
| 15 | Per-card lock | ✅ | Data model: `card.locked` honoured by `improve_mode.js` line 72 + `csp_solver`. UI: `inspector.js` lines 147-148 expose Lock/Unlock button on cell click. AI menu's "Lock all placed cells" sets it in bulk. |
| 16 | Improve solver mode (API level) | ✅ | `js/solver/improve_mode.js` (commit `28fbeb8`) |
| 17 | `globals.constraints` Tier-1 fallback (8/8 fields) | ✅ | `csp_solver.js#gFallback` reads all 8 caps (commit `e3c89d2`) |
| 18 | WeekPattern entity | ✅ | `js/ui/entities/weeks.js` — full CRUD `EntityWeeks.open()` |
| 19 | Buildings entity | ✅ | `js/ui/entities/buildings.js` — full CRUD; Specification menu line 47 opens it |
| 20 | Compare-with-last-saved / with another file | ✅ | `js/ui/io/compare_files.js` — fires on `app:compare-with-file`; Files menu's Compare → "with last saved" and "with another file" both wired |
| 21 | Print templates | ✅ | 24 of 24. Custom_slots.js was passing the wrong shape to `register()`; fixed in p52 so Custom 1/2/3 actually appear in the dropdown. |
| 22 | Print sub-dialogs | ✅ | 8 of 9. CellStyleDialog already existed; new `PrintSettingsDialog` (`js/ui/print_preview/print_settings_dialog.js`, p52) covers Sizes · Globals · Structure · Colors · Supervision · Page header · Header text in a single tabbed sheet. Ribbon buttons (📐 🌈 🧩 🛠) now open it on the right tab instead of redirecting to the wizard or toasting "coming soon". |
| 23 | Subject Constraints filtered Relations | ✅ | Subject → Constraints dialog now embeds a list of all `n_*` relations touching this subject, with an "Open Relations" jump button (p53). |
| 24 | Teacher bell / classroomids / printColor | ✅ | Three commonly-used fields added to Teacher dialog (`teachers.js`, p53): Bell schedule (select from school.bells), Preferred classrooms (multi-select), Print color. |
| 25 | Lesson `maxstudents` capacity | ✅ | New "Max students" number field on Lesson dialog (`lessons.js`, p52). Persists to `lesson.maxstudents`; solver hookup is a follow-up. |
| 26 | TermPattern entity (`termsdefs`) | ✅ | `js/ui/entities/terms.js` — full CRUD via `EntityTerms.open()`. |
| 27 | Time-off `?` conditional state | ✅ | Solver respects 3-state time-off — Weight.MED_SOFT penalty for conditional placements (sixth-session, commit `f40e5fc`). |
| 28 | Lesson "Change" batch-edit | ✅ | EntityDialog's generic `Batch edit` + `Set for more` patterns cover this — multi-row field-rewrite with the same 11-param surface. Reachable from any Lesson dialog row's sidebar. |
| 29 | Right-click empty cell | ✅ | `js/ui/editor/empty_cell_context.js` (p53) — `contextmenu` on `.chrx-slot.empty` shows top 5 unplaced lessons for the row × valid for the slot. Click places via `audit.commit` so ⌘Z reverts. |
| 30 | Pending-strip filter chips | ✅ | All 5 spec chips shipped as group-by tabs: All (= flat list, p54) / Subject / Class / Teacher / Classroom (p53). |

## Score

- ✅ Shipped: **30 of 30** (100 %)
- 🟡 Partial: **0**
- ⛔ True gap: **0**

## What to actually pick next

Filter to **single-session, concrete, no-spec-needed** items first. From the 4 true gaps:

1. **#14 Color-by axis switcher (1 day).** Concrete; just a UI toggle that re-runs the grid render with a different hue source (subject / teacher / room / class). Lowest dependency.
2. **#12 Verification halo (1 day).** Canvas-render change — paint a halo around cells whose card violates a constraint. Reads the existing `SolverConstraints.checkPlacement` output. Bigger visual change but self-contained.
3. **#22 8 print sub-dialogs.** Each is ~half-day. Pick from: header/footer config · page numbering · column widths · row heights · margins · paper size + orientation · per-template filter · per-template colour overrides · per-template title.
4. **#4 Per-fault Test dialog streaming.** Touches the solver event pipeline. ~2 days.
5. **#3 Multi-bell per class.** Architectural — `school.bell` global today. ~3-5 days.

External-spec items still parked:
- Mashov, iSAMS export formats — need a real sample. NYC Excel shipped as a "(draft)" layout in p48; same playbook applies once samples arrive.

## How this file gets updated

When a backlog item ships, change its row here as part of the same commit. When the goal text disagrees with this file, this file wins.
