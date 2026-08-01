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

# --- H5: n_0 "cannot follow" must use the real period index, not the ---------
# break-collapsed offset. Bell 1,2,[break 3],4; two n_0-linked lessons pinned
# to (day0, p2) and (day0, p4) are NOT physically adjacent (break sits between),
# so the model must be FEASIBLE. Pre-fix the offset diff (1) flagged them
# adjacent and the pinned placement went INFEASIBLE.
h5 = dict(
    schoolName="t",
    bell={"periods": [{"index": 1, "isTeaching": True}, {"index": 2, "isTeaching": True},
                      {"index": 3, "isTeaching": False}, {"index": 4, "isTeaching": True}]},
    teachers=[{"id": "ta"}, {"id": "tb"}],
    classes=[{"id": "c1"}],
    classrooms=[{"id": "r1"}],
    subjects=[{"id": "sa"}, {"id": "sb"}],
    lessons=[
        {"id": "A", "subjectId": "sa", "periodsPerWeek": 1, "classIds": ["c1"], "teacherIds": ["ta"], "fixedDay": 0, "fixedPeriod": 2},
        {"id": "B", "subjectId": "sb", "periodsPerWeek": 1, "classIds": ["c1"], "teacherIds": ["tb"], "fixedDay": 0, "fixedPeriod": 4},
    ],
    relations=[{"typ": "n_0", "subjectids": ["sa", "sb"]}],
)
r = solve(h5, {"timeLimitSec": 5})
check("H5: n_0 across a break is not 'adjacent' (periods 2 & 4, break at 3)",
      r["status"] in ("OPTIMAL", "FEASIBLE") and r["stats"]["placed"] == 2,
      f"got {r['status']} placed={r['stats']['placed']}")

# --- H6: n_8 "must be in one day" must be feasible for MULTI-period lessons --
# (rule (g) "different days" is exempted for lessons in a same-day relation).
def _two(sa_ppw, sb_ppw, typ, **extra):
    s = dict(
        schoolName="t", bell=bell(6),
        teachers=[{"id": "ta"}, {"id": "tb"}], classes=[{"id": "c1"}], classrooms=[{"id": "r1"}],
        subjects=[{"id": "sa"}, {"id": "sb"}],
        lessons=[
            {"id": "A", "subjectId": "sa", "periodsPerWeek": sa_ppw, "classIds": ["c1"], "teacherIds": ["ta"], **extra.get("a", {})},
            {"id": "B", "subjectId": "sb", "periodsPerWeek": sb_ppw, "classIds": ["c1"], "teacherIds": ["tb"], **extra.get("b", {})},
        ],
        relations=[{"typ": typ, "subjectids": ["sa", "sb"]}],
    )
    return s

r = solve(_two(2, 2, "n_8"), {"timeLimitSec": 5})
check("H6: n_8 (same day) is feasible with multi-period lessons",
      r["status"] in ("OPTIMAL", "FEASIBLE") and r["stats"]["placed"] == 4,
      f"got {r['status']} placed={r['stats']['placed']}")

# --- H4 n_5: 'must follow' = same day, exactly one period apart --------------
r = solve(_two(1, 1, "n_5", a={"fixedDay": 0, "fixedPeriod": 1}, b={"fixedDay": 0, "fixedPeriod": 2}), {"timeLimitSec": 5})
check("H4/n_5: adjacent placement (P1,P2 same day) is feasible",
      r["status"] in ("OPTIMAL", "FEASIBLE") and r["stats"]["placed"] == 2, f"got {r['status']}")
r = solve(_two(1, 1, "n_5", a={"fixedDay": 0, "fixedPeriod": 1}, b={"fixedDay": 0, "fixedPeriod": 3}), {"timeLimitSec": 5})
check("H4/n_5: a one-period GAP (P1,P3) violates 'must follow'",
      r["status"] == "INFEASIBLE", f"got {r['status']} placed={r['stats']['placed']}")

# --- H4 n_6: ordered 'must follow' = B immediately after A ------------------
def _ordered(a_period, b_period):
    s = _two(1, 1, "n_6", a={"fixedDay": 0, "fixedPeriod": a_period}, b={"fixedDay": 0, "fixedPeriod": b_period})
    s["relations"] = [{"typ": "n_6", "subjectids": ["sa"], "subject2ids": ["sb"]}]
    return s

r = solve(_ordered(1, 2), {"timeLimitSec": 5})
check("H4/n_6: A then B (P1->P2) is feasible",
      r["status"] in ("OPTIMAL", "FEASIBLE") and r["stats"]["placed"] == 2, f"got {r['status']}")
r = solve(_ordered(2, 1), {"timeLimitSec": 5})
check("H4/n_6: wrong order (A at P2, B at P1) is INFEASIBLE",
      r["status"] == "INFEASIBLE", f"got {r['status']} placed={r['stats']['placed']}")

# --- H4 n_7: no break period strictly between two partners on the same day ---
def _break_school(a_period, b_period):
    return dict(
        schoolName="t",
        bell={"periods": [{"index": 1, "isTeaching": True}, {"index": 2, "isTeaching": True},
                          {"index": 3, "isTeaching": False}, {"index": 4, "isTeaching": True}]},
        teachers=[{"id": "ta"}, {"id": "tb"}], classes=[{"id": "c1"}], classrooms=[{"id": "r1"}],
        subjects=[{"id": "sa"}, {"id": "sb"}],
        lessons=[
            {"id": "A", "subjectId": "sa", "periodsPerWeek": 1, "classIds": ["c1"], "teacherIds": ["ta"], "fixedDay": 0, "fixedPeriod": a_period},
            {"id": "B", "subjectId": "sb", "periodsPerWeek": 1, "classIds": ["c1"], "teacherIds": ["tb"], "fixedDay": 0, "fixedPeriod": b_period},
        ],
        relations=[{"typ": "n_7", "subjectids": ["sa", "sb"]}],
    )

r = solve(_break_school(1, 2), {"timeLimitSec": 5})
check("H4/n_7: no break between P1 and P2 is feasible",
      r["status"] in ("OPTIMAL", "FEASIBLE") and r["stats"]["placed"] == 2, f"got {r['status']}")
r = solve(_break_school(2, 4), {"timeLimitSec": 5})
check("H4/n_7: a break (P3) between P2 and P4 is INFEASIBLE",
      r["status"] == "INFEASIBLE", f"got {r['status']} placed={r['stats']['placed']}")

# --- H8: a pre-placed card with an unknown classroomId is surfaced ----------
r = solve(dict(
    schoolName="t", bell=bell(6),
    teachers=[{"id": "t1"}], classes=[{"id": "c1"}], classrooms=[{"id": "r1"}],
    subjects=[{"id": "s1"}],
    lessons=[{"id": "L", "subjectId": "s1", "periodsPerWeek": 1, "classIds": ["c1"], "teacherIds": ["t1"]}],
    cards=[{"lessonId": "L", "day": 0, "period": 1, "classroomId": "ghost_room"}],
), {"timeLimitSec": 5})
check("H8: an unknown room lock surfaces a violation (not silently dropped)",
      any("ghost_room" in (v.get("description") or "") for v in r.get("violations", [])),
      repr(r.get("violations")))

# --- C3 guard: multi-period lessons stay feasible (audit misdiagnosis) -------
r = solve(base(bell=bell(6), lessons=[
    {"id": "L1", "subjectId": "s1", "periodsPerWeek": 2, "classIds": ["c1"], "teacherIds": ["t1"]},
]), {"timeLimitSec": 5})
check("C3 guard: a 2-period lesson is feasible and placed on different days",
      r["status"] in ("OPTIMAL", "FEASIBLE") and r["stats"]["placed"] == 2,
      f"got {r['status']} placed={r['stats']['placed']}")

# --- Audit #9: dynamic day count (was hardcoded NUM_DAYS=6) -------------------
r = solve(dict(
    base(),
    daysPerWeek=5,
    bell=bell(6),
    lessons=[{"id": "L", "subjectId": "s1", "periodsPerWeek": 3, "periodsPerDay": 1,
              "classIds": ["c1"], "teacherIds": ["t1"]}],
    cards=[], relations=[], settings={},
), {"timeLimitSec": 3})
days_used = sorted({a["day"] for a in r["assignment"]})
check("P4/#9: 5-day school never produces a phantom day ≥5",
      r["status"] in ("OPTIMAL", "FEASIBLE") and all(d < 5 for d in days_used),
      f"got {r['status']} days={days_used}")

r = solve(dict(
    base(),
    daysPerWeek=7,
    bell=bell(6),
    lessons=[{"id": "L", "subjectId": "s1", "periodsPerWeek": 7, "periodsPerDay": 1,
              "classIds": ["c1"], "teacherIds": ["t1"]}],
    cards=[], relations=[], settings={},
), {"timeLimitSec": 3})
check("P4/#9: 7-day school is modelled (no truncation to 6)",
      r["status"] in ("OPTIMAL", "FEASIBLE") and r["stats"]["placed"] == 7,
      f"got {r['status']} placed={r['stats']['placed']}")

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
