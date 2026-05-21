# WASM solver fallback — design + integration plan

This directory is the home for the WASM-backed solver path that
`js/solver/worker.js` can switch to when the JS solver is too slow on a
given school (heuristic: lesson count > 5,000, or expanded-lesson count
> 10,000, or measured wall-time on first solve > 60 s).

The JS solver in `../csp_solver.js` is the default and is fast enough for
schools up to ~2,000 lessons (sample-school.xml at 951 cards finishes in
30 ms warm-start, 15 s cold-path timeout with 938+ placed). Beyond that
size, WASM provides 5–10× speedup, which the Worker uses to either solve
in real-time on the same wall-budget, or to run more search iterations
in the same budget.

## What's here today

`loader.js` — gated import of the WASM module. If
`window.__chronexaWasmSolver` is present, the worker prefers it.
Otherwise it falls back to the JS solver. The loader is intentionally a
no-op import so that the rest of the app continues to work even before
the WASM module ships.

`adapter.js` — the message-contract bridge between
`csp_solver.solve(school, options)` and a hypothetical
`wasmSolver.solve(serializedSchool, options)` that takes the
JSON-serialised model and returns the same `SolveResponse` shape. This
is what makes the swap drop-in.

## What's NOT here yet

The WASM module itself. There are three realistic paths to it; pick one
when you have a 1–3 day block to implement:

### Option A — Port `csp_solver.js` to AssemblyScript

Pros: smallest semantic delta from the JS solver (same algorithm, same
soft scorers, same group-aware conflict detection — all of today's
session's fixes carry over verbatim). AS is the closest language to JS.

Cons: ~2,500 lines of AS to write. Need to debug WASM-side memory layout
for the flat-IntArray model (Int32Array → Int32Array<i32>). Compile
toolchain is `npm install -g assemblyscript` + `asc src/index.ts -o out/csp.wasm --optimize`.

Expected speedup: 3–5× over JS on V8 (V8's JIT is already very good at
typed-array hot loops, so the win is incremental, not dramatic).

### Option B — Use OR-Tools CP-SAT compiled to WASM

Pros: world-class production solver. Handles all the constraints
Chronexa cares about. Google maintains it.

Cons: large WASM binary (~5–10 MB), needs a full constraint-model
translation layer (Chronexa's school object → OR-Tools `CpModelProto`),
loses the algorithm-level fixes from today (sibling-deficit, lab-double
expansion are Chronexa-specific). OR-Tools' WASM build is not officially
released for browsers as of 2026-05; see https://github.com/google/or-tools.

Expected speedup: 10–50× on dense schools. Best long-term answer.

### Option C — Use MiniZinc WebAssembly

Pros: MiniZinc has an official WASM build at https://www.minizinc.org/ide/. The
modelling language is high-level and well-documented.

Cons: similar to Option B — translation layer needed. MiniZinc is a
modelling language with a runtime solver behind it (e.g. Gecode, Chuffed
via WASM). Performance varies.

## Integration contract

`worker.js` already has the `{ type: "solve", school, options }` →
`{ type: "done", result }` message shape. The WASM path should
**not** change this contract. `adapter.js` will:

1. Check `loader.isAvailable()`.
2. If yes and school is "large" (lessons > 5,000), call
   `wasmSolver.solve(school, options)`.
3. If no or school is "normal", call the JS `solve(school, options)`.
4. Return the same `SolveResponse` shape (`{ status, assignment, stats,
   violations }`) so the UI doesn't need to know which solver ran.

## Why this is shipped as scaffold not implementation

Each of options A/B/C is a 1–3 day focused effort. None of them is
realistic to complete in the same session as the four upstream levers
above. Shipping this scaffold without the module:

- Locks in the integration contract so the future port doesn't have to
  refactor the worker shape.
- Documents the design tradeoffs so the future implementer doesn't
  re-derive them.
- Forces the JS solver to keep its `SolveResponse` shape stable, since
  any divergence would break the eventual WASM swap.

When the WASM module lands, `loader.js` just needs the dynamic-import
URL and `isAvailable()` flips to true. No other code in the worker or
the UI changes.
