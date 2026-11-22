# Block C2 Report — WASM Multi-Week/Term Support (C2a) & Clean REA Run (C2b)

- **Release:** `20261122-p271-wasm-multi-week-term`
- **Branch / Commits:** `neon/c2-wasm-multiweek` (`9580dc2`) merged `--no-ff` to `main` (`427f227`)
- **Live check:** `curl -s https://abhishekchhetri020.github.io/chronexa-web/ | grep -o 'APP_VER = "[^"]*"'` -> `APP_VER = "20261122-p271-wasm-multi-week-term"`
- **CI:** `deploy-pages` run `45002678818` `completed success` (42s); `frontend-static-check` run `45002678778` was `in_progress` at last successful check (a re-check at 14:01 IST hit `net/http: TLS handshake timeout`).

## C2a — WASM CP-SAT Multi-Week/Term Slice Support (`js/solver/wasm/cp_sat_solver.mjs`)

### Root Causes Found
1. **0-based vs 1-based period bit bug in `validStarts(card)`:** `cp_sat_solver.mjs` tested `1 << (p + off)` using 1-based period ID `p` against 0-based `jm.teacherAvailabilityMask` bits. On a 1-period school (or period 8 of an 8-period school), this rejected the valid period and caused `cpStatus: "OPTIMAL", placed: 0, unplaced: 2, wallSec: 0.07`. Fixed by indexing with `p0 = pidx.get(p)`.
2. **No slice keying on exclusivity maps:** `tOcc`, `clsAt`, `roomOcc`, `sOcc` (`maxParallel`), and `csd` (daily subject cap) were keyed only by `(entity, day, period)` without calendar slice indices, preventing disjoint Week A (`"10"`) and Week B (`"01"`) or Term 1/Term 2 lessons from sharing a teacher, class, or room at the same `(day, period)`.
3. **Room fallback, allowed days & slice output:** Added `classroomIdsExpanded` / `_lessonRoomIds` / `preferredRoomId` room fallback, added `jm.lessonAllowedDays` check in `validStarts(card)`, attached `slices` (active `(week, term)` slice indices from `jm.lessonSliceMask[lIdx]`), `weeks`, and `terms` to each card, keyed exclusivity maps by `|s${sl}` per active slice `sl`, and emitted `weeks` and `terms` bitstrings on solved `assignment` entries.

### Tests Added (`e2e/multi-week-term.spec.js`)
1. **Tiny 1-day x 1-period A/B school (`browser` + `wasm`):** Both solvers place both lessons at `(day 0, period 1)` with `weeks: "10"` and `"01"` (`2.5s` in gate).
2. **Real-size 946-card demo school (half Week A `"10"`, half Week B `"01"`) through both `wasm` (`timeLimitSec: 25`) and `auto` ("Best") pipeline:**
   - WASM CP-SAT built `cards=946, placed_vars=946, slot_vars=39702, soft_terms=0`, reached `PHASE 1 status: FEASIBLE, pstar: 946, wall: 15.066s`.
   - Both `wasm` and `auto` placed `946/946` cards (`weekA > 300`, `weekB > 300`, `0` same-week teacher conflicts) and A/B co-placement survived polish (`17.7s` in gate).
   - *Tool/test failures encountered and fixed during development:* `timeLimitSec: 10` timed out before Phase 1's first feasible solution (~15.1s), so the test uses `timeLimitSec: 25`; `cp_sat_solver.mjs` intentionally logs diagnostics via `console.error`, so the test asserts zero `pageerror` exceptions.

## C2b — Clean REA Run on EduPage/aSc Bundle (`bundle_ttonline.min.js`)

### Tool Failures Reported Honestly
1. **Prior Block C failure:** `round5/rea_s5_analysis.json` (121 MB) had been cancelled by the ~25s tool timeout and contained a cancellation error; removed.
2. **First C2b attempt failure:** Symlinking (`ln -sf`) `bundle_ttonline.min.js` into `/tmp/rea_s5_ttonline/` caused REA to skip the symlink and report `"bytes": 0`. Fixed by copying (`cp`) the bundle into `/tmp/rea_s5_ttonline/bundle_ttonline.min.js` and running REA in background (`nohup ... &`).

### Verified REA Output (`~/chronexa-edupage-study/round5/rea_ttonline.json`, 44 MB NDJSON)
- `terminal: true`, `integrity_contradictions: []`
- `evidence_id`: `ev_3ea459d5c50039bd031bf7bb51f3a9e497001fccd4d48dfc20c1ec1b24bb3fec`
- `sha256`: `7b8466e36326fc3a5ad437fef2f632fea4e64a1a90cc40cb91b6bfe783ae8811`
- Graph: **435 nodes** (`431` `javascript-module`, `1` `javascript-asset`, `1` `artifact`, `1` `storage`, `1` `endpoint`), **848 edges**.
- Recovered 6 module hits referencing `weeksdefs`, `termsdefs`, `weeksdefid`, and `termsdefid` (e.g. `m.sub("weeksdefid")`, `m.sub("termsdefid")`, `e.tableFilterData("termsdefs",{typ:"all"})`, `s.rowData("weeksdefs",e.weeksdefid)`).
- Appended full REA Section 5 findings to `~/chronexa-edupage-study/round5/multi-week-term.md`.

## Release Gate Results (`20261122-p271-wasm-multi-week-term`)
- `npx vitest run`: **68 test files passed (68), 587 tests passed (587), 0 failed**
- `npx vite build`: **ok** (`245 modules transformed`, `4.37s`)
- `npx playwright test --config pw.chrome.config.local.mjs`: **141 passed, 1 skipped, 0 failed (10.4m)**
  - Skipped (known): `e2e/substitutions-flow.spec.js:221` (`the ranker stays sound on the school's real timetable XML`)

## Open Items
- `frontend-static-check` CI run `45002678778` was `in_progress` at last successful check; a re-check hit `net/http: TLS handshake timeout`.
