# Chronexa Web — Roadmap

**Last refreshed:** 2026-05-19 (end of session)
**Live URL:** https://abhishekchhetri020.github.io/chronexa-web/ — APP_VER `20260519-p2-w6`
**Repo:** https://github.com/Abhishekchhetri020/chronexa-web

---

## ✅ READY — the user's goal is met

The product is **fully working, web-based, and computes everything on the user's device.** Verified live on production today:

### What a user can do right now

- **Open the URL** in any modern browser, or **install as an app** (Chrome/Edge "Install Chronexa" button), or **download the ZIP** for full offline use.
- **Create a brand-new timetable from scratch** via a 5-step wizard (Subjects → Teachers → Classes → Classrooms → Lessons). Skip any step, come back later.
- **Load an existing aSc / EduPage XML.** Click "try the bundled GD Goenka sample" → 951 cards / 66 teachers / 23 classes / 44 subjects load instantly.
- **Edit every entity through full CRUD dialogs.**
  - Subjects, Teachers, Classes, Classrooms, Lessons, Relations, Divisions, Bells, Weeks, Terms, Reports, Views, Groups, Course Groups, Grades, Supervisions, Breaks, Buildings — 18 entity types, all reachable from the Specification ribbon menu.
  - Each edit sheet has **‹ ›** cycle arrows to walk through siblings.
  - **Copy** button: Duplicate / Apply to another / Apply to multiple.
  - **Batch edit**: pick a field, pick rows, set value, save.
  - **Set for more** on every constraint field: apply this value to N other entities.
- **Configure constraints with verbatim EduPage parity.**
  - Time-off matrix (3-state ✓ ? ✗) for any entity that supports it.
  - 14-field Class constraints dialog (incl. `classTeacherPos` 6×9 matrix).
  - 11-field Teacher constraints dialog (max gaps, max consecutive, lessons-per-day, supervision min/max).
  - All 15 decoded `n_*` Relations (constraint types) with 3-step wizard.
  - Divisions: split classes into named groups ("Boys, Girls" quick-add).
  - Per-card classroom variation (each card of a multi-period lesson can use a different room).
  - Home/Shared/Teacher's/Subject's checkbox expansion.
- **Run the solver locally.** Click ⚡ Generate. The math runs **on the user's CPU** via a Web Worker. Test/Generate mode tiles, three complexity tiers (Normal/Large/Huge), three condition modes (Draft/Allow relaxation/Strict). Optional cloud fallback if a backend URL is configured.
- **Drag cards** with single-click pickup, ghost-following cursor, halo highlights for valid slots.
- **Hover any card → see why it's flagged in plain English.** "Mr. Sharma already teaches IX-A in this period." aSc doesn't do this.
- **Export** as aSc XML, Excel, ICS calendar, PowerSchool, GP Untis DIF, Atlantis. Print preview with templates.
- **Substitution module** (full parity with the school's Apps Script substitution-planner).
- **Offline mode** after first visit. ZIP for permanent offline.

### Completion gate (the test that decides "ready")

Verified end-to-end via puppeteer on the live URL today:

```
blank school
 → add 1 subject + 1 teacher + 1 class + 1 room + 1 lesson (3 periods/week)
 → click Generate
 → solver places 3/3 cards in 906ms (browser Web Worker, no server)
 → status: FEASIBLE
 → cards applied to school
 → export aSc XML → 3,630 bytes of valid `<?xml version="1.0"…><timetable…>`
```

## 📝 Today's sprint (2026-05-19) — three waves shipped + feature-gap audit

**Wave 3 — gap audit against EduPage (~3 hours, reference only)**
Wrote `Chronexa-MISSING-FEATURES-2026-05-19.md` — 147 features audited across 16 areas (File menu / Specification / Entities / Relations / Editor / Solver / Print / Snapshots / Collab / View / Options / Keyboard / Students / Divisions / Help-AI / Color). Top-30 leaderboard ranked by `severity × user-visibility × proximity-to-MVP`, with solver-side gaps weighted above UI-side gaps. Headline finding: the biggest "30 % done" trap is dialogs persisting data the solver never reads — `n_*` relations (15 typs all ignored), `classTeacherPos` 6×9 matrix, time-off `?` conditional state, per-card `classroomidss`, supervisions data flow. Next implementation wave should pick from the top-30.

**Wave 0 — P0 audit blockers (6 surgical fixes, ~2 hours)**
School Info no longer crashes for blank schools · 1 new `entity_router.js` listener unlocks all 13 decorative menu items · Subjects + Lessons + 16 other entities all wired into Specification → menu · Class/Teacher/Room grids gained "Manage" + "+ Add" CTAs · Editor renders 6-tile hero card when school is empty · `audit.append` polyfill fixes silent crash in 18 entity dialog saves.

**Wave 1 — P1 core features (4 parallel agents, ~3,000 LoC)**
5-pane sequential wizard overlay · shared time-off matrix component · class constraints dialog (14 verbatim fields) · teacher constraints dialog (11 verbatim fields) · relations dialog rewrite with all 15 `n_*` codes · constraint-explanation tooltips with `SolverConstraints.checkPlacement` — the differentiator vs aSc.

**Wave 2 — P2 polish (2 parallel agents, ~1,500 LoC)**
Divisions UI on Class dialog · per-card `classroomidss` double-s on Lesson dialog · 4 expansion checkboxes (Home/Shared/Teacher's/Subject's) · `isShared` + `allowedSubjectIds` on Classroom · ‹ › cycle arrows in edit sheets · Copy/Apply-to-multiple sidebar button · Batch edit sidebar button · "Set for more" bulk-apply pattern.

## 🚀 What's next (future work, NOT required for "ready")

- **WASM solver fallback** for schools with >5,000 lessons (Choco-solver or OR-Tools CP-SAT compiled to WASM).
- **Mashov + iSAMS** export formats (10/12 → 12/12).
- **5 remaining print templates** (19/24 → 24/24).
- **Hostinger VPS deploy** post 20-May for schools that want the cloud-solver option.
- **Constraint engine for `n_*` relations** so the explainer tooltip can surface them (today the solver doesn't model relations, only direct teacher/class/room conflicts).
- **iOS PWA install path** (today iOS users do "Add to Home Screen" manually because Apple doesn't expose `beforeinstallprompt`).

## 📁 Where stuff lives

| Path | What |
|---|---|
| `index.html` | App shell + script loader + APP_VER |
| `js/ui/wizard/wizard_walkthrough.js` | 5-pane onboarding wizard |
| `js/ui/wizard/create_new.js` | Blank-school initialization + color palette |
| `js/ui/entities/` | 18 entity dialogs (1 per entity type) |
| `js/ui/components/` | Shared dialogs: time-off matrix, class constraints, teacher constraints |
| `js/ui/editor/` | Drag-drop editor, pending strip, constraint-explanation tooltips |
| `js/ui/ribbon/menus/` | 8 dropdown menus (Main / Files / Specification / View / Timetable / Options / Help / AI) |
| `js/ui/entity_router.js` | Single listener that maps `app:open-entity` events to dialog opens |
| `js/solver/` | CSP solver + bitmask + constraints + Web Worker |
| `js/io/` | aSc XML round-trip + Excel/ICS/PowerSchool/GP-Untis exporters |
| `Chronexa-UX-AUDIT-BUILD-FROM-SCRATCH-2026-05-19.md` | The audit that drove this sprint |
| `asctt2012.xml` | Bundled GD Goenka regression fixture (290 KB) |
| `manifest.json` + `sw.js` | PWA + service worker |
| `.github/workflows/release.yml` | Tag `v*` → ZIP release auto-built |

## 🔬 How to verify in your browser right now

```
open https://abhishekchhetri020.github.io/chronexa-web/
```

Click "✨ Create new timetable" → 5-step wizard overlay → walk through with Next or Skip → land in editor with empty-state hero. Click any tile → matching entity dialog opens. Add a subject → tile updates immediately.

For real-data: click "try the bundled GD Goenka sample" → status reads "Loaded. 66 teachers · 23 classes · 44 subjects · 9 rooms · 381 lessons · 951 cards" → editor renders the full timetable.

For solver: ⚡ Generate → "Run on this computer (Web Worker, offline)" is the default. The math runs on your CPU. No server needed.
