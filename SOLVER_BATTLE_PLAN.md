# Chronexa CSP Solver — Battle Plan to World's Best

**Goal:** Make Chronexa's timetable solver production-grade, battle-hardened, faster than aSc Timetable, better than Timefold/OptaPlanner for school timetabling.

## Current State (2026-05-27)

**Architecture:**
- SmartCspSolver v1 (Kotlin port)
- 4 sequential branches (comment says "no Web Worker fan-out yet")
- Bitmask occupancy: uint32 per (entity, day)
- MRV + degree heuristic for variable ordering
- Coprime-stride candidate walking
- Incremental soft scoring (19+ scorers)
- Auto-tighten subject daily limits
- Multi-branch parallel workers (min(hardwareConcurrency, 8) Web Workers)
- Warm-start + LNS (Large Neighborhood Search) for improve mode
- WASM cutover incomplete (scaffolded, partial binding)

**Known Issues:**
- Soft score magnitude jumped from -4,950 to -520,900 (more scorers firing, weights need rebalance)
- Missing some constraint types (supervision criteria, student subjects as hard constraints)
- Some relation types incomplete (n_2, n_3, n_15)
- No constraint propagation (AC-3/AC-4)
- No conflict-directed backjumping
- Basic variable ordering (no dom/wdeg, no impact-based)

**Benchmark:**
- GD Goenka sample: 946/0 FEASIBLE in ~1s (beats aSc's 944/2)
- 137K schedules/sec on 8 branches in Puppeteer headless
- Auto-tighten feature: 928/946 placed, 0 distribution violations (original had 86)

## Phase 1: Audit & Baseline (Week 1)

### 1.1 Extract Full Architecture Diagram
- Document all functions, data flow, hot loops
- Profile with Chrome DevTools (CPU flame graph)
- Identify bottlenecks in canPlace(), softScore(), search()

### 1.2 Benchmark Suite
- Create 10+ diverse test cases:
  - Small school (50 cards, 5 teachers, 3 classes)
  - Medium school (200 cards, 20 teachers, 10 classes)
  - Large school (500 cards, 50 teachers, 20 classes)
  - Edge cases: alternating weeks, lunch constraints, lab doubles
  - Stress test: 1000+ cards
- Measure: time-to-first-solution, time-to-best, placed/total, soft score

### 1.3 Competitive Analysis
- Compare against:
  - aSc Timetable (Windows app)
  - Timefold (Java, constraint streams)
  - OptaPlanner (Java, predecessor to Timefold)
  - UniTime (Java, university scheduling)
- Document their strengths/weaknesses vs Chronexa

## Phase 2: Algorithmic Improvements (Weeks 2-3)

### 2.1 Constraint Propagation (HIGH PRIORITY)
- **AC-3 (Arc Consistency):** Before search, prune impossible placements
  - For each lesson, remove slots that violate hard constraints
  - Propagate: if teacher T unavailable at (day, period), remove all lessons with T from that slot
- **Forward Checking:** During search, after placing lesson L, immediately check neighbors
  - If a neighbor's domain becomes empty, backtrack immediately
- **MAC (Maintaining Arc Consistency):** Stronger than forward checking
  - After each placement, re-run AC-3 on affected variables

### 2.2 Search Heuristics (HIGH PRIORITY)
- **Variable Ordering:**
  - **dom/wdeg:** Divide domain size by weighted degree (sum of constraint weights)
  - **Impact-based:** Track which variables cause most domain wipeouts
  - **Fail-first:** Pick variable with smallest domain (MRV already does this)
- **Value Ordering:**
  - **Promise:** Order candidates by soft score improvement
  - **Anti-thesis:** Avoid symmetries (same teacher, same day, consecutive periods)
  - **Least-constraining:** Pick value that leaves most options for others

### 2.3 Backtracking Improvements (HIGH PRIORITY)
- **Conflict-Directed Backjumping (CBJ):** When backtrack, jump to relevant decision
  - Track which variables caused conflict
  - Jump back to earliest variable in conflict set
- **Nogood Recording:** Cache failed subproblems
  - If (T at (d,p)) fails with state S, record (T, d, p, S) as nogood
  - Prune future searches hitting same state
- **Restart Strategy:** Restart search with different random seed after N backtracks
  - Luby sequence: 1, 1, 2, 1, 1, 2, 4, 1, 1, 2, 1, 1, 2, 4, 8, ...

### 2.4 Local Search (MEDIUM PRIORITY)
- **Tabu Search:** Maintain list of recently moved lessons, forbid moving them back
- **Simulated Annealing:** Accept worse solutions with decreasing probability
- **Genetic Algorithm:** Evolve population of timetables, crossover + mutation

### 2.5 Symmetry Breaking (LOW PRIORITY)
- Detect equivalent teachers (same subjects, same availability)
- Fix first teacher's schedule, permute others
- Detect equivalent periods (same day, consecutive)

## Phase 3: Performance (Weeks 4-5)

### 3.1 WASM Hot-Loop Cutover (HIGH PRIORITY)
- Port canPlace() to AssemblyScript
- Optimize memory layout (cache-friendly, aligned)
- Benchmark: JS vs WASM on 10K placements

### 3.2 SIMD Optimizations (MEDIUM PRIORITY)
- Use SIMD for bitmask operations (popcount, leading/trailing zeros)
- Vectorize soft score computation (process multiple teachers/classes in parallel)

### 3.3 Data Structure Improvements (MEDIUM PRIORITY)
- **Sparse bitsets:** Use BitSet64 for small masks, BitSet256+ for large
- **Compressed state:** Share unchanged parts of state between branches
- **Memory pools:** Preallocate arrays, avoid GC pauses

### 3.4 Parallel Search (MEDIUM PRIORITY)
- **Work stealing:** Branches steal work when idle
- **Portfolio search:** Mix strategies (greedy, random, constraint propagation)
- **Deterministic replay:** Reproduce exact search path for debugging

## Phase 4: Features (Weeks 6-7)

### 4.1 Missing Constraints (HIGH PRIORITY)
- **Supervision criteria:** Enforce during placement, not post-validation
- **Student subjects:** Treat elective conflicts as hard constraints
- **All relation types:** Implement n_2, n_3, n_15 fully
- **Lunch window:** Enforce class lunch constraints in canPlace()

### 4.2 Advanced Features (MEDIUM PRIORITY)
- **Bulk classroom assignment:** Greedy pass to assign rooms based on subject tags
- **Lock/unlock bulk:** UI + solver awareness (locked lessons can't be evicted)
- **Parameters dialog:** Solver tuning sliders (time budget, branch count, constraint weights)

### 4.3 Quality of Life (LOW PRIORITY)
- **Soft score recalibration:** Normalize weights so score is interpretable
- **Violation reporting:** Human-readable explanation of why placement failed
- **Incremental solve:** After manual edit, resume from current state

## Phase 5: Quality Assurance (Week 8)

### 5.1 Test Coverage
- Unit tests for canPlace(), softScore(), all constraint types
- Integration tests: 10+ real-world schools
- Regression tests: never get worse on fixed test cases

### 5.2 Benchmark CI
- Run benchmark suite on every commit
- Alert if performance regresses >10%
- Track placed/total, soft score, time-to-solution

### 5.3 Documentation
- Algorithm explanation (for users)
- Code walkthrough (for contributors)
- Tuning guide (how to configure for different school types)

## DeepSeek V4 Pro Collaboration Plan

**Role:** DeepSeek V4 Pro as algorithmic research partner

**Phase 1 (Audit):**
- DeepSeek reviews current architecture, suggests improvements
- Provides competitive analysis of Timefold/OptaPlanner algorithms

**Phase 2 (Algorithms):**
- DeepSeek implements:
  - AC-3 constraint propagation
  - dom/wdeg variable ordering
  - Conflict-directed backjumping
  - Luby restart strategy
- We integrate and test

**Phase 3 (Performance):**
- DeepSeek optimizes AssemblyScript WASM code
- We benchmark and profile

**Phase 4 (Features):**
- DeepSeek reviews constraint implementations
- Suggests edge cases and test scenarios

**Communication Protocol:**
1. I provide: current code, test cases, benchmark results
2. DeepSeek provides: algorithmic improvements, code patches, analysis
3. I integrate, test, report back
4. Iterate

## Success Criteria

**Minimum Viable "World's Best":**
- Solves any school up to 500 cards in <5s
- Always finds feasible solution if one exists (no false UNSAT)
- Soft score within 5% of optimal (hard to measure, but compare vs Timefold)
- Zero hard constraint violations
- Handles all aSc constraint types

**Stretch Goals:**
- 1000+ cards in <10s
- Incremental solve (manual edit → resume in <1s)
- Multi-objective optimization (teacher preference vs student distribution)
- Explainable AI (why this schedule is good/bad)

## Timeline

- **Week 1:** Audit, baseline, benchmark suite
- **Weeks 2-3:** Algorithmic improvements (constraint propagation, heuristics, backtracking)
- **Weeks 4-5:** Performance (WASM, SIMD, data structures)
- **Weeks 6-7:** Features (missing constraints, bulk actions, UI)
- **Week 8:** QA, documentation, final polish

**Total:** 8 weeks to world-class solver

## Resources

- **Me:** Implementation, integration, testing, UI
- **DeepSeek V4 Pro:** Algorithmic research, code patches, analysis
- **User:** Test cases, real-world schools, feedback
- **Tools:** Chrome DevTools, Puppeteer, GitHub Actions

## Next Steps

1. Create 3-5 benchmark test cases
2. Profile current solver on largest case
3. Send architecture diagram + benchmark results to DeepSeek V4 Pro
4. Collaborate on Phase 2 (constraint propagation + heuristics)

---

**This is a living document. Update as we learn what works.**
