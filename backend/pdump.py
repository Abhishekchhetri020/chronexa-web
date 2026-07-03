import json, sys
import math
from collections import defaultdict
from ortools.sat.python import cp_model

school = json.load(open(sys.argv[1]))

# Build minimal example: 2 lessons
# Just dump the first 2 lessons
school["lessons"] = school["lessons"][:2]
school["cards"] = [c for c in school.get("cards", []) if c.get("lessonId") in [L["id"] for L in school["lessons"]]]
school["groups"] = [g for g in school.get("groups", []) if g.get("classId") in [c for L in school["lessons"] for c in L.get("classIds", [])]]

# Now build the model
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
    subject = L.get("subjectId")
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
    for _ in range(ncards):
        cards.append({
            "lesson_id": L["id"], "subject": subject, "length": length,
            "teachers": teachers, "classes": classes, "cls_occ": cls_occ, "rooms": rooms,
        })

m = cp_model.CpModel()

def valid_starts(card):
    out = []
    for (d, p) in slots:
        if card["length"] == 2 and pidx[p] + 1 >= len(periods):
            continue
        out.append((d, p))
    return out

def cover(card, start):
    d, p = start
    if card["length"] == 1:
        return [(d, p)]
    return [(d, p), (d, periods[pidx[p] + 1])]

# For now just count how many assignment vars we'd have
total_avars = 0
for card in cards:
    vs = valid_starts(card)
    total_avars += len(vs)
print(f"Number of cards: {len(cards)}")
print(f"Total assignment vars: {total_avars}")
for ci, card in enumerate(cards):
    vs = valid_starts(card)
    print(f"  card {ci}: lesson {card['lesson_id'][:8]} len={card['length']} starts={len(vs)} teachers={len(card['teachers'])} classes={len(card['classes'])}")
