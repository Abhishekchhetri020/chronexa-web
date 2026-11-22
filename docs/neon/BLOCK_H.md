# Block H — Reliability of User Data (`20261122-p275-data-reliability`)

- **Branch:** `neon/h-data-reliability` (merged `--no-ff` to `main` as `b8dd112`, feature commit `bf19c8e`)
- **Live URL:** https://abhishekchhetri020.github.io/chronexa-web/ (`APP_VER = "20261122-p275-data-reliability"` verified live)
- **Full Release Gate (`1122-191736-gate-p275-v2`):**
  - `npx vitest run`: **587 passed** (68 files), **0 failed**
  - `npx vite build`: **ok** (`2.68s`, 0 chunks `> 500 kB`)
  - `npx playwright test --config pw.chrome.config.local.mjs`: **150 passed, 1 skipped** (`e2e/substitutions-flow.spec.js:221`), **0 failed** (`12.4m`)

## Changes Implemented

### H1 — Demo peek never overwrites a real saved school
- **Files:** `js/ui/components/auto_save.js`
- **Behavior:** Untouched demo loads (`autoRestore: false`) check existing `chronexa.autosave.v1` and refuse to overwrite an existing `autoRestore: true` real school. Reloading after opening the demo restores the real school cleanly.

### H2 — Multi-tab save conflict protection
- **Files:** `js/ui/components/auto_save.js`
- **Behavior:** Added per-tab `TAB_ID`, `adoptedTs` tracking, a `window.addEventListener("storage", ...)` listener, and a pre-save conflict check (`existing.tabId !== TAB_ID && existing.ts > adoptedTs && !opts.forceOverwrite`). When another tab saves newer data, the stale tab refuses to silently overwrite it and shows `[data-testid="chrx-multitab-warning"]` (positioned at `top:72px; right:16px; z-index:10050`, clear of `#chrx-pwa-banner`) with **"Keep this tab"** (`forceOverwrite: true`) and **"Load other tab"** actions.

### H3 — Broken / empty / non-timetable XML import error handling
- **Files:** `js/xml/parse_timetable_xml.js`, `js/ui/main.js`
- **Behavior:** `parseText()` now throws clear, descriptive errors on empty XML and on valid XML that lacks `<timetable>`, `<lessons>`, `<classes>`, or `<teachers>`. `wireXmlUpload()` catches parse errors, displays the message in `#xml-status`, triggers an error toast via `window._chrxNotify(..., "error")`, and resets `input.value = ""` so the page never goes blank and the user can retry immediately.

### H4 — Export → import aSc XML round-trip for day/week/term patterns
- **Files:** `js/ui/entities/days.js`, `js/ui/io/export_timetable_xml.js`
- **Behavior:** Added `syncDaysDefs(school)` on `add`/`update`/`delete` mutations in `js/ui/entities/days.js` and `<daysdefs>` replacement in `exportFromTemplate()` in `js/ui/io/export_timetable_xml.js` (completing day/week/term pattern round-trip alongside Block E's `weeksDefs`/`termsDefs` sync).

### H5 — Version history restore
- Verified intact in the full gate via `e2e/w3-1-version-history.spec.js`.

## Verification & Regression Tests
- **New spec:** `e2e/block-h-reliability.spec.js` — **4/4 passed** (`16.1s` standalone; all 4 passed in full gate):
  1. H1: real school saved → open Demo → reload → real school auto-restored.
  2. H2: two tabs open → Tab 2 saves → Tab 1 shows `[data-testid="chrx-multitab-warning"]` instead of silently overwriting, and **"Keep this tab"** resolves cleanly.
  3. H3: empty, malformed, and non-timetable XML imports show clear error status/toast and never produce a blank page.
  4. H4: custom day pattern (`days="101000"`), week pattern, and term pattern survive export → fresh re-import.
- **Test stability fix:** Updated `e2e/block-e-regression.spec.js` to clear `localStorage` before the `page.goto("/")` re-import step so F0 auto-restore never races with fresh re-import.
