# Block C — Multi-Week / Multi-Term Solver Engine + a_48, a_57, a_73 (`20261122-p270-multi-week-term`)

## Research evidence (read-only)
- Saved to `~/chronexa-edupage-study/round5/multi-week-term.md` (derived from `round4/modules/s5/timetable__app__server__ttdoc.js`, `round4/modules/s5/global__pics__js__bundles__bundle_ttonline.min.js`, `round4/capture/SCHEMA.md`, `CONDITIONS.md`, `GAP_CONDITIONS.md`, `typ_combo.json`; zero aSc/EduPage code, assets, icons, or text copied).

## What changed
Branch `neon/c-multi-week-term` (commit `c3cb49a`), merged `--no-ff` into `main` (`5586173`) and pushed to `origin/main`.

1. **Multi-week & multi-term calendar slice engine (`js/solver/csp_solver.js`):**
   - Resolves `school.weeks` / `school.weeksDefs` and `school.terms` / `school.termsDefs` into per-lesson `lessonWeekMask`, `lessonTermMask`, and Cartesian `lessonSliceMask` (`slice = w * termCount + t`).
   - When `sliceCount > 1 && sliceCount <= 31`, uses slice-aware bitmask occupancy (`teacherSliceOcc`, `roomSliceOcc`, `classSliceGroupOcc`) across `_canPlaceJS`, `canPlaceSecond`, `applySingle`, `removeSingle`, `materializeBestIntoState`, and the post-solve conflict scrubber. Single-week/single-term schools keep the zero-overhead fast path untouched.
   - Disjoint week/term lessons (e.g. Week A `"10"` vs Week B `"01"`, or Term 1 `"10"` vs Term 2 `"01"`) can now co-occupy the same `(day, period)` for the same teacher, class, and classroom with zero conflict, while overlapping patterns (e.g. All-weeks `"11"` vs Week A `"10"`) still conflict.
   - Emits `weeks` and `terms` bitstrings on solved assignments (`csp_solver.js`) and preserves them when applying to `school.cards` (`js/ui/solver_ui/run_and_apply.js`).
2. **Advanced conditions `a_48`, `a_57`, `a_73` (`js/solver/csp_solver.js`):**
   - Added `a_48` (Max free weeks between cards per year), `a_57` (Max weeks/terms on one period), and `a_73` (Max free days between cards per all weeks) to `ADV_REL_TYPS` and `advancedRelationPenalty()`.
   - Raises aSc advanced-condition parity from **66/86 → 69/86**.
3. **Tests:**
   - Unit tests (`js/solver/__tests__/multi_week_term.test.js`): 6 tests covering Week A/B co-placement, Term 1/2 co-placement, All-weeks conflict with Week A, and `a_48`/`a_57`/`a_73` penalties.
   - Browser E2E test (`e2e/multi-week-term.spec.js`): runs the real browser solver (`SolverUI.run`) on a 1-day × 1-period 2-week school and verifies both Week A (`"10"`) and Week B (`"01"`) lessons co-place with zero errors.

## Gate results
- `npx vitest run`: **68 test files passed (68), 587 tests passed (587), 0 failed**.
- `npx vite build`: **ok** (`dist/` built in 2.33s).
- `npx playwright test --config pw.chrome.config.local.mjs`: **140 passed, 1 known skip (`substitutions-flow` real-XML audit), 0 failed** (`18.4m`).

## Live verification
- `curl -s https://abhishekchhetri020.github.io/chronexa-web/ | grep -o 'APP_VER = "[^"]*"'` → `APP_VER = "20261122-p270-multi-week-term"`
- `deploy-pages` & `frontend-static-check` triggered on `main` (`5586173`); see `gh run list --limit 3` output.

## Open / Next
- Remaining 17 of 86 aSc conditions in `GAP_CONDITIONS.md` (12 require student/seminar enrolment, 2 per-week curriculum `a_63/a_64`, 2 emergency/optimal room classes `a_71/a_72`, 1 undocumented `a_28`).
