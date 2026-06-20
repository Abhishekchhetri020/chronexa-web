# 2. "Best timetable" runs a silent two-stage pipeline

Date: 2026-06-20
Status: Accepted

## Context

[ADR-0001](0001-wasm-cpsat-is-the-improve-engine.md) established that WASM-CP-SAT
reaches 100% placement when warm-started (Improve), but is mediocre at cold
Generate (927/946). Improve needs a starting timetable.

The JS CSP Solver has the opposite shape: it produces a *draft fast*, but at lower
final quality. So the two Solvers are complementary.

Measured (60 s budget, fully offline, in-browser):

| Path | Placed | Soft penalty |
| --- | --- | --- |
| Cold WASM-CP-SAT Generate | 927 / 946 | −65,000 |
| WASM-CP-SAT Improve (warm-start) | 946 / 946 | −30k…−35k |
| **JS draft → WASM-CP-SAT Improve (two-stage)** | **946 / 946** | **−1,800** |

The two-stage path gave both 100% placement *and* the best soft quality of any
offline run.

## Decision

Add a fourth mode, **"Best timetable"**, that silently runs a two-stage pipeline:

1. **Stage 1 — Draft:** the JS CSP Solver generates a timetable (≈35% of the
   budget).
2. **Stage 2 — Polish:** that draft seeds WASM-CP-SAT in Improve mode (≈65% of
   the budget), pushing toward 100%.

It is exposed as the `auto` backend in `SolverUI.run` and forced by the "Best"
mode regardless of the Algorithm radio. If stage 2 can't run (e.g. no JSPI), the
stage-1 draft is returned as-is — still a valid timetable.

## Consequences

- One click yields ~100% placement with good soft quality, **with no server**.
- The Algorithm radio no longer applies in "Best" mode (it's overridden to
  `auto`); the UI should reflect that the backend choice is contextual.
- Total wall-time is the sum of both stages (~53 s for a 60 s budget). The 35/65
  split is a starting point, not tuned.
- Reproducibility: stage 1 (JS metaheuristic) is not deterministic, so "Best" runs
  will vary slightly between invocations.

## Alternatives considered

- **Two manual steps** (user clicks Generate, then Improve) — simpler to build but
  most users won't click twice, leaving the 100% result unclaimed.
- **Cold WASM-CP-SAT as the one-shot generator** — caps at 927 and is slower to a
  first solution; strictly worse than the pipeline.
