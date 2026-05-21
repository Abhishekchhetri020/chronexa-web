// WASM/JS solver adapter — drop-in wrapper that picks the best backend
// for the given school. Callers use this instead of importing csp_solver
// directly when they want the WASM fallback to be considered.
//
// Today: always falls through to the JS solver because the WASM module
// hasn't shipped (`loader.isAvailable() === false`). When WASM lands,
// `shouldPreferWasm(school)` decides which backend to use; the
// SolveResponse shape is identical so the caller never has to branch.

import * as wasm from "./loader.js";
import { solve as jsSolve, VERSION as jsVersion } from "../csp_solver.js";

export const VERSION = jsVersion + " (+wasm-adapter)";

export async function solve(school, options = {}) {
  const wantWasm = wasm.shouldPreferWasm(school) && (await wasm.isAvailable());
  if (wantWasm) {
    try { return await wasm.solve(school, options); }
    catch { /* fall through to JS */ }
  }
  return jsSolve(school, options);
}
