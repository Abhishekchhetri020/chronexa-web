"""CP-SAT timetable solver for Chronexa Web.

Model:
- For every lesson `L` (with `periodsPerWeek = N`), we create N "occurrence" variables.
  Each occurrence picks a (day, period, room) slot.
- Hard constraints:
    a) No two occurrences share (teacher, day, period).
    b) No two occurrences share (class, day, period).
    c) No two occurrences share (room, day, period).
    d) periodsPerWeek is satisfied by construction (N occurrences per lesson).
    e) fixedDay / fixedPeriod pin the FIRST occurrence of a lesson (existing behaviour
       of Classic's "fix card" — if a lesson has multiple weekly periods, the user must
       pre-place the rest via `cards`).
    f) Teacher timeOff `"unavailable"` is forbidden.
    g) Occurrences of the same lesson must land on DIFFERENT days (prevents
       double-booking the same subject for a class on one day, which is the Classic
       default expectation).
- Soft constraints (objective, minimized):
    * Teacher gaps within a day (count of empty middle periods between teaching).
    * Preferred-room mismatch (lesson.preferredRoomId not used).
    * Teacher timeOff `"preferred"` violations (teaching during a preferred-off slot).

Teacher / class semantics: lessons may carry teacherIds[] and classIds[] (plural)
to support co-teaching and combined classes. ALL teachers in teacherIds are booked
in the slot; ALL classes in classIds are booked. Assignment.teacherId returns the
primary (teacherIds[0]); Assignment.classIds returns the full list.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from ortools.sat.python import cp_model

LOG = logging.getLogger("chronexa.solver")


# --- progress callback shim -----------------------------------------------
#
# Used by /solve/start to report intermediate progress and to react to
# user-issued cancel requests. The callback is invoked from CP-SAT's own
# search thread, so it must be cheap and exception-safe.

class _ProgressCallback(cp_model.CpSolverSolutionCallback):
    """Wraps a user `on_progress` fn and a `cancel_check` fn.

    on_progress({iter, softScore, hardConflicts, durationMs}) is called once
    per intermediate solution; cancel_check() returning True stops the
    search via StopSearch().
    """

    def __init__(
        self,
        on_progress: Optional[Callable[[Dict[str, Any]], None]],
        cancel_check: Optional[Callable[[], bool]],
        t0: float,
    ) -> None:
        super().__init__()
        self._on_progress = on_progress
        self._cancel_check = cancel_check
        self._t0 = t0
        self._iter = 0

    def on_solution_callback(self) -> None:  # noqa: N802 (OR-Tools API)
        self._iter += 1
        try:
            duration_ms = int((time.perf_counter() - self._t0) * 1000)
            payload = {
                "iter": self._iter,
                "softScore": int(self.ObjectiveValue()) if self.HasResponse() else 0,
                "hardConflicts": 0,  # any solution found is feasible by definition
                "durationMs": duration_ms,
            }
            if self._on_progress is not None:
                self._on_progress(payload)
            if self._cancel_check is not None and self._cancel_check():
                self.StopSearch()
        except Exception as exc:  # pragma: no cover - never let the cb crash CP-SAT
            LOG.warning("progress callback raised: %s", exc)

# --- domain ---------------------------------------------------------------

# Mon..Sat = 6 days; Classic convention (DATA_SHAPES.md).
NUM_DAYS = 6


def _resolve_days(payload: Dict[str, Any]) -> int:
    """Audit #9: derive day count from the payload, not the module constant.

    Precedence, highest first:
      1. payload.daysPerWeek (explicit)
      2. max referenced day in payload.cards + 1
      3. NUM_DAYS (Classic default)

    A 5-day school must never see a phantom day 5; a 7-day school must not
    be truncated to 6 — the pre-fix NUM_DAYS=6 constant made any day_6 card
    turn the whole model INFEASIBLE and ignored explicit daysPerWeek entirely.
    """
    dpw = payload.get("daysPerWeek")
    if isinstance(dpw, int) and dpw > 0:
        return dpw
    max_ref = -1
    for c in (payload.get("cards") or []):
        d = c.get("day")
        if isinstance(d, int) and d > max_ref:
            max_ref = d
    if max_ref >= 0:
        return max_ref + 1
    return NUM_DAYS


def _teaching_period_indices(school: Dict[str, Any]) -> List[int]:
    """Return the 1-based period indices that are teaching periods."""
    periods = school.get("bell", {}).get("periods") or []
    out: List[int] = []
    for p in periods:
        if p.get("isTeaching", True):
            out.append(int(p["index"]))
    if not out:
        # Permissive default: 8 teaching periods, indices 1..8.
        out = list(range(1, 9))
    return sorted(set(out))


# --- main entrypoint ------------------------------------------------------

def solve(
    payload: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None,
    on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    """Solve a timetable. Returns a SolveResponse dict.

    Args:
        payload: SchoolData dict (DATA_SHAPES.md).
        options: SolveRequest.options dict.
        on_progress: optional callback invoked on every intermediate
            CP-SAT solution with {iter, softScore, hardConflicts, durationMs}.
        cancel_check: optional fn that returns True to halt the search.
    """
    options = options or {}
    time_limit = float(options.get("timeLimitSec") or 60.0)
    seed = int(options.get("seed") or 1)
    verbose = bool(options.get("verbose"))

    t0 = time.perf_counter()

    teaching_periods = _teaching_period_indices(payload)
    # Break (non-teaching) period indices — used by n_7 "break cannot be between".
    _bell_periods = (payload.get("bell") or {}).get("periods") or []
    break_periods = sorted(
        int(bp["index"]) for bp in _bell_periods
        if bp.get("index") is not None and not bp.get("isTeaching", True)
    )
    classes = payload.get("classes") or []
    teachers = payload.get("teachers") or []
    rooms = payload.get("classrooms") or []
    lessons = payload.get("lessons") or []

    if not lessons:
        return _empty_response(start=t0, status="OPTIMAL")

    if not classes or not teachers:
        return _empty_response(
            start=t0,
            status="INFEASIBLE",
            violations=[{"ruleId": "no-resources", "description": "school has no classes or teachers"}],
        )

    # Build index maps.
    class_index = {c["id"]: i for i, c in enumerate(classes)}
    teacher_index = {t["id"]: i for i, t in enumerate(teachers)}
    room_index = {r["id"]: i for i, r in enumerate(rooms)}
    teacher_timeoff = {t["id"]: (t.get("timeOff") or {}) for t in teachers}

    model = cp_model.CpModel()

    # Occurrences. Each lesson contributes periodsPerWeek occurrences.
    # `occs` is a list of dicts: {lesson, lesson_idx, occ_idx, day, period, room, slot_index}
    occs: List[Dict[str, Any]] = []
    # Penalty terms aggregated for the objective.
    soft_terms: List[Any] = []
    # We accumulate weights on each term in `soft_terms` separately.
    soft_weights: List[int] = []

    num_days = _resolve_days(payload)
    num_slots = num_days * max(teaching_periods)  # safe upper bound

    # period index → (0-based slot offset). teaching_periods aren't necessarily contiguous,
    # so use enumerate to make day*P + p_offset a contiguous slot id for AllDifferent.
    period_to_offset = {p: i for i, p in enumerate(teaching_periods)}
    P = len(teaching_periods)

    # Lab-doubles need two *physically consecutive* periods (no break between).
    # A teaching-period offset o is a valid block-start iff offset o+1 maps to the
    # very next period index. Empty when the bell has < 2 contiguous periods.
    lab_start_offsets = [
        o for o in range(P - 1) if teaching_periods[o + 1] == teaching_periods[o] + 1
    ]
    # Lessons dropped during pre-flight (e.g. no resolvable teacher). Surfaced as
    # violations so the response explains the unplaced count instead of silently
    # blaming the solver.
    preflight_skipped: List[Dict[str, str]] = []
    # Pre-placed cards whose classroomId can't be resolved — the room lock is
    # unenforceable, so we surface it instead of silently ignoring it.
    bad_room_locks: List[Dict[str, str]] = []

    # --- per-lesson occurrence variables ---
    for lesson_idx, lesson in enumerate(lessons):
        periods_per_week = max(1, int(lesson.get("periodsPerWeek") or 1))
        pref_room_id = lesson.get("preferredRoomId")
        pref_room_idx = room_index.get(pref_room_id) if pref_room_id else None
        fixed_day = lesson.get("fixedDay")
        fixed_period = lesson.get("fixedPeriod")
        required_room_type = lesson.get("requiredRoomType")
        is_lab = bool(lesson.get("isLabDouble"))

        # Pre-compute allowed rooms (filter by roomType if specified).
        if required_room_type and rooms:
            allowed_rooms = [
                i for i, r in enumerate(rooms) if (r.get("roomType") or "") == required_room_type
            ]
        else:
            allowed_rooms = list(range(len(rooms)))

        # If no rooms exist at all, model still works — we'll use a "no-room" sentinel.
        room_domain = allowed_rooms if rooms else [-1]

        # Teachers tagged on this lesson.
        teacher_ids_lesson = lesson.get("teacherIds") or []
        teacher_idxs_lesson = [teacher_index[tid] for tid in teacher_ids_lesson if tid in teacher_index]
        class_ids_lesson = lesson.get("classIds") or []
        class_idxs_lesson = [class_index[cid] for cid in class_ids_lesson if cid in class_index]

        if not teacher_idxs_lesson:
            # Lesson with no resolvable teacher — skip but record.
            LOG.warning("lesson %s has no resolvable teachers; skipping", lesson.get("id"))
            preflight_skipped.append({
                "lessonId": lesson.get("id") or f"lesson_{lesson_idx}",
                "reason": "no resolvable teachers",
            })
            continue

        for occ_idx in range(periods_per_week):
            day_var = model.NewIntVar(0, num_days - 1, f"L{lesson_idx}_O{occ_idx}_day")
            period_var = model.NewIntVarFromDomain(
                cp_model.Domain.FromValues(teaching_periods),
                f"L{lesson_idx}_O{occ_idx}_period",
            )
            if rooms:
                room_var = model.NewIntVarFromDomain(
                    cp_model.Domain.FromValues(room_domain),
                    f"L{lesson_idx}_O{occ_idx}_room",
                )
            else:
                room_var = model.NewConstant(-1)

            # Period offset for use in slot composition.
            period_offset_var = model.NewIntVar(0, P - 1, f"L{lesson_idx}_O{occ_idx}_poff")
            # Tie period_offset_var to period_var via element constraint.
            # period_var = teaching_periods[period_offset_var]
            model.AddElement(period_offset_var, teaching_periods, period_var)

            # Slot id = day * P + period_offset  (contiguous integer 0..num_days*P-1).
            slot_var = model.NewIntVar(0, num_days * P - 1, f"L{lesson_idx}_O{occ_idx}_slot")
            model.Add(slot_var == day_var * P + period_offset_var)

            # A lab-double occupies this period AND the next contiguous one, so it
            # books two adjacent slots. Pinning the start to a valid block-start
            # offset keeps the pair on the same day with no break between them; an
            # empty offset set (bell too small) makes the lesson INFEASIBLE rather
            # than silently placing a half lab.
            slot_vars = [slot_var]
            if is_lab:
                model.AddAllowedAssignments([period_offset_var], [[o] for o in lab_start_offsets])
                slot_var2 = model.NewIntVar(0, num_days * P - 1, f"L{lesson_idx}_O{occ_idx}_slot2")
                model.Add(slot_var2 == slot_var + 1)
                slot_vars.append(slot_var2)

            # Fix first occurrence if pinned.
            if occ_idx == 0:
                if isinstance(fixed_day, int) and 0 <= fixed_day < num_days:
                    model.Add(day_var == fixed_day)
                if isinstance(fixed_period, int) and fixed_period in period_to_offset:
                    model.Add(period_var == fixed_period)

            # Pre-placed cards (if any) override variables for matching (lesson_id, occ_idx).
            # We honour the first card for occ 0, second card for occ 1, etc.
            cards = payload.get("cards") or []
            lesson_cards = [c for c in cards if c.get("lessonId") == lesson.get("id")]
            if occ_idx < len(lesson_cards):
                c = lesson_cards[occ_idx]
                if isinstance(c.get("day"), int):
                    model.Add(day_var == c["day"])
                if isinstance(c.get("period"), int) and c["period"] in period_to_offset:
                    model.Add(period_var == c["period"])
                cid_lock = c.get("classroomId")
                if cid_lock is not None:
                    if rooms and cid_lock in room_index:
                        model.Add(room_var == room_index[cid_lock])
                    else:
                        # Unknown room id: don't silently downgrade the lock to
                        # "any room" — record it so the response can surface it.
                        bad_room_locks.append({
                            "lessonId": lesson.get("id") or f"lesson_{lesson_idx}",
                            "classroomId": str(cid_lock),
                        })

            # Teacher timeOff: hard-forbid "unavailable" slots for any teacher on this lesson.
            for tidx in teacher_idxs_lesson:
                t_id = teachers[tidx]["id"]
                tt_off = teacher_timeoff.get(t_id) or {}
                for key, status in tt_off.items():
                    if status != "unavailable":
                        continue
                    parts = key.split("_")
                    if len(parts) != 2:
                        continue
                    try:
                        d = int(parts[0])
                        p = int(parts[1])
                    except ValueError:
                        continue
                    if p not in period_to_offset:
                        continue
                    forbidden_slot = d * P + period_to_offset[p]
                    for sv in slot_vars:
                        model.Add(sv != forbidden_slot)

            occs.append({
                "lesson": lesson,
                "lesson_idx": lesson_idx,
                "occ_idx": occ_idx,
                "day_var": day_var,
                "period_var": period_var,
                "period_offset_var": period_offset_var,
                "slot_var": slot_var,
                "slot_vars": slot_vars,
                "is_lab": is_lab,
                "room_var": room_var,
                "teacher_idxs": teacher_idxs_lesson,
                "class_idxs": class_idxs_lesson,
                "pref_room_idx": pref_room_idx,
            })

    if not occs:
        return _empty_response(start=t0, status="INFEASIBLE",
                               violations=[{"ruleId": "no-occurrences",
                                            "description": "no lessons produced solvable occurrences"}])

    # --- Hard constraints (a/b/c): no two occurrences may share (resource, slot). ---
    # For each resource, group all occurrences that use it, then AllDifferent on slot_var.

    # Teachers
    teacher_occ_slots: Dict[int, List[Any]] = {}
    for o in occs:
        for tidx in o["teacher_idxs"]:
            for sv in o["slot_vars"]:
                teacher_occ_slots.setdefault(tidx, []).append(sv)
    for tidx, slots in teacher_occ_slots.items():
        if len(slots) > 1:
            model.AddAllDifferent(slots)

    # Classes
    class_occ_slots: Dict[int, List[Any]] = {}
    for o in occs:
        for cidx in o["class_idxs"]:
            for sv in o["slot_vars"]:
                class_occ_slots.setdefault(cidx, []).append(sv)
    for cidx, slots in class_occ_slots.items():
        if len(slots) > 1:
            model.AddAllDifferent(slots)

    # Rooms — only if rooms exist.
    # Audit #21 PERF: channelled per-room AddAllDifferent instead of pairwise
    # reified booleans. The pre-fix shape allocated rooms × (slots²) BoolAnd
    # intermediates — 9 rooms × 1441-slot school blew the model out to
    # millions of little booleans before the solver even started. This path is
    # linear in (rooms × totalSlots).
    if rooms:
        for room_idx in range(len(rooms)):
            # Gather every slot var that can occupy this room, and a per-var
            # BoolVar roomEquals = (room_var == room_idx).
            # Then channel each var through an "effective slot" var that is:
            #   slot_value   if roomEquals is true,
            #   a unique sentinel different from any real slot otherwise.
            # AddAllDifferent on the effective slots enforces pairwise
            # room-slot exclusivity without any pairwise Boolean blowup.
            effs: List[Any] = []
            n_slots = num_days * P
            sentinel_base = n_slots + 1  # every sentinel will be > any real slot
            for i, o in enumerate(occs):
                rv = o["room_var"]
                is_this = model.NewBoolVar(f"L{o['lesson_idx']}_O{o['occ_idx']}_room{room_idx}")
                model.Add(rv == room_idx).OnlyEnforceIf(is_this)
                model.Add(rv != room_idx).OnlyEnforceIf(is_this.Not())
                for sv in o["slot_vars"]:
                    eff = model.NewIntVar(0, sentinel_base + len(occs) * 2 + 4,
                                          f"eff_r{room_idx}_o{o['lesson_idx']}_{o['occ_idx']}_{i}_{len(effs)}")
                    # If is_this: eff == sv (real slot).
                    # Else:      eff == sentinel (unique so no clash).
                    model.Add(eff == sv).OnlyEnforceIf(is_this)
                    model.Add(eff == sentinel_base + len(effs)).OnlyEnforceIf(is_this.Not())
                    effs.append(eff)
            if len(effs) > 1:
                model.AddAllDifferent(effs)

    # --- Hard (g): a lesson's occurrences must be on different DAYS. ---
    # Exception: a lesson that participates in a "same day" relation (n_5/n_6
    # must-follow, n_8/n_10 one-day) is explicitly meant to share a day with its
    # partner, so forcing its own occurrences apart would make the relation
    # unsatisfiable. The browser solver has no rule (g) at all and bunches them;
    # we exempt exactly those lessons to match.
    _same_day_typs = {"n_5", "n_6", "n_8", "n_10"}
    same_day_relation_lessons: set = set()
    for rel in (payload.get("relations") or []):
        if rel.get("disabled") or rel.get("typ") not in _same_day_typs:
            continue
        rsubjs = set(rel.get("subjectids") or []) | set(rel.get("subject2ids") or [])
        rclasses = set(rel.get("classids") or [])
        for li, lz in enumerate(lessons):
            if rsubjs and lz.get("subjectId") not in rsubjs:
                continue
            if rclasses and not any(c in rclasses for c in (lz.get("classIds") or [])):
                continue
            same_day_relation_lessons.add(li)

    lesson_to_occs: Dict[int, List[Any]] = {}
    for o in occs:
        lesson_to_occs.setdefault(o["lesson_idx"], []).append(o)
    for lesson_idx, group in lesson_to_occs.items():
        if len(group) > 1 and lesson_idx not in same_day_relation_lessons:
            model.AddAllDifferent([g["day_var"] for g in group])

    # --- Card relations (ported from JS solver — hard constraints only) ---
    relations = payload.get("relations") or []
    if relations:
        for rel in relations:
            if rel.get("disabled"):
                continue
            typ = rel.get("typ")
            if not typ:
                continue
            subj_set = set(rel.get("subjectids") or [])
            subj2_set = set(rel.get("subject2ids") or [])
            all_subjs = subj_set | subj2_set
            class_set = set(rel.get("classids") or [])

            # Gather matched occurrences
            matched = []
            for o in occs:
                lesson = o["lesson"]
                if all_subjs and lesson.get("subjectId") not in all_subjs:
                    continue
                if class_set and not any(
                    cid in class_set for cid in (lesson.get("classIds") or [])
                ):
                    continue
                matched.append(o)

            if len(matched) < 2:
                continue

            # --- n_1: cannot be same day (cross-subject pairs) ---
            if typ == "n_1":
                for a in range(len(matched)):
                    for b in range(a + 1, len(matched)):
                        oa, ob = matched[a], matched[b]
                        if oa["lesson"].get("subjectId") == ob["lesson"].get("subjectId"):
                            continue
                        model.Add(oa["day_var"] != ob["day_var"])

            # --- n_2: cannot be same slot (same day + same period) ---
            elif typ == "n_2":
                for a in range(len(matched)):
                    for b in range(a + 1, len(matched)):
                        model.Add(matched[a]["slot_var"] != matched[b]["slot_var"])

            # --- n_8 / n_10: must be same day (cross-subject pairs) ---
            elif typ == "n_8" or typ == "n_10":
                for a in range(len(matched)):
                    for b in range(a + 1, len(matched)):
                        oa, ob = matched[a], matched[b]
                        if oa["lesson"].get("subjectId") == ob["lesson"].get("subjectId"):
                            continue
                        model.Add(oa["day_var"] == ob["day_var"])

            # --- n_12 / n_13: simultaneous (same period on same day) ---
            elif typ == "n_12" or typ == "n_13":
                for a in range(len(matched)):
                    for b in range(a + 1, len(matched)):
                        oa, ob = matched[a], matched[b]
                        same_day = model.NewBoolVar(
                            f"rel_{typ}_sd_{oa['lesson_idx']}o{oa['occ_idx']}_{ob['lesson_idx']}o{ob['occ_idx']}"
                        )
                        model.Add(oa["day_var"] == ob["day_var"]).OnlyEnforceIf(same_day)
                        model.Add(oa["day_var"] != ob["day_var"]).OnlyEnforceIf(same_day.Not())
                        model.Add(oa["period_var"] == ob["period_var"]).OnlyEnforceIf(same_day)

            # --- n_16: must be first or last period ---
            elif typ == "n_16":
                first_p = teaching_periods[0]
                last_p = teaching_periods[-1]
                for o in matched:
                    is_first = model.NewBoolVar(f"rel_n16_f_{o['lesson_idx']}o{o['occ_idx']}")
                    model.Add(o["period_var"] == first_p).OnlyEnforceIf(is_first)
                    model.Add(o["period_var"] != first_p).OnlyEnforceIf(is_first.Not())
                    is_last = model.NewBoolVar(f"rel_n16_l_{o['lesson_idx']}o{o['occ_idx']}")
                    model.Add(o["period_var"] == last_p).OnlyEnforceIf(is_last)
                    model.Add(o["period_var"] != last_p).OnlyEnforceIf(is_last.Not())
                    model.AddBoolOr([is_first, is_last])

            # --- n_0: cannot follow (adjacent periods on same day) — simplified ---
            # Forbid any pair of matched occurrences from being adjacent on same day
            elif typ == "n_0":
                for a in range(len(matched)):
                    for b in range(a + 1, len(matched)):
                        oa, ob = matched[a], matched[b]
                        if oa["lesson"].get("subjectId") == ob["lesson"].get("subjectId"):
                            continue
                        # Same day => |period diff| != 1
                        same_day = model.NewBoolVar(
                            f"rel_n0_sd_{oa['lesson_idx']}o{oa['occ_idx']}_{ob['lesson_idx']}o{ob['occ_idx']}"
                        )
                        model.Add(oa["day_var"] == ob["day_var"]).OnlyEnforceIf(same_day)
                        model.Add(oa["day_var"] != ob["day_var"]).OnlyEnforceIf(same_day.Not())
                        # Use the real 1-based period index, not the break-collapsed
                        # offset, so two teaching periods that straddle a break are
                        # not treated as adjacent.
                        max_pidx = teaching_periods[-1]
                        diff = model.NewIntVar(-max_pidx, max_pidx,
                            f"rel_n0_df_{oa['lesson_idx']}o{oa['occ_idx']}_{ob['lesson_idx']}o{ob['occ_idx']}"
                        )
                        model.Add(diff == oa["period_var"] - ob["period_var"])
                        # Adjacent when diff is in {-1, 1}
                        adjacent = model.NewBoolVar(
                            f"rel_n0_adj_{oa['lesson_idx']}o{oa['occ_idx']}_{ob['lesson_idx']}o{ob['occ_idx']}"
                        )
                        model.AddLinearExpressionInDomain(
                            diff, cp_model.Domain.FromValues([-1, 1])
                        ).OnlyEnforceIf(adjacent)
                        model.Add(diff != -1).OnlyEnforceIf(adjacent.Not())
                        model.Add(diff != 1).OnlyEnforceIf(adjacent.Not())
                        both_b = model.NewBoolVar(
                            f"rel_n0_both_{oa['lesson_idx']}o{oa['occ_idx']}_{ob['lesson_idx']}o{ob['occ_idx']}"
                        )
                        model.AddBoolAnd([same_day, adjacent]).OnlyEnforceIf(both_b)
                        model.AddBoolOr([same_day.Not(), adjacent.Not()]).OnlyEnforceIf(both_b.Not())
                        model.Add(both_b == 0)

            # --- n_17: afternoon preference (soft penalty) ---
            elif typ == "n_17":
                half = len(teaching_periods) // 2
                cutoff = teaching_periods[half] if half < len(teaching_periods) else teaching_periods[-1]
                for o in matched:
                    in_morning = model.NewBoolVar(
                        f"rel_n17_m_{o['lesson_idx']}o{o['occ_idx']}"
                    )
                    model.Add(o["period_var"] < cutoff).OnlyEnforceIf(in_morning)
                    model.Add(o["period_var"] >= cutoff).OnlyEnforceIf(in_morning.Not())
                    soft_terms.append(in_morning)
                    soft_weights.append(5)

            # --- n_5: must follow, arbitrary order (same day, adjacent periods) ---
            elif typ == "n_5":
                for a in range(len(matched)):
                    for b in range(a + 1, len(matched)):
                        oa, ob = matched[a], matched[b]
                        if oa["lesson"].get("subjectId") == ob["lesson"].get("subjectId"):
                            continue
                        model.Add(oa["day_var"] == ob["day_var"])
                        adj = model.NewIntVar(0, teaching_periods[-1],
                            f"rel_n5_adj_{oa['lesson_idx']}o{oa['occ_idx']}_{ob['lesson_idx']}o{ob['occ_idx']}")
                        model.AddAbsEquality(adj, oa["period_var"] - ob["period_var"])
                        model.Add(adj == 1)

            # --- n_6: must follow, ordered (B in the period right after A, same day) ---
            elif typ == "n_6":
                _subjids = rel.get("subjectids") or []
                _subj2 = rel.get("subject2ids") or []
                first_subj = _subjids[0] if _subjids else None
                second_subj = (_subj2[0] if _subj2 else None) or (_subjids[1] if len(_subjids) > 1 else None)
                if first_subj and second_subj:
                    a_occs = [o for o in matched if o["lesson"].get("subjectId") == first_subj]
                    b_occs = [o for o in matched if o["lesson"].get("subjectId") == second_subj]
                    for oa in a_occs:
                        for ob in b_occs:
                            model.Add(ob["day_var"] == oa["day_var"])
                            model.Add(ob["period_var"] == oa["period_var"] + 1)

            # --- n_7: a break period must not sit strictly between two partners ---
            # on the same day. Equivalent: on a shared day, both partners stay on
            # the same side of every break.
            elif typ == "n_7":
                for a in range(len(matched)):
                    for b in range(a + 1, len(matched)):
                        oa, ob = matched[a], matched[b]
                        if oa["lesson"].get("subjectId") == ob["lesson"].get("subjectId"):
                            continue
                        if not break_periods:
                            continue
                        same_day = model.NewBoolVar(
                            f"rel_n7_sd_{oa['lesson_idx']}o{oa['occ_idx']}_{ob['lesson_idx']}o{ob['occ_idx']}")
                        model.Add(oa["day_var"] == ob["day_var"]).OnlyEnforceIf(same_day)
                        model.Add(oa["day_var"] != ob["day_var"]).OnlyEnforceIf(same_day.Not())
                        for bp in break_periods:
                            a_above = model.NewBoolVar(
                                f"rel_n7_aa_{oa['lesson_idx']}o{oa['occ_idx']}_{bp}")
                            model.Add(oa["period_var"] >= bp + 1).OnlyEnforceIf(a_above)
                            model.Add(oa["period_var"] <= bp - 1).OnlyEnforceIf(a_above.Not())
                            b_above = model.NewBoolVar(
                                f"rel_n7_ba_{ob['lesson_idx']}o{ob['occ_idx']}_{bp}")
                            model.Add(ob["period_var"] >= bp + 1).OnlyEnforceIf(b_above)
                            model.Add(ob["period_var"] <= bp - 1).OnlyEnforceIf(b_above.Not())
                            model.Add(a_above == b_above).OnlyEnforceIf(same_day)

            # Note: n_9 (same-day ordered) and the soft typs n_3/n_4/n_11/n_14/n_15
            # remain deferred. The JS solver handles these on the browser path.



    # --- Soft: preferred-room ---
    for o in occs:
        pref = o["pref_room_idx"]
        if pref is None or not rooms:
            continue
        mismatch = model.NewBoolVar(f"L{o['lesson_idx']}_O{o['occ_idx']}_prefmiss")
        model.Add(o["room_var"] != pref).OnlyEnforceIf(mismatch)
        model.Add(o["room_var"] == pref).OnlyEnforceIf(mismatch.Not())
        soft_terms.append(mismatch)
        soft_weights.append(2)

    # --- Soft: teacher preferred-off violations ---
    for o in occs:
        for tidx in o["teacher_idxs"]:
            t_id = teachers[tidx]["id"]
            tt_off = teacher_timeoff.get(t_id) or {}
            for key, status in tt_off.items():
                if status != "preferred":
                    continue
                parts = key.split("_")
                if len(parts) != 2:
                    continue
                try:
                    d = int(parts[0])
                    p = int(parts[1])
                except ValueError:
                    continue
                if p not in period_to_offset:
                    continue
                pref_off_slot = d * P + period_to_offset[p]
                viol = model.NewBoolVar(f"L{o['lesson_idx']}_O{o['occ_idx']}_T{tidx}_prefoff_{d}_{p}")
                model.Add(o["slot_var"] == pref_off_slot).OnlyEnforceIf(viol)
                model.Add(o["slot_var"] != pref_off_slot).OnlyEnforceIf(viol.Not())
                soft_terms.append(viol)
                soft_weights.append(3)

    # --- Soft: teacher gaps ---
    # For each (teacher, day), count "empty middle periods" between earliest and latest teaching.
    # Approximated as: (max_period - min_period + 1) - count(periods_used).
    # We model min_period_offset, max_period_offset per (teacher, day) and count.
    # This is a heuristic that hits common scheduling intent.
    for tidx, _ in enumerate(teachers):
        teacher_occs = [o for o in occs if tidx in o["teacher_idxs"]]
        if len(teacher_occs) < 2:
            continue
        for day in range(num_days):
            on_day_bools: List[Any] = []
            on_day_period_offs: List[Any] = []
            for o in teacher_occs:
                on_day = model.NewBoolVar(f"T{tidx}_L{o['lesson_idx']}_O{o['occ_idx']}_d{day}")
                model.Add(o["day_var"] == day).OnlyEnforceIf(on_day)
                model.Add(o["day_var"] != day).OnlyEnforceIf(on_day.Not())
                on_day_bools.append(on_day)
                # Effective period_offset: actual if on_day else P (sentinel large).
                eff = model.NewIntVar(0, P, f"T{tidx}_L{o['lesson_idx']}_O{o['occ_idx']}_d{day}_eff")
                model.Add(eff == o["period_offset_var"]).OnlyEnforceIf(on_day)
                model.Add(eff == P).OnlyEnforceIf(on_day.Not())
                on_day_period_offs.append(eff)

            count_used = model.NewIntVar(0, len(teacher_occs), f"T{tidx}_d{day}_count")
            model.Add(count_used == sum(on_day_bools))

            min_off = model.NewIntVar(0, P, f"T{tidx}_d{day}_min")
            max_off = model.NewIntVar(0, P, f"T{tidx}_d{day}_max")
            model.AddMinEquality(min_off, on_day_period_offs)
            # Max equality only meaningful when at least one occurs that day; use a guarded form.
            # We compute max over (period_offset_var if on_day else 0). To do that, create eff_max.
            on_day_period_offs_max: List[Any] = []
            for o, b in zip(teacher_occs, on_day_bools):
                eff_max = model.NewIntVar(0, P - 1, f"T{tidx}_L{o['lesson_idx']}_O{o['occ_idx']}_d{day}_effmax")
                model.Add(eff_max == o["period_offset_var"]).OnlyEnforceIf(b)
                model.Add(eff_max == 0).OnlyEnforceIf(b.Not())
                on_day_period_offs_max.append(eff_max)
            model.AddMaxEquality(max_off, on_day_period_offs_max)

            # gap = (max - min + 1) - count when count >= 1 ; else 0
            gap = model.NewIntVar(0, P, f"T{tidx}_d{day}_gap")
            none_today = model.NewBoolVar(f"T{tidx}_d{day}_none")
            model.Add(count_used == 0).OnlyEnforceIf(none_today)
            model.Add(count_used >= 1).OnlyEnforceIf(none_today.Not())
            model.Add(gap == 0).OnlyEnforceIf(none_today)
            model.Add(gap == max_off - min_off + 1 - count_used).OnlyEnforceIf(none_today.Not())

            soft_terms.append(gap)
            soft_weights.append(1)

    # --- Objective ---
    if soft_terms:
        # weighted sum
        weighted = []
        for term, w in zip(soft_terms, soft_weights):
            weighted.append(term * w)
        model.Minimize(sum(weighted))

    # --- Solve ---
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.random_seed = seed
    solver.parameters.num_workers = 1  # determinism
    if verbose:
        solver.parameters.log_search_progress = True

    LOG.info(
        "solving: lessons=%d occurrences=%d teachers=%d classes=%d rooms=%d soft_terms=%d time_limit=%.1fs",
        len(lessons), len(occs), len(teachers), len(classes), len(rooms), len(soft_terms), time_limit,
    )

    if on_progress is not None or cancel_check is not None:
        cb = _ProgressCallback(on_progress, cancel_check, t0)
        # enumerate_all_solutions=False but the callback still fires on every
        # improving feasible solution, which is what we want for progress.
        status = solver.Solve(model, cb)
    else:
        status = solver.Solve(model)
    duration_ms = int((time.perf_counter() - t0) * 1000)

    status_label = _status_label(status)

    assignment: List[Dict[str, Any]] = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for o in occs:
            day = int(solver.Value(o["day_var"]))
            period = int(solver.Value(o["period_var"]))
            room_val = int(solver.Value(o["room_var"])) if rooms else -1
            classroom_id: Optional[str] = None
            if rooms and 0 <= room_val < len(rooms):
                classroom_id = rooms[room_val]["id"]
            teacher_id = teachers[o["teacher_idxs"][0]]["id"]
            class_ids = [classes[cidx]["id"] for cidx in o["class_idxs"]]
            # A lab-double occupies this period and the next; emit a card for each
            # half so the timetable shows both slots busy (no phantom free period).
            periods_out = [period, period + 1] if o["is_lab"] else [period]
            for pout in periods_out:
                entry = {
                    "lessonId": o["lesson"]["id"],
                    "day": day,
                    "period": pout,
                    "teacherId": teacher_id,
                    "classIds": class_ids,
                }
                if classroom_id is not None:
                    entry["classroomId"] = classroom_id
                assignment.append(entry)

    placed = len(assignment)
    # A lab-double demands two periods per weekly occurrence — count it as such so
    # placed == expected when fully scheduled.
    expected = sum(
        max(1, int(l.get("periodsPerWeek") or 1)) * (2 if l.get("isLabDouble") else 1)
        for l in lessons
    )
    unplaced = max(0, expected - placed)

    soft_score = 0
    try:
        soft_score = int(solver.ObjectiveValue()) if soft_terms else 0
    except Exception:
        soft_score = 0

    # Explain the unplaced count (H3/H9): name pre-flight skips, and flag the
    # case where the solver produced no assignment at all.
    violations: List[Dict[str, Any]] = [
        {"ruleId": "HARD_unplaced_lesson", "lessonId": sk["lessonId"],
         "description": f"Lesson {sk['lessonId']} skipped before solving: {sk['reason']}"}
        for sk in preflight_skipped
    ]
    violations.extend(
        {"ruleId": "room_lock_unresolved", "lessonId": rl["lessonId"],
         "description": f"Lesson {rl['lessonId']} is locked to unknown room "
                        f"{rl['classroomId']}; the room lock was not applied"}
        for rl in bad_room_locks
    )
    if status_label not in ("OPTIMAL", "FEASIBLE"):
        violations.append({
            "ruleId": "solver_no_solution",
            "description": f"solver returned {status_label}; no assignment produced",
        })

    return {
        "status": status_label,
        "assignment": assignment,
        "violations": violations,
        "stats": {
            "placed": placed,
            "unplaced": unplaced,
            "hardConflicts": 0 if status_label in ("OPTIMAL", "FEASIBLE") else expected,
            "softScore": soft_score,
            "durationMs": duration_ms,
        },
    }


# --- helpers --------------------------------------------------------------

def _status_label(status: int) -> str:
    if status == cp_model.OPTIMAL:
        return "OPTIMAL"
    if status == cp_model.FEASIBLE:
        return "FEASIBLE"
    if status == cp_model.INFEASIBLE:
        return "INFEASIBLE"
    if status == cp_model.MODEL_INVALID:
        return "ERROR"
    # cp_model.UNKNOWN — usually means hit the time limit without finding feasible.
    return "TIMEOUT"


def _empty_response(start: float, status: str, violations: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "status": status,
        "assignment": [],
        "stats": {
            "placed": 0,
            "unplaced": 0,
            "hardConflicts": 0,
            "softScore": 0,
            "durationMs": int((time.perf_counter() - start) * 1000),
        },
    }
    if violations:
        out["violations"] = violations
    return out
