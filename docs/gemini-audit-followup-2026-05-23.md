# Gemini Audit Follow-Up — 2026-05-23

Triggered by the goal containing Gemini's static-analysis report. All six
findings audited; four patched, two deferred with reasons.

## Status

| # | Bug | Verified | Shipped | Notes |
|---|---|:-:|:-:|---|
| 1 | `totalPeriodLoadBalance` not incrementally updated | ✓ | **defer** | Fix isolated to ~2 LOC; causes cold-mode placement regression (944 → 876 on sample-school.xml). Needs `period_load_balance` weight recalibration before landing. Code in tree as commented-out lines with TEMP-REVERT marker. |
| 2 | `teacherBuildingChangesPenalty` O(T·D·P·L) | ✓ | ✓ | Rewritten to single-pass bucket fill + O(T·D·P) sweep. Warm-start solve on sample-school.xml: **445 ms → 74 ms (6× speedup)**, placement unchanged (946/946). |
| 3 | WASM `canPlace` result ignored | ✓ | ✓ | Dead dispatch removed (csp_solver.js:1029-1036 block deleted). Comment was explicit: "JS remains authoritative; this side-by-side call provides the runway." |
| 4 | `wire()` leaks mousedown listeners | ✓ | ✓ | Gated by `rootEl._chrxWired`; day-tab clicks moved to delegate on rootEl so they survive innerHTML replace. Test: 1 listener across 5 renders (was N). |
| 5 | Silent card deletion on 2nd pickup | ✓ | ✓ | On 2nd pickup while `cardInHand` is set, the held card is restored to its origin slot (aSc CLASSIC behavior). Fires `editor:restore` event with `reason: "second-pickup"`. |
| 6 | XML parser drops timeoff / relations / class constraints | ✓ | **defer** | Multi-component effort: each missing data type (timeoff, cardrelations, class.constraints, classroomsupervisions, breaks, buildings, students) has its own CLASSIC schema. A partial patch risks introducing subtle parse bugs that won't surface until real XML hits them. Scope and ship per data-type. |
| 7 | Global `APP` mutation sprawl | n/a | n/a | Not a bug — architectural opinion. Gemini themselves flagged "acceptable for prototypes." |

## Verification

Solver fingerprint on sample-school.xml after patches:

```
warmStart=true   placed=946/946  softScore=-520900  dur=74ms   (was 445ms)
warmStart=false  placed=944/946  softScore=-507440  dur=30001ms (unchanged)
```

Regression suites all green:

```
tools/test_constraints.mjs                    4/4
tools/test_class_conflict_group_aware.mjs     4/4
tools/test_multisession_lesson_lock.mjs       3/3
tools/test_editor_pickup_lifecycle.mjs (NEW)  5/5
```

## What blocks bug #1 from landing

`period_load_balance` weight (`Weight.MED_SOFT = 20`) was calibrated against
the broken-zero behavior. Once the metric goes live, every placement
contributes `periodPref[p] × 20` (100-980 per placement) to softScore.
On cold-start where the 30-second time budget is the binding constraint,
the richer score landscape means fewer placements fit in the budget
(944 → 876 = 7.2% drop).

To land #1 safely:
1. Drop `period_load_balance` default from 20 → ~5 and rerun the
   sample-school + a real-school fingerprint set.
2. Or gate the incremental update behind a feature flag while collecting
   empirical placement-vs-quality data on real schools.

## What blocks bug #6 from landing

Each missing data type in the parser is its own deliverable:

- **`teacher.timeOff` parsing** — CLASSIC stores per-teacher availability
  as 2D bitmask or "d_p"-keyed map. Single-table parse, but the format
  varies across aSc versions. Highest-value to land first.
- **`cardrelations` → `school.relations`** — the solver already reads this
  (csp_solver.js:773, 3613). The XML element `<cardrelations><cardrelation
  typ_id="..." ... />` carries the constraint type via `typ_id`; a typ
  catalog (`n_0` … `n_17` from aSc docs) is needed to map them.
- **`class.constraints`** — 14-field constraints subobject. Bundle line
  2018 references it but parser doesn't populate.
- **`classroomsupervisions`** — already in XML; solver has scoring hooks
  (csp_solver.js:1531+). Parser drops them.

Export side (`js/ui/io/export_timetable_xml.js`) also needs updates per
data type so a UI edit survives round-trip.

## Open finding (separate from Gemini's list)

`warmStart:false` solve on sample-school.xml puts 33 cell-level
class-conflicts in `assignment[]` while reporting only 3 `hardConflicts` —
assignment-integrity bug in TIMEOUT state. Surfaced in the previous session;
unrelated to anything Gemini flagged.
