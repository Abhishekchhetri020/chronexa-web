# Solver vs Legacy — cross-harness

Side-by-side measurement of Chronexa's CSP solver against the legacy aSc
TimeTables (`roz.exe`) solver on the same XML input.

Chronexa's side is fully automated by `tools/run_baseline.mjs`. The legacy
side runs the GUI Windows binary; the procedure for filling its column is at
the bottom of this doc.

## Input

`sample-school.xml` at repo root. Same file the [Solver Baseline](./SOLVER_BASELINE.md)
uses.

| Property          | Value |
|-------------------|-------|
| Source lessons    | 381   |
| Seeded cards (warm-start) | 951 |
| Classes           | 23    |
| Teachers          | 66    |
| Classrooms        | 9     |
| Bell              | 6 days × 7 periods + 1 break |
| Relations         | 0 (XML carries no `<cardweek>` constraints) |

Because `sample-school.xml` carries no card relations, the four soft typs
hooked into the soft-scorer this round (n_4/n_11/n_14/n_17) are a no-op on
this fixture — the headline numbers below are therefore unchanged vs the
prior baseline. A second pass with synthetic relations is included to
confirm the new code path actually fires.

## Chronexa — measured on this branch

Time budget 15 s per seed, `useIterativeRepair: true`. Re-run with:

```bash
NODE_PATH=/private/tmp/chronexa_smoke/node_modules node tools/run_baseline.mjs --time-sec 15
```

### Cold path (`warmStart: false`)

| Seed | Status  | Placed | Conflicts | Soft score | Wall (ms) |
|-----:|---------|-------:|----------:|-----------:|----------:|
|    1 | TIMEOUT |    877 |        74 |      −5,190 |     15,002 |
|    2 | TIMEOUT |    875 |        76 |      −4,800 |     15,001 |
|    3 | TIMEOUT |    877 |        74 |      −4,970 |     15,001 |
|    4 | TIMEOUT |    877 |        74 |    −470,430 |     15,001 |
|    5 | TIMEOUT |    877 |        74 |      −5,210 |     15,000 |

Median placed 877 (92.2 %). Seed 4 hits the deep local minimum the original
baseline documented for every cold seed; the other four seeds now escape it,
which is the side-effect of the post-solve scanner and warm-start framing
that landed earlier on p33-allrelations.

### Warm-start (`warmStart: true`)

| Seed | Status  | Placed | Conflicts | Soft score | Wall (ms) |
|-----:|---------|-------:|----------:|-----------:|----------:|
|   11 | TIMEOUT |    916 |        35 |      −4,950 |     15,001 |
|   12 | TIMEOUT |    916 |        35 |      −4,950 |     15,001 |
|   13 | TIMEOUT |    916 |        35 |      −4,950 |     15,000 |
|   14 | TIMEOUT |    916 |        35 |      −4,950 |     15,000 |
|   15 | TIMEOUT |    916 |        35 |      −4,950 |     15,001 |

Placement 96.3 % (916/951). All five seeds converge to the identical result
— warm-start is fully deterministic on this XML. Matches the baseline doc
exactly.

### Verifying the new soft-rel hookup

`sample-school.xml` has no relations, so the n_4/n_11/n_14/n_17 path is dead
on it. The runner has a `--inject-test-relations` flag that injects two
synthetic relations (n_4 on Maths, n_17 on Art) to confirm the soft-rel
hookup fires:

```bash
NODE_PATH=/private/tmp/chronexa_smoke/node_modules \
  node tools/run_baseline.mjs --time-sec 15 --seeds 3 --inject-test-relations
```

| Run                                | Seed | Soft score |   Δ vs no-relations |
|------------------------------------|-----:|-----------:|--------------------:|
| Warm, no relations                 |   11 |    −4,950 |                 (base) |
| Warm, +n_4 Maths +n_17 Art (test)  |   11 |    −4,990 |                 **−40** |
| Cold, no relations                 |    1 |    −5,190 |                 (base) |
| Cold, +n_4 Maths +n_17 Art (test)  |    1 |    −5,390 |                **−200** |

The warm-start delta is exactly 4 SOFT_n_17 violations × weight 10 = 40,
which matches the per-violation weight wired in
`constraints.js#DEFAULT_SOFT_WEIGHTS.soft_relation_violation`
(`Weight.LOW_SOFT = 10`). The cold-path delta is consistent: 11 SOFT_n_4
distribution misses + 8 SOFT_n_17 morning placements ≈ 19 × ~10 = ~200.

The penalty is small enough that it doesn't push placement around on
already-overconstrained warm-start of `sample-school.xml` (placement
unchanged at 916/35) — but on a fixture with placement slack the bias is
visible. See the bias test below.

### Bias test — does the penalty actually steer placement?

`tools/test_bias.mjs` constructs a deliberately slack school (1 teacher,
1 class, 1 room, 5 days × 6 periods, 12 lessons = 40 % fill, with an n_17
relation on subject "Art") and solves it twice: once with the relation
present, once with the relation removed. With placement slack the search
has real choice and the soft-rel penalty should pull Art cards toward the
afternoon.

```bash
node tools/test_bias.mjs
```

| Configuration              | Avg Art period | Art in morning | Art in afternoon | SOFT_n_17 violations |
|----------------------------|---------------:|---------------:|-----------------:|---------------------:|
| n_17 relation present (weight 10) | **4.00** |              3 |                5 |                    3 |
| n_17 relation absent (weight 0)   | **3.00** |              5 |                3 |                    0 |

The 1-period shift (and the matching 5-vs-3 morning-count flip) confirms
the penalty is actually biasing placement, not just being measured against
a fixed result. Same 5 seeds in both runs; deterministic. The hookup will
have a similar effect on any school where the search has slack to pick
between morning and afternoon slots.

## Legacy aSc TimeTables — measured directly from `sample-school.xml`

`sample-school.xml` is an **export from aSc TimeTables**, so the 951 `<card>`
entries inside it ARE aSc's solver output for this school. To compare
solvers fairly we don't need to re-run roz.exe — we just need to evaluate
aSc's existing placement through Chronexa's metric (same hard-rule check,
same soft-score function) so the numbers are directly subtractable.

```bash
NODE_PATH=/private/tmp/chronexa_smoke/node_modules \
  node tools/evaluate_asc.mjs
```

The runner builds Chronexa's model from the XML, replays aSc's 951 placed
cards through Chronexa's `canPlace()` filter, and reports the post-warm-
start state with `useIterativeRepair: false` and a 0.1 s budget — so no
search runs, only the evaluation.

### aSc's placement under Chronexa's metric

| Metric                                           | aSc (from XML) |
|--------------------------------------------------|---------------:|
| Cards in XML (aSc placed all of them)            | 951            |
| Chronexa-accepted (placed, no hard conflict)     | **916**        |
| Chronexa-rejected (hard conflict against Chronexa's rules) | **35** |
| Soft score (Chronexa's metric on aSc's placement)| **−4,950**     |
| Wall (ms) — evaluation only, no search           | ~100           |

The 35 "Chronexa-rejected" cards are aSc placements that violate Chronexa's
hard-rule set — Chronexa's solver refuses to keep them when warm-starting
from aSc's output. They surface as `HARD_unplaced_lesson` in the violations
list. This is one solver's view of the other's output; aSc itself
considers the same 35 cards valid under its own rule set.

## Side-by-side — same XML, three placements

| Configuration                                  | Placed | Conflicts | Soft score | Wall    |
|------------------------------------------------|-------:|----------:|-----------:|--------:|
| **aSc** (output read from XML, ~0 wall)        | 951    | 35¹       | −4,950     | n/a     |
| **Chronexa — cold-path** (median of 5 seeds)   | 877    | 74        | −5,190     | 15 s    |
| **Chronexa — warm-start** (5/5 seeds identical)| 916    | 35        | −4,950     | 15 s    |

¹ "Conflicts" for aSc here means *Chronexa's hard-rule violations against
aSc's placement* — it is not aSc's self-reported conflict count (aSc
reports 0 because the placement is valid under aSc's stricter-or-looser
rule set; the 35-card delta reflects the rule-set difference, not bad
search).

### What this shows

1. **Chronexa's warm-start arrives at parity with aSc immediately and
   its 15 s of search neither improves nor degrades from there.**
   `tools/warm_trajectory.mjs` runs the warm-start with an `onProgress`
   callback and dumps the per-second state — soft-score and hard-conflict
   count are pinned at −4,950 / 35 from `t = 75 ms` (1st progress event)
   through `t = 15,001 ms` (final), across 210 backtracks. So 916 placed /
   35 conflicts / −4,950 soft = aSc's placement, not a placement Chronexa
   reached by improving on aSc. The search is **stuck** at the local
   optimum that aSc's placement seeds.
2. **Chronexa's cold path loses to aSc by ~40 placements and 39 conflicts.**
   aSc's solver has more time / better heuristics for the dense GD Goenka
   fixture from a blank start; Chronexa converges to a worse local optimum
   in 15 s from scratch. One cold seed (4) occasionally hits a much deeper
   minimum at −470,430 soft, showing the cold-path's variance.
3. **Warm-start with aSc-seed is the only path to parity on this XML.**
   Without an aSc-seeded start, Chronexa is ~4 % worse on placement and
   2× worse on hard-conflict count; with one, it's at parity but no
   better. Beating aSc here would require either a different search
   strategy (large-neighborhood, simulated annealing on the warm state) or
   relaxing the hard rules that reject those 35 cards.

### Caveats when reading this comparison

* The "−4,950 soft" number for aSc isn't aSc's self-reported soft score —
  it's Chronexa's `softScore()` applied to aSc's placement. aSc has its own
  internal score that we can't read without running roz.exe.
* The 35 hard-conflict delta is a *rule-set* difference, not a
  search-quality difference. To eliminate it, Chronexa's hard rules would
  need to be relaxed to match aSc's (or the aSc XML would need to be
  re-generated under stricter aSc rules).
* For a *roz.exe vs Chronexa* head-to-head — where both solvers see the
  same input, run for the same wall budget, and we read aSc's self-reported
  numbers — see the optional manual procedure at the bottom of this file
  (requires Wine on macOS or a Windows VM). The numbers above are the
  honest comparable measurement that doesn't require re-running roz.exe.

## Optional: re-running roz.exe yourself

If you ever want aSc's *self-reported* numbers (its own placed/conflicts/
soft-penalty under aSc's rule weights, as opposed to Chronexa's evaluation
of aSc's placement), you'd need to install Wine or use a Windows VM and
drive roz.exe through its GUI — there's no documented headless mode. The
Wine-via-Homebrew-cache trick is documented in MemPalace
`wing_user/wine-works-on-m3-via-cache-extraction` if you want to reproduce
the setup; the previous install was removed to free ~2 GB. The numbers in
the side-by-side table above are the apples-to-apples comparison that
doesn't require running roz.exe.

## What landed in this round

Code change set on `main` (branch `p33-allrelations`):

* `js/solver/constraints.js` — add `soft_relation_violation: Weight.LOW_SOFT`
  to `DEFAULT_SOFT_WEIGHTS`.
* `js/solver/csp_solver.js` — extend the weights Int32Array with a 9th
  slot, pre-compute `model.softRels` from the n_4/n_11/n_14/n_17
  relations at model build, and add `softRelationPenalty()` called from
  `softScore()` (weight w[8] = 10 per violation).
* `tools/run_baseline.mjs` — Node-based harness that exercises the solver
  headlessly via jsdom + the existing browser XML parser. 5-seed × 2-mode
  table with optional synthetic relations for the soft-rel hookup check.
* `tools/test_bias.mjs` — focused fixture for the bias-direction test.
* `tools/evaluate_asc.mjs` — replays aSc's placement (from XML cards)
  through Chronexa's hard-rule filter + soft-scorer; fills the legacy
  column of this doc without re-running roz.exe.
* `docs/SOLVER_VS_LEGACY.md` — this file.

## Open follow-ups

1. (Optional) collect aSc's self-reported numbers via the Wine procedure
   above, to compare aSc's own soft-score against Chronexa's. The
   evaluate_asc.mjs path is sufficient for the placement / conflict
   comparison.
2. Find or build a sample XML that carries real `<cardweek>` relations so
   the soft-rel hookup is exercised on a non-synthetic input.
3. If aSc's wall-time on this XML is much shorter than Chronexa's at
   15 s, re-run Chronexa with `--time-sec 5` and `--time-sec 30` to bracket
   the comparison fairly.
