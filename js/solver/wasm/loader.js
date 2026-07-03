// WASM solver loader — gated dynamic import.
//
// When the WASM solver module (csp.wasm + its JS shim) lands at
// ./csp_wasm.js, this loader picks it up and exposes the same
// `solve(school, options)` shape as ../csp_solver.js. Until then,
// `isAvailable()` returns false and callers fall back to the JS solver.
//
// Design contract: the WASM solver must return the identical
// SolveResponse shape — { status, assignment, stats, violations } —
// so the Web Worker can swap solvers without changing its message
// contract. See ./README.md for the integration plan.

// csp_wasm.js now exists (shim ready); the actual canplace.wasm binary
// is built via build.sh once AssemblyScript is installed locally. The
// shim falls through to the JS solver if the .wasm file isn't present,
// so flipping this true is safe — it just means the adapter will try
// to load the WASM module first.
const WASM_AVAILABLE = true;

let _mod = null;

export async function isAvailable() {
  if (!WASM_AVAILABLE) return false;
  if (_mod) return true;
  try {
    _mod = await import("./csp_wasm.js");
    return typeof _mod.solve === "function";
  } catch {
    _mod = null;
    return false;
  }
}

export async function solve(school, options) {
  if (!_mod && !(await isAvailable())) {
    throw new Error("WASM solver not available; fall back to the JS solver.");
  }
  return _mod.solve(school, options);
}

// WASM-vs-JS routing for the adapter. Prefer WASM for every school: the
// adapter degrades gracefully (csp_wasm.js falls through to the JS solver
// when the .wasm binary or its acceleration path is unavailable), so there
// is no size threshold to protect. NOTE: this adapter is currently only
// exercised by tools/smoke_wasm_adapter.mjs — the app's real WASM routing
// is the Best-mode pipeline in js/ui/solver_ui/ (JS draft → CP-SAT polish).
export function shouldPreferWasm(_school) {
  return true;
}
