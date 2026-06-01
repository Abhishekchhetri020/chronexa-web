#!/usr/bin/env bash
# Concatenate the 134 entry-script files into a single bundle.
#
# Extracts the ordered ["dir","name"] pairs from index.html so the bundle
# stays in sync with canonical load order.

set -euo pipefail
cd "$(dirname "$0")"

OUT="js/bundle.js"
MAN="js/bundle.manifest.txt"
VERIFY=0

for arg in "$@"; do
  if [[ "$arg" == "--verify" ]]; then
    VERIFY=1
  fi
done

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
  # Comment out ES6 exports so classic scripts don't throw syntax errors in browser
  sed -E 's/^export[[:space:]]+\{/\/\/ export \{/; s/^export[[:space:]]+default/\/\/ export default/' "$path" >> "$OUT"
  echo "" >> "$OUT"
  echo "$path" >> "$MAN"
  count=$((count + 1))
done < "$TMP"

rm -f "$TMP"
echo "✓ Bundle: $OUT ($count files, $(wc -c < "$OUT") bytes)"

if [[ "$VERIFY" == "1" ]]; then
  verify_status=0

  marker_count=$(grep -c '^/\* ─── FILE: .* ─── \*/$' "$OUT" || true)
  marker_count=$(printf '%s' "$marker_count" | tr -d '[:space:]')
  manifest_count=$(wc -l < "$MAN" | tr -d '[:space:]')
  if [[ "$marker_count" == "$manifest_count" ]]; then
    echo "✓ file-count"
  else
    echo "✗ file-count: bundle markers $marker_count != manifest lines $manifest_count"
    verify_status=1
  fi

  sanitization_matches=$(grep -nE '\b(ExportAsc|ImportAsc|AscXml|AscRoz|EduPage|edupage)\b' "$OUT" || true)
  if [[ -z "$sanitization_matches" ]]; then
    echo "✓ sanitization"
  else
    sanitization_summary=$(printf '%s\n' "$sanitization_matches" | sed 's/[[:space:]][[:space:]]*/ /g' | tr '\n' ';')
    echo "✗ sanitization: prohibited identifiers found at $sanitization_summary"
    verify_status=1
  fi

  missing_path=""
  while IFS= read -r manifest_path || [[ -n "$manifest_path" ]]; do
    if [[ ! -f "$manifest_path" ]]; then
      missing_path=$manifest_path
      break
    fi
  done < "$MAN"
  if [[ -z "$missing_path" ]]; then
    echo "✓ paths-exist"
  else
    echo "✗ paths-exist: missing $missing_path"
    verify_status=1
  fi

  exit "$verify_status"
fi
