# Chronexa Web — Master Gap Analysis

**Date:** 2026-05-19 (post-recon)
**Verdict:** User's "30% done" assessment is accurate. Both *feature parity* and *solver effectiveness* sit around 30%.

This doc consolidates findings from:
- `legacy-research` + `legacy-research` (Classic binary RE)
- Chronexa Swift inventory (68 files, the source-of-truth implementation that was halted)
- Live solver test on GD Goenka 951-card school (puppeteer'd against production)
- 16 CLASSIC_*.md research docs

## Top finding: the solver places 28%, not 100%

Tested today on production with GD Goenka data (951 cards, what Classic places at 100%):

```
Status:          TIMEOUT (30s budget)
Placed:          106 / 951   (28%)
Unplaced:        845         (all "no feasible slot during search")
HardConflicts:   845
SoftScore:       -1225
```

Why: the JS port has *pure MRV+degree backtracking* — no iterative repair, no tabu, no Min-Conflicts. The Swift port has `improveByRandomRestart` + tabu; the JS port dropped it. On 951 cards, vanilla backtracking can't converge to feasibility in 30 seconds.

**Fix:** Add Min-Conflicts iterative repair phase after backtracking. Target ≥80% placement. **(W7 agent is on this now.)**

## Solver internals: Ghidra-identified gaps

Ranked by impact on placement rate.

| # | Gap | C class | Swift status | Web status | Impact |
|---|---|---|---|---|---|
| 1 | **Sibling-subject deficit** | CSIntegerCDNeededCards (~3,600 LoC in C) | NOT PORTED (stub returns 0) | NOT PORTED | 8 unplaced lessons on `sample-school.xml`. Solver doesn't bias toward subjects falling behind weekly quota. |
| 2 | **Per-card-ordinal listener fan-out** | FUN_009a391c + FUN_00a2a128 | Disconnected | Not modeled | Several scoring leaves silent. |
| 3 | **CKritOkno mutex** | -200,000 hard veto | Flag-gated dead code | Not modeled | Tabu picks illegal swaps that should have scored -200K. |
| 4 | **Score aggregator coverage** | CAlgoritmus sums ~9-12 criteria | Swift sums 4 | Web sums 8 | Tabu ranks on partial signal. |
| 5 | **CKritUciVTriede** (teacher actually teaches class) | weight 10 | Not ported | Not ported | Edge-case integrity. |
| 6 | **CKritTriedny** (homeroom assignment preference) | weight 10 | Not ported | Not ported | Misses class-teacher prefs. |
| 7 | **CKritResty** (rest periods between heavy days) | weight 10 | Not ported | Not ported | Teachers complain about no recovery. |
| 8 | **n_15 "Reserve space"** | CPodmVztah… | Missing mapping | Missing mapping | User-visible constraint dropped. |
| 9 | Collapsed n_* pairs | n_6/n_5, n_9/n_8, n_10/n_8, n_13/n_14, n_17/n_4 | Single Swift case per pair | Same drift | Semantic mismatch. |
| 10 | CLASSIC-faithful weights | C: 25 / 20 / 10 for teacher_gaps / teacher_gaps_per_day / subject_groups | Swift: 50 / 40 / 25 (benchmark-tuned) | Web: same as Swift | A/B flag needed. |

**Closed by Q2/Q4 follow-up:** `n_2`, `n_3` confirmed RETIRED (zero matches in binary). `CKritBody` confirmed VESTIGIAL (weight 0, hard-coded "Chan Min Chung" test string). Don't port.

## Feature gaps: Swift exists, web doesn't

Top 20 from the Swift inventory (68 files). P0 = blocks completion gate, P1 = user-visible, P2 = polish.

| # | Feature | Swift file | Status | Tier |
|---|---|---|---|---|
| 1 | CardRelationships HAR Importer | CardRelationshipsHARImporter.swift | Web NO | P0 |
| 2 | ScoreExpr DSL + TokenResolver | ASCScoreExpr.swift + ASCScoreEvaluator.swift + TokenResolver.swift | Web NO | P0 |
| 3 | Day / Term / Week Patterns | DaysDialog.swift + TermsAndWeeksDialogs.swift | Web stubs | P0 *(W8 in flight)* |
| 4 | Multi-lesson relationship constraints | 100-type catalogue | Web has 15 n_* but disconnected from solver | P0 |
| 5 | Teacher building-change constraints | Building.swift | Web has buildings.js *(committed today)* | P1 |
| 6 | Approbation mismatch | ASCSolver `SoftConstraint.approbationMismatch` (weight 10) | Web NO | P1 |
| 7 | Print design parser (def.xml) | ASCPrintDesignXMLParser.swift | Web NO | P1 |
| 8 | Cell-style editor (7 cards × 9 anchors × font/color) | ASCCellStyle.swift | Web NO *(W9 in flight)* | P1 |
| 9 | 8 missing soft constraints | ASCSolver.swift | Web has 8 of 13 | P1 |
| 10 | Report-type dropdown (19 templates) | ASCReportType.swift | Web has 11 hardcoded | P1 |
| 11 | Wildcard `??` lessons | ASCWildcard model | Web NO *(W9 in flight)* | P1 |
| 12 | Time-off calendar grid (visual) | TimeOffMatrixView.swift | Web has 3-state matrix component | P1 |
| 13 | Class divisions tree (lab/practical splits) | DivisionsView.swift | Web has divisions data + flat editor | P1 *(W9 upgrading)* |
| 14 | Detailed verification panel | VerificationPanel.swift | Web has basic list | P1 |
| 15 | Student & course group models | ASCModels.swift section | Web NO | P1 |
| 16 | Classroom supervision (substitution data) | ASCClassroomSupervision | Web has substitution module | P1 |
| 17 | Focus mode (spotlight one entity) | FocusModeSheet.swift | Web NO | P2 |
| 18 | Command palette (Cmd+K) | CommandPaletteView.swift | Web NO | P2 |
| 19 | Overview grid (all classes at once) | TimetableOverviewGrid.swift | Web NO | P2 |
| 20 | Substitution ranking | SubstitutionView.swift | Web has substitution UI; ranking incomplete | P2 |

Estimated effort to 80% parity: 120-150 days. We're attacking it in parallel waves.

## Solver effectiveness gates

| Gate | Target | Current | Status |
|---|---|---|---|
| Trivial school (1 lesson) | 100% | 100% | ✅ |
| 30-card school | ≥90% | ≈85%* | ✅ approx |
| GD Goenka 951-card (real) | ≥80% (760+) | 28% (106) | ❌ **#1 blocker** |
| GD Goenka with full constraint set | ≥75% (713+) | n/a | pending |

*estimate from earlier wizard demo; not benchmarked.

## Currently in flight (Wave 3)

| Agent | Brief | Status |
|---|---|---|
| W7 | Solver: add Min-Conflicts repair → ≥80% on real data | Running |
| W8 | Day/Term/Week pattern dialogs | Running |
| W9 | Wildcard lessons + Divisions tree + Cell-style editor | Running |
| Classic agent | Exhaustive Top 30 missing features doc | Running |
| **Main thread** | Buildings entity (shipped 57be227) + this doc | Done |

## Wave 4 (planned, post-Wave 3 land)

Independent agents, no file overlap.

| Agent | Brief | Time |
|---|---|---|
| W10 | 8 missing soft constraints + CLASSIC-faithful weight flag + Approbation mismatch | 5h |
| W11 | Time-off calendar grid + Focus mode + Command palette | 6h |
| W12 | Report-type dropdown + 4 more print templates + multi-sheet Excel | 5h |
| W13 | Statistics panel (TeacherDailyDetail, gap ratio, slot utilization) | 4h |
| W14 | Detailed verification with auto-fix suggestions + Advisor button | 6h |

## Wave 5 (longer-running)

| Item | Days | Why a wave on its own |
|---|---|---|
| ScoreExpr DSL + TokenResolver | 4-5 | 79 expression node types; user-defined scoring |
| CardRelationships HAR Importer + 100-type constraint UI | 3-4 | Schools migrating from Classic need this |
| Print design (def.xml) parser + rendering | 4-5 | Desktop reports must roundtrip |
| Timetable XML round-trip lossless test harness | 1 | Verifies import→export→reimport equality |

## Completion gate (the test that decides "ready")

A school admin can:
1. Open the URL on any laptop/tablet/phone.
2. Either create from scratch via wizard OR upload their Timetable XML.
3. Click Generate → solver places **≥80% of cards in ≤60s using only their device CPU** (no server).
4. Hover any red card → see the conflict explained in plain English.
5. Export Timetable XML + Excel + PDF.
6. Print 24 different report templates.
7. Mark a teacher absent → see ranked substitutes → assign with one click.
8. The whole thing works **offline** after first visit (PWA).

Today: 4/8 met. Target: 8/8.
