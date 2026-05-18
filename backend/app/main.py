"""Chronexa Web — FastAPI backend.

Endpoints:
- GET  /health  → service health + versions
- POST /solve   → run the OR-Tools CP-SAT solver against a SchoolData payload

CORS: open to the GitHub Pages frontend and to localhost dev servers.
Logging: stdout (captured by Docker); each request gets a request_id.
"""

from __future__ import annotations

import logging
import os
import sys
import time
import uuid
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import solver as solver_module

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


@app.post("/solve", response_model=SolveResponse)
async def solve(req: SolveRequest, request: Request) -> SolveResponse:
    rid = getattr(request.state, "request_id", "-")
    LOG.info("rid=%s solve lessons=%d teachers=%d classes=%d",
             rid, len(req.school.lessons), len(req.school.teachers), len(req.school.classes))
    payload = req.school.model_dump()
    opts = req.options.model_dump() if req.options else {}
    try:
        result = solver_module.solve(payload, opts)
    except Exception as exc:
        LOG.exception("rid=%s solver crashed: %s", rid, exc)
        return SolveResponse(
            status="ERROR",
            assignment=[],
            stats=SolveStats(placed=0, unplaced=0, hardConflicts=0, softScore=0, durationMs=0),
            violations=[Violation(ruleId="solver-crash", description=str(exc))],
        )
    return SolveResponse(**result)


# --- entrypoint ----------------------------------------------------------

if __name__ == "__main__":  # pragma: no cover
    import uvicorn  # type: ignore[import-untyped]

    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=False)
