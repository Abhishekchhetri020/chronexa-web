# Block F Report — Reload Persistence (F0) & Solver Robustness (E-01, E-02)

- **Release:** `20261122-p273-solver-robustness-autosave`
- **Branch / Commits:** `neon/f-solver-robustness` (`8c4c3a6`) merged `--no-ff` to `main` (`d313378`)
- **Live check:** `curl -s https://abhishekchhetri020.github.io/chronexa-web/ | grep -o 'APP_VER = "[^"]*"'` -> `APP_VER = "20261122-p273-solver-robustness-autosave"`
- **CI:** `deploy-pages` run `45024445683`; `frontend-static-check` run `45024445639` `in_progress` at handoff.

## F0 — Reload-After-Import / Create Persistence (`js/ui/components/auto_save.js`)
- **Root cause:** `auto_save.js` serialized derived `school._idx` into `localStorage` with no IndexedDB quota fallback, never auto-restored imported or newly created schools on boot (only showed a 1.5s delayed card), and its Restore handler dispatched `app:school-loaded` only on `window` (missing `document` listeners such as `activator.js`).
- **Fix:**
  - Strip derived `_idx` before cloning for storage (`CreateNew.refreshIndex()` rebuilds it on load).
  - Persist immediately on `app:school-loaded` and `app:solve-applied`, falling back to IndexedDB (`chronexa-autosave-v1`) with a small `localStorage` pointer if `localStorage` quota is exceeded.
  - Auto-restore any imported, newly created, or edited school on boot (`autoRestore: true`), dispatching `app:school-loaded` on both `window` and `document` and calling `showStep(6)`. Untouched Demo loads (`demo-xml` / `create-demo`) keep `autoRestore: false` so start-screen/demo reload workflows remain unchanged.
  - Clear stored session when a school is explicitly closed (`detail.school === null`).
- **Verification:**
  - `e2e/block-f-regression.spec.js`: imported XML survives immediate reload with 0 edits (`2.7s`); newly created blank school survives immediate reload with 0 edits (`2.5s`).
  - Real school `LATEST.xml` (`393 KB`, `1,470` cards, `66` teachers): imported via UI -> reloaded immediately with 0 edits -> restored `1,470` cards & `66` teachers with `0 pageerror`.

## E-01 — WASM CP-SAT Phase 2 Memory / Robustness (`js/solver/wasm/cp_sat_solver.mjs`)
- **Root cause:** On large schools (`LATEST.xml`, `1,441` schedulable cards), `buildSoftModel()` added `69,090` extended-soft terms on top of the placement model across parallel WASM worker clones, exhausting Emscripten WASM RAM and throwing `Aborted()` / `Uncaught [object WebAssembly.Exception]` (`8 pageerror`s) before fallback.
- **Fix:**
  - Skip extended-soft expansion on large models (`cards.length > 1000` unless `options.extSoft === true`), keeping core soft polish (`23,016` terms on `LATEST.xml`) and attaching a user-visible `stats.phase2Note`.
  - Cap Phase 2 `numSearchWorkers` to `<= 2` and Phase 2 `maxTimeInSeconds` to `<= 35s` on large models (`cards.length > 1000`).
- **Real-school regression on `LATEST.xml` (DEFAULT Generate — `Best / auto / best`):**
  - **Before (p271/p272):** `1,441 / 1,441` placed, `0` hard conflicts, `151.03s`, `8 pageerror`s, `Aborted()` / `WebAssembly.Exception`, `-693,100 SOFT PENALTIES`.
  - **After (p273, `qa-f-real2`):** **`1,441 / 1,441` placed**, **`0` unplaced**, **`0` hard conflicts**, `PHASE 1 OPTIMAL (61.74s)` -> `PHASE 2 FEASIBLE (35.03s, 23,016 terms)`, total **`116.53s`** (`34.5s` faster), **`0 pageerror`**, **`abortedSeen: false`**, **`33,600 SOFT PENALTIES`**.

## E-02 — Non-Negative Soft Penalties Display (`result_panel.js`, `progress_modal.js`)
- **Root cause:** `stats.softScore` is internally a negated penalty sum (`<= 0`), and `result_panel.js` / `progress_modal.js` rendered it raw next to `"soft penalties"`.
- **Fix:** Display `Math.max(0, Math.round(raw < 0 ? -raw : raw))` in both `js/ui/solver_ui/result_panel.js` (plus tooltip `s.phase2Note` when set) and `js/ui/solver_ui/progress_modal.js`, keeping internal `stats.softScore` untouched for solver/unit-test compatibility.
- **Regression test:** `e2e/block-f-regression.spec.js` (`E-02`, `10.4s`) + `LATEST.xml` check (`33,600 SOFT PENALTIES`).

## Release Gate (`1122-180910-gate-p273`)
- `npx vitest run`: **68 test files passed (68), 587 tests passed (587), 0 failed**
- `npx vite build`: **ok**
- `npx playwright test --config pw.chrome.config.local.mjs`: **146 passed, 1 skipped** (`e2e/substitutions-flow.spec.js:221`), **0 failed (`11.2m`)**

## Tool Failures / Notes
- First real-school run (`qa-f-real`) hit the script's 180s timeout because Phase 2 had an uncapped ~110s budget after Phase 1 finished in 57s (with 0 errors/aborts); adding the 35s Phase 2 cap on `cards.length > 1000` resolved this cleanly (`qa-f-real2` finished in `116.53s`).
