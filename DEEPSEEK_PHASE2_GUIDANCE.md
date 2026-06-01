# DeepSeek V4 Pro — Phase 2 Solver Guidance

**Date:** 2026-05-27  
**Model:** deepseek/deepseek-v4-pro  
**Context:** Chronexa CSP solver Phase 2 architecture consultation

---

## Priority Ranking (Impact for School Timetable CSPs)

1. **MAC (Maintaining Arc Consistency) + CBJ (Conflict-Directed Backjumping)**  
   - Direct upgrade from forward checking → arc consistency after each assignment
   - CBJ turns thrashing into direct conflict diagnosis
   - Combined: cuts backtracking by ~40-70% in dense timetable conflicts
   - This is the single biggest bang for buck

2. **Soft Score Auto-Calibration**  
   - Use ML layer to auto-tune 13 weighted penalties across problem instances
   - Bayesian optimization or online weight adjustment based on final score
   - Directly lifts output quality and adapts to each school's preferences

3. **Luby Restart Sequence**  
   - Robustness under hard deadline
   - Becomes critical for scaling beyond 1000 lessons
   - Integrate with ML slot-success probabilities for randomized value selection

4. **Nogood Recording**  
   - CBJ already captures most conflict information
   - Only implement minimized-nogood learning after everything else is solid
   - High memory/overhead in pure form for 684 lessons

---

## AC-3 / MAC Decision

**Skip plain AC-3. Go directly to MAC.**

- AC-3 as preprocessing is useless; constraints are mostly active after assignments
- MAC = run AC-3 on all binary constraints *after each variable assignment*, then backtrack on domain wipe-out
- Forward checking only prunes neighbors of assigned variable; MAC prunes *all* future variables connected via constraints
- Complexity: O(e·d²) in practice for ~100-slot domains, overhead ~0.1-0.3ms per propagation step
- Store only active constraints (teacher-busy, class-busy, room-busy)

---

## CBJ vs Nogood Recording

**CBJ is the practical winner for 684-lesson timetables.**

- Minimal memory: just a conflict set per variable
- Constant time per jump
- Proven synergy with MAC

**Implementation:**
- When a variable fails, its conflict set = union of all variables responsible for domain wipe-outs
- On backtrack, jump to the deepest variable in that set
- Works seamlessly with MAC

---

## Restart Strategies

**Use Luby restart sequence + soft randomized value ordering.**

- **Sequence:** Luby (1,1,2,1,1,2,4,1,1,2,1,1,2,4,8,…) — optimal for heavy-tailed runtimes
- **Base unit:** Start at 500ms for largest instances (tune via profiling)
- **Key:** Don't restart blindly — use ML slot-success probabilities. Randomly select from top-k most promising slots, weighted by learned success rate
- **Integration:** When elapsed time since last restart exceeds the next Luby limit, ditch current partial assignment and restart with randomized tie-breaking

Geometric restarts (×1.5) are simpler but inferior for heavy-tailed distributions. Fixed restarts are a last resort.

---

## Cutting-Edge Gems (2020-2026)

### 1. Symmetry Breaking (immediate, high impact)
Timetables swarm with symmetries: identical periods, identical rooms, teacher-free slots.
- Add static constraints: "assign lessons to the earliest possible identical slot"
- Dynamic symmetry breaking: if two periods are completely interchangeable for a class, force first lesson into lower-numbered period
- Can slash search space by an order of magnitude

### 2. Portfolio Solvers with ML Worker Threads
Run 2-3 solver variants in parallel (Node.js workers):
- MAC+CBJ with ML ordering (main)
- Same with different random seed and weighted random value selection  
- Lightweight local-search repair for soft constraints (optional)

Stop when any returns a solution within 30s. Maximizes chance on heterogeneous instances.

### 3. Large Neighborhood Search (LNS) for Soft Optimization
Once a feasible timetable exists:
- Destroy a subset of lessons (those causing worst soft penalties)
- Re-solve that subproblem with MAC+CBJ inside a 2-second mini-deadline
- Iterate. ML predicts the most promising "destroy" neighborhoods
- Lifts soft score quality way beyond static solving

### 4. Explanation-Based Mini-Nogood Learning (light)
After CBJ jumps, save the conflict set as a "bad combination" constraint (bounded size, last 200 conflicts). Low-memory clause learning that boosts MAC on extremely dense schedules.

### 5. Warm-Start from ML Prediction
Use slot-success model to construct a full initial assignment greedily, then run MAC only if conflicts remain. Turns solver into repair-oriented system. Can find feasible solutions in milliseconds.

---

## Implementation Order to Beat Classic Timetable

Classic's edge is finely tuned heuristics and years of industrial hardening. Your shotgun advantage is *learning across solves*. Capitalize in this order:

1. **MAC + CBJ** — Makes core search world-class
2. **Symmetry Breaking** — Immediate 10x on some instances
3. **Luby Restart + Randomized Value Selection** — Robustness
4. **LNS for Soft Optimization** — Quality differentiator
5. **Portfolio Solver** — Heterogeneous instance coverage
6. **Warm-Start** — Millisecond solves for repair scenarios

---

## Summary

Build MAC+CBJ first. It's the foundation everything else rests on. Then symmetry breaking for the easy wins. Luby restart once you have randomness in value ordering. LNS is your quality differentiator against Classic on soft constraints.

The ML layer you already have is your secret weapon — use it to bias value selection during restarts and to predict LNS neighborhoods.
