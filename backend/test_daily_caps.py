"""Cloud CP-SAT parity checks (R3-B4).

Run: backend/.venv/bin/python backend/test_daily_caps.py
Kept as a plain script because the backend has no pytest harness and the JS
suite cannot execute Python.
"""
import sys
from collections import Counter, defaultdict

sys.path.insert(0, "backend")
from solver_cpsat import build_and_solve  # noqa: E402


def solve(ppw=8, teacher_cap=None, class_cap=None):
    sch = {
        "schoolName": "caps", "daysPerWeek": 5, "periodsPerDay": 6,
        "bell": {"periods": [{"index": i, "isTeaching": True} for i in range(1, 7)]},
        "subjects": [{"id": "bio", "name": "Bio"}],
        "teachers": [{"id": "t1", "name": "T1", **({"maxPerDay": teacher_cap} if teacher_cap else {})}],
        "classes": [{"id": "c1", "name": "IX A", **({"maxPerDay": class_cap} if class_cap else {})}],
        "classrooms": [{"id": "r1", "name": "R1"}],
        "lessons": [{"id": "l1", "subjectId": "bio", "teacherIds": ["t1"],
                     "classIds": ["c1"], "periodsPerWeek": ppw}],
        "cards": [], "relations": [], "groups": [],
    }
    out = build_and_solve(sch, time_limit_sec=10, num_workers=4)
    return out, Counter(p["day"] for p in out["assignment"])


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ((" — " + detail) if detail else ""))
    return cond


ok = True

# 1. teacher daily cap binds
out, per_day = solve(ppw=8, teacher_cap=2)
ok &= check("teacher cap 2 is respected", all(v <= 2 for v in per_day.values()), str(dict(per_day)))
ok &= check("teacher cap 2 still places everything", out["stats"]["placed"] == 8, str(out["stats"]))

# 2. class daily cap binds
out, per_day = solve(ppw=8, class_cap=2)
ok &= check("class cap 2 is respected", all(v <= 2 for v in per_day.values()), str(dict(per_day)))

# 3. an impossible cap degrades to unplaced cards, not INFEASIBLE
out, per_day = solve(ppw=8, teacher_cap=1)
ok &= check("impossible cap → OPTIMAL, not INFEASIBLE", out["stats"]["cpStatus"] == "OPTIMAL", out["stats"]["cpStatus"])
ok &= check("impossible cap places what fits (5 days x 1)", out["stats"]["placed"] == 5, str(out["stats"]))
ok &= check("impossible cap leaves the rest unplaced", out["stats"]["unplaced"] == 3, str(out["stats"]))

# 4. aSc constraint keys work as well as top-level fields
sch_cons = {
    "schoolName": "keys", "daysPerWeek": 5, "periodsPerDay": 6,
    "bell": {"periods": [{"index": i, "isTeaching": True} for i in range(1, 7)]},
    "subjects": [{"id": "bio", "name": "Bio"}],
    "teachers": [{"id": "t1", "name": "T1", "constraints": {"lessonsPerDayMax": 2}}],
    "classes": [{"id": "c1", "name": "IX A", "constraints": {"maxperiodsday": 2}}],
    "classrooms": [{"id": "r1", "name": "R1"}],
    "lessons": [{"id": "l1", "subjectId": "bio", "teacherIds": ["t1"], "classIds": ["c1"], "periodsPerWeek": 8}],
    "cards": [], "relations": [], "groups": [],
}
out = build_and_solve(sch_cons, time_limit_sec=10, num_workers=4)
per_day = Counter(p["day"] for p in out["assignment"])
ok &= check("aSc keys honoured (lessonsPerDayMax / maxperiodsday)",
            all(v <= 2 for v in per_day.values()) and out["stats"]["placed"] == 8, str(dict(per_day)))



# --- parity with the browser's HARD rules -----------------------------------
def solve_custom(school, secs=10):
    out = build_and_solve(school, time_limit_sec=secs, num_workers=4)
    return out, Counter(p["day"] for p in out["assignment"])


def base_school():
    return {
        "schoolName": "parity", "daysPerWeek": 5, "periodsPerDay": 6,
        "bell": {"periods": [{"index": i, "isTeaching": True} for i in range(1, 7)]},
        "subjects": [{"id": "games", "name": "Games"}],
        "teachers": [{"id": "t1", "name": "T1"}, {"id": "t2", "name": "T2"}],
        "classes": [{"id": "cA", "name": "IX A"}, {"id": "cB", "name": "IX B"}],
        "classrooms": [{"id": "ground", "name": "Ground"}],
        "lessons": [
            {"id": "la", "subjectId": "games", "teacherIds": ["t1"], "classIds": ["cA"], "periodsPerWeek": 2},
            {"id": "lb", "subjectId": "games", "teacherIds": ["t2"], "classIds": ["cB"], "periodsPerWeek": 2},
        ],
        "cards": [], "relations": [], "groups": [],
    }


# a_15: subject maxParallel caps cards of one subject in the same period.
sch = base_school()
sch["subjects"][0]["maxParallel"] = 1
out, _ = solve_custom(sch)
per_slot = Counter((p["day"], p["period"]) for p in out["assignment"])
ok &= check("a_15 subject cap of 1 never puts two cards in one period",
            all(v <= 1 for v in per_slot.values()), str(dict(per_slot)))

# a_60: cards may only start inside the marked window.
sch = base_school()
sch["relations"] = [{"typ": "a_60", "subjectids": ["games"],
                     "classids": ["cA", "cB"], "positions": {"from": 3, "to": 4}}]
out, _ = solve_custom(sch)
outside = [p for p in out["assignment"] if not (3 <= p["period"] <= 4)]
ok &= check("a_60 window respected (periods 3-4 only)", not outside, str(outside[:3]))
ok &= check("a_60 still places the cards", out["stats"]["placed"] >= 1, str(out["stats"]))

# teacher max consecutive is scored, not hard: the run should stay short.
sch = base_school()
sch["teachers"][0]["maxConsecutivePeriods"] = 1
sch["lessons"] = [
    {"id": "la", "subjectId": "games", "teacherIds": ["t1"], "classIds": ["cA"], "periodsPerWeek": 5},
]
out, _ = solve_custom(sch, secs=15)
per_day = defaultdict(list)
for p in out["assignment"]:
    per_day[p["day"]].append(p["period"])
runs = []
for d, ps in per_day.items():
    ps = sorted(ps)
    run = best = 1
    for a, b in zip(ps, ps[1:]):
        run = run + 1 if b == a + 1 else 1
        best = max(best, run)
    runs.append(best)
ok &= check("teacher max-consecutive 1 keeps runs short", all(r <= 2 for r in runs), str(dict(per_day)))

print("\n" + ("ALL PASS" if ok else "SOME FAILED"))
sys.exit(0 if ok else 1)
