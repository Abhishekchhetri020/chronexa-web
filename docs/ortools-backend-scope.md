# OR-Tools CP-SAT backend — scope (the real path to ~0 unplaced)

The browser JS solver is ~2× slower per node than native and its result is unstable
w.r.t. the speed/phase-split interaction, so on a hard 951-card instance it lands at
16-21 unplaced in the browser even though the same code reaches 3 in node. A server-side
**OR-Tools CP-SAT** solver sidesteps both: native speed + an exact solver that can prove
optimality / reach 0 when feasible.

The app ALREADY has the client wiring (`js/ui/solver_ui/backend_client.js`). It only needs
a server at `window.CHRONEXA_BACKEND_URL`. No app changes required beyond setting that URL.

## API the backend must implement (exact, from backend_client.js)
- `POST /solve/start`  body `{ school, options }`  → `{ jobId }`   (404 ⇒ client falls back to browser)
- `GET  /solve/status/{jobId}` → `{ state: "running"|"done"|"error"|"cancelled",
      progress: { iter, softScore, hardConflicts, backtracks, durationMs },
      result: SolveResponse, error }`
- `POST /solve/cancel/{jobId}`
- `SolveResponse` (same shape the browser returns):
  `{ status, assignment: [{ lessonId, day, period, classroomId }], stats: { placed, unplaced,
     hardConflicts, softScore }, violations, diagnostics }`

## `school` JSON the backend receives (from parse_timetable_xml.js)
- `daysPerWeek`, `bell.periods[]` (teaching grid), `teachers/classes/classrooms/subjects`
- `lessons[]`: `{ id, classIds[], teacherIds[], subjectId, groupIds[], periodsPerWeek,
   requiredRoomType, preferredRoomId, fixedDay, fixedPeriod, isLabDouble, _lessonRoomIds[] }`
- `groups[]`: class subdivisions (`classId, divisionTag, entireClass`) — needed for the
  group-aware "two split-class lessons may share a slot iff disjoint groups within a division".
- `cards[]`: any pre-placed/locked cards (warm start / fixed).

## CP-SAT model sketch
- Var: for each lesson card, `(day, period, room)` — or a Boolean x[lesson, slot, room].
- Hard: teacher no-overlap, class/group no-overlap (group-aware via the divisionTag/mask rule),
  room no-overlap, per-class bell validity, fixed slots, required room type, lab-doubles,
  card relations (same-day / cannot-follow / must-same-day / first-or-last, etc.).
- Objective: maximize placed (or minimize unplaced as a soft term), then the existing soft
  weights (teacher gaps, subject spread, daily limits) mirrored from constraints.js.
- Return: map the CP-SAT assignment back to `assignment[]`; unplaced lessons → diagnostics.

## Stack & hosting
- Python + `ortools` (`pip install ortools`) + FastAPI; jobs in a dict keyed by jobId, solved
  in a background thread; CP-SAT `solver.parameters.max_time_in_seconds` = options.timeLimitSec;
  `num_search_workers` = server cores. CP-SAT streams bound progress → map to `progress`.
- Deploy: any small VM / Fly.io / Render. Set `window.CHRONEXA_BACKEND_URL` (e.g. inject in
  index.html or via a config). HTTPS + permissive CORS for the GitHub-Pages origin.

## Effort
Real but well-defined: ~1-2 days for a first cut (model + server + deploy). The constraint
translation (relations, group masks, lab-doubles) is the bulk; everything else is plumbing.
This is the only path that reliably reaches 0 unplaced on hard instances.
