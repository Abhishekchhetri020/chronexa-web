# DeepSeek V4 Collaboration Brief — Chronexa CSP Solver

## Mission
Collaborate to make Chronexa's timetable CSP solver **battle-hardened, production-grade, and the best school timetabling solver in the world** — better than Classic Timetable and Timefold for the school-scheduling domain.

## Current Architecture (Summary)
- **SmartCspSolver v1** (Kotlin port) — `js/solver/csp_solver.js` (4078 lines)
- **Bitmask occupancy**: uint32 per (entity, day) — bit `p` set means busy at period `p`
- **Variable ordering**: MRV + degree heuristic (minimum remaining values + conflict degree)
- **Value ordering**: coprime-stride walk over precomputed candidate slots
- **Incremental soft scoring**: 19+ scorers (teacher gaps, class gaps, subject distribution, teacher room stability, consecutive overload, period load, teacher-last-period, supervision criteria, student elective conflicts, subject-tag room mismatch, afternoon-heavy penalty, block-pairing, teacher interval max days, min resting hours, building changes, tag daily caps, ...)
- **Multi-branch**: 4 branches with deterministic coprime-stride seeds, pick best result; Web Worker fan-out in progress (8 workers)
- **Improve mode**: Warm-start + LNS (Large Neighborhood Search) with locked-lesson preservation
- **WASM cutover**: scaffolded but non-functional (ES module loading error)

## Baseline Performance (darwin arm64, Node v26.0.0, single-branch)

| Test Case | Cards | Time | Placed | Hard Conf | Soft Score |
|-----------|-------|------|--------|-----------|------------|
| Small | 39 | 0.014s | 39/39 | 0 | 0 |
| Medium | 300 | 0.325s | 300/300 | 0 | 0 |
| Large | 800 | 3.23s | 800/800 | 0 | 0 |

**Suspicious issue**: soft score = 0 everywhere. Benchmark data may not populate soft metadata fields (teacherLastPeriodCap, classLunchMask, etc.), OR solver weights are zeroed for default benchmark data.

## Hard Constraints (already enforced in canPlace())
- One card per slot (no duplicate occupancy)
- Teacher not double-booked
- Class not double-booked
- Room not double-booked
- Room capacity >= class size (when roomRequired)
- Per-class bell schedule (can't place class outside its bell)
- Per-teacher timeOff mask
- Fixed day/period pins
- Subject daily limit (auto-tightened)
- Teacher last-period cap
- Lab doubles need 2 consecutive periods

## Known Issues (prioritized)
1. **Soft score always zero on benchmark data** — either data is missing weight metadata OR weights are effectively disabled
2. **No constraint propagation (AC-3/MAC)** — solver places blindly and backtracks
3. **No conflict-directed backjumping** — chronological backtrack wastes work
4. **Variable ordering is basic** — no dom/wdeg, no impact-based
5. **No nogood recording** — same failed subproblems revisited
6. **No restart strategy** — single attempt per branch
7. **WASM non-functional** — JS fallback only
8. **Supervision criteria not in search** — only post-validation
9. **Student subjects not hard constraints** — elective conflicts not enforced during placement
10. **Relations n_2/n_3/n_15 incomplete** — partial enforcement only

## Highest-Impact Work (Pick ONE of these to start)

### A. Constraint Propagation (AC-3) — HIGH IMPACT
Before search runs, precompute:
- For each lesson, remove candidate (slot, room) pairs that violate ANY hard constraint upfront
- Propagate: if teacher T unavailable at (day, period), remove from ALL lessons with teacher T
- Maintain forward-checking during search: after each placement, immediately prune neighbors' candidate lists; if domain becomes empty, backtrack immediately

**Expected payoff**: dramatically reduce search space, fewer backtracks

### B. Conflict-Directed Backjumping (CBJ) — HIGH IMPACT
When canPlace fails, don't backtrack chronologically. Instead:
- Record the "conflict set": which variables were involved in the conflict
- Jump back to the EARLIEST variable in the conflict set
- Carry forward the nogood: don't re-place that variable in the same way

**Expected payoff**: skip entire failed subtrees

### C. dom/wdeg Variable Ordering — MEDIUM IMPACT
- Weighted degree: sum of weights of constraints each variable is involved in
- Pick variable with smallest `domain_size / weighted_degree`
- When a constraint fails, increment weights of ALL variables involved in that failure

**Expected payoff**: fail-fast on hardest variables first

### D. Luby Restart Strategy — MEDIUM IMPACT
- After N backtracks without improvement, abandon current branch state, pick new seed
- Sequence: 1, 1, 2, 1, 1, 2, 4, 1, 1, 2, 1, 1, 2, 4, 8, ...
- Combined with nogood recording to avoid re-exploring

**Expected payoff**: escape local minima

### E. Fix Soft Score = 0 Bug — HIGH IMPACT, LOW EFFORT
Investigate why `softScore()` returns 0 on all benchmarks:
- Are benchmark JSON files missing weight metadata fields?
- Is `model.weights` defaulting to zeros?
- Is the incremental scoring not being triggered during apply/remove?
- Are the refreshXxx() functions actually being called on applyPlacement()?

**Expected payoff**: real optimization signal for the solver

## Your Role (DeepSeek V4)
- Review the current architecture for algorithmic weaknesses
- Implement ONE of the above (A, B, C, D, or E) with clean, tested code
- Explain your approach and tradeoffs
- Suggest edge cases to test

## Files to Review (relative to repo root `/Users/abhishekchhetri/chronexa-web/`)
- `js/solver/csp_solver.js` — the main solver (4078 lines)
- `js/solver/constraints.js` — weight/failure catalog
- `js/solver/bitmask.js` — bit ops (popcount)
- `js/solver/score_expr.js` — soft score expression language
- `js/solver/relation_enforcer.js` — n_* relation types
- `js/solver/improve_mode.js` — LNS/warm-start
- `js/solver/worker.js` — Web Worker bridge
- `benchmarks/small_school.json`, `medium_school.json`, `large_school.json`
- `SOLVER_BATTLE_PLAN.md` — full 5-phase roadmap
- `docs/SOLVER_BASELINE.md`, `docs/SOLVER_V2.md` — existing solver documentation

## Communication Protocol
1. I provide: code snippets, test cases, profiling output
2. You provide: algorithmic patches, mathematical analysis, complexity bounds
3. I integrate into the codebase, run benchmarks, report back
4. Iterate

## Success Criteria
- 800-card school solvable in <5s (currently 3.2s — we're there; aim for <1s with propagation)
- Always find FEASIBLE if one exists (never false UNSAT)
- Soft score is meaningful and drives real optimization (not 0)
- Zero hard constraint violations
- Soft score within 5% of theoretical optimum on benchmark cases

---

**First task I'd like you to tackle**: Pick whichever of (A), (B), (C), (D), (E) gives the best bang-for-buck. My recommendation: **(E) then (A)** — fix the soft score signal first, then add constraint propagation to use that signal intelligently.
