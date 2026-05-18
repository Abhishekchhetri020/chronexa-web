"""In-memory job registry for asynchronous /solve runs.

Job lifecycle:
    queued → running → done | cancelled | error

This is a deliberately tiny in-process registry. It does not survive a
restart and does not coordinate across workers — but `app.main` runs with
`--workers 1` (see Dockerfile) and the school day fits in a single
process, so this is enough for v1.

The future Redis-backed implementation will swap the storage out behind
the same `JobRegistry.get / set_progress / mark_done` surface — the API
endpoints in `main.py` won't change.
"""

from __future__ import annotations

import asyncio
import threading
import time
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional


# --- progress payload shape ------------------------------------------------
#
# Mirrors what the JS worker emits + what backend_client.js consumes:
#
#   { iter, softScore, hardConflicts, durationMs, backtracks?, p1?, p2? }
#
# `p1` / `p2` are EduPage's overall vs current-branch progress bars (0..1).


def _now_ms() -> int:
    return int(time.perf_counter() * 1000)


class Job:
    """One async solve. Thread-safe for cancel flag + progress writes."""

    __slots__ = (
        "id", "state", "created_at", "started_at", "finished_at",
        "progress", "result", "error", "_cancel", "_lock",
    )

    def __init__(self, job_id: str) -> None:
        self.id = job_id
        self.state: str = "queued"  # queued | running | done | cancelled | error
        self.created_at = _now_ms()
        self.started_at: Optional[int] = None
        self.finished_at: Optional[int] = None
        self.progress: Dict[str, Any] = {
            "p1": 0.0, "p2": 0.0,
            "iter": 0, "hardConflicts": 0, "softScore": 0, "durationMs": 0,
        }
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self._cancel = False
        self._lock = threading.Lock()

    # Cancel flag (read from the CP-SAT callback inside solver.py)
    def request_cancel(self) -> None:
        with self._lock:
            self._cancel = True

    def cancel_requested(self) -> bool:
        with self._lock:
            return self._cancel

    def set_progress(self, payload: Dict[str, Any]) -> None:
        with self._lock:
            # Shallow-merge; never replace untouched keys with None.
            for k, v in payload.items():
                if v is not None:
                    self.progress[k] = v
            self.progress["durationMs"] = (_now_ms() - (self.started_at or self.created_at))

    def mark_running(self) -> None:
        with self._lock:
            self.state = "running"
            self.started_at = _now_ms()

    def mark_done(self, result: Dict[str, Any]) -> None:
        with self._lock:
            if self.state in ("cancelled", "error"):
                return  # terminal already
            self.state = "done"
            self.result = result
            self.finished_at = _now_ms()
            # Snapshot final stats into progress so polled status reflects them.
            stats = result.get("stats") or {}
            for k in ("hardConflicts", "softScore", "durationMs"):
                if k in stats:
                    self.progress[k] = stats[k]
            self.progress["p1"] = 1.0
            self.progress["p2"] = 1.0

    def mark_cancelled(self) -> None:
        with self._lock:
            if self.state == "done":
                return
            self.state = "cancelled"
            self.finished_at = _now_ms()

    def mark_error(self, msg: str) -> None:
        with self._lock:
            self.state = "error"
            self.error = msg
            self.finished_at = _now_ms()

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            out: Dict[str, Any] = {
                "id": self.id,
                "state": self.state,
                "progress": dict(self.progress),
            }
            if self.result is not None:
                out["result"] = self.result
            if self.error:
                out["error"] = self.error
            return out


class JobRegistry:
    """Single in-process registry. Spawns asyncio tasks on `start`."""

    def __init__(self, max_jobs: int = 64) -> None:
        self._jobs: Dict[str, Job] = {}
        self._tasks: Dict[str, "asyncio.Task[Any]"] = {}
        self._lock = threading.Lock()
        self._max_jobs = max_jobs

    def _gc(self) -> None:
        # If we're over budget, drop oldest terminal jobs. Cheap O(n).
        if len(self._jobs) <= self._max_jobs:
            return
        terminals = [
            j for j in self._jobs.values()
            if j.state in ("done", "cancelled", "error") and j.finished_at is not None
        ]
        terminals.sort(key=lambda j: j.finished_at or 0)
        for j in terminals[: max(0, len(self._jobs) - self._max_jobs)]:
            self._jobs.pop(j.id, None)
            self._tasks.pop(j.id, None)

    def create(self) -> Job:
        with self._lock:
            self._gc()
            jid = uuid.uuid4().hex
            job = Job(jid)
            self._jobs[jid] = job
            return job

    def get(self, jid: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(jid)

    def attach_task(self, jid: str, task: "asyncio.Task[Any]") -> None:
        with self._lock:
            self._tasks[jid] = task

    def cancel(self, jid: str) -> bool:
        with self._lock:
            job = self._jobs.get(jid)
            if not job:
                return False
        job.request_cancel()
        task = self._tasks.get(jid)
        if task and not task.done():
            task.cancel()
        return True

    def list_ids(self) -> List[str]:
        with self._lock:
            return list(self._jobs.keys())


# Module-level singleton; FastAPI app imports this.
REGISTRY = JobRegistry()
