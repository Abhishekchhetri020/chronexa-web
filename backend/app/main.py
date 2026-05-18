"""Chronexa Web — FastAPI backend.

Endpoints:
- GET  /health                 → service health + versions
- POST /solve                  → SYNC solver (backward compatible); under the
                                  hood it now uses the async machinery.
- POST /solve/start            → start a background solver job, return jobId
- GET  /solve/status/{jobId}   → poll job state + progress (+ result when done)
- POST /solve/cancel/{jobId}   → request cancellation of a running job

CORS: open to the GitHub Pages frontend and to localhost dev servers.
Logging: stdout (captured by Docker); each request gets a request_id.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
import uuid
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import solver as solver_module
from .jobs import REGISTRY, Job

# --- version + logging ---------------------------------------------------

APP_VERSION = "0.1.0"


def _ortools_version() -> str:
    try:
        from ortools import __version__ as v  # type: ignore[attr-defined]
        return str(v)
    except Exception:
        return "unknown"


def _make_logger() -> logging.Logger:
    log_level = (os.getenv("LOG_LEVEL") or "INFO").upper()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s"
    ))
    root = logging.getLogger()
    # Avoid duplicate handlers under uvicorn reload.
    root.handlers = [handler]
    root.setLevel(log_level)
    return logging.getLogger("chronexa.api")


LOG = _make_logger()


# --- pydantic models (mirror DATA_SHAPES.md) -----------------------------

class BellPeriod(BaseModel):
    index: int
    label: str
    startMin: int
    endMin: int
    isTeaching: bool = True


class Bell(BaseModel):
    periods: List[BellPeriod]


class Teacher(BaseModel):
    id: str
    name: str
    abbr: Optional[str] = None
    maxGapsPerDay: Optional[int] = None
    maxConsecutivePeriods: Optional[int] = None
    timeOff: Optional[Dict[str, Literal["available", "preferred", "unavailable"]]] = None


class ClassSection(BaseModel):
    id: str
    name: str


class SchoolClass(BaseModel):
    id: str
    name: str
    sections: Optional[List[ClassSection]] = None


class Classroom(BaseModel):
    id: str
    name: str
    capacity: Optional[int] = None
    roomType: Optional[str] = None


class Subject(BaseModel):
    id: str
    name: str
    abbr: Optional[str] = None


class Lesson(BaseModel):
    id: str
    classIds: List[str]
    teacherIds: List[str]
    subjectId: str
    periodsPerWeek: int
    requiredRoomType: Optional[str] = None
    preferredRoomId: Optional[str] = None
    fixedDay: Optional[int] = None
    fixedPeriod: Optional[int] = None
    isLabDouble: Optional[bool] = None


class Card(BaseModel):
    lessonId: str
    day: int
    period: int
    classroomId: Optional[str] = None


class SchoolData(BaseModel):
    schoolName: str
    bell: Bell
    teachers: List[Teacher]
    classes: List[SchoolClass]
    classrooms: List[Classroom]
    subjects: List[Subject]
    lessons: List[Lesson]
    cards: Optional[List[Card]] = None


class SolveOptions(BaseModel):
    algorithm: Optional[Literal["browser-csp", "or-tools-cpsat"]] = "or-tools-cpsat"
    timeLimitSec: Optional[float] = 60.0
    seed: Optional[int] = 1
    verbose: Optional[bool] = False


class SolveRequest(BaseModel):
    school: SchoolData
    options: Optional[SolveOptions] = None


class AssignmentEntry(BaseModel):
    lessonId: str
    day: int
    period: int
    classroomId: Optional[str] = None
    teacherId: str
    classIds: List[str]


class SolveStats(BaseModel):
    placed: int
    unplaced: int
    hardConflicts: int
    softScore: int
    durationMs: int


class Violation(BaseModel):
    ruleId: str
    description: str


class SolveResponse(BaseModel):
    status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "TIMEOUT", "ERROR"]
    assignment: List[AssignmentEntry]
    stats: SolveStats
    violations: Optional[List[Violation]] = None


class SolveJobAck(BaseModel):
    jobId: str


class SolveProgress(BaseModel):
    p1: float = 0.0
    p2: float = 0.0
    iter: int = 0
    hardConflicts: int = 0
    softScore: int = 0
    durationMs: int = 0


class SolveStatus(BaseModel):
    state: Literal["queued", "running", "done", "cancelled", "error"]
    progress: SolveProgress
    result: Optional[SolveResponse] = None
    error: Optional[str] = None


# --- app -----------------------------------------------------------------

app = FastAPI(
    title="Chronexa Web Solver",
    version=APP_VERSION,
    description="OR-Tools CP-SAT timetable solver for Chronexa Web.",
)


def _cors_origins() -> List[str]:
    """Build the CORS origin list.

    Defaults: production frontend on GitHub Pages + common localhost dev ports.
    Override with CORS_ORIGINS env var (comma-separated).
    """
    raw = os.getenv("CORS_ORIGINS")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [
        "https://abhishekchhetri020.github.io",
        "http://localhost:8000",
        "http://localhost:5173",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:5173",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    request.state.request_id = rid
    start = time.perf_counter()
    LOG.info("rid=%s %s %s start", rid, request.method, request.url.path)
    try:
        response = await call_next(request)
    except Exception as exc:  # pragma: no cover
        dur = (time.perf_counter() - start) * 1000.0
        LOG.exception("rid=%s %s %s error after %.1fms: %s",
                      rid, request.method, request.url.path, dur, exc)
        return JSONResponse(status_code=500, content={"error": str(exc), "requestId": rid})
    dur = (time.perf_counter() - start) * 1000.0
    response.headers["X-Request-ID"] = rid
    LOG.info("rid=%s %s %s done %d in %.1fms",
             rid, request.method, request.url.path, response.status_code, dur)
    return response


@app.get("/health")
async def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "version": APP_VERSION,
        "ortools_version": _ortools_version(),
    }


def _run_solver_blocking(
    payload: Dict[str, Any],
    opts: Dict[str, Any],
    job: Optional[Job],
    time_limit: float,
) -> Dict[str, Any]:
    """CPU-bound wrapper. Called inside a threadpool from the async path."""
    on_progress = None
    cancel_check = None
    if job is not None:
        time_limit_ms = max(1.0, time_limit) * 1000.0

        def _on_prog(p: Dict[str, Any]) -> None:
            # Map durationMs into the EduPage-style p1 bar (overall progress).
            dt = float(p.get("durationMs") or 0)
            p1 = min(1.0, dt / time_limit_ms)
            payload = dict(p)
            payload["p1"] = p1
            # p2 is "current branch" — we don't expose branches per-solve,
            # but a sawtooth of the iter counter keeps the UI lively.
            payload["p2"] = float(int(p.get("iter") or 0) % 1000) / 1000.0
            job.set_progress(payload)

        on_progress = _on_prog
        cancel_check = job.cancel_requested
    return solver_module.solve(payload, opts, on_progress=on_progress, cancel_check=cancel_check)


async def _execute_solve(req: SolveRequest, job: Optional[Job], rid: str) -> Dict[str, Any]:
    """Top-level async solver runner. Used by both /solve and /solve/start."""
    payload = req.school.model_dump()
    opts = req.options.model_dump() if req.options else {}
    time_limit = float((opts.get("timeLimitSec") or 60.0))
    if job is not None:
        job.mark_running()
    try:
        result = await asyncio.get_running_loop().run_in_executor(
            None, _run_solver_blocking, payload, opts, job, time_limit
        )
    except Exception as exc:
        LOG.exception("rid=%s solver crashed: %s", rid, exc)
        crash = {
            "status": "ERROR",
            "assignment": [],
            "stats": {"placed": 0, "unplaced": 0, "hardConflicts": 0, "softScore": 0, "durationMs": 0},
            "violations": [{"ruleId": "solver-crash", "description": str(exc)}],
        }
        if job is not None:
            job.mark_error(str(exc))
        return crash
    if job is not None:
        # If cancellation was requested mid-solve we still got a result;
        # honor the user's cancel by reporting cancelled state.
        if job.cancel_requested():
            job.mark_cancelled()
        else:
            job.mark_done(result)
    return result


@app.post("/solve", response_model=SolveResponse)
async def solve(req: SolveRequest, request: Request) -> SolveResponse:
    """Synchronous solve. Backward-compatible with v0 clients.

    Internally this now uses the same background-task path as /solve/start
    but awaits its completion before returning.
    """
    rid = getattr(request.state, "request_id", "-")
    LOG.info("rid=%s solve lessons=%d teachers=%d classes=%d",
             rid, len(req.school.lessons), len(req.school.teachers), len(req.school.classes))
    result = await _execute_solve(req, job=None, rid=rid)
    return SolveResponse(**result)


@app.post("/solve/start", response_model=SolveJobAck)
async def solve_start(req: SolveRequest, request: Request) -> SolveJobAck:
    """Kick off a background solver job. Returns immediately with a jobId."""
    rid = getattr(request.state, "request_id", "-")
    job = REGISTRY.create()
    LOG.info("rid=%s solve/start job=%s lessons=%d teachers=%d classes=%d",
             rid, job.id, len(req.school.lessons), len(req.school.teachers), len(req.school.classes))

    async def _runner() -> None:
        try:
            await _execute_solve(req, job=job, rid=rid)
        except asyncio.CancelledError:
            job.mark_cancelled()
            raise
        except Exception as exc:  # pragma: no cover - defensive
            LOG.exception("rid=%s job=%s background runner crashed: %s", rid, job.id, exc)
            job.mark_error(str(exc))

    task = asyncio.create_task(_runner())
    REGISTRY.attach_task(job.id, task)
    return SolveJobAck(jobId=job.id)


@app.get("/solve/status/{job_id}", response_model=SolveStatus)
async def solve_status(job_id: str) -> SolveStatus:
    job = REGISTRY.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"error": "unknown jobId", "jobId": job_id})
    snap = job.snapshot()
    payload: Dict[str, Any] = {
        "state": snap["state"],
        "progress": snap["progress"],
    }
    if "result" in snap and snap["result"] is not None:
        payload["result"] = snap["result"]
    if snap.get("error"):
        payload["error"] = snap["error"]
    return SolveStatus(**payload)


@app.post("/solve/cancel/{job_id}")
async def solve_cancel(job_id: str) -> Dict[str, Any]:
    ok = REGISTRY.cancel(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail={"error": "unknown jobId", "jobId": job_id})
    return {"ok": True, "jobId": job_id}


# --- entrypoint ----------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    import uvicorn  # type: ignore[import-untyped]

    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=False)
