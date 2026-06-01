"""Regression tests for the 2026-06-01 audit — Python OR-Tools path.

Run with the ortools venv:
    ~/.cache/chronexa_ortools_venv/bin/python backend/test_audit_regression.py

Covers the verified-real Python findings (C4, H3, H9) plus a guard that the
audit's MISDIAGNOSED C3 (claimed multi-period lessons go INFEASIBLE) stays
feasible — it never was a bug; rule (g) only forces different days.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.solver import solve  # noqa: E402


def bell(n):
    """n teaching periods, 1-based indices 1..n."""
    return {"periods": [{"index": i, "isTeaching": True} for i in range(1, n + 1)]}


def base(**kw):
    return dict(
        schoolName="t",
        teachers=[{"id": "t1", "name": "T1"}],
        classes=[{"id": "c1", "name": "C1"}],
        classrooms=[{"id": "r1", "name": "R1"}],
        subjects=[{"id": "s1", "name": "S1"}],
        **kw,
    )


passed = 0
failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        print("  PASS  " + name)
        passed += 1
    else:
        print("  FAIL  " + name + ("\n          " + detail if detail else ""))
        failed += 1


# --- C4: isLabDouble must occupy two CONSECUTIVE periods ---------------------
r = solve(base(bell=bell(1), lessons=[
    {"id": "LAB", "subjectId": "s1", "periodsPerWeek": 1, "classIds": ["c1"],
     "teacherIds": ["t1"], "isLabDouble": True},
]), {"timeLimitSec": 5})
check("C4a: lab-double cannot fit a 1-period bell (needs 2 consecutive)",
      r["status"] == "INFEASIBLE", f"got {r['status']} placed={r['stats']['placed']}")

r = solve(base(bell=bell(2), lessons=[
    {"id": "LAB", "subjectId": "s1", "periodsPerWeek": 1, "classIds": ["c1"],
     "teacherIds": ["t1"], "isLabDouble": True},
]), {"timeLimitSec": 5})
periods = sorted(a["period"] for a in r["assignment"])
same_day = len({a["day"] for a in r["assignment"]}) == 1
check("C4c: lab-double books two consecutive periods on one day",
      r["status"] in ("OPTIMAL", "FEASIBLE") and periods == [1, 2] and same_day,
      f"got {r['status']} periods={periods} days={[a['day'] for a in r['assignment']]}")

# --- H3 / H9: pre-flight skips surface in a violations list -----------------
r = solve(base(bell=bell(6), lessons=[
    {"id": "OK", "subjectId": "s1", "periodsPerWeek": 1, "classIds": ["c1"], "teacherIds": ["t1"]},
    {"id": "BAD", "subjectId": "s1", "periodsPerWeek": 1, "classIds": ["c1"], "teacherIds": ["ghost"]},
]), {"timeLimitSec": 5})
check("H3: response includes a violations key", "violations" in r, repr(list(r.keys())))
check("H9: the pre-flight-skipped lesson BAD is named in violations",
      any(v.get("lessonId") == "BAD" for v in r.get("violations", [])),
      repr(r.get("violations")))

# --- C3 guard: multi-period lessons stay feasible (audit misdiagnosis) -------
r = solve(base(bell=bell(6), lessons=[
    {"id": "L1", "subjectId": "s1", "periodsPerWeek": 2, "classIds": ["c1"], "teacherIds": ["t1"]},
]), {"timeLimitSec": 5})
check("C3 guard: a 2-period lesson is feasible and placed on different days",
      r["status"] in ("OPTIMAL", "FEASIBLE") and r["stats"]["placed"] == 2,
      f"got {r['status']} placed={r['stats']['placed']}")

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
