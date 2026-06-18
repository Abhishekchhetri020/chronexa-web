---
title: Chronexa Solver
emoji: 📅
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Chronexa CP-SAT solver backend

OR-Tools CP-SAT timetable solver for the Chronexa app. Implements the
`/solve/start` → `/solve/status` contract that `backend_client.js` speaks.

The code is pulled from the public GitHub repo at build time, so this Space
stays a thin wrapper (just this README + the Dockerfile). To update the solver,
push to GitHub and click **"Factory rebuild"** on the Space.

Point the app at this Space:
`https://<your-app-url>/?backend=https://<your-username>-chronexa-solver.hf.space`

Tuning (Space → Settings → Variables and secrets):
- `CHRONEXA_WORKERS` — CP-SAT worker threads. Free CPU Spaces have ~2 vCPU, so
  `2` is sensible (default in the Dockerfile).
- `CHRONEXA_MIN_SECONDS` — minimum solve budget. Free CPUs are slow; `180`-`240`
  gives the search time to place everything.
