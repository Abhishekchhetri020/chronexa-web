# Double/Triple Booking Fix — 2026-05-23

## Symptom

User loaded `sample-school (3)-export (1).xml` and hit Generate. Rendered
timetable showed visibly overlapping cards:

- VI B Mon-P6: "S.S.T, SANSKRIT, INFORMATION TECHNOLOGY"
- X A Thu-P2: "PHYSICS, S.S.T, MATHS, Swimming/Games" (quadruple)
- VII A Wed-P4: "INFORMATION TECHNOLOGY, Games"
- IX A Mon-P5: "ENGLISH, S.S.T"
- IX B Tue-P7: "Music, S.S.T"

## Root cause (still open — only phase localized)

The XML's source data has duplicate `<card>` entries (e.g. lesson
`AA4E0EFB1B78B2ED` has TWO cards at period=5 days=001000), and zero
`<group>` elements (every lesson is whole-class, mask=0x1).

Phase isolation (using `timeLimitSec`, the correct option name — a first
pass mistakenly used `timeBudgetMs` which is ignored, leaving the default
30 s budget and producing misleading numbers):

| Config | placed | scrubbed |
|---|---|---|
| warm-only ultra-short (0.1 s) | 1176 | **1** |
| warm + repair (5 s) | 1187 | 5 |
| warm + repair + LNS (5 s) | 1189 | 3 |
| cold + repair (5 s) | 1160 | 1 |

At 0.1 s — barely enough for the warm-start replay to finish — the
scrubber already drops 1 placement. So warm-start replay IS introducing
at least one conflict on this XML. Repair compounds it. Why
`canPlace` lets two whole-class placements (both `gMask=0x1`) into the
same `(class, day, period)` is not yet root-caused.

**Separately, Gemini also reported a "flat groups" bug**: a class with
multiple `divisionTag` values would assign sequential bits across all
groups, so two groups from *different* divisions (e.g. Boys = bit 0,
Group A = bit 2) would `AND` to 0 and be treated as non-conflicting —
even though they share students. That's a real bug for any XML that has
multi-division groups; it is **not** the cause of the conflicts on this
user's XML (their XML has zero `<group>` elements). Filed separately;
not patched here.

## Fix (safety net)

`js/solver/csp_solver.js`: added a post-solve scrubber that runs after
`globalBest` is finalized but before `assignment[]` is built. It walks
placements once in `lessonIdx` order, maintaining a per-cell class group
bitmask, a teacher×slot taken-bit, and a room×slot taken-bit. Any
placement that would collide with an already-kept one is dropped from
`bestLessonAssigned`. Dropped lessons surface as `HARD_unplaced_lesson` in
the violation list and via the new `stats.scrubbedConflicts` counter.

The scrubber is correctness-preserving: it never invents placements, only
removes ones that would have rendered as double/triple booking.

## Verification

User XML (`/tmp/user_xml.xml`):

```
Before: status=TIMEOUT placed=1192/1269 hardConflicts=77  class-conflict-cells=20
After:  status=TIMEOUT placed=1176/1269 hardConflicts=93  class-conflict-cells=0
                                                          teacher-conflicts=0
                                                          room-conflicts=0
        scrubbedConflicts=16
```

The 16 lessons the scrubber dropped move from `assignment[]` to the
violation list, so the Verification panel shows them as unplaced rather
than hiding the conflict behind the rendered grid.

sample-school.xml (regression sentinel):

```
placed=946/946 FEASIBLE scrubbedConflicts=0   (unchanged from pre-patch)
```

## Tests

- `tools/test_no_double_booking.mjs` (new) — 4/4 green. Asserts: no
  class double-booking, no teacher double-booking,
  `stats.scrubbedConflicts` exposed, source-duplicate cards don't bloat
  placement count beyond `periodsPerWeek`.
- `tools/test_constraints.mjs` — 4/4
- `tools/test_class_conflict_group_aware.mjs` — 4/4
- `tools/test_multisession_lesson_lock.mjs` — 3/3
- `tools/test_editor_pickup_lifecycle.mjs` — 5/5

## Division-aware packing (Gemini follow-up — now shipped)

Gemini's second message pointed out that the scrubber, like `canPlace`,
used a flat bitmask — so a class split by multiple divisions (e.g.
gender Boys/Girls AND activity GroupA/GroupB) would let "Boys" lessons
(bit 0) coexist with "GroupA" lessons (bit 2) because `0b0001 & 0b0100
=== 0`. Boys and GroupA share students, so they must conflict.

Verified against the user's XML first: it has **zero `<group>`
elements**, so this specific bug couldn't be the cause of the original
double-booking symptom (the scrubber's flat-mask path was producing 0
conflicts on the user's data because every lesson collapsed to the
whole-class fallback `0x1`). But the underlying flat-groups bug IS
real for any XML with multi-division groups, so we shipped the proper
fix.

**Encoding** — `lessonClassGroupMask[i]` and `state.classGroupOcc[idx]`
are now packed `uint32`s:

```
bits  0..15 → divisionTag (0 = default; 0xFFFF = whole-class sentinel)
bits 16..31 → bitmask of groups WITHIN that division (≤16 bits)
```

**Conflict rule** — at the packed level, `canPlace` (and the scrubber)
flag a conflict when:
1. Either side is whole-class (`divIdx === 0xFFFF`).
2. Divisions differ (cross-division → shared students).
3. Same division AND masks intersect.

**Changes** — `js/solver/csp_solver.js`:
- `buildModel` builds per-(class, division) group ordering; emits packed
  `lessonClassGroupMask`.
- `canPlace` (line 1115-1124) and `canPlaceSecond` (line 1288-1295) use
  the three-step conflict rule above.
- `applySingle` OR's mask bits in the high half while preserving
  divisionTag in the low half.
- `removeSingle` clears bits within the division; resets the slot to 0
  (and clears `classOcc`) when the last group bit goes away.
- The post-solve scrubber uses the identical packed comparison.

**Test** — `tools/test_division_aware_conflict.mjs` (new, 1/1 green).
Without the packing, Boys-PE + GroupA-Art both placed (0/1). With the
packing, only one is placed; the other surfaces as
`HARD_unplaced_lesson` in `violations[]`.

## `removeSingle` strict div-match (Gemini analysis_results.md follow-up)

Gemini's deeper read flagged that `removeSingle` had an over-permissive
condition:

```js
if (occPacked !== 0 && (occDiv === lessonDiv || occDiv === 0xFFFF || lessonDiv === 0xFFFF)) {
  // … mask-subtract
}
```

When a bug-path caller (the iterativeRepair rollback at csp_solver.js
~2643, or `materializeBestIntoState` / `restoreFromSnapshot` — all of
which apply placements WITHOUT a `canPlace` re-check) handed
`removeSingle` a lesson whose `divisionTag` didn't match the slot's
occupant, the disjunction was still entering the mask-clear branch
because at least one side was the whole-class sentinel. The subtraction
`occMask & ~lessonMask` could clear unrelated bits or zero the whole
slot — at which point `canPlace` happily let new lessons land on the
already-occupied cell. That's the upstream root cause of the
stack-and-scrub symptom the screenshots showed.

**Fix:** strict match.

```js
if (occPacked !== 0 && occDiv === lessonDiv) { …mask-subtract… }
```

All legitimate callers (warm-start replay, backtrack apply/undo, repair
displacement that did pass `canPlace`) guarantee `occDiv === lessonDiv`.
Bug-path callers now silently no-op the mask write instead of corrupting
the encoding. Symmetric to the defensive guard already in `applySingle`.

Test: `tools/test_remove_single_div_match.mjs` (new, 2/2 green) — a
school whose source XML pre-places three whole-class lessons (S.S.T-ish
+ Sanskrit-ish + IT-ish) at the same (class, day, period). After the
fix, only one places; the other two surface as `HARD_unplaced_lesson`.

## What's still open

- **Root cause** of why bug-path callers reach `removeSingle` with a
  mismatched lesson in the first place — i.e. how the repair / restore
  paths ever build state where two divisions co-occupy a slot. The
  strict guard makes the symptom harmless, but the deeper investigation
  (probably in `tryPlaceViaRepair`'s rollback at line 2643) is still
  worthwhile.
- **Cold-mode TIMEOUT 33-vs-3 discrepancy** from a previous session —
  moot at the user level (scrubber catches anything in `assignment[]`),
  but the underlying state divergence is worth tracing.

## Print-preview audit (companion fixes)

The screenshots that surfaced this bug came from print preview. Audited
`js/ui/print_preview/*` afterward and shipped two adjacent fixes:

- `pivot_engine.js entitiesFor("day")` — honored `school.daysPerWeek`
  instead of hardcoded 6. A 5-day school no longer emits a phantom
  Saturday row/column unless the preset opts in to `hideEmptyRows`.
- `pivot_engine.js entitiesFor("period")` — when handed the actual
  `school.bell.periods` array, the function now maps each entity to the
  bell's real `{index, label}` rather than emitting sequential 1..N
  ordinals. Schools with break-period gaps in their bell (e.g.
  P1/P2/BREAK/P3) no longer silently mis-key cards.
- `print_preview.js render()` — propagates `periods` to the registered
  pivot render fn. Previously the call was `def.render(s)` so the pivot
  engine defaulted to 8 periods regardless of the school's bell.

Tests: `tools/test_print_pivot_dims.mjs` (3/3 green).

The pivot engine renders ALL cards matching a (row, col) cell. That's
the right behavior — when the solver emitted double/triple booking, the
pivot faithfully showed it. The post-solve scrubber above means at most
one card lands in each (class, slot) cell, so the visible stacked-card
symptom is resolved at the data layer; no renderer change was needed
for the user-reported screenshots.

Filed but not patched (lower blast radius, scope creep):
- The legacy `perEntityPages` / `summaryPage` / `posterPage` paths in
  `print_preview.js` also hardcode a 6-day `DAYS` array. They only run
  when no pivot preset registers, so impact is minimal in practice.
- `pivot_cell_renderer.js` uses `position:absolute` with anchor-based
  stacking for elements; two elements with the same anchor overlap
  rather than stacking vertically.

## How to pick up the fix in the browser

The patch is to `js/solver/csp_solver.js` + `js/ui/print_preview/*`.
Both load via dynamic ES import (`?v=APP_VER`) or are concatenated into
`js/bundle.js`. Hard-reload (⌘⇧R) the tab and re-run Generate on the
same XML. The Verification panel should now list ~16 unplaced lessons
(visible + actionable) rather than the timetable silently showing
double/triple booking.
