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

### Options & solve behaviour
- `options.timeLimitSec` — a **max** budget. The server floors it (≥120s for the
  parallel mode) so the search has time to place everything.
- **Stop-at-zero**: the instant all cards are placed, the solver stops and returns
  — placing all cards is provably optimal (you can't place more), so it ends early
  (often 13-90s) and the result is consistently 0 unplaced.
- `options.deterministic: true` → **single worker** = bit-reproducible (same answer
  every run). Slower: floored to 240s because one worker needs ~240s to reach 0 on
  the demo. Default (`false`) → 8 workers, faster, reliably 0, but the parallel race
  means the exact arrangement/time varies (the *count* is still consistently 0).
- `options.seed`, `options.numWorkers` (non-deterministic mode only).

Why "Run on cloud" earlier flickered between 0 / 4 / 6: there was no stop-at-zero and
the 60s budget cut the parallel search off mid-improvement. Both are fixed.

## Model (solver_cpsat.py)
- Each lesson expanded into `periodsPerWeek` cards; each card placed in ≤1 (day,period)
  slot — and one room for room-requiring lessons. Objective: maximize placed.
- Hard constraints mirror the JS FAIL semantics: teacher no-overlap; **group-aware**
  class no-overlap (two cards on a class conflict iff either is whole-class, or
  different divisions, or same group in a division); room no-overlap; fixed slots.
- **Warm-start hint** from `school.cards` (the saved/known solution) + **symmetry
  breaking** on interchangeable same-lesson cards — these two together take the 30s
  result from 921 → 948.

## Deploy (required for the GitHub Pages link to use cloud)
The deployed app is HTTPS; browsers **block** an HTTPS page from calling a local
`http://127.0.0.1` backend (Mixed-Content + Private Network Access). So `localhost`
testing works, but the GitHub link needs the backend on a **public HTTPS** URL.
Tunnels (cloudflared/localtunnel) are unreliable here (DNS-blocked / interstitial),
so deploy it:

```bash
# Fly.io (free tier). Dockerfile + fly.toml are in this dir.
fly launch --copy-config --now      # creates the app + first deploy
fly deploy                          # subsequent deploys
fly status                          # -> https://chronexa-solver.fly.dev
```
or Render: New → Web Service → this repo, root `backend/`, it auto-detects the
Dockerfile. Either gives an HTTPS URL.

Then point the app at it (works from the GitHub link too):
`https://abhishekchhetri020.github.io/chronexa-web/?backend=https://chronexa-solver.fly.dev`
(the `?backend=` param persists to localStorage). Tighten CORS in `server.py`
(`allow_origins`) to your Pages origin for production.

## Not yet modeled (incremental — add as needed)
Soft objectives (teacher gaps, subject spread), card relations (same-day / cannot-follow /
etc.), lab-doubles, per-class bell restrictions, max-per-day, subject daily limits.
The demo file doesn't exercise most of these; add them by mirroring `constraints.js`.
