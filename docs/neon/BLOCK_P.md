# Block P — Generate Flow & Grid Clarity (`20261122-p277-generate-clarity`)

- **Branch:** `neon/p-generate-clarity` (merged `--no-ff` to `main` as `fe9879c`, feature commit `397c549`)
- **Live URL:** https://abhishekchhetri020.github.io/chronexa-web/ (`APP_VER = "20261122-p277-generate-clarity"` verified live)
- **After Screenshots:** `docs/neon/ui-shots/block-p/` (`1-generate-dialog-after.png`, `2-progress-after.png`, `3-result-after.png`, `4-grid-after.png`) vs Claude's before shots in `docs/neon/ui-shots/claude-review/`.
- **Release Gate (`1122-204147-gate-p277` + `1122-211833-recheck-2-p277`):**
  - `npx vitest run`: **587 passed** (68 files), **0 failed**
  - `npx vite build`: **ok** (`5.35s`, 0 chunks `> 500 kB`)
  - `npx playwright test --config pw.chrome.config.local.mjs`: **152 passed, 1 skipped, 2 failed** under heavy parallel Mac CPU load (`e2e/w2-1-undo.spec.js:5` and `e2e/w2-5-availability-shading.spec.js:67` `perf < 50ms`); immediately re-ran both specs cleanly (`1122-211833-recheck-2-p277`): **7/7 passed, 0 failed**.

## Root Causes & Fixes

### P1 — Data risk ("946 vs 951, will lose 5 cards")
- **Root cause:** `docs/demo_sample-school.xml` has 5 double-period (`periodsPerWeek=2, periodsPerCard=2`) "Sports Meet Practice" lessons stored in aSc XML as 2 separate 1-period `<card>` elements each (`946 + 5 = 951`). The solver emits 1 `span=2` card per double-period lesson (`946` cards covering all `951` period-slots, `0` unplaced). `isDestructiveApply()` in `js/ui/solver_ui/result_panel.js` previously compared raw `newCards.length < school.cards.length`, firing a false destructive warning and turning "Keep this timetable" into a red-bordered warning button.
- **Fix (`js/ui/solver_ui/result_panel.js`):**
  - Added `mergePreservedCards(school, solverCards)` so any non-lesson / duty / orphan cards are automatically preserved on apply.
  - Added `coveredLessonSlots(school, cards)` and updated `isDestructiveApply()` so a 100%-placed run (`unplaced === 0`, `assignment.length >= expected`) is never flagged as destructive; actual loss is compared by covered period-slots.
  - Styled `confirmDestructiveApply()` with clean sans-serif typography and neutral dark heading (no red serif/emoji).

### P2 — Topbar chip vs Result panel truth
- **Fix (`js/ui/solver_ui/result_panel.js`):** Result panel now computes clashes via `VerificationPanelPro.countHardConflicts({ ...school, cards: previewCards })` (the exact same verifier used by `#editor-unplaced-count`), and `applyImmediately()` synchronously refreshes `#editor-unplaced-count` so the Result panel and Topbar chip always report the same clash count.

### P3 — Generate dialog (`js/ui/solver_ui/prelaunch_dialog.js`)
- Simplified top-level choice to 3 clean speed presets (**Quick** `~30s`, **Balanced** `~90s`, **Best** `~5 min`) and one primary **"Build timetable"** button.
- Moved the **"Recommended"** badge dynamically onto whichever speed preset is preselected (eliminating the "Best selected / Balanced tagged Recommended" contradiction).
- Sanitized placeholder school names (`"Classic Timetable 2012 XML"` → `"Sample school"` / `"My school"`).
- Collapsed overlapping options (Action mode, Rebuild/Improve only/Add unplaced only, Complexity, Conditions, Algorithm, report toggle) under **"More options"** (`#csu-advanced`).

### P4 — Progress modal (`js/ui/solver_ui/progress_modal.js`)
- Fixed both contradictions: a single honest `placed / total` percentage now drives **both** the progress ring and the `"Progress"` bar (never `96%` vs `1%`), and `"Left to place"` computes `Math.max(0, total - placed)` instead of displaying `ev.hardConflicts` (`0`).
- Replaced jargon with plain-English steps (`Checking → Placing → Improving → Done`), plain status sentences (`"Placing lessons… X of Y"` → `"Improving the timetable…"`), elapsed time, and **"Use what we have so far"**.
- Moved developer telemetry (`Current branch`, `Schedules / sec`, `Iterations`, `Phase`, `Soft penalties`, live heatmap, branch race, `Currently placing` / `Currently stuck`) under a collapsed **"Show details"** (`#csu-progress-details`).

### P5 — Result panel (`js/ui/solver_ui/result_panel.js`, `css/solver_ui.css`)
- Replaced `"FEASIBLE · Ns"` jargon with `"Finished in Ns"`.
- Replaced 4 tiles (orange `"UNPLACED 0"` and raw `"SOFT PENALTIES 487,270"`) with 3 clean tiles: **Placed** (`946 / 946`, green when all placed), **Clashes** (`0`, synced with `VerificationPanelPro`), and **Quality** (`Good / Fair / Needs work (N%)` + top 3 plain-English improvement reasons).
- Primary button is solid brand **"Use this timetable"**; secondary buttons are **"Try again"** and **"Close"** (`"Undo apply"` stays hidden until applied).
- Collapsed the lessons-per-period grid under **"Lessons per period"** (`#csu-result-grid-details`) with clean scrolling and no clipped Saturday row.

### P6 — Grid & navigation clarity (`js/ui/editor/grid_canvas.js`, `css/design-v3.css`)
- Filtered empty duty-area rows (`1st Floor`, `2nd Floor`, `3rd Floor` — 0 lessons, 0 cards, floor/duty name) out of the default Class grid view when regular classes exist.
- Hid the redundant legacy step-tab strip (`nav:has(button.step-btn)`) inside the Workspace shell so navigation is one clear structure instead of three stacked bars.

## Regression Spec (`e2e/block-p-generate-clarity.spec.js`)
- Verifies P1–P6 end-to-end on the demo school: clean Class grid + single nav, non-placeholder summary + Recommended == preselected + collapsed More options, ring == bar + left == total - placed + collapsed Show details, plain Result + 3 tiles + 1-click apply with **0 `#chrx-apply-confirm` modal**, and topbar chip == result clashes.
