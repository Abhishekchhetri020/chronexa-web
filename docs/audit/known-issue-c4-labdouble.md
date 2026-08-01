# Known issue — backend lab-double regression (cp solver), predating Phase 4

During Phase 4 work on the audit we identified a pre-existing regression:
a simple `isLabDouble=True` lesson on the smallest feasible school
(1 day × 3 periods, single teacher/class/room, periodsPerWeek=2) returns
INFEASIBLE with placed=0 on commit b670349 (2026-07-30 "fix(solver/py):
implement n_5/n_6/n_7, fix n_8/n_10 multi-period, surface bad room locks").
The same shape solved OPTIMAL placed=4 on the previous commit
0dc223e ("fix(solver): break-aware n_0, honest lab-double reason,
zero-weight rules").

Reproduction (on b670349 or later):
    python3 - <<'PY'
    import sys
    sys.path.insert(0, 'backend')
    from app.solver import solve
    s = dict(schoolName='t', daysPerWeek=1,
             bell={'periods':[{'index': i, 'isTeaching': True} for i in range(1,4)]},
             teachers=[{'id':'t1'}], classes=[{'id':'c1'}], classrooms=[{'id':'r1'}],
             subjects=[{'id':'s1'}],
             lessons=[{'id':'LAB','subjectId':'s1','periodsPerWeek':2,
                       'isLabDouble':True,'classIds':['c1'],'teacherIds':['t1']}],
             cards=[], relations=[], settings={})
    r = solve(s, {'timeLimitSec': 3})
    print(r['status'], r['stats'])
    PY

Phase 4 remediates the four kimi audit items (#9, #21, #22 partial, #8).
This lab-double bug is a separate regression — I have NOT chased its root
cause (it's likely in the lesson-expansion / candidate scaffolding added by
b670349's relation set merging around n_8).

Tracked for follow-up. Plan text: read b670349 diff against lab-double
occurrence enumeration, assert any occurrence expansion overwrites of the
isLabDouble span. Hot spots: backend/app/solver.py lesson→occs scaffolding.
