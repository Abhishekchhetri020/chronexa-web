# Block D — D1 Curtain Reliability + D2 Dense Matrix Auto-Pagination (`20261122-p268-curtain-print-pagination`)

## What changed
Branch `neon/block-d` (commit `2938bb0`), merged `--no-ff` into `main` (`fb3b3ed`) and pushed to `origin/main`.

### D1 — `e2e/curtain.spec.js:248` flake fix (`BUG-D01`)
- **Root cause:** Under full-suite CPU load, the test measured `pendingCard.boundingBox()` and `target.boundingBox()` immediately after `curtainHeight > 190` without confirming that `pendingCard` was visible/settled inside the expanded curtain body, that `target` was uncovered above the curtain overlay, or that drag pickup (`CardInHand.active()` / ghost element) had engaged before moving to `target`.
- **Fix (`e2e/curtain.spec.js`):** Wait on state rather than timeouts — assert `pendingCard` and `.chrx-slot.empty` target visibility, poll until both boxes are settled and `target` center sits above the curtain overlay (scrolling into view if needed), nudge past the pickup threshold and poll for active drag state (`window.CardInHand?.active?.()` / `.chrx-card-ghost`) before moving to target and releasing.
- **Verification:** Passed **5/5** standalone (`1.1m`), **1/1** inside the 139-test full suite (`5.0s`), and **5/5** immediately after the full suite (`44.0s`) — **11/11 consecutive passes**.

### D2 — `BUG-P08` dense matrix auto-pagination
- **Pivot engine (`js/ui/print_preview/pivot_engine.js`):** Added `maxMatrixRowsPerPage(report, orientation)` and row-slice auto-pagination in `renderReport()` for entity-row matrices (leaving day/period-row reports like `class`, `teacher`, `room` untouched). Sub-pages append `(k/n)` to `pageTitle` / `data-chrx-scope`. Accounts for 2-line teacher name wrapping in compact row headers and multi-row headers (`cols.length > 1`).
- **Contract overview (`js/ui/print_preview/print_presets.js`):** Updated `renderContractOverview()` to paginate in 2D (`9` teachers × `12` subjects per page) so 42-subject schools no longer compress columns to ~5 mm and wrap vertically into +455 mm overflow.
- **Real 66-teacher XML (`LATEST.xml`, 34 classes, 66 teachers, 42 subjects) verification with `fitToPage: false`:**
  - `summary`: `Page 1 / 18`, **Fits A4**, 16 rows/page, `overW=0`, `overH=0`
  - `summary_of_teachers`: `Page 1 / 36`, **Fits A4**, 11 rows/page, `overW=0`, `overH=0`
  - `contract_overview`: `Page 1 / 32`, **Fits A4**, 9 rows/page × 12 subjects, `overW=0`, `overH=0`
  - `wait_points_teachers`: `Page 1 / 6`, **Fits A4**, 11 rows/page, `overW=0`, `overH=0`
  - `wall_poster_teachers`: `Page 1 / 36`, **Fits A4**, 11 rows/page, `overW=0`, `overH=0`
- **Regression test:** Added `D2-P08` in `e2e/print-b2-regression.spec.js` (scales school to 66 teachers / 34 classes / 42 subjects, asserts `Fits A4`, `overW <= 2`, `overH <= 2`, `fitToPage === false`, and `pages > 1` for all 5 reports). Updated `e2e/print-smoke.spec.js` summary page upper bound to `school.classes` to match auto-paginated output.

## Gate results
- `npx vitest run`: **67 test files passed (67), 581 tests passed (581), 0 failed**.
- `npx vite build`: **ok** (`dist/` built in 3.26s).
- `npx playwright test --config pw.chrome.config.local.mjs`: **138 passed, 1 known skip (`substitutions-flow` real-XML audit), 0 failed** (`10.1m`).
- `npx playwright test --config pw.chrome.config.local.mjs e2e/curtain.spec.js -g "existing unplaced flow" --repeat-each=5`: **5 passed, 0 failed** (`44.0s`, run right after the full suite).

## Live verification
- `curl -s https://abhishekchhetri020.github.io/chronexa-web/ | grep -o 'APP_VER = "[^"]*"'`
  ```
  APP_VER = "20261122-p268-curtain-print-pagination"
  ```
- `gh run list --limit 3`:
  - `deploy-pages` (run `44994452823`): `completed` / `success` (38s)
  - `frontend-static-check` (run `44994452734`): `in_progress` (58s elapsed; ~12 min CI run)

## Open bugs
- None from Block B, B2, or D (`BUG-P01`–`BUG-P08`, `BUG-Q01`, `BUG-D01` all fixed and regression-tested). Ready for Claude verification before Block C.

## D3 — Respect `fitToPage` in dense matrix auto-pagination (`20261122-p269-fit-to-page-respect`)
- **Change:** Branch `neon/d3-fit-to-page` (`425bfa5`) → merged `--no-ff` into `main` (`b584f9b`). Skips auto-pagination in `renderReport()` (`js/ui/print_preview/pivot_engine.js`) and `renderContractOverview()` (`js/ui/print_preview/print_presets.js`) when `APP.printSettings.fitToPage` is true so "Fit to page (shrink if too big)" produces one shrunk sheet per day/page-combo as before p268.
- **Regression test:** Added `D3` in `e2e/print-b2-regression.spec.js` (34-class school: `fitToPage=false` splits to >6 pages and Fits A4; `fitToPage=true` renders 1 page per day == 6 pages and scales to fit A4).
- **Gate:** `vitest` **67 files / 581 passed (0 failed)**; `vite build` **ok (7.02s)**; `playwright` **139 passed, 1 known skip, 0 failed (17.9m)**.
- **Live & CI:** `deploy-pages` (`44996556294`) `completed / success` (46s); `frontend-static-check` (`44996556276`) `in_progress`; live `curl` verified `APP_VER = "20261122-p269-fit-to-page-respect"`.
