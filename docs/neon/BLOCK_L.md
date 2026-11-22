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

## Batch L3b HOTFIX (`20261123-p284-l3b-hotfix`)

### What changed
1. **L3b-0 — First-visit SW reload race eliminated (`js/ui/pwa_install.js`, `js/entry/main.js`, `index.html`, `js/ui/components/auto_save.js`):**
   - On a fresh visit where `navigator.serviceWorker.controller` is null, `pwa_install.js` exposes `window.__CHRX_SW_DECISION__` and `markReadyAndReplay()` awaits it before setting `window.__CHRX_READY__ = true`, so early CTA clicks during the first-visit SW takeover are queued cleanly with `"Loading…"` instead of racing a reload.
   - Before any automatic SW/COI reload (`reloadPreservingClick()`), any queued CTA id is stored in `sessionStorage` (`chrx-queued-cta`) and replayed in `markReadyAndReplay()` after the reload.
   - `hasOpenWork()` now also detects active/in-progress CTA clicks (`window.__CHRX_CTA_IN_PROGRESS__`), open template pickers, and mounted editors, and is **re-checked inside the 300 ms `controllerchange` timer** so a reload can never fire over an already-loaded school or in-flight demo fetch.
   - Replaced the `💾` emoji and hardcoded light card in `auto_save.js`'s `"Restore previous session?"` popup with `ChrxIcons.svg("clock", 15)` + dark/theme tokens (and suppressed it while a CTA is queued/in-progress), and replaced `🔄` in `pwa_install.js`'s update banner with `ChrxIcons.svg("refresh", 15)`.
2. **L3b-1 — Boot-crash fail-safe scoped strictly to same-origin module failures (`index.html`, `js/entry/main.js`):**
   - `handleBootCrash` now triggers **only** on same-origin `<script>` / `<link rel="modulepreload">` load errors or dynamic-import module rejections — completely ignoring blocked third-party stylesheets, Google Fonts, images, and non-fatal runtime errors.
   - Preserves a backup of any queued CTA click (`__CHRX_EARLY_CLICK_BACKUP__`) so if `markReadyAndReplay()` is reached later, it removes `#chrx-boot-error`, clears `__CHRX_BOOT_FAILED__`, and still replays the click.
3. **L3b-2 — Unique IDs for both "Try demo" buttons (`index.html`):**
   - Added `id="cta-nav-demo"` on the topbar `"Try demo"` button and `id="cta-footer-demo"` on the footer `"Try the demo"` button, and made fallback ID generation unique (`chrx-early-cta-<seq>`).
4. **L3b-3 — Clean fallback font stack & third-party-blocked screenshots (`css/tokens.css`, `css/chronexa-theme.css`, `docs/neon/ui-shots/l3b/`):**
   - Updated `--chrx-font-sans` / `--font-family-body` to include `system-ui` right after `"Inter Tight"`, and `--font-family-heading` to `"Fraunces", "Iowan Old Style", Georgia, serif`.
   - Captured `landing-no-3p-1440.png` and `editor-no-3p-1440.png` with all third-party hosts blocked.
5. **E2E tests (`e2e/block-l-ui-polish.spec.js`):**
   - Added `L3b` (blocks all third-party hosts → zero `#chrx-boot-error`, unique `#cta-nav-demo` & `#cta-footer-demo`, early click opens demo).
   - Added `L3b-0` (**10× repeat** fresh browser context under 4× CPU throttle clicking `#cta-landing-demo` right at `READY` → demo opens 10/10 times with zero `"Restore previous session?"` popup).

### Full Release Gate (`p284`)
- `npx vitest run`: **587 / 587 passed** (68 files, 0 failed)
- `npx vite build`: **succeeded** (`2.02 s`)
- `npx playwright test --config pw.chrome.config.local.mjs`: **168 passed, 1 skipped** (known real-XML ranker skip), **0 failed** (`11.8 m`)

## Batch L4 — Generate Flow & Grid Polish (`20261123-p285-l4-generate-grid`)

### What changed
1. **Pre-launch dialog (`js/ui/solver_ui/prelaunch_dialog.js`, `css/solver_ui.css`):**
   - Aligned summary unit with progress/result via `SolverUI.expectedCardCount(school)` (e.g. `946 lesson periods to place`, `951 currently on the grid, 4 conflicts`).
   - Replaced all emoji/symbol icons (`◷ ⚖ ★ ↺ ↻ ＋ ✦ ✓`) with `ChrxIcons.node(...)` SVGs.
   - Replaced purple accents with brand teal tokens, removed `"soft penalties"` / `"clashes"` jargon, and added plain-English footnote explaining `"best so far"` and that Cancel leaves the timetable unchanged.
2. **Progress modal (`js/ui/solver_ui/progress_modal.js`, `index.html`, `css/solver_ui.css`):**
   - Fixed progress resetting backwards to `0 of 946` / `946 left to place` during polishing/finishing by tracking `bestPlaced` and preserving final placed counts through `"applying"` and `"done"`.
   - Replaced raw internals in `"Show details"` (`applyingPhase`, `Current branch`, `Soft penalties 9,779,290`, `Schedules / sec`, `Iterations`) with plain English (`Current step`, `Current pass`, `Balance`, `Checks / sec`, `Tries`) and replaced step-pill/tile symbols (`📋 ⏱ ✓ ✎ ✦ ▶ ◎ ▸ ↻ ◆ ⚠`) with `ChrxIcons.node(...)` SVGs.
   - Added live 500 ms elapsed timer, plain one-line cloud-fallback notice bar (`#csu-progress-fallback`) wired to `onFallback`, and renamed `"Accept partial result"` → `"Use what we have so far"`.
3. **Result panel (`js/ui/solver_ui/result_panel.js`, `css/solver_ui.css`):**
   - Standardized terminology to `conflict` / `conflicts` everywhere (no `clash` / `clashes`), explained resolved/reduced prior conflicts in the status line (e.g. `Finished in 5s · All 4 previous conflicts resolved`), removed `⛔` emoji, and added explicit `Discard` (`#csu-result-reject`) alongside `Apply`.
   - Prevented `"946 / 946"` tile from wrapping onto two lines at 390 px (`white-space: nowrap`, responsive font size).
4. **Grid, tooltips, toast & 390 px mobile layout (`js/ui/editor/card_in_hand.js`, `js/ui/editor/constraint_explainer.js`, `js/ui/components/auto_save.js`, `js/ui/main.js`, `css/editor.css`, `css/editor-v3.css`, `css/lane-class-rail.css`):**
   - Fixed rule-only invalid cell refusal modal (`showCollisionMenu`) to display `"Cannot place here"` + actual reasons instead of `"clashes with 0 lessons"`.
   - Moved `#chrx-autosave-pill` to bottom-right (`bottom:14px; right:16px`) so it never covers the bottom-left `"Unplaced lessons"` bar label.
   - Fixed stuck `.chrx-explainer-tooltip` by hiding on `mouseleave`, `pointerdown`, `scroll`, `blur`, and dialog-open events, and suppressing hover tooltips on mobile/touch (`<= 767px` / `hover: none`) or while a modal is open.
   - Cleaned up 390 px layout: grouped secondary grid toolbar controls into a `"⋯"` overflow menu (`#editor-tools-more`), hid the redundant `.chrx-class-rail` on `<= 767px` (keeping the Class dropdown), and fixed right-edge clipping on `.chrx-focus-boardbar` / `.chrx-overview-bar`.
5. **E2E tests & screenshots (`e2e/block-l4-generate-grid.spec.js`, `docs/neon/ui-shots/l4/`):**
   - Added `L4-1` (plain pre-launch counts, no raw internals in progress details, live elapsed timer, Cancel mid-generate leaves cards 100% identical), `L4-2` (`conflict(s)` wording, single-line 390 px tile, bottom-right autosave pill, Apply then Undo restores identical cards), and `L4-3` (real mouse drag onto invalid red cell refused with plain-English reason + 390 px layout/tooltip/rail checks) with 10 light/dark 1440 & 390 screenshots.

### Full Release Gate (`p285`)
- `npx vitest run`: **587 / 587 passed** (68 files, 0 failed)
- `npx vite build`: **succeeded** (`1.98 s`)
- `npx playwright test --config pw.chrome.config.local.mjs`: **171 passed, 1 skipped** (known real-XML ranker skip), **0 failed** (`14.3 m`)

## Batch L5 — Output Screens & p285 Leftovers (`20261123-p286-l5-output-screens`)

### What changed
1. **p285 Leftover (a) — 390 px `"All classes"` zero right-edge overflow (`css/editor-v3.css`):**
   - Collapsed `.chrx-shell` to single-column (`minmax(0, 1fr)`) under `@media (max-width: 767px)`, turning an open `.chrx-sidebar` into a fixed overlay drawer instead of pushing `.chrx-main` off-screen, and constrained `.chrx-focus-boardbar`, `.chrx-focus-boardbar__overview`, and `.chrx-overview-bar` to `100%` width (`box-sizing: border-box`, `grid-template-columns: auto minmax(0, 1fr) auto`).
2. **p285 Leftover (b) — Removed unexplained Balance number in Generate `"Show details"` (`js/ui/solver_ui/progress_modal.js`):**
   - Hid the opaque `#csu-stat-soft` tile so `"Show details"` displays only plain-English progress details (`Current step`, `Tries`, `Checks / sec`, `Current pass`, `Currently placing`, `Currently stuck`).
3. **p285 Leftover (c) — Real conflict count in Pre-launch & Result (`js/ui/solver_ui/prelaunch_dialog.js`, `js/ui/solver_ui/result_panel.js`):**
   - Switched both dialogs from the missing `global.Verifier` reference to the real `global.VerificationPro.countHardConflicts(school)`. Pre-launch now shows `"951 currently on the grid, 4 conflicts"`, and Result explains `"Finished in Xs · The 4 earlier conflicts are resolved"` when earlier conflicts are cleared.
4. **Export filenames & header icon (`js/ui/components/export_dialog.js`, `js/ui/io/export_{excel,csv,ics,html,timetable_xml,png}.js`):**
   - Replaced `📤` emoji in the Export dialog header with `ChrxIcons.node("export", 16)`.
   - Standardized all 6 file exporters (`.xlsx`, `.csv`, `.ics`, `.html`, `-export.xml`, `.png`) to include the sanitized school name (never placeholder/source `.xml` names) and ISO date (`YYYY-MM-DD`).
5. **Dark-mode Print Preview prints crisp white paper (`css/style.css`):**
   - Added `@media print` overrides for `:root[data-theme="dark"]` on `.chrx-preview-doc`, `.chrx-preview-page`, table headers, breaks, and pivot cells so dark-mode preview always prints white paper with dark ink.
6. **School Settings immediate persistence (`js/ui/components/school_settings_dialog.js`):**
   - Called `AutoSave.save({ autoRestore: true })` immediately on save so changes to school name and print defaults survive an immediate page reload.
7. **E2E tests & screenshots (`e2e/block-l5-output-screens.spec.js`, `docs/neon/ui-shots/l5/`):**
   - Added `L5-1` (real sidebar click → Export all 6 formats, verifying `bytes > 100`, school name + date in filename, no `📤` emoji), `L5-2` (real sidebar click → Substitutions mark absent → apply cover → dated grid), and `L5-3` (real topbar/sidebar clicks across Generate leftovers, dark-mode Print Preview `@media print` white paper, 390 px `"All classes"` right-edge check, Version History, Publish, and School Settings reload persistence) + 6 screenshots in `docs/neon/ui-shots/l5/`.

### Full Release Gate (`p286`)
- `npx vitest run`: **587 / 587 passed** (68 files, 0 failed)
- `npx vite build`: **succeeded** (`5.81 s`)
- `npx playwright test --config pw.chrome.config.local.mjs`: **174 passed, 1 skipped** (known real-XML ranker skip), **0 failed** (`23.9 m`)

---

## Batch L6 — Local-Date Exports, Strict Substitutions E2E & Output Polish (`20261123-p287-l6-output-fixes`)

1. **Local-date export filenames (`js/ui/io/export_filename.js`, all 7 exporters):**
   - Added shared `localDateYmd(date)` and `schoolSlug(school)` helpers so all 7 exporters (`export_excel.js`, `export_csv.js`, `export_ics.js`, `export_html.js`, `export_timetable_xml.js`, `export_png.js`, `export_excel_nyc.js`) format `YYYY-MM-DD` from local calendar date rather than UTC `toISOString().slice(0, 10)`.
2. **Strict Substitutions E2E (`e2e/block-l5-output-screens.spec.js` `L5-2`):**
   - Rewrote `L5-2` with zero `if (isVisible)` skips: types a teacher into `"Type a teacher name…"`, picks via keyboard (`Enter`), clicks `Generate substitutions`, asserts ≥1 row with a substitute name and no raw hex ID / emoji / `SCORE`, checks `Print memo` tab lists the substitute, and verifies the dated grid shows the substitution.
   - `L5-1` uses `page.clock.install({ time: new Date("2026-11-23T00:30:00+05:30") })` under `TZ=Asia/Kolkata` to verify every downloaded filename carries local date `2026-11-23` (never UTC `2026-11-22`).
3. **Substitution planner polish (`js/ui/substitution/{absence_input,classwise_output,teacherwise_output}.js`):**
   - Resolved `"Acting class teacher"` class names instead of raw hex IDs; prevented duplicated teacher name in absent chips (`abbr === name`); replaced emoji icons (`🛡 ⚡ 💾 ↺ ✎ 👁 ⏱ 🔗 ✕`) with `ChrxIcons` SVGs; replaced `"SCORE 145"` / `"SCORE-LOAD 265"` with plain `"Best match"` / `"Good match"` / `"Possible"` and `"Load"` period counts; fixed singular/plural `"extra period"` / `"slot"`; added `"All slots covered"` hint + tooltip when `"Smart auto-fill"` is disabled.
4. **Version History in-app confirm & plain copy (`js/ui/components/version_history.js`, `e2e/w3-1-version-history.spec.js`):**
   - Replaced native `window.confirm` with an in-app confirmation modal (`[data-vh-confirm-ok]` / `[data-vh-confirm-cancel]`, Escape cancels); renamed `"Diff"` → `"Compare"` and `"Diff vs the current timetable"` → `"What changed"`.
5. **Brand teal Export dialog & Published viewer (`js/ui/components/export_dialog.js`, `css/viewer.css`):**
   - Styled Export dialog header in brand teal (`#0d4f54`) with plain-English format descriptions (removed `"Round-trip XML"`, `"zero dependencies"`, `"zero app chrome"`).
   - Replaced navy `#1e3a8a` / `#1e40af` / `#1d4ed8` accents in `css/viewer.css` with brand teal (`#0d4f54` / `#0a3f43` / `#13676e`).
6. **Single-line `"Focus board"` button (`css/editor-v3.css`):**
   - Added `white-space: nowrap; flex-shrink: 0;` to `.chrx-overview-bar__back` so `"Focus board"` stays on one line at 1440 px with the sidebar open.

### Full Release Gate (`p287`)
- `npx vitest run`: **587 / 587 passed** (68 files, `38.11 s`, 0 failed)
- `npx vite build`: **succeeded** (`3.70 s`)
- `TZ=Asia/Kolkata npx playwright test --config pw.chrome.config.local.mjs`: **174 passed, 1 skipped** (known real-XML ranker skip), **0 failed** (`20.4 m`)
