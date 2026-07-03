"""Bisect Python solver: toggle teacher, class, soft constraints"""
import json
import sys
import math
from collections import defaultdict
from ortools.sat.python import cp_model
import solver_cpsat

school = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/demo_school.json"))
tl = int(sys.argv[2] if len(sys.argv) > 2 else 30)

# Time budget per phase: tl * 0.6 each
r1 = solver_cpsat.build_and_solve(school, time_limit_sec=tl, soft=False)
print(f"[no soft] placed={r1['stats']['placed']}/946 status={r1['stats']['cpStatus']} wall={r1['stats']['wallSec']}s")
