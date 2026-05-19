# Chronexa Web — Roadmap

**Last refreshed:** 2026-05-19
**Live URL:** https://abhishekchhetri020.github.io/chronexa-web/
**Repo:** https://github.com/Abhishekchhetri020/chronexa-web

---

## ✅ What works right now

- **Install + Open the app.** Three ways: visit the URL, click "Install Chronexa" to get it as a PWA app on your computer, or download a ZIP from the GitHub releases (one-click offline).
- **Build a new timetable from scratch.** Click ✨ Create new timetable → a 5-step wizard walks you through Subjects → Teachers → Classes → Classrooms → Lessons. You can skip any step. After step 5 you land in the editor with cards ready to drag.
- **Open an existing aSc XML.** Drag-drop or pick a file, including the bundled GD Goenka sample (1,269 cards / 33 classes / 61 teachers). Solver, grids, drag-drop all activate.
- **Edit every entity through a CRUD dialog.**
  - Subjects, Teachers, Classes, Classrooms, Lessons, Relations (constraints), Divisions, Bells, Weeks, Terms, Reports, Views, Groups, Course Groups, Grades, Supervisions, Breaks — 17 entity dialogs, all reachable from the Specification menu.
  - Time-off matrix (3-state ✓ ? ✗) for any entity that supports it.
  - 14-field Class constraints dialog (verbatim EduPage labels).
  - 11-field Teacher constraints dialog (verbatim EduPage labels).
  - 15 named Relations (constraint types n_0 through n_17, except n_2/n_3/n_15 which EduPage itself leaves undecoded). Three-step wizard: pick type → pick scope → pick importance.
- **Run the solver locally.** Click ⚡ Generate. Pick Test/Generate, complexity (Normal/Large/Huge), conditions (Draft/Allow relaxation/Strict), and algorithm (browser/cloud). Defaults to running on the user's CPU via a Web Worker. Cloud fallback configurable.
- **Drag cards.** Click a card to pick it up; click an empty slot to place it. Pending strip shows unplaced cards. Substitution module works.
- **Constraint-explanation tooltips.** Hover any card → see in plain English why it's flagged ("Mr. Sharma already teaches IX-A in this period", "Class teacher V-C prefers last period"). Shift-hover shows explanations even for OK cells. Differentiator vs aSc.
- **Read-only views.** Class Grid, Teacher Grid, Room Grid steps show per-entity timetables. Each has a "+ Add" button that opens the matching CRUD dialog.
- **Export.** aSc XML, Excel, ICS, PowerSchool, GP Untis DIF, Atlantis. Print preview with templates.
- **Offline.** Service worker caches everything after first visit. ZIP download for full offline. Solver stays on the user's CPU.

## 🚧 In flight (Wave 2 agents, running now)

- **Divisions UI** in the Class dialog (Mother class → Boys/Girls split, etc.)
- **Per-card classroom variation** for the Lesson dialog (`classroomidss` array-of-arrays — Card 3 of Maths in Lab, others in home room)
- **Home/Shared/Teacher's/Subject's** checkbox expansion in Lesson dialog
- **"Set for more"** bulk-apply pattern across constraint dialogs
- **Copy-to** (Duplicate / Apply to another / Apply to multiple) on entity dialogs
- **Change/batch-edit** (multi-row field overwrite)
- **< > cycle arrows** in edit sheets

## 📝 Last 7 days — what happened

**2026-05-19 — Build-from-scratch sprint shipped**

The "Create new timetable" CTA used to dump the user into an empty editor with no way to add anything. Today the user gets:
1. A 5-step wizard that walks them through every entity type.
2. An empty-state hero card on the editor with 6 colorful tiles (Subjects / Teachers / Classes / Classrooms / Lessons / Generate) — click to open dialogs.
3. All 18 entity dialogs wired into the Specification ribbon menu (previously decorative).
4. The "+ Add" buttons on every Class/Teacher/Room grid (previously read-only).
5. Two latent crashes fixed (School Info crash on blank schools, silent audit.append crash that silently failed every dialog save).

**2026-05-18 — PWA + offline + ZIP release**
Made Chronexa installable as a Progressive Web App. Service worker caches everything. Added a release-zip GitHub Action so users can download a ZIP and run fully offline (double-click index.html).

**2026-05-16 → 17 — wave I/J/K/L/M/P** (six parallel agents) shipped: 17 entity dialogs at parity, drag-drop with ghost+halos, substitution module (full parity with the Apps Script substitution-planner skill), 19/24 print templates, 5/6 imports, 10/12 exports.

## 🎯 Where we're heading

**Completion gate** (the test that decides "ready"):
> A blank-school user can complete Subject → Teacher → Class → Room → Lesson → Generate → see ≥1 card placed → export aSc XML, no errors at any step.

Once Wave 2 lands and the gate passes, the product is what the user asked for: a fully working web-based timetable builder, no server needed, runs on the user's device, better than aSc in three concrete ways (constraint-explanation tooltips, free, offline).

## 🚨 Known problems

- The GD Goenka sample is bundled (290 KB) but the demo button is wired only as of today's last commit — needs one more cache-bust before users see it working live.
- iOS doesn't expose `beforeinstallprompt` so iOS users have to do "Add to Home Screen" manually rather than clicking Install.
- ZIP-download users are version-frozen at the moment they downloaded. Need an in-app "newer version available" check when online.

## 📁 Where stuff lives

| Path | What |
|---|---|
| `index.html` | App shell + script loader + APP_VER |
| `js/ui/wizard/` | The 5-step wizard + create-new logic |
| `js/ui/entities/` | 18 entity dialogs (1 per entity type) |
| `js/ui/components/` | Shared dialogs: time-off matrix, class constraints, teacher constraints |
| `js/ui/editor/` | Drag-drop editor, pending strip, constraint-explanation tooltips |
| `js/ui/ribbon/menus/` | 8 dropdown menus (Main / Files / Specification / View / Timetable / Options / Help / AI) |
| `js/ui/entity_router.js` | Single listener that maps `app:open-entity` events to `EntityX.open()` calls |
| `js/solver/` | CSP solver + bitmask + constraints + Web Worker |
| `js/io/` | aSc XML round-trip, Excel/ICS/PowerSchool/GP-Untis exporters |
| `Chronexa-UX-AUDIT-BUILD-FROM-SCRATCH-2026-05-19.md` | The audit that drove this sprint |
| `asctt2012.xml` | Bundled GD Goenka regression fixture |
| `manifest.json` + `sw.js` | PWA + service worker |
| `.github/workflows/release.yml` | Tag a `v*` → ZIP release auto-built |

## 🔬 How to verify on your machine

```
open https://abhishekchhetri020.github.io/chronexa-web/
```

Click "Create new timetable" — expect a 5-step wizard overlay. Click Skip 5×. Land in the empty editor with the "Let's build your timetable" hero. Click any tile → entity dialog opens. Add a subject → tile disappears from "needs setup" list. Click Generate → solver dialog opens with Run-on-this-computer pre-selected.

For a real-data test: click "try the bundled GD Goenka sample" — should report 33 classes / 61 teachers / 1,269 cards.
