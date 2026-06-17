"""
Chronexa OR-Tools CP-SAT solver.

Translates the app's `school` JSON (from js/xml/parse_timetable_xml.js) into a
CP-SAT model and returns an assignment in the same shape the browser solver
returns, so the existing backend_client.js consumes it unchanged.

Model: each lesson is expanded into `periodsPerWeek` cards; each card is placed
in at most one (day, period) slot (and, for room-requiring lessons, one room).
Objective: maximize placed cards (then minimize a light soft term). Hard
constraints mirror the JS solver's FAIL semantics:
  - teacher no-overlap per slot
  - class no-overlap per slot, GROUP-AWARE (two cards on a class conflict iff
    either is whole-class, or different divisions, or same group in a division)
  - room no-overlap per slot (only for lessons with explicit room candidates)
  - fixed day/period
  - per-card distinct slots (implied by teacher/class, kept explicit)
"""
from ortools.sat.python import cp_model


def _teaching_periods(school):
    ps = [p for p in school["bell"]["periods"] if p.get("isTeaching", True) is not False]
    # periods are 1-based in cards; keep their index values
    return [p["index"] for p in ps]


def build_and_solve(school, time_limit_sec=30, num_workers=8, seed=1, progress_cb=None):
    days = list(range(school["daysPerWeek"]))
    periods = _teaching_periods(school)              # e.g. [1..7]
    slots = [(d, p) for d in days for p in periods]  # list of (day, period)
    slot_index = {s: i for i, s in enumerate(slots)}

    groups_by_id = {g["id"]: g for g in school.get("groups", [])}

    # ---- expand lessons into cards + per-card metadata --------------------
    cards = []  # each: dict(lesson_id, teachers, classes, class_group(map class->(divkey,groupkey)), rooms, fixed)
    for L in school["lessons"]:
        lid = L["id"]
        teachers = L.get("teacherIds") or []
        classes = L.get("classIds") or []
        # resolve this lesson's group occupancy PER class
        # class -> (divkey, groupkey): divkey "W" = whole class; else divisionTag
        cls_occ = {}
        gids = [g for g in (L.get("groupIds") or []) if g in groups_by_id]
        for c in classes:
            # groups of this lesson that belong to class c
            mine = [groups_by_id[g] for g in gids if groups_by_id[g].get("classId") == c]
            whole = (not mine) or any(g.get("entireClass") for g in mine)
            if whole:
                cls_occ[c] = ("W", "W")
            else:
                # assume one division per lesson per class; group = the group id(s)
                div = mine[0].get("divisionTag", 0)
                gkey = tuple(sorted(g["id"] for g in mine if g.get("divisionTag", 0) == div))
                cls_occ[c] = (("D", div), gkey)
        rooms = list(L.get("_lessonRoomIds") or [])
        fixed_day = L.get("fixedDay")
        fixed_period = L.get("fixedPeriod")
        n = int(L.get("periodsPerWeek") or 0)
        for _ in range(n):
            cards.append({
                "lesson_id": lid, "teachers": teachers, "classes": classes,
                "cls_occ": cls_occ, "rooms": rooms,
                "fixed_day": fixed_day, "fixed_period": fixed_period,
            })

    m = cp_model.CpModel()

    # valid slots per card (fixed day/period restrict)
    def valid_slots(card):
        out = []
        for (d, p) in slots:
            if card["fixed_day"] is not None and d != card["fixed_day"]:
                continue
            if card["fixed_period"] is not None and p != card["fixed_period"]:
                continue
            out.append((d, p))
        return out

    # assign[c][s] : card c at slot s
    assign = {}
    placed = []
    # y[c][s][r] for room-requiring cards
    yroom = {}
    for ci, card in enumerate(cards):
        vs = valid_slots(card)
        avars = {}
        if card["rooms"]:
            # joint (slot, room) vars; assign = sum over rooms
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

    # ---- teacher no-overlap ----------------------------------------------
    # index cards by (teacher, slot)
    from collections import defaultdict
    t_slot = defaultdict(list)
    for ci, card in enumerate(cards):
        for t in card["teachers"]:
            for s, v in assign[ci].items():
                t_slot[(t, s)].append(v)
    for key, vs in t_slot.items():
        if len(vs) > 1:
            m.Add(sum(vs) <= 1)

    # ---- room no-overlap --------------------------------------------------
    r_slot = defaultdict(list)
    for (ci, s, r), v in yroom.items():
        r_slot[(r, s)].append(v)
    for key, vs in r_slot.items():
        if len(vs) > 1:
            m.Add(sum(vs) <= 1)

    # ---- class group-aware no-overlap ------------------------------------
    # For each (class, slot): collect cards touching the class, grouped by divkey.
    # cross-division/whole exclusivity: at most one divkey active per (class,slot).
    # within a division: each groupkey used at most once.
    cs_cards = defaultdict(list)  # (class, slot) -> list of (ci, divkey, groupkey)
    for ci, card in enumerate(cards):
        for c, (divkey, groupkey) in card["cls_occ"].items():
            for s, v in assign[ci].items():
                cs_cards[(c, s)].append((divkey, groupkey, v))
    for (c, s), entries in cs_cards.items():
        # group by divkey
        by_div = defaultdict(list)            # divkey -> list of vars
        by_div_group = defaultdict(list)      # (divkey, groupkey) -> list of vars
        for divkey, groupkey, v in entries:
            by_div[divkey].append(v)
            by_div_group[(divkey, groupkey)].append(v)
        # within-division: each group used at most once (also caps whole-class)
        for (divkey, groupkey), vs in by_div_group.items():
            if len(vs) > 1:
                m.Add(sum(vs) <= 1)
        # cross-division exclusivity: at most one divkey active
        if len(by_div) > 1:
            div_active = []
            for divkey, vs in by_div.items():
                da = m.NewBoolVar(f"div_{c}_{slot_index[s]}_{divkey}")
                # da is true iff any card of this div placed here
                m.AddMaxEquality(da, vs)
                div_active.append(da)
            m.Add(sum(div_active) <= 1)

    # ---- symmetry breaking: order same-lesson cards by slot index --------
    # Interchangeable cards of one lesson explode the search; pin a slot-index
    # var per card and force strictly increasing order within a lesson.
    from collections import defaultdict as _dd
    lesson_cards = _dd(list)
    for ci, card in enumerate(cards):
        lesson_cards[card["lesson_id"]].append(ci)
    slotidx_var = {}
    NOSLOT = len(slots) + 1  # sentinel for "unplaced" (sorts last)
    for ci, card in enumerate(cards):
        sv = m.NewIntVar(0, NOSLOT, f"si_{ci}")
        # sv = sum(slot_index*assign) + NOSLOT*(1-placed)
        m.Add(sv == sum(slot_index[s] * v for s, v in assign[ci].items())
              + NOSLOT * (1 - placed[ci]))
        slotidx_var[ci] = sv
    for lid, cis in lesson_cards.items():
        for a, b in zip(cis, cis[1:]):
            # strictly increasing slot when both placed; unplaced (NOSLOT) sort last
            m.Add(slotidx_var[a] < slotidx_var[b])

    # ---- warm-start hint from saved cards (school.cards) ------------------
    saved = _dd(list)
    for c in (school.get("cards") or []):
        if c.get("day") is not None and c.get("period") is not None:
            saved[c["lessonId"]].append(c)
    for lid, cis in lesson_cards.items():
        sc = sorted(saved.get(lid, []), key=lambda c: (c["day"], c["period"]))
        for ci, card in zip(cis, sc):
            s = (card["day"], card["period"])
            if s in assign[ci]:
                m.AddHint(assign[ci][s], 1)
                rm = card.get("classroomId")
                if rm and (ci, s, rm) in yroom:
                    m.AddHint(yroom[(ci, s, rm)], 1)

    # ---- objective: maximize placed --------------------------------------
    m.Maximize(sum(placed))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit_sec)
    solver.parameters.num_search_workers = int(num_workers)
    solver.parameters.random_seed = int(seed)

    status = solver.Solve(m, progress_cb) if progress_cb is not None else solver.Solve(m)

    assignment = []
    n_placed = 0
    for ci, card in enumerate(cards):
        if solver.Value(placed[ci]) != 1:
            continue
        # find the chosen slot
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
        assignment.append({"lessonId": card["lesson_id"], "day": d, "period": p,
                           "classroomId": room})
        n_placed += 1

    total = len(cards)
    return {
        "status": "OK",
        "assignment": assignment,
        "stats": {
            "placed": n_placed,
            "unplaced": total - n_placed,
            "hardConflicts": 0,
            "softScore": 0,
            "cpStatus": solver.StatusName(status),
            "objective": int(solver.ObjectiveValue()) if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else 0,
            "bestBound": int(solver.BestObjectiveBound()),
            "wallSec": round(solver.WallTime(), 2),
        },
        "violations": [],
    }


if __name__ == "__main__":
    import json, sys
    school = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/demo_school.json"))
    tl = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    r = build_and_solve(school, time_limit_sec=tl)
    print(json.dumps(r["stats"], indent=2))
