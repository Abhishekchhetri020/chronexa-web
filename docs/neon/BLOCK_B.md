# Block B + B2 — Production QA Sweep & Print Preview Priority (`20261122-p267-print-qa-b2`)

## What changed
Branch `neon/qa-sweep` (commit `fe57d1e`), merged `--no-ff` into `main` (`56570e0`) and pushed to `origin/main`.
Fixed 8 real defects found during the 1440px/390px QA sweep and 31-template real-XML (`LATEST.xml`: 34 classes, 66 teachers, 42 subjects, 10 rooms, 537 lessons, 1,470 cards) print preview audit (full details in `docs/neon/BUGS.md`):

1. **BUG-P01 [CRITICAL] [print]** `supervision_duties` crashed with `TypeError: Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'` on any file with duty slots → flattened array children in `U.el()` (`templates/_helpers.js`) and spread `cell.map(...)` in `templates/supervision_duties.js`. Now renders `Fits A4` with 0 console errors.
2. **BUG-P02 [HIGH] [print]** Tuning panel controls (Cell Padding, Font Size, Border Width, Card Theme, Visible Elements) had zero effect on Summary pivot reports (`summary`, `summary_of_teachers`, `summary_of_classrooms`) → wired `cellTuning(report)` and `elementStyleFor(report, key).enabled` (with `data-chrx-el` attributes) into `renderSummaryClassDayCell` and `renderSummaryClassDayPeriodCell` (`pivot_cell_renderer.js`).
3. **BUG-P03 [HIGH] [print]** Tuning panel controls had zero effect on non-pivot template reports (`teacher_workload`, `list_of_teachers`, `list_of_classes`, `supervision_duties`, etc.) → wired `APP.printTuning` into `tableCSS()`, `thCSS()`, and `tdCSS()` (`templates/_helpers.js`).
4. **BUG-P04 [HIGH] [print]** `summary` and `summary_of_teachers` overflowed A4 page width by `+1.4mm` (7px) → tightened `availableGridWidthPx` border/rounding budget in `pivot_engine.js`. Verified `overW=0` on real XML.
5. **BUG-P05 [MEDIUM] [print]** 8+ templates and `print_presets.js` inline renderers leaked `"aSc Timetables 2012 XML"` and hardcoded today's date → added `U.schoolTitle()` / `U.dateLine()` (`templates/_helpers.js`), `safeSchoolTitle()` (`print_presets.js`), and updated all 20 template files + 7 inline preset renderers. Verified 0 placeholder leaks across all 31 templates on `LATEST.xml`.
6. **BUG-P06 [MEDIUM] [print]** Export → PDF (`printScope`) wiped the toolbar, never bound `Escape`, and never closed on `afterprint` → bound `keydown` (`onKey`) and `{ once: true }` `afterprint` → `closePreview()` in `print_preview.js`.
7. **BUG-P07 [MEDIUM] [print]** `list_of_teachers` (`+98.5mm`) and `list_of_classes` (`+87mm`) overflowed A4 page height → fixed pagination (20 rows/page landscape in `print_presets.js`, 18 rows/page in `templates/list_of_classes.js` & `templates/list_of_teachers.js`). Verified both render `Fits A4` (`Page 1 / 4` and `Page 1 / 2`) on `LATEST.xml`.
8. **BUG-Q01 [MEDIUM] [qa]** Command palette (`⌘K`) wiped typed queries after 20 ms via `setTimeout`, detaching matched items mid-click → moved input reset and `renderPaletteList("")` synchronously into `openPalette()` (`js/ui/shell_v3.js`).

## QA Sweep Results (1440px & 390px)
- **390px mobile:** 0 horizontal overflow on landing (`390/390`), template picker (`390/390`), editor (`390/390`, 0 clipped topbar buttons), and print preview (`390/390`, `ctrlOver=0`); 0 `pageerror`, 0 `console.error`.
- **1440px exports on `LATEST.xml`:** Excel (`671,548 B`), CSV (`81,862 B`), XML (`405,034 B`), PNG (`282,696 B`), PDF (`34` pages mounted) all succeeded with 0 errors.
- **31-template Print Preview audit on `LATEST.xml`:** 0 `pageerror`, 0 `console.error`, 0 placeholder school leaks, 0 horizontal width overflow, Tuning verified live on both pivot (`class`, `teacher`, `room`, `summary`) and template (`teacher_workload`) render paths.

## Gate results
- `npx vitest run`: **67 test files passed (67), 581 tests passed (581), 0 failed**.
- `npx vite build`: **ok** (`dist/` built in 2.12s).
- `npx playwright test --config pw.chrome.config.local.mjs`: **137 passed, 1 known skip (`substitutions-flow` real-XML audit), 0 failed** (including 4 new rendered-page regression tests in `e2e/print-b2-regression.spec.js`; full run 136 passed + 1 skip + 1 `w3-1-version-history` palette race, which after `BUG-Q01` fix passed 2/2 in 17.5s).

## Live verification
- `curl -s https://abhishekchhetri020.github.io/chronexa-web/ | grep -o 'APP_VER = "[^"]*"'`
  ```
  APP_VER = "20261122-p267-print-qa-b2"
  ```
- `gh run list --limit 3`:
  - `deploy-pages` (run `44991550684`): `completed` / `success` (44s)
  - `frontend-static-check` (run `44991550650`): `in_progress` (58s elapsed; ~12 min CI run)
  - `frontend-static-check` for Block A `p266` (run `44988192192`): `completed` / `success` (11m52s)

## Open bugs
- `BUG-P08 [LOW] [print]`: Dense 34-class / 66-teacher single-page matrices (`summary`, `summary_of_teachers`, `contract_overview`, `wait_points_teachers`, `wall_poster_teachers`) still overflow A4 height unless `Fit to page` is enabled (candidates for auto-row-pagination in a follow-up batch).
