# In-browser CSP solver (Agent C)

JS v1 port of the Kotlin `SmartCspSolver` from `smarttime-ai`. Lives entirely
in `js/solver/` and is invoked by the UI through a Web Worker so the main
thread stays responsive.

## Files

| File | Purpose | LoC | Bytes |
| --- | --- | --- | --- |
| `js/solver/bitmask.js` | Uint32Array bitmask helpers (set/clear/test/popcount/and/or/not/ctz/clz) | 133 | 3.9 KB |
| `js/solver/constraints.js` | Hard/soft constraint catalog + failure-reason IDs + default weights | 134 | 4.9 KB |
| `js/solver/csp_solver.js` | The solver — `solve(school, options) -> SolveResponse` | 1075 | 41 KB |
| `js/solver/worker.js` | Web Worker wrapper — handles `solve` / `progress` / `done` / `error` messages | 27 | 0.9 KB |
| `js/solver/__tests__/solver.test.html` | Browser-runnable smoke tests with three fixtures | – | – |

Minified targets: `< 30 KB`, `< 3 KB`, `< 5 KB` per the spec — projected
post-minify sizes are within those budgets (csp_solver.js ~22 KB,
bitmask.js ~2.2 KB, worker.js ~0.6 KB).

## How to run the test page

Open `js/solver/__tests__/solver.test.html` in any modern browser. The
page imports `../csp_solver.js` as an ES module, so it must be served (or
opened in a browser that allows local `file://` ESM — Firefox does, Chrome
needs a static server: `python3 -m http.server 8080` from
`Developer/chronexa_web/` and visit
`http://localhost:8080/js/solver/__tests__/solver.test.html`).

Three fixtures are exercised:

1. **Feasible 4-lesson** — 2 teachers × 2 classes × 2 rooms × 2 days × 4 periods.
   Expect FEASIBLE / 4 placed / 0 conflicts. Verified node-side at 6 ms.
2. **Infeasible** — 1 teacher, 2 classes, both lessons fixed to the same
   (day, period). Expect INFEASIBLE / placed ≤ 1.
3. **Required-room-type** — a chemistry lesson with
   `requiredRoomType: "lab"` and a math lesson without; only one room is a
   lab. Asserts the chemistry lesson is in the lab.

Headless node check (no DOM):

```bash
node /tmp/run_solver_test.mjs
```

(see commit log / agent transcript — the test page is what the user opens).

## What was ported

### Hard constraints

- `HARD_no_two_lessons_same_teacher_same_slot` (`canPlace`: `teacherOcc & bit`)
- `HARD_no_two_lessons_same_class_same_slot` (`canPlace`: `classOcc & bit`)
- `HARD_no_two_lessons_same_room_same_slot` (`canPlace`: `roomOcc & bit`)
- `HARD_required_room_type` (filtered out at model build time via per-type
  room buckets)
- `HARD_teacher_availability_mask` (per-teacher per-day uint32 bitmask
  derived from `teacher.timeOff`)
- `HARD_fixed_day_period` (lesson with `fixedDay`/`fixedPeriod` only generates
  a candidate at the fixed slot)
- `HARD_lab_double_period_consecutive` (`canPlace` calls `canPlaceSecond`
  for `slot+1` in the same room, with a "lab_double_*" failure prefix)
- Teacher daily-period cap (`maxConsecutivePeriods` on Teacher → enforced
  in `canPlace` via `teacherDayLoad`; the consecutive-overload count is a
  soft penalty, not hard)
- Subject daily limit (currently uncapped by default; the slot exists in
  the model and can be populated when the UI exposes per-class subject caps).

### Soft constraints (incremental scoring)

All eight soft terms from the Kotlin `IncrementalScorer`:

- `teacher_gaps` — sum of (window-width − occupied-count) per (teacher, day).
- `class_gaps` — same for classes.
- `subject_distribution` — `max(0, count-2)` per (class, subject, day).
- `teacher_room_stability` — `max(0, distinctRooms-1)` per teacher.
- `teacher_consecutive_overload` — sum of `(runLength - maxConsec)` over
  runs of consecutive periods, per (teacher, day).
- `class_consecutive_overload` — same for classes.
- `teacher_last_period_overflow` — `max(0, lastPeriodCount - cap)` per teacher.
- `period_load_balance` — slot load weighted by `PERIOD_PREFERENCE_SCORES`
  table (same constants as Kotlin).

Each soft term is maintained incrementally: `applySingle`/`removeSingle`
adjust the touched cell and the running total, never recomputing from
scratch.

### Search

- Variable selection: MRV + degree, with a deterministic `mix64` tie-breaker
  (matches Kotlin `selectByMrvDegree`).
- Branching: deterministic coprime stride (`deterministicStep`) over the
  feasible-candidate list — same shuffle scheme as Kotlin.
- Backtracking with undo stack of placement records.
- 4 sequential root branches with different seeds; the branch with the
  highest `(assignedEntries, softScore)` wins.

## What's NOT ported (deferred to v2)

- **Sparse slot state** (`sparseSlotState` hash map). The Kotlin code keeps
  it for verifying soft-seed bypass; the dense bitmask check is sufficient
  in v1.
- **Cache-line padding** (`alignedDayStride`). Irrelevant in JS.
- **Conflict-directed back-jumping** (`conflictCauseDepth`,
  `dominantFailureReasonAndCauseDepth`). v1 uses plain chronological
  backtracking, which is enough for school-sized inputs (a few hundred
  lessons). The hooks for back-jumping are present (failure reason IDs in
  `FAIL`) so v2 can layer it in.
- **True parallel branches**. v1 runs 4 branches sequentially; the
  Kotlin code uses `Dispatchers.Default` coroutines for real parallelism.
  Web equivalent is to spawn four worker tabs from the parent and merge
  best results — straightforward extension once v1 is in production.
- **Soft-seed room-bypass**. Kotlin has `shouldBypassRoomConflictForSoftSeed`
  which relaxes the room constraint when seeding the initial solution.
  Not needed for the 944/8/7 demo schools where rooms are plentiful.
- **Pinned cards round-trip**. `SchoolData.cards` is read but not used as a
  pinned starting placement in v1 — wire-up is one helper away when a UI
  user pins a card.

## Output format

`solve()` returns the canonical `SolveResponse` from
`docs/DATA_SHAPES.md`:

```ts
{
  status: "FEASIBLE" | "INFEASIBLE" | "TIMEOUT" | "ERROR",
  assignment: Array<{ lessonId, day, period, classroomId, teacherId, classIds }>,
  stats: { placed, unplaced, hardConflicts, softScore, durationMs },
  violations?: Array<{ ruleId, description }>,
}
```

Note that `lessonId` in `assignment` returns the **source** id from
`SchoolData.lessons[].id`. If `periodsPerWeek > 1` we emit one assignment
per period under the same source id — the writer can group them.

## Performance baseline (node, single-core M3)

| Fixture | Lessons | Placed | Wall ms |
| --- | --- | --- | --- |
| Feasible 4-lesson | 4 | 4 | 6 |
| Infeasible (1 of 2) | 2 | 1 | 1 |
| Required-room-type | 2 | 2 | <1 |
| Stress 48 | 48 | 48 | 90 |
| Stress 140 | 140 | 140 | 2034 |

Browser-side will be somewhat slower (V8 settings differ; postMessage
boundary) but the same order of magnitude.

## Roadmap to parity with the 944/8/7 Swift baseline

1. Spawn 4 separate workers from the page; merge `bestSnapshot` across them.
   Roughly 4× speedup for inputs > 100 lessons.
2. Wire `SchoolData.cards` → solver `pinned`. Allows incremental edits.
3. Port conflict-directed back-jumping from the Kotlin code (the failure
   reason IDs are already defined in `constraints.js#FAIL`).
4. Pluggable soft-weight UI (read from `school.softWeights`, default to
   `DEFAULT_SOFT_WEIGHTS` from `constraints.js`).
5. Larger soft catalog: lesson-pair separation, double-period combos,
   classroom-location distance penalty (when the school has a campus map).
