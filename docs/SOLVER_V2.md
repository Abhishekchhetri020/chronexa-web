# SOLVER v2 — wave-3 changelog

This document describes the wave-3 backend + solver improvements shipped on
2026-05-18. It is the changelog for the work done by **Agent P** (backend job
queue) and **Agent P-bis** (frontend wiring + missing CKrit* constraints).

It complements:

- `docs/SOLVER.md` — Agent C's original CSP solver design
- `docs/SOLVER_UI.md` — Agent G's source-interface contract for the UI
- `docs/DATA_SHAPES.md` — `SolveRequest` / `SolveResponse` shapes

## What shipped

### 1. Backend job-queue API (Agent P)

Three new endpoints, layered on top of the existing synchronous `POST /solve`:

| Endpoint                      | Method | Returns                  | Purpose                                |
| ----------------------------- | ------ | ------------------------ | -------------------------------------- |
| `/solve/start`                | POST   | `{ jobId }`              | Kick off a background solver job       |
| `/solve/status/{jobId}`       | GET    | `SolveStatus`            | Poll job state + progress + result     |
| `/solve/cancel/{jobId}`       | POST   | `{ ok, jobId }`          | Request cancellation of a running job  |

`SolveStatus.state` is one of `queued | running | done | cancelled | error`.
`SolveStatus.progress` carries the Classic-style `{p1, p2, iter,
hardConflicts, softScore, durationMs}` payload. `SolveStatus.result` is the
canonical `SolveResponse` once `state === "done"`.

The synchronous `POST /solve` is preserved for backward compatibility; it now
internally uses the same async machinery but awaits completion before
returning. See `backend/app/main.py::_execute_solve`.

### 2. In-loop solver progress (Agent P-bis)

`js/solver/csp_solver.js` previously emitted progress only via a 250ms
`setInterval` inside `solve()`. That worked but was opaque to the search:
when a branch was busy in JS for >250ms, the UI froze.

Wave-3 changes:

- `solve(school, options)` now reads `options.onProgress` and threads it into
  the `ctx` carried by `backtrack()`.
- A new helper `maybeEmitProgress(ctx, ...)` is called at the **top of every
  `backtrack()` invocation**. It coalesces emissions: it emits when **at
  least 500 iterations** have passed since the last emission **or at least
  500ms wall-clock**, whichever comes first.
- The payload now includes `backtracks` so the progress modal's "Stuck
  counter" (Classic `p_VykaslalSa`) tile can be lit up.
- A wall-clock safety net `setIntervalShim` still ticks every 500ms in case
  the search itself is blocked inside a single tight loop (e.g. constructing
  the candidate scratch list for a giant `feasibleCount`).
- A final flush emits the last snapshot at branch end, so the modal sees the
  closing iter / softScore / backtracks count before `done` arrives.

The progress payload shape is now:

```
{ iter, softScore, hardConflicts, backtracks, durationMs }
```

`backtracks` is optional from older paths but always present from the
solver itself.

### 3. Worker progress throttling (Agent P-bis)

`js/solver/worker.js` previously forwarded every solver `onProgress` call as
a `postMessage`. With the new 500-iter cadence that's already gentle, but
the worker now also coalesces at the postMessage boundary:

- The latest payload is held in a `latest` slot.
- A `setInterval(500ms)` ticker ships `latest` to the main thread.
- An immediate post is also sent if the time since the last post is already
  ≥ 500ms (so we get fast first-frame).
- On termination we flush `latest` one more time before `done`.

### 4. Backend client switches to real polling (Agent P-bis)

`js/ui/solver_ui/backend_client.js` previously synthesized 750ms heartbeat
progress events while awaiting a synchronous `POST /solve`. Wave-3 changes:

- New default cloud path: `POST /solve/start` → poll `GET /solve/status/:id`
  every 1000ms → on `state === "done"` emit `{type:"done", result}`; on
  `error` emit `{type:"error", message}`. Cancellation issues `POST
  /solve/cancel/:id`.
- **Backward compat**: if `POST /solve/start` returns `404`, we fall back to
  the legacy `POST /solve` + 750ms synthesized heartbeat path. This lets the
  same UI work against the old backend during a rollout window.
- The `Source` interface (`{subscribe, cancel, pause, resume, mode}`) is
  unchanged — `progress_modal.js` doesn't see the difference.
- If the backend itself fails (network error, 5xx), `onFallback(why)` is
  invoked and the run quietly hands off to the browser worker.

### 5. Five missing `CKrit*` constraints (Agent P-bis)

`js/solver/constraints.js` now exports five new constraint functions, each
returning `{violations: int, weight: int}`:

| Function                    | Weight  | What it scores                                     |
| --------------------------- | ------- | -------------------------------------------------- |
| `CKritSluzba`               | 50000   | Hall-duty supervisor double-booked                 |
| `CKritCourseGroup`          | 150     | Elective group lessons should coincide in time     |
| `CKritTriedny`              | 10      | Class teacher should teach the last period         |
| `CKritResty`                | 10      | Leftover / unplaced lesson count (substitution)    |
| `CKritVhodneNaSpojenie`     | 150     | Parallel-lesson merge opportunity (room sharing)   |

Weights mirror the original CLASSIC Tabu Search penalty table per
`Chronexa-AUDIT-Master.md` (CKrit* family).

All five functions take `(assignment, lessonsById, schoolData)`. They are
**post-hoc scoring helpers**, not inner-loop checks; they don't bend the
search. They are exposed so the violations panel, the Verification drawer,
and the "Test the timetable" gate can use them.

A new export `CKRIT_FUNCTIONS` (`Object<id, fn>`) lets callers iterate them.

#### Algorithm sketches

- **`CKritSluzba`** — index `assignment` by `(teacherId, day, period)` into a
  set, then walk `schoolData.classroomsupervisions[]`; each row whose
  `(teacherid, day, period)` is also in the set counts as one violation.
- **`CKritCourseGroup`** — for each `coursegroup`, gather the set of
  `(day,period)` slots used by any subject in its `subjectids[]`. If a slot
  hosts fewer than `subjectids.length` lessons, count the missing slots —
  this proxies for "students would need to be in two places at once."
- **`CKritTriedny`** — read each class's `classTeacherId` (we tolerate
  `teacherid` / `classteacher` for shape variance), then for every day the
  class has lessons, check who occupies the last teaching period. One
  violation per day where the occupant is not the class-teacher.
- **`CKritResty`** — count lessons present in `lessonsById` (or fallback
  `schoolData.lessons`) but not in `assignment`. One violation per
  unplaced lesson.
- **`CKritVhodneNaSpojenie`** — bucket assignments by `(day, period,
  subjectId)`. For every pair of cross-class entries in the same bucket,
  if `classroomId` differs, count one violation.

## Source-interface compatibility

The UI's `Source` contract from `docs/SOLVER_UI.md` is unchanged:

```js
const source = SolverUI.run({ school, options, algorithm });
// source = { subscribe(cb), cancel(), pause(), resume(), mode }
```

Subscribe events stay the same except `progress` events now optionally carry
`backtracks`.

## Verification

- Browser solver test page (`js/solver/__tests__/solver.test.html`) still
  passes all 3 fixtures.
- The async cloud path was validated against the v2 backend (Agent P's job
  queue). On a backend that doesn't yet expose `/solve/start`, the client
  falls back to the synchronous `POST /solve` heartbeat path without any UI
  changes.

## File map

| File                                              | Wave-3 change                                           |
| ------------------------------------------------- | ------------------------------------------------------- |
| `backend/app/main.py`                             | `/solve/start`, `/solve/status/:id`, `/solve/cancel/:id` |
| `backend/app/jobs.py`                             | In-memory job registry + cancel hook                    |
| `js/solver/csp_solver.js`                         | In-loop `maybeEmitProgress` + `backtracks` in payload    |
| `js/solver/worker.js`                             | 500ms coalesced postMessage                              |
| `js/solver/constraints.js`                        | `CKritSluzba`, `CKritCourseGroup`, `CKritTriedny`, `CKritResty`, `CKritVhodneNaSpojenie` |
| `js/ui/solver_ui/backend_client.js`               | `/solve/start` + polling, 404 → sync heartbeat fallback  |
| `docs/SOLVER_V2.md`                               | This file                                                |


<!-- Chronexa Web -->
