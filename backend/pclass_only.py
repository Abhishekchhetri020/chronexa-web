"""Run Python solver with modified model: only placement + class no-overlap"""
import json, math
from collections import defaultdict
from ortools.sat.python import cp_model

school = json.load(open("/tmp/demo_school.json"))

def _teaching_periods(school):
    ps = [p for p in school["bell"]["periods"] if p.get("isTeaching", True) is not False]
    return [p["index"] for p in ps]

days = list(range(school["daysPerWeek"]))
periods = _teaching_periods(school)
pidx = {p: i for i, p in enumerate(periods)}
slots = [(d, p) for d in days for p in periods]
slot_index = {s: i for i, s in enumerate(slots)}
groups_by_id = {g["id"]: g for g in school.get("groups", [])}

cards = []
for L in school["lessons"]:
    length = 2 if L.get("isLabDouble") else 1
    ppw = int(L.get("periodsPerWeek") or 0)
    ncards = max(1, round(ppw / length)) if ppw > 0 else 0
    teachers = L.get("teacherIds") or []
    classes = L.get("classIds") or []
    cls_occ = {}
    gids = [g for g in (L.get("groupIds") or []) if g in groups_by_id]
    for c in classes:
        mine = [groups_by_id[g] for g in gids if groups_by_id[g].get("classId") == c]
        whole = (not mine) or any(g.get("entireClass") for g in mine)
        if whole:
            cls_occ[c] = ("W", "W")
        else:
            div = mine[0].get("divisionTag", 0)
            gkey = tuple(sorted(g["id"] for g in mine if g.get("divisionTag", 0) == div))
            cls_occ[c] = (("D", div), gkey)
    for _ in range(ncards):
        cards.append({"lesson_id": L["id"], "length": length, "teachers": teachers,
                      "classes": classes, "cls_occ": cls_occ, "rooms": []})

m = cp_model.CpModel()
assign = {}
placed = []
for ci, card in enumerate(cards):
    avars = {}
    for s in slots:
        # Check valid starts
        if card["length"] == 2 and pidx[s[1]] + 1 >= len(periods):
            continue
        avars[s] = m.NewBoolVar(f"a_{ci}_{slot_index[s]}")
    assign[ci] = avars
    pl = m.NewBoolVar(f"p_{ci}")
    m.Add(sum(avars.values()) == pl)
    placed.append(pl)

cls_at = defaultdict(list)
for ci, card in enumerate(cards):
    for s, avar in assign[ci].items():
        d, p = s
        if card["length"] == 1:
            covered = [(d, p)]
        else:
            nxt = pidx[p] + 1
            if nxt >= len(periods): continue
            covered = [(d, p), (d, periods[nxt])]
        for ps in covered:
            for c, (dk, gk) in card["cls_occ"].items():
                cls_at[(c, ps)].append((dk, gk, avar))

for (c, ps), entries in cls_at.items():
    by_div = defaultdict(list)
    by_div_group = defaultdict(list)
    for dk, gk, v in entries:
        by_div[dk].append(v)
        by_div_group[(dk, gk)].append(v)
    for k, vs in by_div_group.items():
        if len(vs) > 1:
            m.Add(sum(vs) <= 1)
    if len(by_div) > 1:
        div_active = []
        for dk, vs in by_div.items():
            da = m.NewBoolVar(f"div_{c}_{slot_index[ps]}_{dk}")
            m.AddMaxEquality(da, vs)
            div_active.append(da)
        m.Add(sum(div_active) <= 1)

m.Maximize(sum(placed))
s = cp_model.CpSolver()
s.parameters.num_search_workers = 8
s.parameters.random_seed = 1
s.parameters.max_time_in_seconds = 30
status = s.Solve(m)
n_placed = 0
if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
    for ci, pl in enumerate(placed):
        if s.Value(pl) == 1: n_placed += 1
print(f"[Python class-only] status={s.StatusName(status)} placed={n_placed}/{len(cards)} wall={s.WallTime():.2f}s")
