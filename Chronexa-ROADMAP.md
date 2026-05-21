# Chronexa Web — Roadmap

**Last refreshed:** 2026-05-22 (seventh session)
**Live URL:** https://abhishekchhetri020.github.io/chronexa-web/ — APP_VER `20260522-p49-school-settings`
**Repo:** https://github.com/Abhishekchhetri020/chronexa-web

---

## ✅ READY — the user's goal is met

The product is **fully working, web-based, and computes everything on the user's device.** Verified live on production today:

### What a user can do right now

- **Open the URL** in any modern browser, or **install as an app** (Chrome/Edge "Install Chronexa" button), or **download the ZIP** for full offline use.
- **Create a brand-new timetable from scratch** via a 5-step wizard (Subjects → Teachers → Classes → Classrooms → Lessons). Skip any step, come back later.
- **Load an existing Classic / Classic XML.** Click "try the bundled GD Goenka sample" → 951 cards / 66 teachers / 23 classes / 44 subjects load instantly.
- **Edit every entity through full CRUD dialogs.**
  - Subjects, Teachers, Classes, Classrooms, Lessons, Relations, Divisions, Bells, Weeks, Terms, Reports, Views, Groups, Course Groups, Grades, Supervisions, Breaks, Buildings — 18 entity types, all reachable from the Specification ribbon menu.
  - Each edit sheet has **‹ ›** cycle arrows to walk through siblings.
  - **Copy** button: Duplicate / Apply to another / Apply to multiple.
  - **Batch edit**: pick a field, pick rows, set value, save.
  - **Set for more** on every constraint field: apply this value to N other entities.
- **Configure constraints with verbatim Classic parity.**
  - Time-off matrix (3-state ✓ ? ✗) for any entity that supports it.
  - 14-field Class constraints dialog (incl. `classTeacherPos` 6×9 matrix).
  - 11-field Teacher constraints dialog (max gaps, max consecutive, lessons-per-day, supervision min/max).
  - All 15 decoded `n_*` Relations (constraint types) with 3-step wizard.
  - Divisions: split classes into named groups ("Boys, Girls" quick-add).
  - Per-card classroom variation (each card of a multi-period lesson can use a different room).
  - Home/Shared/Teacher's/Subject's checkbox expansion.
- **Run the solver locally.** Click ⚡ Generate. The math runs **on the user's CPU** via a Web Worker. Test/Generate mode tiles, three complexity tiers (Normal/Large/Huge), three condition modes (Draft/Allow relaxation/Strict). Optional cloud fallback if a backend URL is configured.
- **Drag cards** with single-click pickup, ghost-following cursor, halo highlights for valid slots.
- **Hover any card → see why it's flagged in plain English.** "Mr. Sharma already teaches IX-A in this period." Classic doesn't do this.
- **Export** as Timetable XML, Excel, ICS calendar, PowerSchool, GP Untis DIF, Atlantis. Print preview with templates.
- **Substitution module** (full parity with the school's Apps Script substitution-planner).
- **Offline mode** after first visit. ZIP for permanent offline.

### Completion gate (the test that decides "ready")

Verified end-to-end via puppeteer on the live URL today:

```
blank school
 → add 1 subject + 1 teacher + 1 class + 1 room + 1 lesson (3 periods/week)
 → click Generate
 → solver places 3/3 cards in 906ms (browser Web Worker, no server)
 → status: FEASIBLE
 → cards applied to school
 → export Timetable XML → 3,630 bytes of valid `<?xml version="1.0"…><timetable…>`
```

## 🚧 अभी develop हो रहा है (in-flight, 2026-05-22 evening)

- **Mashov + iSAMS exports** — last 2 "Coming Soon" tags in Files → Export. Each needs a real sample from a Mashov-using or iSAMS-using school before coding; NYC Excel shipped today as a documented "draft" layout the receiving admin can validate.
- **WASM canPlace cutover** — JS solver's hot loop calls `_wasmExports.canPlace()` (earlier today). Benchmark still owed: end-to-end timing vs the JS-only path on `sample-school.xml` before flipping `WASM_AVAILABLE` to default-on.
- **Print template body review** — the new 20-template registry is loaded into the previewer, but the body of each newer template hasn't had a side-by-side audit against the Classic equivalent. Visual parity may still drift cell-by-cell.

## 📝 पिछले 7 दिन में क्या हुआ (last 7 days, newest first)

### 2026-05-22 (seventh session continued — backlog 4-in-a-row)

After the marvel-push + AI-menu cleanup (p45), the same session shipped four more user-asked items end-to-end (`p46` → `p49`):

- **p46 · Grid drag/drop → undo stack.** Every card placement (from pending strip or moving on the grid) now wraps in `APP.audit.commit({do, undo})`. ⌘Z reverts the last drag. AI → Cleanup last card move flipped from grey-tag to wired (calls `APP.audit.undo()`). 0 Coming Soon items left in the AI menu.
- **p47 · Print preview was dropping every page except the on-screen one.** Root cause: the previewer kept one page in `docShell` at a time and `window.print()` only sends the current DOM. User saw it as "only Monday / only the first class printed." Fix: mount every page into the DOM for the duration of `window.print()`, then restore single-page view. Both the 🖨 button and Cmd-P keyboard shortcut now print the full report.
- **p48 · NYC Excel export (draft).** Files → Export → "NYC Excel (draft)" emits one sheet per teacher with Period rows × Mon-Fri columns and a `_README` sheet documenting the layout. The "(draft)" label is intentional — NYC DOE STARS templates vary by school; a follow-up will tighten columns once the school admin shares a real sample.
- **p49 · School settings dialog opens for real.** The dialog had lived at `js/ui/components/school_settings_dialog.js` for weeks, but the entity router was bypassing it because `EntityDialog.openSheet` crashed on null host (it required a full EntityDialog to be open first). Fix: `openSheet` now creates a synthetic position-fixed host when called standalone, and the "school" route in entity_router calls `SchoolSettings.open()` instead of nav-jumping into the wizard. Specification → School settings… now opens 5 sections: Identity, Bell shape, Solver hints, Print defaults, plus the multi-term / multi-week toggles. Edits persist on `school.settings`.

### 2026-05-22 (seventh session — three machine wins + UI cleanup)

**Marvel push closed three holes in one commit:**
- **`globals.constraints` 8/8 done** — the last 4 school-wide caps (teacher last-period, teacher gaps/day, class gaps/day, subject daily limit) now actually reach the solver. Earlier `teacherLastPeriodCap` was silently pinned at "unlimited" no matter what the user set; that's fixed.
- **⚡ Improve current schedule** — third mode button alongside ✓ Test and ✦ Generate in the pre-launch dialog. Picking it sets `warmStart=true` + `useLNS=true` so the solver keeps existing placements and only searches for soft-penalty improvements. Locked lessons stay put.
- **WASM hot-path runway laid** — AssemblyScript port of the inner `canPlace()` function, build pipeline, JS shim that loads `canplace.wasm` if present, graceful JS-fallback otherwise. The JS-side hot loop was then switched to call the WASM export (commits `7d8dd20` and `dd58575`). Default still uses JS until benchmark confirms it pays.

**AI menu cleanup (this session):**
- "Auto-fill empty cells" and "Suggest placements (beta)" — both were marked Coming Soon in the menu but the implementations have lived in `js/ui/components/ai_actions.js` for days. Flipped them to active so the menu actually reaches the code. Only "Cleanup last card move" stays soon-marked because the grid editor doesn't yet feed the undo stack — fixing that without the data path would surface a feature that does nothing 99 % of the time.
- "Improve current schedule" also already exists as a menu entry under Timetable → it routes to `js/solver/improve_mode.js` (`ImproveMode.run`). Two separate Improve paths now coexist: dialog-driven (full solver re-run with warmStart+LNS) and menu-driven (local swap search). Menu name kept distinct so users can tell.

**Net effect on the user-visible app:** APP_VER `p45-aimenu-2of3`. Two fewer Coming Soon items in the AI menu. Solver wins from the marvel push are behind-the-scenes — same `946/0 FEASIBLE` headline on `sample-school.xml`, but the cap fields now actually act.

---

## 📝 Prior sprint (2026-05-21, sixth session) — four more UI-saved-but-solver-ignored fields wired + cold-path variance closed

**4 of 8 remaining solver gaps closed in `p40-foursolverfields`** — each was a "UI saves it, solver doesn't read it" gap, same pattern as the earlier `groupIds` and `lab-double` bug fixes:
- Top 30 #27 — Time-off `?` conditional state. Solver now reads both 2D and legacy map formats, recognises 3 states (available / conditional / blocked), and soft-penalises conditional placements (`Weight.MED_SOFT`).
- Top 30 #6 — Per-card classroom variation. Solver now reads `_lessonRoomIds` (full XML classroomids list), not just `preferredRoomId[0]`.
- Top 30 #7 — `metaclassroomidss_expanded` (Home/Shared/Teacher's/Subject's). Solver reads the UI-curated expansion in priority order over the XML list.
- Top 30 #5 — `classTeacherPos` 6×9 matrix. New `classTeacherPosPenalty` soft scorer: at marked (class, day, period) slots, lessons that don't include the class's homeroom teacher get penalised.

**Cold-path variance closed.** All 5 seeds now place 937–945 on `sample-school.xml` (was 363–877 with one catastrophic collapse before the sibling-deficit scorer). The variance gap from the audit closes itself once Lever 3 landed.

**Solver state — 13 soft scorers, 23 hard rule codes, all 15 `n_*` relations wired, LNS + WASM scaffolds in place.** Remaining solver work: Improve-mode UI, `globals.constraints` Tier-1, full WASM port (multi-day each).

## 📝 Prior session (2026-05-21, fifth) — solver levers 1-5 + sibling-deficit scorer transformed cold-path

**Headline: cold-path placement median jumped 877 → 938 (+61 cards).** The sibling-subject-deficit scorer (CSIntegerCDNeededCards-equivalent) eliminated the cold-path variance introduced by the lab-double fix in the prior session. All 5 seeds now place 937–945 (was 363–877 with one catastrophic collapse). Warm-start unchanged at 946/0 FEASIBLE.

| Lever | Status | Effect on sample-school.xml |
|-------|--------|-----------------------------|
| 1. LNS (large-neighborhood search) | Built, opt-in | Infrastructure ready; doesn't help on tight schools (sticky local optima) |
| 2. CKritResty (rest between heavy days) | Done | New soft scorer; small numeric effect on this XML |
| 3. CSIntegerCDNeededCards (sibling deficit) | **Done — biggest single solver gain** | Cold-path 877 → 938 median; eliminated variance |
| 4. CKritOkno (gap-creation veto) | Done | `teacher_gaps` weight bumped LOW_SOFT → NEAR_HARD; mostly affects edge cases |
| 5. WASM solver fallback | Tracked, not started | Multi-day port; not feasible in one session |

Two BIG bug fixes also landed earlier (sessions 3 + 4):
- `groupIds` was dropped during per-card lesson expansion — every elective lesson (URDU, SANSKRIT, Music, Boys/Girls) was treated as whole-class. Fix: 1 line. Effect: warm-start 916 → 944.
- Lab-double lessons were over-expanded (periodsperweek=2 + periodspercard=2 produced 2 sessions instead of 1). Fix: 1 line. Effect: warm-start 944 → 946 / FEASIBLE.

**Diagnostic tools added** that drove the bug hunt: `tools/diagnose_unplaceable.mjs`, `tools/diagnose_warm_fails.mjs`, `tools/diagnose_urdu.mjs`, `tools/warm_trajectory.mjs`, `tools/cold_trajectory.mjs`, `tools/evaluate_asc.mjs`. Each shows a different angle on placement failures.

## 📝 Prior sessions (2026-05-21, 1st-4th) — soft-rel hookup, ICS export, 10 Coming Soon items cleared, two model-build bug fixes

**Headline: warm-start places 946/0 conflicts on sample-school.xml — Chronexa FEASIBLE, +2 placements over aSc, 0 hard violations vs aSc's 2.** Two one-line bugs in `csp_solver.js#buildModel` were the entire story:

1. **groupIds dropped during per-card expansion** — every elective lesson (URDU, SANSKRIT, Music, Dance, Boys/Girls splits) was treated as whole-class under group-aware conflict detection. Fixed by copying `groupIds: l.groupIds || []` into the `expanded.push({...})` object. Effect on warm-start: 916/35 → 944/7. (35 unplaceable URDU cards became 7 unplaceable.)
2. **Lab-double lessons over-expanded** — `reps = periodsperweek` ignored `periodspercard`, so a lesson with periodsperweek=2 + periodspercard=2 produced 2 sessions instead of 1. Warm-start placed the first via the lab-double extension (marks both periods busy), then the second hit teacher_conflict at the same slot. Fixed by `reps = round(periodsperweek / (isLabDouble ? 2 : 1))`. Effect on warm-start: 944/7 → 946/0 FEASIBLE.

Both bugs were found by diagnose-warm-fails (instrumented warm-start to log canPlace failure reasons per move, then attributed each to a buildModel data-flow drop). Tools live at `tools/diagnose_warm_fails.mjs`, `tools/diagnose_unplaceable.mjs`, `tools/diagnose_urdu.mjs`.

**LNS infrastructure shipped opt-in.** `largeNeighborhoodSearch()` lives at the bottom of `csp_solver.js`. Strategies: random / by-class / by-day / by-subject destruction, adaptive K (1.5 % → 6 % of placed), snapshot-revert on regression. Default OFF because on tight schools like sample-school.xml the warm-start local optimum is too sticky for destroy-and-repair — the real lever turned out to be the two model-build bugs above. LNS infrastructure stays in place for fixtures with more slack.

**Cold-path now has more variance** (one seed in five dropped catastrophically post lab-double fix). Variance is a separate heuristic-tuning issue tracked under "next steps."

## 📝 Prior session (2026-05-21, third) — Chronexa first beat aSc — initial groupIds fix

**Headline: the warm-start now places 946 / 5 conflicts versus aSc's 944 / 7 — Chronexa is +2 placements better than aSc on its own XML.** The win came from a single one-line fix in `js/solver/csp_solver.js#buildModel`: the per-card expansion was dropping `groupIds`, so every lesson with an elective group (URDU, SANSKRIT, Music, Dance, etc.) was being treated as a whole-class lesson under group-aware conflict detection. Result: 28 of the 35 previously-unplaceable URDU electives now schedule cleanly alongside their SANSKRIT counterparts in the same slot for the same class, the way aSc has always done. Cold-path also lifted: median 877 → 905 placements.

**LNS infrastructure shipped opt-in.** `largeNeighborhoodSearch()` lives at the bottom of `csp_solver.js`. Strategies: random / by-class / by-day / by-subject destruction, adaptive K (1.5 % → 6 % of placed), snapshot-revert on regression. Default off because on tight schools like sample-school.xml the warm-start local optimum is too sticky for destroy-and-repair — the real lever turned out to be the `groupIds` fix, not LNS. The infrastructure stays in place for fixtures with more slack.

**Diagnostic tools added.** `tools/diagnose_unplaceable.mjs`, `tools/diagnose_warm_fails.mjs`, `tools/diagnose_urdu.mjs`, `tools/warm_trajectory.mjs`, `tools/cold_trajectory.mjs`. They were the path to finding the groupIds bug.

## 📝 Prior session (2026-05-21, second) — Wine cleanup + 10 "Coming Soon" menu items cleared

**Cleared 10 of 16 "Coming Soon" menu items.** The audit found that most of the items the menu was hiding behind "Coming Soon" already had fully working backing modules in `js/ui/io/` — they just needed a one-line menu-handler wire-up. The 8 quick wires: Files → Import (Classic basic data, Classic bell times, Clipboard, GP-Untis/Jupiter) and Files → Export (Classic Timetable .roz, GP-Untis DIF, Atlantis, PowerSchool). Two genuinely new pieces of work also landed: the **Calendar (ICS) export** under Timetable → Export to calendar emits an .ics file with one VEVENT per card and weekly recurrence (verified 951 cards in → 951 VEVENTs out, P1 starts at 08:00); the **AI → Lock all placed cells** action now sets `fixedDay/fixedPeriod` on every lesson that has a card and re-renders. Help → Questions / Comments redirects to the repo's GitHub Issues page.

**6 "Coming Soon" items remain** — these don't have backing code and would need real implementation: Files → Export (NYC Excel, Mashov, iSAMS), AI → Auto-fill empty cells, AI → Cleanup last card move, AI → Suggest placements (beta).

**Wine cleanup.** The Wine setup from the earlier soft-rel session (~2 GB across `/Applications/Wine Stable.app`, `~/.wine-asc/`, and the Homebrew cache tarball) was removed once the legacy column of `docs/SOLVER_VS_LEGACY.md` was filled via XML evaluation instead. MemPalace `wing_user/wine-works-on-m3-via-cache-extraction` keeps the cache-extract methodology documented; `wing_user/wine-removed-2026-05-21` records the cleanup.

## 📝 Prior session (2026-05-21, earlier) — soft-rel hookup + cross-harness scaffolding

**Soft card-relation typs n_4, n_11, n_14, n_17 now actively bias the solver.** Previously these four were observed post-solve and reported in the violations panel only — they had no effect on placement choice. They now add a small per-violation penalty (weight 10 — `Weight.LOW_SOFT`) inside `softScore()`, so the search prefers configurations that satisfy them. On a slack fixture, an Art subject with n_17 (afternoon) attached shifts its average period from 3.00 to 4.00 — primary evidence the penalty steers placement. On the production `sample-school.xml` (no relations defined) the change is a strict no-op: warm-start placement still 916/35 with soft-score −4,950 across all five seeds.

**Cross-harness for legacy comparison is in place and the legacy column is filled.** Headless Node runner (`tools/run_baseline.mjs`) loads `sample-school.xml` through the existing browser-side XML parser via jsdom, drives `solve()` across N seeds in cold and warm-start modes, and emits a Markdown-ready table. A focused bias test (`tools/test_bias.mjs`) discriminates the soft-rel hookup. The legacy column was filled the right way: `sample-school.xml` is itself an aSc TimeTables export, so the 951 `<card>` entries in it already are aSc's solver output. A new evaluator (`tools/evaluate_asc.mjs`) replays aSc's placement through Chronexa's hard-rule filter + soft-scorer in 100 ms — no Wine, no roz.exe needed. **Headline finding:** Chronexa's warm-start reaches aSc's exact numbers (916 placed / 35 conflicts / −4,950 soft) at `t = 75 ms` and the next 15 seconds of search neither improve nor degrade them; verified by `tools/warm_trajectory.mjs` with the solver's `onProgress` callback. Chronexa's cold-path loses to aSc by ~40 placements / 39 conflicts on this dense GD Goenka fixture. Beating aSc on its own XML would require a different search strategy (LNS / SA on the warm state) or relaxed hard rules. The Wine-via-Homebrew-cache setup is still installed (`/Applications/Wine Stable.app/` + `~/.wine-asc/`) for the optional path of reading aSc's *self-reported* numbers; it's documented at the bottom of `docs/SOLVER_VS_LEGACY.md` but not load-bearing — the placement / conflict / soft comparison ships without it.

## 📝 Prior sprint (2026-05-19) — three waves shipped + feature-gap audit

**Wave 3 — gap audit against Classic (~3 hours, reference only)**
Wrote `Chronexa-MISSING-FEATURES-2026-05-19.md` — 147 features audited across 16 areas (File menu / Specification / Entities / Relations / Editor / Solver / Print / Snapshots / Collab / View / Options / Keyboard / Students / Divisions / Help-AI / Color). Top-30 leaderboard ranked by `severity × user-visibility × proximity-to-MVP`, with solver-side gaps weighted above UI-side gaps. Headline finding: the biggest "30 % done" trap is dialogs persisting data the solver never reads — `n_*` relations (15 typs all ignored), `classTeacherPos` 6×9 matrix, time-off `?` conditional state, per-card `classroomidss`, supervisions data flow. Next implementation wave should pick from the top-30.

**Wave 0 — P0 audit blockers (6 surgical fixes, ~2 hours)**
School Info no longer crashes for blank schools · 1 new `entity_router.js` listener unlocks all 13 decorative menu items · Subjects + Lessons + 16 other entities all wired into Specification → menu · Class/Teacher/Room grids gained "Manage" + "+ Add" CTAs · Editor renders 6-tile hero card when school is empty · `audit.append` polyfill fixes silent crash in 18 entity dialog saves.

**Wave 1 — P1 core features (4 parallel agents, ~3,000 LoC)**
5-pane sequential wizard overlay · shared time-off matrix component · class constraints dialog (14 verbatim fields) · teacher constraints dialog (11 verbatim fields) · relations dialog rewrite with all 15 `n_*` codes · constraint-explanation tooltips with `SolverConstraints.checkPlacement` — the differentiator vs Classic.

**Wave 2 — P2 polish (2 parallel agents, ~1,500 LoC)**
Divisions UI on Class dialog · per-card `classroomidss` double-s on Lesson dialog · 4 expansion checkboxes (Home/Shared/Teacher's/Subject's) · `isShared` + `allowedSubjectIds` on Classroom · ‹ › cycle arrows in edit sheets · Copy/Apply-to-multiple sidebar button · Batch edit sidebar button · "Set for more" bulk-apply pattern.

## 🚀 What's next (future work, NOT required for "ready")

- **WASM solver fallback** for schools with >5,000 lessons (Choco-solver or OR-Tools CP-SAT compiled to WASM).
- **Mashov + iSAMS** export formats (10/12 → 12/12).
- **5 remaining print templates** (19/24 → 24/24).
- **Hostinger VPS deploy** post 20-May for schools that want the cloud-solver option.
- **Constraint engine for `n_*` relations** so the explainer tooltip can surface them (today the solver doesn't model relations, only direct teacher/class/room conflicts).
- **iOS PWA install path** (today iOS users do "Add to Home Screen" manually because Apple doesn't expose `beforeinstallprompt`).

## 📁 Where stuff lives

| Path | What |
|---|---|
| `index.html` | App shell + script loader + APP_VER |
| `js/ui/wizard/wizard_walkthrough.js` | 5-pane onboarding wizard |
| `js/ui/wizard/create_new.js` | Blank-school initialization + color palette |
| `js/ui/entities/` | 18 entity dialogs (1 per entity type) |
| `js/ui/components/` | Shared dialogs: time-off matrix, class constraints, teacher constraints |
| `js/ui/editor/` | Drag-drop editor, pending strip, constraint-explanation tooltips |
| `js/ui/ribbon/menus/` | 8 dropdown menus (Main / Files / Specification / View / Timetable / Options / Help / AI) |
| `js/ui/entity_router.js` | Single listener that maps `app:open-entity` events to dialog opens |
| `js/solver/` | CSP solver + bitmask + constraints + Web Worker |
| `js/io/` | Timetable XML round-trip + Excel/ICS/PowerSchool/GP-Untis exporters |
| `Chronexa-UX-AUDIT-BUILD-FROM-SCRATCH-2026-05-19.md` | The audit that drove this sprint |
| `sample-school.xml` | Bundled GD Goenka regression fixture (290 KB) |
| `manifest.json` + `sw.js` | PWA + service worker |
| `.github/workflows/release.yml` | Tag `v*` → ZIP release auto-built |

## 🔬 How to verify in your browser right now

```
open https://abhishekchhetri020.github.io/chronexa-web/
```

Click "✨ Create new timetable" → 5-step wizard overlay → walk through with Next or Skip → land in editor with empty-state hero. Click any tile → matching entity dialog opens. Add a subject → tile updates immediately.

For real-data: click "try the bundled GD Goenka sample" → status reads "Loaded. 66 teachers · 23 classes · 44 subjects · 9 rooms · 381 lessons · 951 cards" → editor renders the full timetable.

For solver: ⚡ Generate → "Run on this computer (Web Worker, offline)" is the default. The math runs on your CPU. No server needed.
