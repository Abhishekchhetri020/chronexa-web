"""
Chronexa solver backend (FastAPI + OR-Tools CP-SAT).

Implements the contract that js/ui/solver_ui/backend_client.js speaks:
  POST /solve/start   {school, options}            -> {jobId}
  GET  /solve/status/{jobId}                        -> {state, progress, result, error}
  POST /solve/cancel/{jobId}                        -> {ok}
  GET  /health                                      -> {ok}

Set window.CHRONEXA_BACKEND_URL in the app to this server's URL.

Run:  ./.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8088
"""
import threading
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from ortools.sat.python import cp_model

import solver_cpsat

app = FastAPI(title="Chronexa CP-SAT backend")

# CORS: the static app is served from GitHub Pages (and localhost during dev).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten to the Pages origin in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# jobId -> dict(state, progress, result, error, cancel_event)
_JOBS = {}
_LOCK = threading.Lock()


def _run_job(job_id, school, options):
    job = _JOBS[job_id]
    cancel_event = job["cancel"]
    t0 = time.time()

    # A CP-SAT callback that streams the best placed-count as progress.
    class _Progress(cp_model.CpSolverSolutionCallback):
        def __init__(self):
            super().__init__()
        def on_solution_callback(self):
            placed = int(self.ObjectiveValue())
            with _LOCK:
                job["progress"] = {
                    "iter": placed,
                    "softScore": 0,
                    "hardConflicts": 0,
                    "durationMs": int((time.time() - t0) * 1000),
                }
            if cancel_event.is_set():
                self.StopSearch()

    try:
        result = solver_cpsat.build_and_solve(
            school,
            time_limit_sec=float(options.get("timeLimitSec", 30)),
            num_workers=int(options.get("numWorkers", 8)),
            seed=int(options.get("seed", 1)),
            progress_cb=_Progress(),
        )
        with _LOCK:
            if cancel_event.is_set():
                job["state"] = "cancelled"
            else:
                job["state"] = "done"
                job["result"] = result
                job["progress"] = {
                    "iter": result["stats"]["placed"],
                    "softScore": 0,
                    "hardConflicts": result["stats"]["unplaced"],
                    "durationMs": int((time.time() - t0) * 1000),
                }
    except Exception as e:  # noqa: BLE001 - surface any model error to the client
        with _LOCK:
            job["state"] = "error"
            job["error"] = f"{type(e).__name__}: {e}"


@app.get("/health")
def health():
    return {"ok": True, "jobs": len(_JOBS)}


@app.post("/solve/start")
async def solve_start(req: Request):
    body = await req.json()
    school = body.get("school")
    options = body.get("options") or {}
    if not school or not school.get("lessons"):
        return {"error": "missing school.lessons"}
    job_id = uuid.uuid4().hex
    _JOBS[job_id] = {
        "state": "running",
        "progress": {"iter": 0, "softScore": 0, "hardConflicts": 0, "durationMs": 0},
        "result": None,
        "error": None,
        "cancel": threading.Event(),
    }
    threading.Thread(target=_run_job, args=(job_id, school, options), daemon=True).start()
    return {"jobId": job_id}


@app.get("/solve/status/{job_id}")
def solve_status(job_id: str):
    job = _JOBS.get(job_id)
    if not job:
        return {"state": "error", "error": "unknown jobId"}
    with _LOCK:
        return {
            "state": job["state"],
            "progress": job["progress"],
            "result": job["result"],
            "error": job["error"],
        }


@app.post("/solve/cancel/{job_id}")
def solve_cancel(job_id: str):
    job = _JOBS.get(job_id)
    if job:
        job["cancel"].set()
    return {"ok": True}
