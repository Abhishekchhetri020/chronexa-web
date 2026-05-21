#!/usr/bin/env bash
# Build the AssemblyScript canPlace hot-path to WASM.
#
# Prerequisites (one-time):
#   npm install -g assemblyscript
#
# Output:
#   js/solver/wasm/canplace.wasm   — the WASM binary
#   js/solver/wasm/canplace.wat    — text disassembly (for inspection)
#   js/solver/wasm/canplace.d.ts   — TypeScript bindings
#
# After building, csp_wasm.js (the JS shim) and loader.js flip
# WASM_AVAILABLE=true so the adapter picks up the WASM path.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v asc >/dev/null 2>&1; then
  echo "AssemblyScript compiler 'asc' not on PATH. Install: npm install -g assemblyscript" >&2
  exit 1
fi

asc assembly/canplace.ts \
  --outFile canplace.wasm \
  --textFile canplace.wat \
  --bindings raw \
  --optimize \
  --runtime stub \
  --exportRuntime

echo "✓ Built canplace.wasm ($(wc -c < canplace.wasm) bytes)"
echo "✓ Disassembly: canplace.wat"
