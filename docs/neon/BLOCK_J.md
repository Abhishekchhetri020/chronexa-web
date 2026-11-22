# Block J — First-run experience (`20261122-p279-first-run`)

## Goal
A new user starting from an empty school reaches a printed timetable without help: clear empty states, inline hints, accurate `GET STARTED` checklist, sample school one click away, and errors in plain words.

## What changed
1. **Accurate `GET STARTED` checklist & one-click sample school** (`js/ui/editor/activator.js`, `css/editor.css`):
   - Added a live `"X of 4 required steps done"` progress counter (`#chrx-hero-progress`) covering the 4 required items (Subjects, Teachers, Classes, Lessons) while marking Classrooms clearly as `Optional`.
   - Highlighted the next required step with `data-next="true"` (`Next →`) and auto-selected that entity kind in the inline **Quick add** bar.
   - Added a one-click **`Try a sample school`** button (`#chrx-hero-sample-btn` wired via `[data-closing-demo]` to `main.js`'s `loadBundledDemo()`).
   - Added a **`Ready! Add your first lesson →`** callout banner (`#chrx-hero-ready` / `#chrx-hero-first-lesson`) once at least one subject, teacher, and class exist.
   - Listened to both `window` and `document` `entity:changed` events so checklist progress updates immediately.
2. **Plain-English guards & validation** (`js/ui/ribbon/topbar.js`, `js/ui/print_preview/print_preview.js`, `js/ui/entities/lessons.js`):
   - Clicking **Generate** or **Print preview** on an empty school shows a plain-English message instead of opening an empty dialog.
   - Saving a lesson without choosing a subject or class now shows a plain-English warning toast (`"Choose a subject before saving this lesson."` / `"Pick at least one class before saving this lesson."`) instead of silently doing nothing.
3. **Coachmark no longer blocks Generate/Result modals** (`js/ui/components/first_card_coachmark.js`):
   - Found during the timed stranger walk: `FirstCardCoachmark.show()` fired 650ms after adding the first lesson and popped up *on top* of the Generate / Result modal, blocking `"Use this timetable"`.
   - Added `hasOpenModal()` guard so the coachmark never interrupts an open dialog, and updated its copy (`Unplaced lessons`, `clash`).
4. **Automated stranger walk & sample-school regression test** (`e2e/block-j-first-run.spec.js`):
   - **J1:** Timed stranger walk from `/` → `Start with a school template` → `Blank — I'll set up everything` → verify empty-school guards & `0 of 4` progress → Quick Add `Mathematics`, `Ms. Priya`, `Grade 1A` → `Ready! Add your first lesson` → save lesson → Generate → `Use this timetable` → Print preview (`Ctrl+P`) → verify `Math` & `1A` on the A4 page → Print (`Ctrl+P`).
   - **J2:** One-click `Try a sample school` from an empty school loads the full 946-card sample school cleanly.

## Recorded stranger time
- **5.3 s (`5277 ms`)** end-to-end in the full release gate (`5.1 s` standalone) from `/` with a blank school to a verified A4 printed timetable (`1` placed card, `0` errors).

## Verification (Full Release Gate)
- `npx vitest run`: **587 / 587 passed** (68 files, 0 failed)
- `npx vite build`: **succeeded** (`2.59 s`, offline `dist/viewer.js` bundled)
- `npx playwright test --config pw.chrome.config.local.mjs`: **157 passed, 1 skipped** (known real-XML ranker skip), **0 failed** (`13.8 m`)
- Release version: `20261122-p279-first-run`


## J2 — Real-stranger live polish (`20261122-p280-j2-first-run`)
Fixes every item found in Claude's live walk of `p279` (`docs/neon/ui-shots/claude-review-p279/`):
1. **Blank/template lands directly on Editor (`#step-6`) with the `GET STARTED` checklist** (`js/ui/main.js`, `js/ui/onboarding/wiring.js`, `index.html`, `js/ui/i18n.js`):
   - Exposed `window.showStep = showStep`, deduplicated the `#cta-build-new` handler so `SchoolTemplates.showPicker` + `onTemplatePicked()` run once, and stopped auto-popping the competing 5-step `WizardWalkthrough` modal over the `GET STARTED` checklist.
   - Updated School Info (`#step-2`) subtitle from `"Summary of what was parsed from your XML."` to `"School details, calendar, bell schedule, and defaults."` (switching to `"School details and schedule imported from your file."` only when an XML file was actually imported).
2. **No false `"↶ Restored Auto-saved"` toast in brand-new sessions** (`js/ui/components/auto_save.js`):
   - Fixed `flashIndicator("↶ Restored")` so it displays `"↶ Restored previous session"` instead of concatenating `"Auto-saved"`.
   - Made initial `onSchoolLoaded` persistence silent (`{ silent: true }`) so creating a fresh blank/template school never flashes a misleading toast.
3. **Template picker polish** (`js/ui/onboarding/school_templates.js`, `js/ui/start_screen.js`):
   - App sans-serif heading (`Inter Tight` / `DM Sans`), plain-English subtitles (`"8+ subjects · 6 days × 8 periods"`, zero raw `· indian` / `· western` / `blank` tags), full-width Blank card (`grid-column: 1 / -1`), removed the heavy blue `:focus` outline around the panel, and rendered a clean right-aligned `"Cancel"` footer button (only mentioning keeping the current school when one is already loaded).
4. **Sidebar `Basics` / `Advanced` grouping & hidden stray `+ New tab` bar** (`js/ui/shell_v3.js`, `css/design-v3.css`, `js/ui/multi_doc_tabs.js`):
   - Grouped sidebar into **Workspace**, **Basics** (Subjects, Teachers, Classes, Rooms, Lessons, Bells, Days — expanded), **Advanced** (Divisions, Grades, Students, Weeks, Terms, Buildings, Relations, School settings, Solver params — collapsed `<details>` by default), and **Files**.
   - Hid `#chrx-tab-bar` (`+ New tab`) when fewer than 2 tabs are open.
5. **Consistent line SVG icons in School Info & Tour modal guard** (`js/ui/components/school_hub.js`, `js/ui/onboarding/tour.js`):
   - Replaced all 8 emoji icons in School Info sub-nav (`PANES`) with crisp 16×16 stroke SVG icons matching the sidebar.
   - Prevented `Tour.maybeStart()` from auto-popping on top of open modals or the empty-school `GET STARTED` checklist.
6. **After screenshots & E2E coverage**:
   - `docs/neon/ui-shots/block-j2/1-templates-after.png` and `2-empty-school-after.png`.
   - Added **J3** to `e2e/block-j-first-run.spec.js` asserting all 5 J2 fixes.

### J2 Full Release Gate (`p280`)
- `npx vitest run`: **587 / 587 passed** (68 files, 0 failed)
- `npx vite build`: **succeeded** (`2.66 s`)
- `npx playwright test --config pw.chrome.config.local.mjs`: **158 passed, 1 skipped** (known real-XML ranker skip), **0 failed** (`12.8 m`)
- Stranger walk time: **5.9 s (`5910 ms`)** in full gate.
