# Chronexa CP-SAT backend

Server-side timetable solver using **OR-Tools CP-SAT**. Drop-in for the app's
existing cloud path (`js/ui/solver_ui/backend_client.js`) — no app code changes,
just point `window.CHRONEXA_BACKEND_URL` at this server.

## Why
The in-browser JS solver is ~5× environment-sensitive and lands at 16-21 unplaced
on the demo (path-dependent local search across V8 environments). CP-SAT runs
natively, server-side, and reaches **950/951 (1 unplaced) in 60s** on the same
file — and can prove a bound. Measured on the bundled demo (951 cards):

| solver | unplaced |
|---|---|
| browser JS (worker) | 16-21 |
| node JS | 3 |
| **CP-SAT backend @60s** | **1** |
| **CP-SAT backend @120s** | **1** (bound still improving) |

## Run (local dev)
```bash
cd backend
python3.13 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8088
```

Then in the app (browser console, or inject in index.html before the bundle):
```js
window.CHRONEXA_BACKEND_URL = "http://127.0.0.1:8088";
```
and pick **Run on cloud** in the Generate pre-launch dialog. The app POSTs
`{school, options}` to `/solve/start`, polls `/solve/status/{jobId}`, and applies
the returned assignment.

## API (what backend_client.js speaks)
- `POST /solve/start`  `{school, options}` → `{jobId}`
- `GET  /solve/status/{jobId}` → `{state: running|done|error|cancelled, progress:{iter,softScore,hardConflicts,durationMs}, result, error}`
- `POST /solve/cancel/{jobId}` → `{ok}`
- `GET  /health`
- `result` = `{status, assignment:[{lessonId,day,period,classroomId}], stats:{placed,unplaced,hardConflicts,softScore,...}, violations}`

`options.timeLimitSec` (default 30; use ≥30 — CP-SAT presolve on this model size
needs ~20s before the warm-start hint kicks in), `options.numWorkers` (default 8),
`options.seed`.

## Model (solver_cpsat.py)
- Each lesson expanded into `periodsPerWeek` cards; each card placed in ≤1 (day,period)
  slot — and one room for room-requiring lessons. Objective: maximize placed.
- Hard constraints mirror the JS FAIL semantics: teacher no-overlap; **group-aware**
  class no-overlap (two cards on a class conflict iff either is whole-class, or
  different divisions, or same group in a division); room no-overlap; fixed slots.
- **Warm-start hint** from `school.cards` (the saved/known solution) + **symmetry
  breaking** on interchangeable same-lesson cards — these two together take the 30s
  result from 921 → 948.

## Deploy
Any small VM / Fly.io / Render. Pin to HTTPS, set CORS to the Pages origin (currently
`*` in server.py — tighten for production), and set `window.CHRONEXA_BACKEND_URL`.

## Not yet modeled (incremental — add as needed)
Soft objectives (teacher gaps, subject spread), card relations (same-day / cannot-follow /
etc.), lab-doubles, per-class bell restrictions, max-per-day, subject daily limits.
The demo file doesn't exercise most of these; add them by mirroring `constraints.js`.
