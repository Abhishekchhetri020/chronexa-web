# 1. WASM-CP-SAT is the Improve engine, warm-started with a placement floor

Date: 2026-06-20
Status: Accepted

## Context

The WASM-CP-SAT Backend (OR-Tools CP-SAT compiled to WebAssembly, in-browser)
can be used two ways:

- **Generate** — solve from scratch.
- **Improve** — start from an existing timetable and better it.

Measured on the 951-Card demo (30 s budget, JSPI, 8 workers):

| Mode | Placed | Soft penalty |
| --- | --- | --- |
| Generate (from scratch) | 927 / 946 (~98%) | −65,000 |
| **Improve (warm-started)** | **946 / 946 (100%)** | **−35,200** |

From a deliberately *partial* input (911 saved Cards, ~40 missing), Improve also
reached **946 / 946**. Cloud-CP-SAT, by contrast, is stronger at cold Generate
(933/946) but requires the backend.

The non-obvious part: simply hinting the existing solution (`addHint`) was *not*
enough — the cold run already carried those hints and still landed on 927. CP-SAT
treated the hints as soft guidance and searched away from them. Only when we also
**lock a placement floor** (`sum(placed) ≥ the number of warm-started Cards`)
does the solver accept the given timetable as its first incumbent and improve
from there rather than searching blind.

## Decision

Position WASM-CP-SAT primarily as the **Improve** engine. In Improve mode it:

1. Adds the existing Cards (`school.cards`) as hints, and
2. Locks `sum(placed) ≥ warm-started count`, so placement can only go up.

It remains usable for cold Generate, but that path is strictly weaker than
Cloud-CP-SAT and should not be the headline use.

## Consequences

- The in-browser solver can reach **100% placement** on a re-solve, which cold
  search cannot guarantee on this NP-hard, over-subscribed instance.
- Improve depends on a starting timetable, so the Generate step (e.g. the JS CSP
  Solver, or a prior solve) feeds it. The Generate→Improve handoff is now a
  first-class flow, not an afterthought.
- The placement floor assumes the warm-start is feasible under the hard model. If
  it is not (e.g. it violates the per-day cap), the floor could make the model
  infeasible; callers must pass a hard-feasible starting solution.

## Alternatives considered

- **Cold-Generate rival to Cloud** — simpler mentally, but strictly worse than
  Cloud at that job and leaves the 100% result on the table.
- **`fixVariablesToTheirHintedValue`** — reproduces the input exactly (946/946 in
  1.2 s) but cannot improve soft quality, so it verifies rather than improves.
- **`repairHint`** — the intended "improve from hint" knob, but it failed to find
  a solution on this model (0 placed). The placement-floor approach is what works.
