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
import os
import threading
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

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

    def progress_fn(placed, ms):
        with _LOCK:
            job["progress"] = {
                "iter": placed, "softScore": 0, "hardConflicts": 0,
                "durationMs": int((time.time() - t0) * 1000),
            }

    # deterministic mode -> single worker (reproducible). Otherwise 8 workers
    # (faster to reach all-placed, but the parallel race is non-deterministic).
    # Single-worker needs a longer budget to reach 0, so floor it higher.
    deterministic = bool(options.get("deterministic", False))
    req_time = float(options.get("timeLimitSec", 60))
    if deterministic:
        workers = 1
        time_limit = max(req_time, 240.0)   # 1 worker needs ~240s to hit 0
    else:
        # Default worker count: env CHRONEXA_WORKERS (set this to ~2 on a small
        # free host like Hugging Face), else the request value, else CPU count.
        default_workers = int(os.environ.get("CHRONEXA_WORKERS", os.cpu_count() or 4))
        workers = int(options.get("numWorkers") or default_workers)
        # Slow hosts need longer to reach all-placed; allow a higher floor via env.
        floor = float(os.environ.get("CHRONEXA_MIN_SECONDS", 120))
        time_limit = max(req_time, floor)

    try:
        result = solver_cpsat.build_and_solve(
            school,
            time_limit_sec=time_limit,
            num_workers=workers,
            seed=int(options.get("seed", 1)),
            progress_fn=progress_fn,
            cancel_check=cancel_event.is_set,
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
