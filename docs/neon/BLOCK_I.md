# Block I — Accessibility & Polish (`20261122-p276-accessibility`)

- **Branch:** `neon/i-accessibility` (merged `--no-ff` to `main` as `5e6e91b`, feature commit `ba2e5fc`)
- **Live URL:** https://abhishekchhetri020.github.io/chronexa-web/ (`APP_VER = "20261122-p276-accessibility"` verified live)
- **Dev Dependencies & Supply-Chain Scan:**
  - Installed pinned exact versions: `@axe-core/playwright@4.14.0` (published `2026-10-15`, 38 days old) and `axe-core@4.14.0` (published `2026-10-05`, 48 days old) — both ≥14 days old.
  - `~/go/bin/bumblebee scan --profile project --root .`: **0 findings** (`files_considered=23583`, `records=1000`, `diagnostics=0`, `736ms`).
- **Full Release Gate (`1122-200233-gate-p276`):**
  - `npx vitest run`: **587 passed** (68 files), **0 failed**
  - `npx vite build`: **ok** (`2.82s`, 0 chunks `> 500 kB`)
  - `npx playwright test --config pw.chrome.config.local.mjs`: **153 passed, 1 skipped** (`e2e/substitutions-flow.spec.js:221`), **0 failed** (`14.4m`)

## Axe-Core Audit Before → After (WCAG 2.0/2.1 A + AA, Critical & Serious)

| Surface | Before (critical/serious rules) | After |
|---|---:|---:|
| Start screen | 2 (`color-contrast`, `nested-interactive`) | **0** |
| Editor | 5 (`aria-allowed-attr`, `aria-required-children`, `aria-required-parent`, `color-contrast`, `label-content-name-mismatch`) | **0** |
| Lesson dialog | 5 (shared editor chrome) | **0** |
| Print preview | 6 (shared + `scrollable-region-focusable`) | **0** |
| Substitutions | 7 (shared + `label`, `scrollable-region-focusable`) | **0** |
| Published viewer | 1 (`color-contrast`) | **0** |
| **Total** | **26** | **0** |

## Fixes Implemented
- **Start screen (`index.html`, `css/landing-redesign.css`):**
  - Moved `<input type="file" id="xml-file">` out of `#start-open-card` and changed `#start-open-card` to a real `<button type="button">` (fixes `nested-interactive`).
  - Raised contrast on `--faint` (`#6e6e73` → `#8e8e93`), `.lx-marquee li` (`#ffffff38` → `#ffffff9e`), and `#step-1 .chrx-start-links a` (`#7cd4d9` on `#000`).
- **Editor & Shell ARIA + Contrast (`js/ui/editor/grid_canvas.js`, `js/ui/shell_v3.js`, `css/editor-v3.css`, `js/ui/components/auto_save.js`):**
  - Added `role="tab"` to `.chrx-class-rail__item` inside `role="tablist"`.
  - Wrapped `.chrx-focus-board` header and period rows in `<div role="row" style="display:contents">` so `role="grid"` → `role="row"` → `columnheader`/`rowheader`/`gridcell` is valid without altering CSS Grid layout.
  - Changed `.chrx-vkarta` (`role="button"`) from `aria-selected` to `aria-pressed`.
  - Omitted overriding `aria-label="Scheduled, ..."` on occupied `.chrx-focus-slot` cells so visible card text matches the accessible name (`label-content-name-mismatch`).
  - Raised WCAG AA contrast on light/dark muted ink (`--chrx-fg-tertiary`/`--chrx-fg-muted`: `#5e5e64` light / `#9a9aa0` dark), status tokens (`--chrx-amber`/`--chrx-orange`: `#9a2700`, `--chrx-green`: `#17692b`), card secondary text (`--e3-card-ink-l: 22%`, `.chrx-vk-line2` `opacity: 0.92`), and `#chrx-autosave-pill` (`#f8fafc` on `#0f172a`/`#92400e` with `visibility: hidden` + `prefers-reduced-motion` support).
  - Added `tabindex="0"` and `aria-label` to `.chrx-sidebar` (`js/ui/shell_v3.js`) and `.chrx-preview-doc` (`js/ui/print_preview/print_preview.js`).
- **Substitutions & Published Viewer (`js/ui/substitution/absence_input.js`, `css/viewer.css`):**
  - Connected `.chrx-sub-date` with `id="chrx-sub-date"` + `aria-label="Substitution date"` to its `<label for="chrx-sub-date">`.
  - Raised `.chrx-pub-ptime` and `.chrx-pub-foot` contrast from `#94a3b8` to `#475569`.
- **Keyboard-only Generate → Print (`js/ui/shell_v3.js`):**
  - Wired `Cmd/Ctrl+G` → `app:generate` (previously advertised in the command palette as `⌘G` but missing from the keydown handler). Full path (`Ctrl+G` → `Enter` to generate → `Enter` on auto-focused `#csu-result-apply` → `Ctrl+P` to open Print Preview → `Ctrl+P` to print → `Escape` to close) works with zero mouse clicks.

## Regression Suite (`e2e/block-i-accessibility.spec.js` — 3/3 passed)
- **I1:** Zero critical/serious axe-core violations across all 6 surfaces.
- **I2:** 390×844 mobile viewport pass across all 13 major dialogs (`Generate`, `Export`, `SchoolSettings`, `Teachers`, `Classes`, `Subjects`, `Rooms`, `Days`, `Weeks`, `Terms`, `Lesson`, `PrintPreview`, `Substitutions`) — every dialog opens with `docOverflow=0`, `left >= 0`, `right <= 390`.
- **I3:** End-to-end keyboard-only Generate → Apply → Print Preview → Print → Escape with zero mouse clicks.
