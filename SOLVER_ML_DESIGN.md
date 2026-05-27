# Chronexa Solvers - Machine Learning Integration

## Overview

The CSP solver incorporates online learning that improves with every solve. The learning system tracks:
1. **Variable difficulty**: Which teachers/subjects/classes cause backtracking
2. **Value success patterns**: Which time slots work best for specific assignment patterns
3. **School-specific knowledge**: Learned heuristics cached per school structure

All learning stays on-device in localStorage. No data leaves the browser.

## ML Features

### Feature 1: Conflict-Driven Variable Ordering

**Goal**: Prioritize "hard" variables (those that cause backtracking) to fail early and reduce search space.

**Algorithm**:
```
For each variable v:
  difficulty_score[v] = (2 * backtracks[v] + conflicts[v]) / (successes[v] + 1)
  
Variable ordering:
  1. Sort by difficulty_score (descending)
  2. Break ties by domain size (ascending, MRV heuristic)
  3. Break remaining ties by degree (descending)
```

**Learning signals**:
- `onBacktrack(v)`: Variable v caused a backtrack → increment backtracks[v]
- `onConflict(v1, v2)`: Variables v1 and v2 conflicted → increment conflicts[v1], conflicts[v2]
- `onSuccess(v)`: Variable v was successfully placed → increment successes[v]

**Storage**: `Map<variableKey, {backtracks, conflicts, successes}>`
- variableKey = SHA-256 hash of (teacherId + subjectId + classIds)
- Shared across similar teaching assignments

### Feature 2: Pattern-Based Value Selection

**Goal**: Try value assignments (time slots) that succeeded in the past for similar variables.

**Algorithm**:
```
For variable v with candidate slots S = [s1, s2, ..., sn]:
  For each slot si:
    pattern = hash(v.subjectId, v.classGrade, v.timeOfDayPreference)
    success_rate[si] = past_successes[pattern][si] / (past_successes[pattern][si] + past_failures[pattern][si])
    
    # Bayesian smoothing for untested slots
    if (past_successes[pattern][si] + past_failures[pattern][si]) < 3:
      success_rate[si] = 0.5  # Prior: assume 50% success
      
    # Recency bonus: recent successes matter more
    if slot was used in last solve:
      success_rate[si] *= 1.1
  
  Sort S by success_rate (descending)
  Return first 3 slots to try
```

**Learning signals**:
- `onPlacementSuccess(v, slot)`: Variable v placed in slot succeeded → increment successes[pattern][slot]
- `onPlacementFailure(v, slot)`: Variable v placed in slot failed → increment failures[pattern][slot]

**Storage**: `Map<patternHash, Map<slotId, {successes, failures, lastUsed}>`
- patternHash = SHA-256 hash of (subjectId + classGrade + dayOfWeek)
- Captures patterns like "Math for Grade 10 on Mondays prefers morning slots"

### Feature 3: Constraint Weight Learning (Future)

**Goal**: Auto-tune soft constraint weights based on user satisfaction signals.

**Signals** (not yet implemented):
- User manually moves cards after solve → decrease weights for those constraints
- User accepts solve without changes → increase weights
- User marks conflicts as "acceptable" → soften those constraints

**This is deferred until user feedback collection is in place.**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      csp_solver.js                           │
│  ┌──────────────────┐    ┌──────────────────────────────┐  │
│  │ SmartCspSolver   │    │ SolverLearning                │  │
│  │                  │    │ - variableDifficulty         │  │
│  │ - selectNext()   │<───│ - slotSuccessPatterns        │  │
│  │ - selectValue()  │───>│ - onBacktrack()              │  │
│  │ - search()       │    │ - onSuccess()                │  │
│  │                  │    │ - save() / load()            │  │
│  └──────────────────┘    └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓↑
                    ┌───────────────┐
                    │ localStorage  │
                    │ Key: school   │
                    │ structure hash│
                    └───────────────┘
```

## Integration Points

### In SmartCspSolver.selectNextVariable():

```javascript
// OLD: Pure MRV + degree
const unassigned = this.unassignedVariables;
unassigned.sort((a, b) => {
  return this.domainSize(a) - this.domainSize(b); // MRV
});

// NEW: ML-enhanced ordering
const unassigned = this.unassignedVariables;
const difficultyScores = this.learning.getVariableDifficulties(unassigned);
unassigned.sort((a, b) => {
  const diffDiff = difficultyScores[b] - difficultyScores[a];
  if (Math.abs(diffDiff) > 0.1) return diffDiff; // Learned difficulty
  return this.domainSize(a) - this.domainSize(b); // MRV fallback
});
```

### In SmartCspSolver.selectValue():

```javascript
// OLD: Try all values in order
const values = this.getValues(variable);

// NEW: Try learned-successful values first
const values = this.getValues(variable);
const successRates = this.learning.getValueSuccessRates(variable, values);
values.sort((a, b) => successRates[b] - successRates[a]);
const topValues = values.slice(0, Math.min(3, values.length));
```

### Learning hooks:

```javascript
// When backtracking
if (this.currentAssignment.conflictCount > 0) {
  this.learning.onBacktrack(this.currentVariable);
  for (const conflict of this.currentAssignment.conflicts) {
    this.learning.onConflict(this.currentVariable, conflict.otherVariable);
  }
}

// When successfully placing a variable
if (this.isConsistent(assignment)) {
  this.learning.onSuccess(variable);
  this.learning.onPlacementSuccess(variable, assignedSlot);
} else {
  this.learning.onPlacementFailure(variable, assignedSlot);
}
```

## Storage Format

```javascript
{
  "version": 1,
  "schoolHash": "a3f8c2d9...",  // SHA-256 of school structure
  "lastUpdated": "2026-05-27T10:00:00Z",
  "variableDifficulty": {
    "teacher:123:subject:456:class:789": {
      "backtracks": 47,
      "conflicts": 23,
      "successes": 152
    }
  },
  "slotSuccessPatterns": {
    "subject:456:grade:10:day:Monday": {
      "slot:0": {"successes": 12, "failures": 3, "lastUsed": "2026-05-27T09:30:00Z"},
      "slot:1": {"successes": 8, "failures": 1, "lastUsed": "2026-05-27T09:30:00Z"},
      "slot:2": {"successes": 15, "failures": 2, "lastUsed": "2026-05-27T09:30:00Z"}
    }
  },
  "stats": {
    "totalSolves": 47,
    "averageSolveTime": 8.2,
    "bestSolveTime": 3.1,
    "improvementRate": 0.85  // 15% improvement per solve
  }
}
```

## Expected Performance Gains

Based on CSP solver literature and similar implementations:

1. **Small schools (39 cards)**: 
   - Baseline: 14ms
   - With ML: 8-12ms (40-50% faster after 10+ solves)
   
2. **Medium schools (300 cards)**:
   - Baseline: 325ms
   - With ML: 200-280ms (20-40% faster after 10+ solves)
   
3. **Large schools (800 cards)**:
   - Baseline: 3.2s
   - With ML: 1.8-2.5s (25-45% faster after 10+ solves)

**Diminishing returns**: Most gains come from first 20 solves. After 50+ solves, improvements plateau.

## Privacy & Security

- All learning data stored in `localStorage` (browser-only)
- No network requests for ML features
- School data never leaves the device
- User can clear learning history anytime (Settings → Clear Solver Learning)

## Testing Strategy

1. **Unit tests**: Test learning module in isolation
   - Track backtracks/conflicts/successes correctly
   - Persist and reload from localStorage
   - Handle edge cases (empty history, corrupted data)

2. **Integration tests**: Verify learning improves solve time
   - Solve same school 10 times
   - Assert average time decreases
   
3. **Regression tests**: Ensure ML doesn't degrade worst-case performance
   - ML should never make solver slower than baseline
   - If ML overhead > 10ms, disable for that solve

4. **User A/B test**: Compare with/without ML
   - Randomly disable ML for 10% of solves
   - Log solve times for comparison

## Future Enhancements

1. **Cross-school learning**: Share patterns across different schools (opt-in, anonymized)
2. **Constraint importance learning**: Auto-weight soft constraints based on user satisfaction
3. **Neural network embeddings**: Use GNN to learn from timetable structure
4. **Meta-learning**: Learn which heuristics work best for which school types

## Implementation Plan

### Phase 1: Core Learning Module (This session)
- Create `solver_learning.js`
- Implement variable difficulty tracking
- Implement slot success patterns
- Add localStorage persistence
- Integrate with SmartCspSolver

### Phase 2: Testing & Tuning
- Add unit tests
- Benchmark ML overhead
- Tune learning rates and decay factors

### Phase 3: User Interface
- Add "Solver Learning" section to Settings
- Show learning stats (solves completed, time saved)
- Clear learning history button

### Phase 4: Advanced Features (Future)
- Constraint weight learning
- Cross-school learning (opt-in)
- Neural embeddings
