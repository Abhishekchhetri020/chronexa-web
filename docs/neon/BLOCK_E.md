# Block E Report — Full QA Pass After p266–p271 (E0–E4)

- **Release:** `20261122-p272-qa-weeks-terms-mobile`
- **Branch / Commits:** `neon/e-qa-pass` (`776ddaa` E0 docs tracking, `5bb1577` E-03/E-04 fixes + tests, `4bcaf58` MASTER_BRIEF sync) merged `--no-ff` to `main` (`56a8524`)
- **Live check:** `curl -s https://abhishekchhetri020.github.io/chronexa-web/ | grep -o 'APP_VER = "[^"]*"'` -> `APP_VER = "20261122-p272-qa-weeks-terms-mobile"`
- **CI:** `deploy-pages` run `45012064933` (live already serving `p272`); `frontend-static-check` run `45012064820` `in_progress` at handoff.

## E0 — Track `docs/neon/*.md` in Git
- Committed all 8 `docs/neon/*.md` reports (`BLOCK_A.md`, `BLOCK_B.md`, `BLOCK_C.md`, `BLOCK_C2.md`, `BLOCK_D.md`, `BUGS.md`, `MASTER_BRIEF.md`, `STATUS.md`) on `neon/e-qa-pass` (`776ddaa`) and merged into `main` (`56a8524`).

## E1 — Real-School Run on `LATEST.xml`
- **School:** `~/.mempalace/gdgpsd_data/timetable/LATEST.xml` (`66` teachers, `34` classes, `537` lessons, `1,470` XML period-slots / `1,441` schedulable cards).
- **29-card gap explained:** `LATEST.xml` contains `sum_ppw = 1,470` period-slots across `537` lessons, of which `24` lessons have `periodspercard > 1` (double/block periods), collapsing `1,470` period-slots into `1,441` schedulable cards (`1,470 - 1,441 = 29` merged period-slots).

| Mode / Algorithm | Preset | Placed / Total | Unplaced | Hard Conflicts | Soft Score Shown | Wall Time | Errors / Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| **DEFAULT** (`Best` / `auto`) | `best` (default) | **1,441 / 1,441** | 0 | 0 | `-693,100` (`E-02`) | 151.03s | WASM Phase 2 (`EXTENDED SOFT: terms added= 69090`) threw `Aborted()` / `Uncaught [object WebAssembly.Exception]` (`E-01`) before recovering |
| `Generate` / `browser` | `balanced` (90s) | **1,165 / 1,441** | 276 | 276 | `-404,200` (`E-02`) | 91.11s | `TIMEOUT · 90s`; 0 `pageerror`, 0 `console.error` |
| `Generate` / `wasm` | `balanced` (90s) | **1,433 / 1,441** | 8 | 0 | `-671,700` (`E-02`) | 82.35s | 0 `pageerror`, 0 `console.error` (did not hit Phase 2 OOM at 90s budget; at `best` preset, `wasm` also hit `E-01` `Aborted()`) |
| `Generate` / `cloud` | `fast` (30s) | **1,165 / 1,441** | 276 | 276 | `-404,200` (`E-02`) | 41.10s | Backend HTTP `503` -> fell back to `browser` (`TIMEOUT · 30s`) |

## E2 — Weeks/Terms Through the UI & aSc XML Round-Trip
- Created `Week A` (`10`) and `Week B` (`01`) in `EntityWeeks`, and `Term 1` (`10`) and `Term 2` (`01`) in `EntityTerms`, assigned to lessons in `EntityLessons`, ran Generate, checked `#editor-view-filter`, checked Print Preview, and exported/re-imported aSc XML.
- **Defect found & fixed (`E-03`):** `EntityWeeks` and `EntityTerms` wrote only to `school.weeks`/`school.terms`, leaving `school.weeksDefs`/`school.termsDefs` stale, and `exportFromTemplate()` never replaced `<weeksdefs>`/`<termsdefs>` in `sourceText`. Fixed in `js/ui/entities/weeks.js`, `js/ui/entities/terms.js`, and `js/ui/io/export_timetable_xml.js`. Covered by `e2e/block-e-regression.spec.js` (`E-03`).

## E3 — Full Surface Sweep (1440px & 390px), 31 Print Reports, Exports, Reload
- **1440px:** Start screen (`0px` overflow), Editor (`0px`), all 7 entity dialogs (`teachers`, `classes`, `subjects`, `classrooms`, `weeks`, `terms`, `lessons`, `0px`), undo/redo/lock (`ok: true`), substitutions (`0px`), publish (`ok`), 0 `pageerror`, 0 `console.error`.
- **390px:** Start screen (`0px`), Editor (`0px`); **caught & fixed `E-04`:** entity dialogs caused `251px` horizontal overflow (`641px > 390px`) via `HEADER.chrx-topbar` / `.chrx-topbar-editor-tools` and unstacked `.chrx-ent-dialog`. Fixed in `css/entities.css`, `css/editor.css`, and `css/editor-v3.css`. Covered by `e2e/block-e-regression.spec.js` (`E-04`).
- **All 31 print reports on `LATEST.xml` (`fitToPage: false` AND `fitToPage: true`):** `27/31` rendered with `0` overflowing sheets in both modes (`0` `pageerror`, `0` `console.error`). The 4 with `0` pages on `LATEST.xml` were `timetable_for_student` (0 students), `timetable_for_each_student` (0 students), `supervision_duties` (0 duties), and `teacher_workload` (tested separately on Demo in `e2e/print-b2-regression.spec.js:77` which passed).
- **Exports:** Direct downloads verified in standalone sweep for `csv`, `ics`, `html`, `xml`, `png` (`5/5` passed); all 7 formats (`CSV`, `Excel .xlsx`, `ICS`, `HTML`, `aSc XML`, `PNG`, `PDF`) passed in the release gate (`e2e/w3-4-export.spec.js` tests 115–122).
- **Reload persistence:** Reloading immediately after importing `LATEST.xml` (without edits) returned `hasSchool: false` — noted for Block H (`Reliability of user data`).
- **Solver diagnostic `console.error`s ignored during E1:** `RELATIONS: encoded constraints= ...`, `IMPROVE mode: placement floor = ...`, `EXTENDED SOFT: terms added= ...`, `MODEL BUILD: ...`, `PHASE 1 ...`.

## E4 — Defects Logged & Release Gate (`20261122-p272-qa-weeks-terms-mobile`)
- Logged **`E-01`** (High, deferred to Block F), **`E-02`** (Medium, deferred to Block F), **`E-03`** (High, **FIXED**), and **`E-04`** (Medium, **FIXED**) in `docs/neon/BUGS.md`.
- **Gate (`1122-153713-gate-p272`):**
  - `npx vitest run`: **68 test files passed (68), 587 tests passed (587), 0 failed**
  - `npx vite build`: **ok**
  - `npx playwright test --config pw.chrome.config.local.mjs`: **143 passed, 1 skipped** (`e2e/substitutions-flow.spec.js:221`), **0 failed (`10.9m`)**

## Tool Failures / Limitations Reported
- Earlier standalone `E1` harness timed out on `browser`/`wasm` when they inherited the `best` preset instead of `balanced`; fixed in `qa-e1b` by explicitly selecting `balanced`.
- Two transient Gemini remote-tool timeouts/disconnects occurred during E1/E3; recovered cleanly via `neonjob` background jobs.
- Standalone `E3b` script missed `xlsx` (button testid differs from `xlsx`) and `pdf` (selector mismatch), both of which were verified passing in `e2e/w3-4-export.spec.js` during the full gate.
- Preview server on port `4181` (PID `26613`) was stopped cleanly by PID before running the Playwright gate.
