# Browser constraint engine improvements — 2026-09-11

## Behavior

- **Same day, in order (`n_9`)** now works in the JavaScript CSP and browser
  CP-SAT engines. A leader must finish before its follower starts on the same
  day. Both placement orders, double-period leaders, class scope, and legacy
  `[A, B]` subject lists are covered. Unplaced partners do not invalidate a
  partial result. Relations apply to every matched leader/follower session
  pair, consistent with the existing all-pairs same-day constraints.
- The CSP includes these partners when invalidating cached candidate counts
  and finding lessons to move during repair. CP-SAT uses two conditional
  comparisons per session pair rather than enumerating forbidden slot pairs.
- **First/last (`n_16`)** honors first-only, last-only and either-edge settings,
  each class's teaching periods, and the entire double-period span. Multiple
  requirements intersect. Allowed starts are precomputed as bitmasks, removing
  repeated bell scans from the CSP placement loop. Both engines use the same
  masks; the editor uses the same mask calculation.
- A browser CP-SAT double cannot jump across a break or missing period. Its
  result contains **one card per session**, matching the JavaScript solver and
  editor. The old output emitted the tail as an extra overlapping card.
- `checkPlacement` checks plain SchoolData without requiring UI indexes,
  treats non-teaching periods as hard constraints, and checks the full span
  against class bells and teacher unavailability/preferred time off.

The optional AssemblyScript placement accelerator predates the new relation
rules. Affected lessons use the complete JavaScript check even when that
accelerator is enabled. The separate browser OR-Tools CP-SAT worker encodes
the rules directly. The Python cloud solvers are outside this change.

## Verification

- `npm run test:unit`: 58 tests pass. New regression tests reproduced 13
  failures before implementation. Agreement tests now supply generated cards
  to the verifier; previously they checked an empty timetable without indexes.
- `./node_modules/.bin/playwright test e2e/constraint-engine.spec.js`: three
  tests pass against the production build, including actual CP-SAT workers and
  the Best timetable pipeline on the bundled demo: **946/946 placed**, zero
  reported hard conflicts and zero scrubbed conflicts.
- Production Vite build and `git diff --check` pass.
- Single-run comparison with the CSP source at `878185e`, using seed 9881 and
  identical fixtures/options: 39/39, 300/300, 684/684 and 951/951 sessions remain
  placed. Scores are unchanged; timings are effectively unchanged. These are
  regression measurements, not a claim of a general solver speedup. The older
  synthetic benchmark files contain legacy bell schemas; the small-school
  agreement test normalizes its fixture to canonical SchoolData.

The existing `e2e/solver-run.spec.js` mouse-click test was blocked before
generation: `#error-slot` intercepted the Generate button. The new demo test
exercises the same browser pipeline through its API without applying the
result to the user's timetable. Editor layout changes are outside this patch.

Source changes are local; this work does not publish a release.
