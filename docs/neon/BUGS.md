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

---

## Block E — Full QA Pass After p266–p271 (2026-11-22)

### E-01 (High — FIXED in `20261122-p273-solver-robustness-autosave`)
- **Title:** WASM CP-SAT `Aborted()` / `Uncaught [object WebAssembly.Exception]` during Phase 2 extended soft optimization on large real school (`LATEST.xml`)
- **Steps:** Import `~/.mempalace/gdgpsd_data/timetable/LATEST.xml` (66 teachers, 34 classes, 537 lessons, 1,441 schedulable cards / 1,470 period-slots) -> Generate -> keep default (`Best` / `auto`, `best` preset) or `Generate` -> `wasm` (`best` preset) -> wait for Phase 2 (`EXTENDED SOFT: terms added= 69090`).
- **Expected:** Solver completes Phase 2 (or skips/caps cleanly) with 0 `pageerror`s and 0 `Aborted()` crashes.
- **Actual:** At ~138s during Phase 2, `cp_sat_runtime.js` logs `Aborted()` and throws `Uncaught [object WebAssembly.Exception]` (4–8 `pageerror` events) before recovering/falling back to deliver `1,441 / 1,441` placed (`0` hard conflicts). Note: at 90s `balanced` preset (`wasm`), Phase 2 did not abort (`1,433 / 1,441` placed, `0` hard conflicts, `0` pageerrors).
- **Fix (Block F):** Skipped extended-soft model expansion on large WASM models (`cards.length > 1000` unless `options.extSoft === true`), capped Phase 2 workers to `<= 2` and Phase 2 wall time to `<= 35s` on large models in `js/solver/wasm/cp_sat_solver.mjs`, and attached `stats.phase2Note`.
- **Verified on `LATEST.xml` (default Generate):** `1,441 / 1,441` placed, `0` unplaced, `0` hard conflicts, `PHASE 1 OPTIMAL (61.74s)` -> `PHASE 2 FEASIBLE (35.03s, 23,016 terms)`, total `116.53s`, `0 pageerror`, `0 Aborted()`.

### E-02 (Medium — FIXED in `20261122-p273-solver-robustness-autosave`)
- **Title:** Solver result panel displays large negative "SOFT PENALTIES" values
- **Steps:** Run Generate on `LATEST.xml` or the Demo school and inspect the result panel tiles.
- **Expected:** Quality/penalty metric is 0-or-positive (or presented as a clear quality score).
- **Actual:** Displays `-693,100 SOFT PENALTIES` (`auto` on `LATEST.xml`), `-671,700 SOFT PENALTIES` (`wasm` balanced), `-404,200 SOFT PENALTIES` (`browser` balanced / `cloud` fallback), and `-489,460 SOFT PENALTIES` (demo school).
- **Fix (Block F):** Converted internally negated `softScore` (`<= 0`) to a non-negative integer penalty display in `js/ui/solver_ui/result_panel.js` and `js/ui/solver_ui/progress_modal.js` (`33,600 SOFT PENALTIES` on `LATEST.xml`).
- **Regression test:** `e2e/block-f-regression.spec.js` (`E-02`).

### E-03 (High — FIXED in `20261122-p272-qa-weeks-terms-mobile`)
- **Title:** Week/Term patterns created or edited in `EntityWeeks` / `EntityTerms` dialogs do not sync `school.weeksDefs` / `school.termsDefs` and are dropped on template-based aSc XML export
- **Steps:** Load Demo school -> open `Specification -> Weeks…`, add `Week A` (`10`) and `Week B` (`01`) -> open `Specification -> Terms…`, add `Term 1` (`10`) and `Term 2` (`01`) -> assign them to lessons -> open `#editor-view-filter` or export to aSc XML and re-import.
- **Expected:** `school.weeksDefs` and `school.termsDefs` include the new patterns; grid filter lists `Week A`/`Term 1`; exported XML writes `<weeksdefs>` and `<termsdefs>` with the new patterns so re-import preserves both defs and lesson references.
- **Actual (before fix):** `EntityWeeks`/`EntityTerms` mutated only `school.weeks`/`school.terms`, leaving `school.weeksDefs`/`school.termsDefs` stale (only "All weeks"/"Whole year"). `exportFromTemplate()` also never replaced `<weeksdefs>`/`<termsdefs>` in `sourceText`, dropping UI-created weeks/terms on XML export.
- **Fix:** Added `syncWeeksDefs(school)` in `js/ui/entities/weeks.js` and `syncTermsDefs(school)` in `js/ui/entities/terms.js` inside `add`/`update`/`delete` mutations and `ensure()`; updated `exportFromTemplate()` and synthesized export in `js/ui/io/export_timetable_xml.js` to emit `<weeksdefs>` and `<termsdefs>` from `weeksDefs`/`weeks` and `termsDefs`/`terms`.
- **Regression test:** `e2e/block-e-regression.spec.js` (`E-03` — full UI create -> lesson assign -> `#editor-view-filter` -> XML export -> re-import round-trip).

### E-04 (Medium — FIXED in `20261122-p272-qa-weeks-terms-mobile`)
- **Title:** 251px horizontal overflow (`641px > 390px`) at 390px mobile viewport when entity dialogs open
- **Steps:** Set viewport to `390x844`, load Demo school, open `EntityClasses`, `EntityWeeks`, `EntityTerms`, or `EntityLessons`.
- **Expected:** `document.documentElement.scrollWidth <= 394` with no horizontal page overflow.
- **Actual (before fix):** `scrollWidth` reached `641px` (`HEADER.chrx-topbar` / `DIV.chrx-topbar-editor-tools` stretched past 390px and `.chrx-ent-dialog` lacked mobile stacking rules).
- **Fix:** Added `@media (max-width: 640px)` responsive stacking in `css/entities.css` and `@media (max-width: 767px)` `.chrx-shell .chrx-topbar` wrapping + `max-width: 100vw; overflow-x: clip` in `css/editor-v3.css` + `css/editor.css`.
- **Regression test:** `e2e/block-e-regression.spec.js` (`E-04` — verifies `scrollWidth <= clientWidth + 4` across `EntityClasses`, `EntityWeeks`, `EntityTerms`, `EntityLessons` at `390x844`).

### F0 (High — FIXED in `20261122-p273-solver-robustness-autosave`)
- **Title:** Reloading immediately after importing or creating a school (with no edits) drops the user to an empty start screen (`hasSchool: false`)
- **Steps:** Import `LATEST.xml` (or any XML) or create a blank school -> reload the page without making edits.
- **Expected:** Imported or newly created school is preserved and automatically restored into the editor on reload.
- **Actual (before fix):** `auto_save.js` never auto-restored on boot (only showed a delayed 1.5s floating card whose Restore button dispatched `app:school-loaded` only on `window`, not `document`) and serialized derived `_idx` into `localStorage` without an IndexedDB quota fallback.
- **Fix:** Updated `js/ui/components/auto_save.js` to strip derived `_idx`, persist immediately on `app:school-loaded` with an IndexedDB fallback (`chronexa-autosave-v1`) if `localStorage` quota is exceeded, and auto-restore non-demo (imported/created/edited) schools on boot (dispatching `app:school-loaded` on both `window` and `document`). Untouched demo loads still land on the start screen on reload.
- **Regression tests:** `e2e/block-f-regression.spec.js` (`F0` imported XML + newly created blank school) and standalone `LATEST.xml` reload check (`1,470` cards restored).
