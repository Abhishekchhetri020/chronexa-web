# Block L — Full UI Polish

## Batch L1 (`20261122-p281-l1-ui-polish`)

### What changed
1. **L0 — Early-click race & legacy header flash eliminated** (`index.html`, `js/ui/main.js`):
   - Hid the legacy `<header>` and `<nav>` from byte 0 (`body > header, body > nav, .chrx-main > header, .chrx-main > nav { display: none !important; }`) so the old `"1. Start / Editor / School Info…"` bar can never flash on screen before `ShellV3` mounts.
   - Added a capture-phase early-click queue for `#cta-build-new`, `#cta-landing-demo`, `[data-closing-demo]`, and `#cta-load-demo` before `window.__CHRX_READY__` is set; `main.js` ensures `ShellV3.mount()` has run, marks `window.__CHRX_READY__ = true`, and replays any queued click cleanly.
   - Verified in Playwright under **4× CPU throttle** clicking `#cta-build-new` within 100 ms of `DOMContentLoaded`: zero legacy header flash, template picker opens cleanly, Blank lands on the light Editor with `0 of 4 required steps done`, zero `pageerror`s.
2. **J2 review polish items** (`index.html`, `js/ui/editor/activator.js`, `js/ui/editor/grid_canvas.js`, `css/editor.css`, `js/ui/pwa_install.js`):
   - Topbar chip on an empty school now reads **`No lessons yet`** instead of `— unplaced`.
   - Replaced all 6 emoji icons (`📚👨‍🏫👥🚪📝⚡`) on the `GET STARTED` checklist cards with consistent 18×18 stroke SVG icons matching the sidebar and School Info.
   - Prevented the `"Runs entirely on your computer"` PWA banner from overlapping the landing page or the empty-school `GET STARTED` checklist, and replaced its emoji with a stroke SVG icon.
3. **Multi-screen visual audit fixes** (`js/ui/components/export_dialog.js`, `js/ui/substitution/main.js`, `css/editor-v3.css`):
   - **Export dialog**: Fixed dark-on-dark serif `"Export Timetable"` title on the dark navy header (now crisp white `#f8fafc` sans-serif), replaced developer jargon `"rendered via SVG foreignObject"` with `"High-resolution timetable image ready to share."`, and unified accent colors to the app's brand teal (`var(--chrx-accent, #0d4f54)`).
   - **Substitution planner**: Unified heading font to app sans-serif.
   - **Screenshots captured** (`docs/neon/ui-shots/l1/`): `landing-{1440,390}.png`, `empty-school-{1440,1440-dark,390}.png`, `editor-{1440,1440-dark,1280,390}.png`, `export-1440.png`, `substitutions-1440.png`, `print-preview-1440.png`.
   - **Noted for Batch L2**: Visual inspection of `empty-school-1440-dark.png` caught that secondary `.chrx-btn` (`Try a sample school`, `Test`) still renders with a white background on the empty-school dark-mode screen (while `editor-1440-dark.png` renders dark gray properly) — first item for Batch L2 alongside remaining dialogs (Verification, Advisor/Statistics, Publish, Version History, Entity dialogs).

### Full Release Gate (`p281`)
- `npx vitest run`: **587 / 587 passed** (68 files, 0 failed)
- `npx vite build`: **succeeded** (`9.73 s`)
- `npx playwright test --config pw.chrome.config.local.mjs`: **161 passed, 1 skipped** (known real-XML ranker skip), **0 failed** (`16.7 m`)

## Batch L2 (`20261122-p282-l2-ui-polish`)

### What changed
1. **L1b — Early-click replay & slow-connection notice** (`index.html`, `js/entry/main.js`):
   - Removed premature `window.__CHRX_READY__ = true` and early-click replay from `js/ui/main.js` (which fired before `school_templates.js` loaded and swallowed `#cta-build-new`).
   - Added `markReadyAndReplay()` at the end of `js/entry/main.js` (after all entry modules finish evaluating), clearing any pending boot notice timer, removing `#chrx-boot-timeout`, restoring the button label, and replaying the queued CTA click cleanly.
   - Added `"Loading…"` visual feedback on queued early CTA clicks and a **20-second calm reassurance notice** (`#chrx-boot-timeout`, neutral slate `role="status"`, *"Still loading Chronexa — your click will open as soon as it is ready."*) that starts **only** when a CTA click is actually queued, never sets `__CHRX_READY__` early, and keeps the click queued until boot finishes.
2. **Dark-mode button contrast without flattening danger buttons** (`css/design-v3.css`, `css/editor-v3.css`):
   - Added global dark-mode secondary button contrast rules (`.chrx-btn:not(.chrx-btn--primary):not(.chrx-btn--danger)`) and `#editor-toggle-skin` styling so `Try a sample school`, `Test`, and the skin toggle render cleanly on dark surfaces.
   - Explicitly preserved `.chrx-btn--danger` with high-contrast dark-mode danger styling (`#f87171` text and subtle red border/hover) instead of flattening it to neutral white.
3. **Playwright E2E coverage & multi-screen dialog screenshot audit** (`e2e/block-l-ui-polish.spec.js`, `docs/neon/ui-shots/l2/`):
   - Expanded `e2e/block-l-ui-polish.spec.js` to 5 tests: early-click `#cta-build-new` under 4× CPU throttle, early-click `#cta-landing-demo` under 4× CPU throttle, slow **200 KB/s** `Network.emulateNetworkConditions` + early-click `#cta-build-new` (verifying picker opens and `#chrx-boot-timeout` count is 0), empty-school dark-mode contrast & 390 px overflow check, and multi-screen dialog audit (Verification, Advisor, Statistics, Publish, Version History, Lessons).
   - **Queued for Batch L3 (`p283`)** from visual review of `docs/neon/ui-shots/l2/`:
     1. Publish timetable dialog in dark mode has hardcoded light card backgrounds (`#fff` / `#f4f7ff` / `#f1f5f9`) causing white-on-white option titles, and `Escape` does not close it.
     2. Advisor, Statistics, and Version History headings still use serif font + emoji icons (`💡`, `📊`, `🕒`), and Advisor action buttons use bright blue instead of brand teal.

### Full Release Gate (`p282`)
- `npx vitest run`: **587 / 587 passed** (68 files, 0 failed)
- `npx vite build`: **succeeded** (`3.60 s`)
- `npx playwright test --config pw.chrome.config.local.mjs`: **163 passed, 1 skipped** (known real-XML ranker skip), **0 failed** (`11.4 m`)

## Batch L3 (`20261123-p283-l3-ui-polish`)

### What changed
1. **L3-0 — Early-click guard moved into `<head>`** (`index.html`):
   - Moved the entire capture-phase early-click guard + boot-crash fail-safe `<script>` from the end of `<body>` into `<head>` so `window.__CHRX_EARLY_WIRED__ === true` from byte 0 before any CTA button in `<body>` is parsed.
   - Fixes slow-connection (200 KB/s, 300 ms latency) real mouse clicks on the topbar `"Try demo"` button (`[data-closing-demo]`) at ~1–2 s that were previously lost before the end-of-body script ran.
2. **L3-1 — Publish dialog dark mode & Escape + focus return** (`js/ui/components/publish_dialog.js`, `js/ui/entities/dialog_shell.js`):
   - Replaced all hardcoded light backgrounds/borders/text (`#fff`, `#f4f7ff`, `#f1f5f9`, `#e2e8f0`, `#1e3a8a`, `#334155`, `#475569`, `#64748b`) in Publish with theme tokens (`--chrx-bg-tile`, `--chrx-accent-bg`, `--chrx-accent`, `--chrx-fg`, `--chrx-fg-secondary`, `--chrx-line`).
   - Added standalone `Escape` key handler and opener focus restoration to `EntityDialog.openSheet()` / `closeSheet()` so Publish, School Settings, and all standalone sheets close cleanly on `Escape` and return focus.
3. **L3-2 — Advisor, Statistics, Version History, Verification & app-wide icon/brand-teal sweep** (`js/ui/components/icons.js`, `advisor.js`, `statistics_panel.js`, `version_history.js`, `verification_panel_pro.js`, `export_dialog.js`, `dashboards.js`, `lessons_grid_matrix.js`, `saved_views.js`, `view_filter.js`, `print_settings_dialog.js`, `school_settings_dialog.js`, `lessons.js`, `custom_fields.js`, `wizard_walkthrough.js`, `approbation_matrix.js`, `color_taxonomy.js`, `constraints_library.js`, `ai_actions.js`, `index.html`):
   - Added `bulb`, `chart`, `trend`, `file`, `globe`, `image` to `ChrxIcons`.
   - Switched Advisor, Statistics, Version History, and Verification headings from serif to `--chrx-font-sans`, replaced dialog header/section/export emoji icons with `ChrxIcons` SVGs, converted all three panels + Export dialog to dark-mode theme tokens, added Escape + focus-return to Version History (and focus-return to Advisor/Statistics), and replaced hardcoded bright-blue buttons/accents (`#2563eb`, `#3b82f6`, `#1d4ed8`, `bg-blue-600`) with brand teal (`var(--chrx-accent, #0d4f54)`).
4. **L3-3 — Dark-mode shell toggles, topbar date-clear, & full dark-mode audit** (`index.html`, `css/design-v3.css`):
   - Fixed `.chrx-shell-toggle` in dark mode (including active `.is-side-hidden` / `.is-rail-hidden` / `.is-fullscreen` states) so they never render as light `rgb(239, 239, 241)` squares.
   - Replaced Tailwind slate classes on `#editor-date-clear`, `#editor-date-input`, and its label with theme-token classes (`.chrx-date-clear`, `.chrx-date-input`, `.chrx-date-label`), and added dark-mode surface/input overrides for dialogs and print preview.
5. **L3-4 — Boot-crash fail-safe** (`index.html`):
   - Added capture-phase `error` + `unhandledrejection` handler before `__CHRX_READY__`: clears any pending 20 s notice timer, restores any queued CTA button (never stuck on `"Loading…"`), prevents post-crash clicks from re-entering `"Loading…"`, and shows `#chrx-boot-error` (`role="alert"`): *"Chronexa could not start. Please refresh the page."*
6. **L3-5 — New E2E tests & 1440/390 light/dark screenshots** (`e2e/block-l-ui-polish.spec.js`, `docs/neon/ui-shots/l3/`):
   - Added `L3-item0` (real `page.mouse.click` on Try demo under 200 KB/s + 300 ms latency asserting `__CHRX_EARLY_WIRED__ === true` before body finishes), `L3-boot-crash` (aborting `index-*.js` chunk via `page.route`), and `L3-dark-audit` (computed-color white-on-white DOM walker + Escape-close check across Publish, Advisor, Statistics, Version History, Verification, Export, and Lessons + `.chrx-shell-toggle` check + 11 screenshots in `docs/neon/ui-shots/l3/`).

### Full Release Gate (`p283`)
- `npx vitest run`: **587 / 587 passed** (68 files, 0 failed)
- `npx vite build`: **succeeded** (`2.05 s`)
- `npx playwright test --config pw.chrome.config.local.mjs`: **165 passed, 1 skipped** (known real-XML ranker skip), **1 transient perf jitter** (`w2-5-availability-shading.spec.js:67` `pickupDuration` 100.43 ms vs 100 ms; immediately re-verified **2/2 passed in 6.5 s**, `block-l-ui-polish.spec.js` **8/8 passed**).
