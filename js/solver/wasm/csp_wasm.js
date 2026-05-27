// WASM-backed solver shim. Same `solve(school, options)` contract as the
// pure-JS solver — internally uses the AssemblyScript canPlace() for the
// inner-loop hot path while keeping the JS backtracking driver for now.
//
// This module exists for the moment of cutover. When `canplace.wasm` is
// present at this directory, `loader.isAvailable()` flips true and the
// adapter prefers WASM.
//
// First-cut performance target: drop in-process canPlace from ~JS hot-
// loop cost to ~WASM hot-loop cost (typically 2-4× faster on V8 for
// flat-typed-array workloads). The 5-10× target requires porting more
// of the solver (state-update loops, MRV selection, repair) — that's
// the staged follow-up.

import { solve as jsSolve } from "../csp_solver.js";

let _wasmExports = null;

async function loadWasm() {
  if (_wasmExports) return _wasmExports;
  try {
    const url = new URL("./canplace.wasm", import.meta.url);
    // Node-side: read the .wasm directly. Browser-side: fetch().
    let buf;
    if (typeof fetch === "function") {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("canplace.wasm not found");
      buf = await resp.arrayBuffer();
    } else {
      const fs = await import("node:fs/promises");
      buf = (await fs.readFile(url.pathname)).buffer;
    }
    const mod  = await WebAssembly.instantiate(buf, { 
      env: {
        abort: (msg, file, line, col) => {
          console.error(`[wasm] abort at ${file}:${line}:${col}`);
          throw new Error("wasm abort");
        },
      },
    });
    _wasmExports = mod.instance.exports;
    return _wasmExports;
  } catch (e) {
    return null;
  }
}

export async function wasmCanPlaceReady() {
  return (await loadWasm()) !== null;
}

export async function wasmExports() {
  return await loadWasm();
}

export async function solve(school, options = {}) {
  // For the moment of cutover: try to load WASM, but fall through to the
  // JS solver. The full WASM path requires:
  //   1. Build the flat-buffer view of school's model arrays.
  //   2. Memcpy / share with the WASM instance via setShape + bindArrays.
  //   3. Patch csp_solver to call _wasmExports.canPlace() instead of its
  //      own JS canPlace() inside the hot loop.
  //
  // Step 3 is the genuine engineering work (~1 day). Steps 1-2 are also
  // needed but cheap by comparison. Until that lands, even with the WASM
  // module present, we still execute the JS solver because the model
  // wiring isn't done.
  await loadWasm(); // warm the module if present (no-op if absent)
  return jsSolve(school, options);
}
