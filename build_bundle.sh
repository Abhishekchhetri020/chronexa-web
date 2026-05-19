#!/usr/bin/env bash
# Concatenate the 134 entry-script files into a single bundle.
#
# Extracts the ordered ["dir","name"] pairs from index.html so the bundle
# stays in sync with canonical load order.

set -euo pipefail
cd "$(dirname "$0")"

OUT="js/bundle.js"
MAN="js/bundle.manifest.txt"

# Extract entries via grep + sed (portable, no bash 4 mapfile, no awk regex).
TMP=$(mktemp)
grep -oE '\["[a-z]+","[a-z0-9_/]+"\]' index.html > "$TMP"

echo "/* Chronexa bundle — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT"
echo " * $(wc -l < "$TMP") modules concatenated in document order." >> "$OUT"
echo " * DO NOT EDIT — regenerate with bash build_bundle.sh */" >> "$OUT"
echo "" >> "$OUT"
: > "$MAN"

count=0
while IFS= read -r entry; do
  # Strip [" "] and split on ","
  e=$(echo "$entry" | tr -d '[]"')
  d=${e%,*}
  n=${e#*,}
  path="js/${d}/${n}.js"
  if [[ ! -f "$path" ]]; then
    echo "WARN: missing $path" >&2
    continue
  fi
  echo "/* ─── FILE: $path ─── */" >> "$OUT"
  cat "$path" >> "$OUT"
  echo "" >> "$OUT"
  echo "$path" >> "$MAN"
  count=$((count + 1))
done < "$TMP"

rm -f "$TMP"
echo "✓ Bundle: $OUT ($count files, $(wc -c < "$OUT") bytes)"
