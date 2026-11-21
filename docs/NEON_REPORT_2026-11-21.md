# Neon Report — Chronexa Backlog Block 1 (2026-11-21)

- **Branch:** `neon/backlog-1` (branched from `main` at `ef92770`)
- **Commit status:** **Not committed** (and nothing pushed or deployed). Per brief rule ("Commit on the branch only if build and tests pass"), the Landing v4 changes remain uncommitted on `neon/backlog-1` because the Playwright E2E suite could not run in this sandboxed environment.

## 1. Landing v4 Review

Reviewed the uncommitted working-tree changes on `neon/backlog-1`:
- `index.html` — switches landing canvas to `#000`, replaces `.lx-aurora` and the static `.lx-stage` device frame with `.lx-horizon`, `#lx-field` (drifting card field), and `#lx-story` (4-stage pinned scroll story: `01 · Assemble`, `02 · Layer`, `03 · Detect`, `04 · Resolve`), updates the header anchor to `#lx-story`, and renames mini planes to `.lx-plane-mini`.
- `js/ui/components/timetable_model.js` — replaces the view-switcher board with `mountField()` (14 depth cards) and `mountStory()` (scroll-driven assemble → 3-layer split → Wed P3 clash → Thu P3 resolve, with `prefers-reduced-motion` static fallback and pointer spotlight on `.lx-tile`).
- `css/landing-redesign.css` & `css/landing-anim.css` — updated styles for the dark canvas, drifting field, and scroll story; only `@font-face` remaining is `"Studio Sans"` (`../src/fonts/dm-sans.woff2`), which bundled cleanly to `dist/assets/dm-sans-Xz1IZZA0.woff2` (36.93 kB).
- Deleted font files: `src/fonts/Instrument-Serif-OFL.txt`, `src/fonts/instrument-serif-italic.woff2`, `src/fonts/instrument-serif.woff2`.

### Deleted-font reference check
- Command: `grep -rn -i --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist "instrument[- ]serif" .`
- Result: **0 references in code, CSS, HTML, or assets** (the only match in the repo is `docs/NEON_BRIEF_2026-11-21.md:15`).

### What Neon changed
- Created and checked out branch `neon/backlog-1`.
- Rebuilt `dist/` via `npm run build` (killed temporary `vite preview` server afterward so future builds are not blocked; cleaned up `test-results/` from aborted Playwright runs).
- Wrote this report: `docs/NEON_REPORT_2026-11-21.md`.
- Made no edits to product source files.

## 2. Build & Test Results

| Check | Command | Result | Exact Counts |
|---|---|---|---|
| Production build | `npm run build` (`vite build`) | **PASS** (exit 0, 8.12 s) | 245 modules transformed; `dist/viewer.js` built (20,605 B) |
| Unit tests | `npx vitest run` | **PASS** (exit 0, 62.69 s) | **67 / 67** test files passed · **581 / 581** tests passed · **0 failed** |
| Backend parity | `./backend/.venv/bin/python backend/test_daily_caps.py` | **PASS** (exit 0) | **19 / 19** checks passed · **0 failed** (`ALL BACKEND CHECKS PASSED`) |
| E2E tests | `npx playwright test --config pw.chrome.config.local.mjs` | **BLOCKED** | **0 passed · 0 completed** (134 tests discovered; browser launch aborted by sandbox) |
| HF Space redeploy | *(skipped per brief)* | **SKIPPED** | Not attempted (requires Abhishek's HF auth token) |

## 3. Screenshots (`docs/neon-shots/`)

- **Not captured (blocked).** Neither desktop nor 390 px screenshots could be generated because no browser could be launched or driven from this session (details below). `docs/neon-shots/` was not created.

## 4. What Could Not Be Done (Blockers)

1. **Playwright E2E suite (`134` tests) could not execute:**
   - With `pw.chrome.config.local.mjs` (`channel: "chrome"`), launching `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` inside the sandboxed shell immediately aborts with macOS Seatbelt Mach port denial:
     `FATAL:base/apple/mach_port_rendezvous_mac.cc:159] Check failed: kr == KERN_SUCCESS. bootstrap_check_in com.google.Chrome.MachPortRendezvousServer.<pid>: Permission denied (1100)`
   - With default `playwright.config.js`, Playwright's bundled Chromium headless shell is not installed at `~/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`.
2. **Landing page screenshots (desktop + 390 px) could not be captured:**
   - Direct headless Chrome launch hit the same Mach port denial above, and `open -a "Google Chrome"` failed inside the sandbox (`Unable to find application named 'Google Chrome'`).
   - `browser-harness` (`browser_doctor`) reported Chrome remote debugging port `9222` is not open (`Connection refused` / `chrome-not-running`).
   - `desktop-harness` `osascript` failed with an unexpected server disconnect (`-32000`).
3. **Commit on `neon/backlog-1` was withheld** because E2E tests and visual screenshot checks have not yet passed.

## 5. Recommended Next Steps (Unsandboxed Terminal)

```bash
cd ~/chronexa-web
git status -sb                                            # verify branch neon/backlog-1
npx vite preview --port 4173 --strictPort &               # dist/ is already freshly built
cp ~/.mempalace/gdgpsd_data/timetable/LATEST.xml dist/__school.xml
npx playwright test --config pw.chrome.config.local.mjs   # run all 134 e2e tests
```

Once E2E passes and desktop + 390 px screenshots are saved to `docs/neon-shots/`, commit the Landing v4 changes on `neon/backlog-1`.

## 6. Verification by Claude (unsandboxed, 2026-11-21)

- `npm run build`: exit 0. `npx vitest run`: 67/67 files, 581/581 tests passed.
- `npx playwright test --config pw.chrome.config.local.mjs`: **133 passed, 1 skipped** (the real-XML audit fixture skip noted in the handoff), 12.3 min.
- Screenshots captured in `docs/neon-shots/` (desktop 1440 and 390 px, hero + scroll story): 0 page errors, 0 console errors, 0 px horizontal overflow at both widths.
- Landing v4 committed on `neon/backlog-1`. Not pushed, not deployed, APP_VER not bumped.
