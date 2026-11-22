# Chronexa Production QA & Print Preview Bugs (Block B + B2)

Audited on built preview (`http://localhost:4173/`) using Playwright + real Chrome at 1440×900 and 390×844, including all 31 print preview templates and Tuning panel controls on `~/.mempalace/gdgpsd_data/timetable/LATEST.xml` (34 classes, 66 teachers, 42 subjects, 10 rooms, 537 lessons, 1,470 cards).

## Fixed in `20261122-p267-print-qa-b2`

### BUG-P01 [CRITICAL] [print] `supervision_duties` template crashed with `TypeError` on files with duty slots — FIXED
- **Steps:** Import `LATEST.xml` → Open Print Preview → Select `Supervision duties`.
- **Expected:** Renders A4 supervision duties table with zero console/page errors.
- **Actual (before):** Threw `TypeError: Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'` in `js/ui/print_preview/templates/supervision_duties.js:90` because `cell.map(...)` passed an Array to `U.el()`.
- **Fix:** Flattened nested array children in `U.el()` (`templates/_helpers.js`) and spread `...(cell.map(...))` in `supervision_duties.js`. Now renders `Fits A4` with 0 errors.
- **Regression:** `e2e/print-b2-regression.spec.js` (`B2-P01/P05`).

### BUG-P02 [HIGH] [print] Tuning panel controls had zero effect on Summary pivot reports (`summary`, `summary_of_teachers`, `summary_of_classrooms`) — FIXED
- **Steps:** Import `LATEST.xml` → Print Preview → `Summary timetable of classes` → `Tuning` drawer → adjust Padding, Font Size, Border Width, Card Theme, or Visible Elements checkboxes.
- **Expected:** Rendered summary cells reflect all Tuning controls.
- **Actual (before):** Zero DOM/style changes across all 8 Tuning controls (`renderSummaryClassDayCell` / `renderSummaryClassDayPeriodCell` ignored `cellTuning(report)` and `elementStyleFor(report, key)`).
- **Fix:** Wired `cellTuning(report)` (`padding`, `fontSize`, `borderWidth`, `theme`) and `elementStyleFor(report, key).enabled` (with `data-chrx-el` attributes) into both summary renderers in `js/ui/print_preview/pivot_cell_renderer.js`.
- **Regression:** `e2e/print-b2-regression.spec.js` (`B2-P02/P04`).

### BUG-P03 [HIGH] [print] Tuning panel controls had zero effect on non-pivot template reports (`teacher_workload`, `list_of_teachers`, `list_of_classes`, `supervision_duties`, etc.) — FIXED
- **Steps:** Import `LATEST.xml` → Print Preview → `Teacher workload & contract` → `Tuning` drawer → adjust Padding, Font Size, Border Width, Card Theme.
- **Expected:** Rendered table cells reflect Tuning settings.
- **Actual (before):** Zero DOM/style changes (`U.tableCSS()`, `U.thCSS()`, `U.tdCSS()` hardcoded static CSS).
- **Fix:** Wired `APP.printTuning` into `tableCSS()`, `thCSS()`, and `tdCSS()` in `js/ui/print_preview/templates/_helpers.js`.
- **Regression:** `e2e/print-b2-regression.spec.js` (`B2-P03/P05/P07`).

### BUG-P04 [HIGH] [print] `summary` and `summary_of_teachers` overflowed A4 page width (+1.4 mm / 7 px) — FIXED
- **Steps:** Import `LATEST.xml` → Print Preview → `Summary timetable of classes` or `Summary timetable of teachers`.
- **Expected:** Table width fits A4 (`scrollOverW <= 0`).
- **Actual (before):** `overW=7px` (`⚠ overflows width +1.4mm`).
- **Fix:** Tightened `availableGridWidthPx` border/rounding budget in `js/ui/print_preview/pivot_engine.js`. Verified `overW=0` on both `summary` and `summary_of_teachers`.
- **Regression:** `e2e/print-b2-regression.spec.js` (`B2-P02/P04`).

### BUG-P05 [MEDIUM] [print] 8+ templates and `print_presets.js` inline renderers leaked `"aSc Timetables 2012 XML"` and hardcoded today's date — FIXED
- **Steps:** Import `LATEST.xml` → Print Preview → `Teacher workload & contract`, `List of teachers`, `List of classes`, `Lesson grid`, `Contract overview`, `Daily attendance`, `Wall poster of classrooms`, `Teacher-wise — extra columns`.
- **Expected:** Uses sanitized `PrintPivot.printTitle(school, PS)` and file date.
- **Actual (before):** Printed `"aSc Timetables 2012 XML"` across 8 templates on `LATEST.xml`.
- **Fix:** Added `U.schoolTitle()` / `U.dateLine()` in `_helpers.js`, `safeSchoolTitle()` in `print_presets.js`, and updated all templates & inline preset renderers. Verified 0 placeholder leaks across all 31 templates.
- **Regression:** `e2e/print-b2-regression.spec.js` (`B2-P01/P05`, `B2-P03/P05/P07`).

### BUG-P06 [MEDIUM] [print] Export → PDF (`printScope`) did not close on `Escape` or `afterprint` — FIXED
- **Steps:** Open Export dialog → select PDF → click Print / Save as PDF → press `Escape` (or finish OS print dialog).
- **Expected:** Print overlay closes cleanly and returns to the editor.
- **Actual (before):** `printScope()` wiped the toolbar, never bound `onKey`, and never closed on `afterprint`, trapping the user on the print overlay.
- **Fix:** Bound `keydown` (`onKey`) and `{ once: true }` `afterprint` → `closePreview()` in `printScope()` (`js/ui/print_preview/print_preview.js`).
- **Regression:** `e2e/print-b2-regression.spec.js` (`B2-P06`).

### BUG-P07 [MEDIUM] [print] `list_of_teachers` and `list_of_classes` overflowed A4 page height (+98.5 mm / +87 mm) — FIXED
- **Steps:** Import `LATEST.xml` → Print Preview → `List of teachers` or `List of classes`.
- **Expected:** Clean pagination fitting A4.
- **Actual (before):** `list_of_teachers` overflowed `+98.5mm` (3 pages) and `list_of_classes` overflowed `+87mm` (2 pages).
- **Fix:** Paginated at 20 rows/page on A4 landscape (`print_presets.js`) and 18 rows/page in `templates/list_of_classes.js` & `templates/list_of_teachers.js`. Verified both show `Fits A4` (`Page 1 / 4` and `Page 1 / 2`) on `LATEST.xml`.
- **Regression:** `e2e/print-b2-regression.spec.js` (`B2-P03/P05/P07`).

## Remaining Low-Priority / Known Dense-School Print Notes (Open)
- **BUG-P08 [LOW] [print] Dense multi-entity single-page matrices (`summary` 34 classes, `summary_of_teachers` 66 teachers, `contract_overview`, `wait_points_teachers`, `wall_poster_teachers`) overflow A4 height on 66-teacher school unless "Fit to page" is toggled on.** Expected for dense 66-row matrices on a single A4 sheet; users can enable `Fit to page` in Sheet & PDF settings, or we can add auto-row-pagination in a follow-up batch.

### BUG-Q01 [MEDIUM] [qa] Command palette (`⌘K`) wiped user input after 20 ms via `setTimeout` — FIXED
- **Steps:** Press `⌘K` and immediately type `"Version history"` within 20 ms.
- **Expected:** Typed query filters palette items cleanly.
- **Actual (before):** `openPalette()` in `js/ui/shell_v3.js:305` ran `setTimeout(() => { p._input.value = ""; ... renderPaletteList(""); }, 20)`, wiping typed characters and detaching matched items from the DOM mid-click.
- **Fix:** Reset `p._input.value` and call `renderPaletteList("")` synchronously in `openPalette()`, keeping only `.focus()` in the 20 ms timer.
- **Regression:** `e2e/w3-1-version-history.spec.js` (2/2 passed in 17.5s).

## Fixed in `20261122-p268-curtain-print-pagination`

### BUG-P08 [MEDIUM] [print] Dense 34-class / 66-teacher matrices overflowed A4 height without Fit-to-page — FIXED
- **Steps:** Import `LATEST.xml` (34 classes, 66 teachers, 42 subjects) → Print Preview (`fitToPage: false`) → Select `summary`, `summary_of_teachers`, `contract_overview`, `wait_points_teachers`, or `wall_poster_teachers`.
- **Expected:** Each matrix auto-paginates and renders `Fits A4` without requiring `Fit to page`.
- **Actual (before):** Overflowed A4 height by +107.6mm to +608.9mm.
- **Fix:** Added dynamic row auto-pagination (`maxMatrixRowsPerPage`) in `js/ui/print_preview/pivot_engine.js` and 2D teacher×subject pagination (9 teachers × 12 subjects/page) in `renderContractOverview` (`js/ui/print_preview/print_presets.js`). Verified all 5 matrices show `Fits A4` (`overW=0, overH=0, fitToPage=false`) on `LATEST.xml`.
- **Regression:** `e2e/print-b2-regression.spec.js` (`D2-P08`).

### BUG-D01 [MEDIUM] [qa] `e2e/curtain.spec.js:248` flaked under full-suite load — FIXED
- **Root cause:** Drag started immediately after `curtainHeight > 190` without waiting for settled `pendingCard`/`target` boxes (target uncovered above expanded curtain) or confirming drag-pickup state (`CardInHand.active()` / ghost element).
- **Fix:** Wait on settled boxes, scroll target above curtain if needed, and poll for drag-pickup state before moving to target. Verified 5/5 with `--repeat-each=5`.
