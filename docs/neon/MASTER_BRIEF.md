# Neon master brief — make Chronexa production-ready (from 2026-11-22)

You (Neon, Gemini app) do the work. Claude is the orchestrator: it re-checks every block before
you start the next one. Work through `@fleet-shell` run_command (unsandboxed: Chrome/Playwright work).

Read first: `~/knowledge/okf/reports/CHRONEXA-HANDOFF-2026-10-31.md` (release flow, harness, traps).
Repo: `~/chronexa-web`. Live: https://abhishekchhetri020.github.io/chronexa-web/ (Pages deploys on push to main).

## Hard rules
1. **Tool timeout ~25 s.** Anything longer (build, vitest, playwright, servers) runs in the background:
   `cd ~/chronexa-web && nohup <cmd> > /tmp/neon_<name>.log 2>&1 & echo $!` then poll the log.
2. **Release gate (all must pass before merging to main):** `npx vitest run` 0 failed;
   `npx vite build` ok; `npx playwright test --config pw.chrome.config.local.mjs` 0 failed
   (1 known skip allowed: substitutions-flow real-XML audit). Kill any `vite preview` before building.
3. **Release flow:** work on a branch `neon/<topic>` → gate → bump `window.APP_VER` in `index.html`
   (`YYYYMMDD-pNNN-slug`, next number after the current one) → `git checkout main && git merge --no-ff`
   → `git push` → after ~3 min verify `curl -s <live url> | grep -o 'APP_VER = "[^"]*"'` shows the new
   value and `gh run list --limit 3` is green. Never force-push, never rewrite history, never touch other
   branches or worktrees.
4. **Backend / HF Space:** do not deploy (needs a token only Abhishek has). Backend edits are allowed
   only with `backend/test_daily_caps.py` passing; note "needs HF redeploy" in STATUS.
5. **EduPage / aSc:** READ-ONLY. Never save, submit, delete or POST anything on EduPage. Tenant
   `abhishekchhetri.edupage.org`, file at `online.php?num=32`. Session/cookie tooling:
   `~/chronexa-edupage-study/round4/` (`probe_session.py`, `pull_state.py`, `r4.py` blocks writes).
   Study BEHAVIOUR only. **Never copy aSc/EduPage code, assets, icons or text into Chronexa** — write
   our own implementation. Save evidence under `~/chronexa-edupage-study/round5/`.
6. **REA** (reverse-engineering tool, github.com/morluto/rea, pinned 6.8.0):
   `~/tools/rea/node_modules/.bin/rea <command>` (`rea --help`, `rea doctor`). Use it to understand how
   an aSc feature works (e.g. `analyze-web-bundle`, `capture-browser-scenario`, `observe-web-session`).
   Do not install another REA version or any npm package younger than 14 days.
7. **Honesty:** report exact counts and real failures. If something is blocked after 3 honest
   attempts, write `BLOCKED: <reason>` in STATUS and move to the next item.
8. No mail, no ERP, no school data writes. This job is Chronexa only.

## Status file (Claude watches it)
Append one line per event to `~/chronexa-web/docs/neon/STATUS.md`:
`<time> | <block> | STARTED|DONE|BLOCKED|RELEASED <APP_VER> | <one-line detail>`
Write a short report per block to `docs/neon/BLOCK_<letter>.md` (what changed, gate results with counts,
live check output, open bugs).

## Blocks (do them in order; end your turn after each DONE so Claude can verify)
**A. Ship Landing v4.** Branch `neon/backlog-1` (commit c162f4f, already gated by Claude) →
release flow above → verify live. STATUS `RELEASED`.

**B. Production QA sweep.** Use the app like a user on the built preview (`npx vite preview --port 4173`)
with Playwright + real Chrome, following handoff §5: start screen → template → blank school → entities →
lessons → Generate → drag/swap → print preview → export (PDF/PNG/CSV/XLSX/XML) → import the real XML
(`~/.mempalace/gdgpsd_data/timetable/LATEST.xml`) → substitutions → undo/redo → reload persistence,
at 1440 px and 390 px. Log `pageerror` and `console.error`. Write every defect to
`docs/neon/BUGS.md` (id, steps, expected, actual, severity). Then fix them, highest severity first,
each with a regression test, each through the release gate. Release in batches.

**B2. Print preview — priority (added 2026-11-22 by Abhishek).** Chronexa is a web app only (no Mac
app). HF backend work is postponed. Go through EVERY print report and template in the preview
(classes, teachers, rooms, summary/pivot, supervision/duty, substitution memo) on the real XML:
check fits-A4, page breaks, headers/footers/page numbers, abbreviations, period times, break
columns, Tuning panel (padding, font, border, theme, visibility) actually changing the output,
PDF export page count, and both render paths (templates AND pivot — handoff §8). Compare with aSc's
print output read-only (see `okf/reports/chronexa-print-engine-vs-asc-2026-10-30.md`). Log defects in
BUGS.md with `print` tag, fix, regression-test the RENDERED page (not helpers), release.

**C. aSc parity with REA.** Pick the next missing aSc feature from
`~/chronexa-edupage-study/round4/capture/GAP_CONDITIONS.md` (start with multi-week/term).
Study it in the logged-in EduPage editor with REA (read-only), write what you learned to
`round5/<feature>.md`, then implement it in Chronexa yourself with tests, gate, release.

## Claude's review of Block B (2026-11-22 ~12:00) — next items
Verified: live p267; vitest 581/581; your 4 new print tests FAIL on p266 and PASS on p267 (good tests).
My full e2e run on main: 136 passed, 1 skipped, **1 failed: `e2e/curtain.spec.js:248`** (unplaced flow
in curtain). It passes 3/3 alone on both p266 and p267, so it is a pre-existing flake under full-suite load.
Next, in order:
**D1.** Make `curtain.spec.js:248` reliable (find the race; wait on state, not timeouts). Prove it with
`--repeat-each=5` inside a full-suite run.
**D2.** BUG-P08: auto-paginate the dense single-page matrices (`summary`, `summary_of_teachers`,
`contract_overview`, `wait_points_teachers`, `wall_poster_teachers`) so they fit A4 without "Fit to
page" on the real 66-teacher XML. Rendered-page regression tests. Release.
**C.** Then Block C (REA + EduPage, read-only, multi-week/term first) as written above.

## Claude's review of Block D (2026-11-22 ~12:15)
D1 approach is right (waits on state). D2 regression found by review:
**D3.** `renderReport()` in `pivot_engine.js` now auto-splits entity matrices even when the user turned
ON Sheet & PDF → "Fit to page (shrink if too big)" (`APP.printSettings.fitToPage`). Before p268 that
setting produced ONE shrunk page (e.g. a one-sheet wall chart); now it is ignored. Fix: skip the
auto-split when `fitToPage` is true. Add a rendered-page test: real-size school, fitToPage=true →
summary renders 1 page per day/page-combo and fits; fitToPage=false → split as now. Gate, release.
Then go on to Block C.

## Rule added 2026-11-22 12:40
Only stop YOUR OWN preview/dev server, by the PID you started (`kill <pid>`). Never `pkill vite`/
`pkill -f "vite preview"` — Claude runs its own verification server on ports 4191-4199 in parallel.
Use port 4173 (or 4180-4189) for yours.

## Claude's review of Block C (2026-11-22 ~13:45)
Gate verified clean on p270 (587 unit, 140 e2e + 1 skip). Two problems your report did not mention:
1. **REA never ran successfully.** `round5/rea_s5_analysis.json` (121 MB) is an error log:
   "JavaScript application analysis failed … code: cancelled". Your research came from reading the
   round4 captures directly. That is fine and read-only, but the report must say REA failed. Always
   report tool failures.
2. **Only the JS solver knows weeks/terms.** Claude ran your Week A/B spec with each algorithm on p270:
   `browser` ✅, `auto` ✅ (tiny school only), `wasm` ❌ — CP-SAT returns 0 cards. The cloud backend
   also ignores weeks (backend deploy stays postponed; do not touch HF).
Next:
**C2a.** Make the WASM CP-SAT model honour week/term slices (disjoint slices may share teacher/class/
room at the same day+period). If that is too big, route `wasm`/`auto` to the JS solver whenever the
school has >1 slice and show a clear notice in the Generate dialog. Test: a REAL-SIZE school (e.g. the
demo school with half the lessons set to Week A and half to Week B) through the default Generate
button flow (algorithm "auto"/Best) AND `wasm`: A/B co-placement must survive the polish. Gate, release.
**C2b.** Re-run REA properly in the background (`nohup ~/tools/rea/node_modules/.bin/rea
analyze-javascript-application <path> --json > round5/rea_<name>.json 2>&1 &`, then poll), so the 25 s
tool timeout cannot cancel it. Add what REA really shows to `round5/multi-week-term.md`, or write
BLOCKED with the exact error.
Write BLOCK_C2.md; STATUS lines as usual; end your turn after C2's DONE.

## Block E — full QA pass after p266–p271 (assigned 2026-11-22 by Abhishek via Claude)
Claude verified p271: 587 unit, 141 e2e + 1 skip, CI green. Now use the app like a real user again,
because six releases touched print and solver code. Same rules, gate and release flow as above.
**E0.** First commit `docs/neon/*.md` to git (not large data files) on a branch, so the reports are not
Mac-only. Ship it with the first E release.
**E1. Real-school run** on `~/.mempalace/gdgpsd_data/timetable/LATEST.xml` (import through the UI):
press Generate with the DEFAULT mode the dialog offers; record placed/unplaced, hard conflicts
(Verification dialog), wall time. Then the same with each algorithm. Report the numbers.
**E2. Weeks/terms through the UI**: create Week A/B and Term 1/2 in the app's own dialogs, set
patterns on lessons in the lesson dialog, Generate, check the grid week/term filter, print, export to
aSc XML and re-import (round-trip keeps weeks/terms).
**E3. Every surface** at 1440 px and 390 px: start screen, templates, entity dialogs, lesson dialog,
drag/swap/lock, undo/redo, version history, saved views, substitutions planner, publish + published
viewer, all 31 print reports with Fit to page OFF and ON, all exports (PDF/PNG/CSV/XLSX/ICS/HTML/XML),
reload persistence. Log `pageerror` + `console.error` (ignore the solver's own diagnostic logs, list them).
**E4.** Every defect → `BUGS.md` (new ids `E-xx`, steps / expected / actual / severity), fix highest
first with rendered-page regression tests, gate, release in batches.
Report tool failures and anything you could not test. Write BLOCK_E.md. End your turn after E's DONE.
