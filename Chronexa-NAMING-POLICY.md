# Naming policy

**Purpose:** avoid trademark/copyright exposure from third-party scheduler vendors.

## Banned tokens

The following tokens MUST NOT appear in any file in this repository (case-insensitive matching), except for the few documented exceptions below:

| Banned token | Use instead |
|---|---|
| `aSc` / `ASC` / `asc` / `Asc` | `Classic` (UI) or `Timetable` (file format) |
| `aSc TimeTables` / `aSc Timetables` | `Classic Timetable` |
| `aSc XML` | `Timetable XML` |
| `EduPage` / `Edupage` / `edupage` / `EDUPAGE` | `Classic` (UI) or `Cloud` (when referring to provider) |
| `asctt2012` | `sample-school` (filename) |
| `ascttdivision` (XML attr name OK as data; as identifier → rename) | `divisionTag` (identifier) |

## Allowed exceptions

1. **English words that contain those letter sequences** but are unrelated (e.g. `ascending`, `cascade`, `ascertain`, `JavaScript`, `classification`). The check uses word-boundary regex so these are safe.
2. **External-website URLs in docs only** (e.g. `https://example-school.invalid/...`). Already neutralized to `.invalid` placeholders.
3. **Imported XML data** — the file format we read/write contains attribute names like `<daysdef days="100000"/>`. Those attribute names are part of the foreign file format; we are a compatible reader/writer. They live inside data strings, not as JS identifiers.

## Enforcement

### Manual check

```bash
grep -rinoE "(EduPage|EDUPAGE|edupage|Edupage|\baSc\b|\bASC\b|asctt|edupage-skin|export_asc_|import_asc_|parse_asc_)" \
  --include="*.js" --include="*.html" --include="*.css" \
  --include="*.json" --include="*.md" --include="*.yml" --include="*.xml" . \
  2>/dev/null | grep -v ".git/" | grep -v "Chronexa-NAMING-POLICY.md"
```

If the command returns any lines, the codebase is dirty — fix before commit.

### Pre-commit hook (optional)

Save as `.git/hooks/pre-commit`:

```bash
#!/usr/bin/env bash
banned=$(git diff --cached --name-only | xargs -I {} grep -lE \
  "(EduPage|EDUPAGE|edupage|Edupage|\\baSc\\b|\\bASC\\b|asctt|edupage-skin)" \
  {} 2>/dev/null | grep -v "Chronexa-NAMING-POLICY.md")
if [ -n "$banned" ]; then
  echo "✗ Banned tokens detected in staged files:"
  echo "$banned"
  echo "See Chronexa-NAMING-POLICY.md."
  exit 1
fi
```

### CI check

The release workflow (`.github/workflows/release.yml`) can grep-fail on a tag push.

## Why this matters

aSc TimeTables and Classic are commercial scheduler products. Chronexa is a fully-original implementation; we built our own solver, our own UI, our own data model. References to those product names in our marketing or code could trigger trademark concerns. By keeping the codebase neutral we make Chronexa independent.

The XML file format we read/write is a public/de-facto interchange format used by many schedulers; reading and writing it is fair use, but we should not brand around the original tool's name.

## When in doubt

- A label in the UI? → use generic terms (`Timetable XML`, `import`, `export`).
- A function name? → describe what it does (`parseTimetableXml`, not `parseAscXml`).
- A doc comment? → reference no products by name; describe the data shape.
- A user-facing menu item? → "Open existing timetable…" rather than "Open aSc XML…".
