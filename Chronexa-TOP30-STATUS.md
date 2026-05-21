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
| 3 | Multi-bell per class | ⛔ | True gap. Architectural change — `school.bell` currently global. ~3-5 day port. |
| 4 | Per-fault Test dialog live streaming | ⛔ | `test_dialog.js` runs validate-only; no live oc/hc/sc streaming yet. ~2 days. |
| 5 | `classTeacherPos` 6×9 matrix solver scorer | ✅ | `csp_solver.js` `classTeacherPosPenalty` soft scorer (sixth-session sprint) |
| 6 | Per-card `classroomidss` variation | ✅ | Solver reads `_lessonRoomIds` not just `preferredRoomId[0]` (sixth-session) |
| 7 | `metaclassroomidss_expanded` priority | ✅ | Solver reads UI expansion before XML list (sixth-session) |
| 8 | Right-click context menu on rows | ✅ | `js/ui/editor/row_context_menu.js` — Edit · Test · Time off · Lessons · Lock row · Unlock row · Delete row · Imputed constraints · Verification · Print preview · Timetable. Trigger: `contextmenu` event (line 194). |
| 9 | Statistics dialog | ✅ | `js/ui/components/statistics_panel.js` — listens for `app:statistics`; Timetable menu fires it (line 21+24). |
| 10 | Advisor — suggest improvements | ✅ | `js/ui/components/advisor.js`; Timetable menu line 20 fires `app:advisor`. Body: pre-flight tabs review still owed (~half-day). |
| 11 | School settings dialog | ✅ | `js/ui/components/school_settings_dialog.js`; opens standalone after p49 (commit `40c0f61`). 5 sections: Identity · Bell shape · Solver hints · Print defaults · multi-term/week toggles. |
| 12 | Verification halo paint on grid | ⛔ | True gap. No `halo` / `verifyPaint` code exists. ~1 day canvas-render work. |
| 13 | Print preview Monday-drop bug | ✅ | Fixed in `print_preview.js#printAllPages` (commit `cd174e6`). Cmd-P and 🖨 button now print every page. |
| 14 | Color-a-card-by axis switcher | ⛔ | True gap. No `colorBy` toggle. ~1 day UI + render rewire. |
| 15 | Per-card lock | ✅ | Data model: `card.locked` honoured by `improve_mode.js` line 72 + `csp_solver`. UI: `inspector.js` lines 147-148 expose Lock/Unlock button on cell click. AI menu's "Lock all placed cells" sets it in bulk. |
| 16 | Improve solver mode (API level) | ✅ | `js/solver/improve_mode.js` (commit `28fbeb8`) |
| 17 | `globals.constraints` Tier-1 fallback (8/8 fields) | ✅ | `csp_solver.js#gFallback` reads all 8 caps (commit `e3c89d2`) |
| 18 | WeekPattern entity | ✅ | `js/ui/entities/weeks.js` — full CRUD `EntityWeeks.open()` |
| 19 | Buildings entity | ✅ | `js/ui/entities/buildings.js` — full CRUD; Specification menu line 47 opens it |
| 20 | Compare-with-last-saved / with another file | ✅ | `js/ui/io/compare_files.js` — fires on `app:compare-with-file`; Files menu's Compare → "with last saved" and "with another file" both wired |
| 21 | Print templates | 🟡 | 20 of 24 templates shipped (5 built-ins + 15 add-ons in `js/ui/print_preview/templates/`). 4 remaining + body review per template. |
| 22 | Print sub-dialogs | 🟡 | 1 of 9 shipped (`cell_style_dialog.js`). 8 remaining — most can re-use the new standalone-host pattern from p49. |
| 23-30 | 8 remaining smaller items | 🟡 | Mix of shipped + small gaps. Most are reachable via the cleared "Coming Soon" menu items (10/16 cleared 2026-05-21, plus 2 more in p45). |

## Score

- ✅ Shipped: **17 of 30** (57 %)
- 🟡 Partial: **5 of 30** (17 %)
- ⛔ True gap: **4 of 30** — items #3, #4, #12, #14

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
