"""
Chronexa OR-Tools CP-SAT solver.

Translates the app's `school` JSON (from js/xml/parse_timetable_xml.js) into a
CP-SAT model and returns an assignment in the same shape the browser solver
returns, so the existing backend_client.js consumes it unchanged.

Model
-----
Each lesson is expanded into sessions ("cards"): a lab-double (isLabDouble,
periodspercard=2) becomes one card that occupies TWO consecutive same-day
periods; a single becomes a 1-period card. periodsPerWeek/periodsPerCard cards
per lesson.

Hard constraints (mirror the JS solver's FAIL semantics):
  - teacher / room no-overlap, per occupied period
  - class no-overlap, GROUP-AWARE (whole-class vs division vs group)
  - lab-double = two consecutive periods, same day, same room
  - subject per-day cap = ceil(sessions / days)  (the EVS even-spread rule:
    6/wk -> 1/day, 7/wk -> one day gets 2)
  - fixed day/period

Soft objective (minimized after placement, weights mirror DEFAULT_SOFT_WEIGHTS):
  - teacher_gaps (50)        idle gaps in a teacher's day
  - subject back-to-back (20) two singles of one class+subject in adjacent periods
  - period_load_balance (10) even number of lessons per day per class

Objective = maximize  PLACE_W * placed - soft_penalty   (lexicographic: a card
placed always beats any soft gain), so it still drives to 0 unplaced first.
"""
import math
from collections import defaultdict
from ortools.sat.python import cp_model


def _teaching_periods(school):
    ps = [p for p in school["bell"]["periods"] if p.get("isTeaching", True) is not False]
    return [p["index"] for p in ps]


def build_and_solve(school, time_limit_sec=30, num_workers=8, seed=1,
                    progress_fn=None, cancel_check=None, soft=True, gaps=False):
    days = list(range(school["daysPerWeek"]))
    ndays = len(days)
    periods = _teaching_periods(school)                 # e.g. [1..7]
    pidx = {p: i for i, p in enumerate(periods)}        # period value -> 0-based index
    slots = [(d, p) for d in days for p in periods]
    slot_index = {s: i for i, s in enumerate(slots)}

    groups_by_id = {g["id"]: g for g in school.get("groups", [])}

    # ---- expand lessons into session-cards -------------------------------
    cards = []
    for L in school["lessons"]:
        length = 2 if L.get("isLabDouble") else 1
        ppw = int(L.get("periodsPerWeek") or 0)
        ncards = max(1, round(ppw / length)) if ppw > 0 else 0
        teachers = L.get("teacherIds") or []
        classes = L.get("classIds") or []
        subject = L.get("subjectId")
        # class -> (divkey, groupkey): "W" = whole class
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
        rooms = list(L.get("_lessonRoomIds") or [])
        fixed_day = L.get("fixedDay")
        fixed_period = L.get("fixedPeriod")
        for _ in range(ncards):
            cards.append({
                "lesson_id": L["id"], "subject": subject, "length": length,
                "teachers": teachers, "classes": classes, "cls_occ": cls_occ,
                "rooms": rooms, "fixed_day": fixed_day, "fixed_period": fixed_period,
            })

    m = cp_model.CpModel()

    def valid_starts(card):
        out = []
        for (d, p) in slots:
            if card["fixed_day"] is not None and d != card["fixed_day"]:
                continue
            if card["fixed_period"] is not None and p != card["fixed_period"]:
                continue
            if card["length"] == 2 and pidx[p] + 1 >= len(periods):
                continue  # a double cannot start at the last teaching period
            out.append((d, p))
        return out

    def cover(card, start):
        d, p = start
        if card["length"] == 1:
            return [(d, p)]
        return [(d, p), (d, periods[pidx[p] + 1])]

    # assign[ci][start] bool ; placed[ci] ; yroom[(ci,start,room)]
    assign = {}
    placed = []
    yroom = {}
    for ci, card in enumerate(cards):
        vs = valid_starts(card)
        avars = {}
        if card["rooms"]:
            for s in vs:
                rs = []
                for r in card["rooms"]:
                    v = m.NewBoolVar(f"y_{ci}_{slot_index[s]}_{r}")
                    yroom[(ci, s, r)] = v
                    rs.append(v)
                a = m.NewBoolVar(f"a_{ci}_{slot_index[s]}")
                m.Add(a == sum(rs))
                avars[s] = a
        else:
            for s in vs:
                avars[s] = m.NewBoolVar(f"a_{ci}_{slot_index[s]}")
        assign[ci] = avars
        pl = m.NewBoolVar(f"p_{ci}")
        m.Add(sum(avars.values()) == pl)
        placed.append(pl)

    # ---- occupancy maps over occupied (period) slots ---------------------
    t_occ = defaultdict(list)               # (teacher, ps) -> [vars]
    room_occ = defaultdict(list)            # (room, ps) -> [vars]
    cls_at = defaultdict(list)              # (class, ps) -> [(divkey, groupkey, var)]
    for ci, card in enumerate(cards):
        for start, avar in assign[ci].items():
            covered = cover(card, start)
            for ps in covered:
                for t in card["teachers"]:
                    t_occ[(t, ps)].append(avar)
                for c, (dk, gk) in card["cls_occ"].items():
                    cls_at[(c, ps)].append((dk, gk, avar))
            if card["rooms"]:
                for r in card["rooms"]:
                    yv = yroom[(ci, start, r)]
                    for ps in covered:
                        room_occ[(r, ps)].append(yv)

    for key, vs in t_occ.items():
        if len(vs) > 1:
            m.Add(sum(vs) <= 1)
    for key, vs in room_occ.items():
        if len(vs) > 1:
            m.Add(sum(vs) <= 1)

    # group-aware class no-overlap, per occupied slot
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

    # ---- subject even-spread (SOFT) --------------------------------------
    # Ideal per-day cap = ceil(sessions / days): 6/wk -> 1/day, 7/wk -> 2 on one
    # day. NOTE: this is SOFT, not hard — even the reference (ASC) solution must
    # put 2 of a 6/wk subject on a day in ~86 cases to place everything, so a
    # hard cap forces cards unplaced. Soft lets it spread wherever possible and
    # double-up only when the instance demands it.
    ncards_cs = defaultdict(int)
    for card in cards:
        for c in card["classes"]:
            ncards_cs[(c, card["subject"])] += 1
    cap_cs = {k: max(1, math.ceil(v / ndays)) for k, v in ncards_cs.items()}
    csd = defaultdict(list)                 # (class, subject, day) -> [start vars]
    for ci, card in enumerate(cards):
        for c in card["classes"]:
            for start, avar in assign[ci].items():
                csd[(c, card["subject"], start[0])].append(avar)

    # ---- symmetry breaking + warm-start hint -----------------------------
    lesson_cards = defaultdict(list)
    for ci, card in enumerate(cards):
        lesson_cards[card["lesson_id"]].append(ci)
    NOSLOT = len(slots) + 1
    slotidx_var = {}
    for ci, card in enumerate(cards):
        sv = m.NewIntVar(0, NOSLOT, f"si_{ci}")
        m.Add(sv == sum(slot_index[s] * v for s, v in assign[ci].items())
              + NOSLOT * (1 - placed[ci]))
        slotidx_var[ci] = sv
    for lid, cis in lesson_cards.items():
        for a, b in zip(cis, cis[1:]):
            m.Add(slotidx_var[a] < slotidx_var[b])

    saved = defaultdict(list)
    for c in (school.get("cards") or []):
        if c.get("day") is not None and c.get("period") is not None:
            saved[c["lessonId"]].append(c)
    for lid, cis in lesson_cards.items():
        sc = sorted(saved.get(lid, []), key=lambda c: (c["day"], c["period"]))
        if not sc:
            continue
        length = cards[cis[0]]["length"]
        starts = sc[::length]   # for doubles take the first period of each pair
        for ci, card in zip(cis, starts):
            s = (card["day"], card["period"])
            if s in assign[ci]:
                m.AddHint(assign[ci][s], 1)
                rm = card.get("classroomId")
                if rm and (ci, s, rm) in yroom:
                    m.AddHint(yroom[(ci, s, rm)], 1)

    # ---- soft objective --------------------------------------------------
    soft_terms = []   # list of (weight, IntVar/expr) to MINIMIZE
    if soft:
        # Lexicographic via weight ratios: spread >> back-to-back >> balance >>
        # teacher-gaps. Gaps are the cheapest to sacrifice and the slowest to
        # optimize, so they act as a tiebreaker that never degrades spread.
        W_SPREAD, W_B2B, W_BAL, W_GAP = 1000, 200, 30, 1

        # subject even-spread: penalize each session over the ideal per-day cap.
        for (c, subj, d), vs in csd.items():
            cap = cap_cs[(c, subj)]
            if len(vs) > cap:
                over = m.NewIntVar(0, len(periods), f"sp_{c}_{subj}_{d}")
                m.Add(over >= sum(vs) - cap)
                soft_terms.append((W_SPREAD, over))

        # period-slot busy expression per teacher (0/1 thanks to no-overlap)
        # teacher_gaps: an interior empty period between two busy ones.
        # busy[t][d][i] expression
        for t in ({t for card in cards for t in card["teachers"]} if gaps else ()):
            for d in days:
                busy = []
                for p in periods:
                    vs = t_occ.get((t, (d, p)), [])
                    busy.append(sum(vs) if vs else 0)
                # prefix OR (any busy at <= i) and suffix OR (any busy at >= i)
                n = len(periods)
                pre = [m.NewBoolVar(f"pre_{t}_{d}_{i}") for i in range(n)]
                suf = [m.NewBoolVar(f"suf_{t}_{d}_{i}") for i in range(n)]
                for i in range(n):
                    terms_pre = busy[:i + 1]
                    terms_suf = busy[i:]
                    # pre[i] = OR(busy[0..i]) ; encode pre[i] >= each, pre[i] <= sum
                    m.Add(pre[i] <= sum(terms_pre))
                    for b in terms_pre:
                        m.Add(pre[i] >= b)
                    m.Add(suf[i] <= sum(terms_suf))
                    for b in terms_suf:
                        m.Add(suf[i] >= b)
                for i in range(n):
                    g = m.NewBoolVar(f"gap_{t}_{d}_{i}")
                    # gap if surrounded by busy but not busy here
                    m.Add(g <= pre[i])
                    m.Add(g <= suf[i])
                    m.Add(g + busy[i] <= 1)
                    m.Add(g >= pre[i] + suf[i] - busy[i] - 1)
                    soft_terms.append((W_GAP, g))

        # subject back-to-back (singles of same class+subject in adjacent periods)
        # only matters where the per-day cap allows >=2.
        cs_at = defaultdict(list)   # (class, subject, d, p) -> [single start vars]
        for ci, card in enumerate(cards):
            if card["length"] != 1:
                continue
            for c in card["classes"]:
                for start, avar in assign[ci].items():
                    cs_at[(c, card["subject"], start[0], start[1])].append(avar)
        for (c, subj, d, p), vs in cs_at.items():
            if pidx[p] + 1 >= len(periods):
                continue
            nxt = periods[pidx[p] + 1]
            vs2 = cs_at.get((c, subj, d, nxt))
            if not vs2:
                continue
            here = sum(vs)
            there = sum(vs2)
            b2b = m.NewBoolVar(f"b2b_{c}_{subj}_{d}_{p}")
            m.Add(b2b >= here + there - 1)
            soft_terms.append((W_B2B, b2b))

        # period_load_balance: penalize a class having too many lessons on one day
        # (soft cap at ceil(total_class_cards / days) + 0).
        class_day = defaultdict(list)
        class_total = defaultdict(int)
        for ci, card in enumerate(cards):
            for c in card["classes"]:
                class_total[c] += 1
                for start, avar in assign[ci].items():
                    class_day[(c, start[0])].append(avar)
        for (c, d), vs in class_day.items():
            target = math.ceil(class_total[c] / ndays)
            over = m.NewIntVar(0, len(periods), f"over_{c}_{d}")
            m.Add(over >= sum(vs) - target)
            soft_terms.append((W_BAL, over))

        # teacher daily-load balance (cheap): spread each teacher's lessons
        # across days so no day is overloaded (helps the "lumpy teacher" look
        # without the expensive per-period gap model).
        tday = defaultdict(list)
        ttotal = defaultdict(int)
        for ci, card in enumerate(cards):
            for t in card["teachers"]:
                ttotal[t] += 1
                for start, avar in assign[ci].items():
                    tday[(t, start[0])].append(avar)
        for (t, d), vs in tday.items():
            target = math.ceil(ttotal[t] / ndays)
            over = m.NewIntVar(0, len(periods), f"tov_{t}_{d}")
            m.Add(over >= sum(vs) - target)
            soft_terms.append((W_BAL, over))

    total_cards = len(cards)

    # =====================================================================
    # PHASE 1 — maximize placement (doubles hard). Quality is ignored here so
    # the search reaches all-placed fast; we lock that count in phase 2.
    # =====================================================================
    m.Maximize(sum(placed))
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = int(num_workers)
    solver.parameters.random_seed = int(seed)
    t1 = float(time_limit_sec) * (0.5 if soft_terms else 1.0)

    class _P1(cp_model.CpSolverSolutionCallback):
        def __init__(self):
            super().__init__()
        def on_solution_callback(self):
            placed_now = int(round(self.ObjectiveValue()))
            if progress_fn is not None:
                try:
                    progress_fn(placed_now, int(self.WallTime() * 1000))
                except Exception:
                    pass
            if placed_now >= total_cards:
                self.StopSearch()           # provably optimal placement -> stop
            elif cancel_check is not None and cancel_check():
                self.StopSearch()

    solver.parameters.max_time_in_seconds = max(5.0, t1)
    status = solver.Solve(m, _P1())
    pstar = int(round(solver.ObjectiveValue())) if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else 0
    elapsed = solver.WallTime()

    # =====================================================================
    # PHASE 2 — lock placement at pstar, minimize the soft penalty. This is a
    # much smaller search (placement fixed), so quality improves quickly.
    # =====================================================================
    if soft_terms and pstar > 0 and (cancel_check is None or not cancel_check()):
        m.ClearHints()
        for ci in range(len(cards)):
            for s, v in assign[ci].items():
                m.AddHint(v, solver.Value(v))
        for k, v in yroom.items():
            m.AddHint(v, solver.Value(v))
        m.Add(sum(placed) >= pstar)
        m.Minimize(sum(w * sv for (w, sv) in soft_terms))
        t2 = max(5.0, float(time_limit_sec) - elapsed)

        class _P2(cp_model.CpSolverSolutionCallback):
            def __init__(self):
                super().__init__()
            def on_solution_callback(self):
                if progress_fn is not None:
                    try:
                        progress_fn(pstar, int((elapsed + self.WallTime()) * 1000))
                    except Exception:
                        pass
                if cancel_check is not None and cancel_check():
                    self.StopSearch()

        solver2 = cp_model.CpSolver()
        solver2.parameters.num_search_workers = int(num_workers)
        solver2.parameters.random_seed = int(seed)
        solver2.parameters.max_time_in_seconds = t2
        status2 = solver2.Solve(m, _P2())
        if status2 in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            solver = solver2
            status = status2

    assignment = []
    n_placed = 0
    for ci, card in enumerate(cards):
        if solver.Value(placed[ci]) != 1:
            continue
        chosen = None
        for s, v in assign[ci].items():
            if solver.Value(v) == 1:
                chosen = s
                break
        if chosen is None:
            continue
        d, p = chosen
        room = None
        if card["rooms"]:
            for r in card["rooms"]:
                if solver.Value(yroom[(ci, chosen, r)]) == 1:
                    room = r
                    break
        # emit one assignment row per occupied period (so doubles show as two cards)
        for (dd, pp) in cover(card, chosen):
            assignment.append({"lessonId": card["lesson_id"], "day": dd, "period": pp,
                               "classroomId": room})
        n_placed += 1

    soft_penalty = 0
    if soft_terms and status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        soft_penalty = int(sum(w * solver.Value(v) for (w, v) in soft_terms))

    return {
        "status": "OK",
        "assignment": assignment,
        "stats": {
            "placed": n_placed,
            "unplaced": total_cards - n_placed,
            "hardConflicts": 0,
            "softScore": -soft_penalty,
            "cpStatus": solver.StatusName(status),
            "objective": n_placed,
            "wallSec": round(elapsed + (solver.WallTime() if soft_terms and pstar > 0 else 0), 2),
        },
        "violations": [],
    }


if __name__ == "__main__":
    import json, sys
    school = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/demo_school.json"))
    tl = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    sf = (sys.argv[3] != "nosoft") if len(sys.argv) > 3 else True
    r = build_and_solve(school, time_limit_sec=tl, soft=sf)
    print(json.dumps(r["stats"], indent=2))
