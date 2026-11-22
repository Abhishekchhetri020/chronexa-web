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
