# Open-source timetabling research → ideas for Chronexa

Surveyed 2026-05-22. Sources: FET (Liviu Lalescu, AGPL, C++/Qt), Timefold/OptaPlanner (Apache, Java), UniTime (open source, Java), CSP-literature on Kempe chains + late acceptance.

## What each project does well

### FET (Free Timetabling Software)
- **Algorithm:** Custom recursive backtracking with constraint propagation (despite "GA" being mentioned in some press, the actual implementation is a deterministic search). 5-20 min typical solve time.
- **Constraint catalogue:** ~80 constraint types organized into Time + Space categories. Far richer than Classic's `n_*` typs.
- **Weight % per constraint** — every constraint carries a 0-100% weight. 100% = compulsory hard rule. 50% = "should respect but can violate". Gives finely-graded control without separate hard/soft buckets.
- **Activity tags** — generic tag-based filtering: tag activities with arbitrary strings, then write constraints that target tagged activities only. Powerful generalization.
- **Modes:** Official / Mornings-Afternoons / Block Planning / Terms — different bell shapes baked in.

### Timefold (formerly OptaPlanner / Red Hat)
- **Constraint Streams** — declarative O(n) scoring via a Java-Streams-style API: `forEach() → filter() → join() → penalize()`. An order-of-magnitude faster than naive O(n²) recompute. Designed for incremental score updates as moves happen.
- **Two-phase solve:** construction heuristic (greedy) → local search (tabu, simulated annealing, late acceptance). Chronexa already has this.
- **Late Acceptance Hill-Climbing** — single-parameter alternative to SA. Maintains a sliding window of the last L scores; accept moves that beat the score from L steps ago. Easier to tune than SA temperature curves.
- **ConstraintVerifier** — unit tests for individual constraints without running the whole solver.
- **Move types:** swap, change, pillar move (move all entities sharing a value together), chained moves.

### UniTime (Apereo Foundation)
- **Distributed scheduling model** — multiple departmental managers coordinate; conflict resolution at boundaries. Useful if Chronexa ever needs multi-admin live edit.
- **Student sectioning** — separately optimizes which student goes into which section of an oversubscribed course. We don't need this for K-12 but the per-student conflict detector we shipped (`studentScheduleConflicts`) is the same shape.
- **Event scheduling** — community room booking on top of class scheduling. Separate concern from the core problem.

### CSP/CP literature
- **Kempe chain moves** — pick two timeslots, walk the conflict graph, swap a connected subset. Maintains feasibility while making a large structural change. Strong at escaping local optima where single-swap is stuck.
- **Great Deluge algorithm** — like SA but with a single "water level" threshold that rises slowly. One parameter, no cooling schedule.
- **Hybrid SA + Kempe** — research-validated combination.

---

## Concrete ports for Chronexa (priority-ordered)

### Tier 1 — small ports, big payoff

| Idea | Source | Effort | Why |
|---|---|---|---|
| **Activity tags + 2-3 tag-aware constraints** | FET | small | Lets schools express "max 2 PE per day per teacher" without enumerating teachers. Adds `lesson.tags[]` + constraint that filters by tag. |
| **Per-constraint weight slider** | FET | small | Solver parameters dialog already has 6 sliders; surface tags/lunch/teaching window etc. so admins can tune what matters to them. |
| **Min resting hours between days (teacher + class)** | FET | small | Soft scorer: penalise gap between last period today and first tomorrow that's < N hours. Useful for split-shift schools. |
| **Max building changes per day for teacher** | FET | small | Soft scorer using existing Buildings entity + class.classroomId + room.buildingId. |
| **Min gaps between building changes** | FET | small | When a teacher changes buildings mid-day, need ≥ N free periods to walk. Soft penalty when violated. |

### Tier 2 — medium effort, real wins

| Idea | Source | Effort | Why |
|---|---|---|---|
| **Kempe chain move in local search** | CSP literature | medium | New move type — pick 2 periods, find conflict-connected card-set, swap. Strongest escape-from-local-optimum technique. Add to LNS phase. |
| **Late Acceptance Hill-Climbing as an alternative strategy** | Timefold | medium | New strategy option in Solver Parameters. Single L parameter (window size). Easier for non-experts than tuning SA. |
| **ConstraintVerifier-style test harness** | Timefold | medium | `tools/test_constraints.mjs` — load sample-school, fire each constraint in isolation with known-bad placements, assert it fires. Catches regressions. |
| **Constraint Streams-style scoring rewrite** | Timefold | large | The big one. Rewrite `softScore()` from imperative loops into declarative filter-then-join. Done right, opens up incremental scoring. **Multi-day port — defer.** |

### Tier 3 — declarative wins

| Idea | Source | Effort | Why |
|---|---|---|---|
| **Modes (Mornings-Afternoons / Block / Terms)** | FET | medium | Bell-schedule presets. Block Planning = "lessons come in pairs" preset. |
| **Subject + activity-tag → preferred room mapping** | FET | small | Today: per-subject preferred rooms. Add: per-(subject, tag) preferred rooms so "Math + Lab" maps to Lab Room 3 while "Math + Regular" maps to any. |
| **Working in hourly interval max days per week** | FET | small | "Mrs. Sharma works in [8am,10am] at most 3 days/week." Niche but easy. |

### Out of scope for Chronexa

- **Student sectioning** — K-12 scope, students don't pick sections.
- **Distributed multi-admin sync** — Chronexa is local-first; multi-doc tabs are the workable substitute.
- **Native binary plugin system** — FET has it, browser-app doesn't need it.

---

## What we should NOT borrow

- **FET's UI** — Qt desktop, very dense, modal-heavy. Chronexa's already modernised past this.
- **Timefold's Maven dependency tree** — Java-only. Chronexa is JS/WASM in-browser by design.
- **UniTime's Tomcat backend** — distributed schedule editing requires a server. Chronexa stays local.

---

## Implementation order shipped after this audit

See `Chronexa-TOP30-STATUS.md` for the live ledger. Items shipped from this research land under the new "OSS-inspired ports" section.

Sources:
- [FET — Free Timetabling Software](https://lalescu.ro/liviu/fet/)
- [FET manual — www.timetabling.de](https://www.timetabling.de/manual/FET-manual.en.html)
- [Timefold Solver — GitHub](https://github.com/TimefoldAI/timefold-solver)
- [Timefold school-timetabling presentation](https://timefoldai.github.io/timefold-presentations/events/Algorithms_introduction_School_Timetabling.html)
- [UniTime — Apereo Foundation](https://www.apereo.org/programs/software/unitime)
- [Kempe chain neighborhood for timetabling — Springer](https://link.springer.com/chapter/10.1007/978-3-642-16248-0_15)
- [openTimetables (CEE / classes-stay-in-room model)](https://github.com/rocristoi/openTimetables)
- [mFET fork](https://github.com/leonardodazeredo/mfet)
