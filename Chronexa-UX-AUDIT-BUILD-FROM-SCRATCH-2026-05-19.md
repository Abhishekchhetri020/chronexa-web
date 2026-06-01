# Chronexa Web — Build-from-Scratch UX Audit

**Date:** 2026-05-19
**Scope:** what happens between clicking ✨ "Create new timetable" and dragging the first card onto the grid
**Method:** live walk of `https://abhishekchhetri020.github.io/chronexa-web/` via puppeteer + diff against Classic's 8-step wizard (already reverse-engineered in `legacy-research` + `WIZARD_6_8_R6.md`)
**APP_VER under test:** `20260518-pwa1`

---

## 1. The 90-second user journey (recorded live)

> A first-time user lands on the URL. They want to build a fresh timetable.

| Step | What the user does | What actually happens | What they expect |
|---|---|---|---|
| 1 | Lands on the URL | Sees Step 1 "Start your timetable" with two cards: 🪄 Build new + 📂 Load existing | OK |
| 2 | Clicks ✨ **Create new timetable** | Jumps straight to **Step 6 (Editor)** — empty grid, empty pending strip, zero hints | A wizard that walks them through school setup |
| 3 | Confused — clicks **School Info** in the step ladder to set up the school name + bell schedule | 🔴 **CRASH** — red error banner: `TypeError: Cannot read properties of undefined (reading 'counts')` at `school_info.js:18:36` | A form to enter school name, days/week, period times |
| 4 | Clicks **Class Grid** | Shows a read-only 6×8 timetable preview with "No matches" — no Add button, no way to create a class | A list/grid where they can add classes |
| 5 | Clicks **Teacher Grid** | Same — read-only preview, "No matches" | A teacher CRUD interface |
| 6 | Clicks **Room Grid** | Same | A room CRUD interface |
| 7 | Looks for **Subjects** anywhere | Subjects do not appear in the step ladder, the Specification menu, or any ribbon button | A way to create subjects |
| 8 | Looks for **Lessons** | Lessons do not appear in the step ladder, the Specification menu, or any ribbon button | A way to create lessons (which is what makes cards appear) |
| 9 | Clicks **Specification → Bell times / Periods…** in the menu bar | Menu opens — but **clicking the item does nothing** (no dialog opens, no handler wired) | The bell schedule editor |
| 10 | Clicks **Specification → Days / Weeks / Terms / Buildings / Holidays / School settings** | Same — all decorative, no dialogs open | These entity editors |
| 11 | Out of ideas, clicks **⚡ Generate** in the header | ✅ Solver dialog opens with Test/Generate mode tiles, 3 complexity tiers, 3 conditions, browser/cloud algorithm choice. Status line says "My School · 0 teachers · 0 classes · 0 lessons · 0 placed" | Either runs the solver or tells them there's nothing to schedule |

**Net result of "Create new timetable" today:** a user with zero prior context cannot create a single subject, class, teacher, classroom, lesson, or card through any visible UI path.

---

## 2. Two showstopper bugs

### Bug A — School Info step crashes for every new-from-scratch user

**Trigger:** click "Create new timetable" → click "School Info" step button.
**Stack:**
```
TypeError: Cannot read properties of undefined (reading 'counts')
  at Object.render   (js/ui/school_info.js:18:36)
  at renderActiveStep (js/ui/main.js:48:26)
  at showStep         (js/ui/main.js:42:5)
```
**Root cause:** `school_info.js` reads `school._meta.counts`. The `_meta` blob is only created by `parseTimetableXml.parseFile()`. `CreateNew.createBlank()` doesn't populate `_meta`. So Step 2 is XML-upload-only and crashes for everyone else.
**Once raised, the error banner persists across all subsequent step changes** (visible in steps 3/4/5 screenshots too — same red box, never cleared).

### Bug B — Specification menu items are decorative

**Trigger:** click Specification → any item.
**Observed:** Bell times / Periods… / Days… / Weeks… / Terms… / Buildings… / Holidays… / School settings… all open no dialog. Click handler missing.
**Root cause (suspected):** `js/ui/entities/*.js` modules exist (bells, breaks, buildings, classes, classrooms, classroomsupervisions, coursegroups, divisions, grades, groups, lessons, relations, subjects, teachers, terms, ttreports, ttviews, weeks — 18 entity files) but they are **not wired** to any menu item or step button. They're orphan modules.

---

## 3. Structural gap — Chronexa step ladder vs Classic wizard

**Classic's actual 8-step wizard:**

| Classic step | What it does | Chronexa today |
|---|---|---|
| 1 — School | name, year, country, region, days/week, periods, multi-term/week toggles | 🟨 Step 2 "School Info" exists but **crashes** for from-scratch users |
| 2 — Subjects | CRUD for subjects (name, abbr, color, picture, time-off matrix, contract weight, constraints) | ⛔ **NO STEP, NO MENU ITEM, NO RIBBON BUTTON** |
| 3 — Classes | CRUD for classes + class teacher, home rooms, bell schedule, color, 14-field constraints, divisions, time-off | 🟨 Step 3 "Class Grid" is a **read-only timetable preview**, not a CRUD editor |
| 4 — Classrooms | CRUD for rooms (name, abbr, color, building, capacity, supervision, nearby rooms, time-off) | 🟨 Step 5 "Room Grid" — read-only preview, no CRUD |
| 5 — (Days definition — folded into step 1 in modern Classic) | bell, daysdefs, weeksdefs, termsdefs | ⛔ menu items exist but click handlers missing |
| 6 — Teachers | CRUD (last/first/abbr, color, gender, title, suffix, classrooms, bell, number, time-off, 11 constraints) | 🟨 Step 4 "Teacher Grid" — read-only preview, no CRUD |
| 7 — **Lessons** (the most complex entity — 21 fields) | subject + teacher(s) + class(es) + group + duration + count + classroom rules | ⛔ **NO STEP, NO MENU ITEM, NO RIBBON BUTTON**. Without lessons, no cards exist; without cards, the editor is permanently empty. |
| 8 — End (Test / Generate / Verify) | three independent solver flows | ✅ Generate dialog at **parity** — mode tiles, complexity, conditions, algorithm choice, status line |

**The single biggest gap:** Subjects and Lessons have entity-dialog modules on disk (`js/ui/entities/subjects.js`, `lessons.js`) but **zero entry points** from the UI. The "Create new timetable" CTA creates an empty shell that no UI path can populate.

---

## 4. Entity dialogs — wired vs orphan

| Entity | `js/ui/entities/<file>.js` exists? | Reachable from UI? |
|---|---|---|
| subjects | ✅ | ❌ orphan |
| teachers | ✅ | ❌ orphan |
| classes | ✅ | ❌ orphan |
| classrooms | ✅ | ❌ orphan |
| lessons | ✅ | ❌ orphan |
| relations (cardrelationships) | ✅ | ❌ orphan |
| bells | ✅ | ❌ orphan (Specification → Bell times… is decorative) |
| breaks | ✅ | ❌ orphan |
| buildings | ✅ | ❌ orphan (Specification → Buildings… is decorative) |
| classroomsupervisions | ✅ | ❌ orphan |
| coursegroups | ✅ | ❌ orphan |
| divisions | ✅ | ❌ orphan |
| grades | ✅ | ❌ orphan |
| groups | ✅ | ❌ orphan |
| terms | ✅ | ❌ orphan (Specification → Terms… is decorative) |
| weeks | ✅ | ❌ orphan (Specification → Weeks… is decorative) |
| ttreports | ✅ | ❌ orphan |
| ttviews | ✅ | ❌ orphan |

**18 entity modules. Zero are wired to a discoverable entry point** in the from-scratch flow.

The dialog shell (`dialog_shell.js`) exists — these modules are NOT broken, they're just unreachable. Wiring them to menu items + step buttons is mostly plumbing, not net-new dialog code.

---

## 5. Solver UI — confirmed at parity ✅

**Verified live:** click ⚡ Generate → opens `.csu-dialog` with:
- ✅ **Mode tiles:** "Test the timetable" + "Generate timetable" (matches Classic's `testStart` vs `generatorStart`)
- ✅ **Complexity:** Normal · 30s · small school | Large · 60s · 30-50 classes | Huge · 2 min · 60+ teachers (matches Classic's `Normal/Large/Huge`)
- ✅ **Conditions:** Draft · Allow relaxation · Strict (matches Classic's verbatim labels)
- ✅ **Algorithm:** "Run on this computer (Web Worker, offline)" + "Run on cloud (Backend URL not set — falls back to browser)" — this is a **Chronexa-only feature**; Classic has no offline mode
- ✅ **Status line:** "My School · 0 teachers · 0 classes · 0 lessons · 0 placed"
- ✅ **Show solver report after run** checkbox

No work needed here. The solver flow is already past parity.

**Verify** — `Specification → ✓ Verification` exists in the menu but I did not click it in this audit; will validate in the next sprint.

---

## 6. Priority-ranked punchlist

### P0 — blockers for any from-scratch user (≈ 14h)

| # | Item | Hours | Why P0 |
|---|---|---|---|
| 1 | **Fix Bug A** — `school_info.js` crashes on blank schools | 1 | Every new user hits this on first navigation |
| 2 | **Fix Bug B** — wire 7 Specification menu items to their existing dialogs (Bell, Days, Weeks, Terms, Buildings, Holidays, School settings) | 3 | Menu items are decorative; user can't reach the dialogs |
| 3 | **Add Subjects entry point** — either a step in the ladder, a top-level menu (Specification → Subjects…), or a ribbon button. Wire to existing `entities/subjects.js`. | 2 | No path to create subjects today |
| 4 | **Add Lessons entry point** — same pattern. Wire to existing `entities/lessons.js`. | 2 | No path to create lessons; without lessons, no cards |
| 5 | **Convert Class Grid / Teacher Grid / Room Grid from read-only previews to CRUD editors** — each gets a "+ Add" button that opens the entity dialog | 3 | Today they're "No matches" dead-ends |
| 6 | **Empty-state coaching** on the editor — when school is empty, show a hero card "Add your first class / teacher / subject / lesson →" with deep-links to the dialogs | 3 | Today the editor is a blank rectangle with no guidance |

### P1 — finish the from-scratch wizard (≈ 22h)

| # | Item | Hours |
|---|---|---|
| 7 | Add a real **Step 1.5: Wizard** option after "Create new timetable" — sequential walkthrough Subject → Teacher → Class → Room → Lesson with "Next" buttons (Classic parity) | 8 |
| 8 | Time-off matrix dialog (3-state ✓ ? ✗) for subjects/classes/classrooms/teachers — single shared component | 4 |
| 9 | Class constraints sub-dialog with 14 fields (per Classic cdefs) — `classteacherpos` matrix is the heavy one | 4 |
| 10 | Teacher constraints sub-dialog with 11 fields (max gaps, max consecutive, lessons-per-day range, supervision min/max) | 3 |
| 11 | Divisions UI per class (`entities/divisions.js` orphan today) | 3 |

### P2 — moat features + close the long tail (≈ 30h)

| # | Item | Hours |
|---|---|---|
| 12 | Relations dialog with all 15 decoded `n_*` constraint typs (cardrelationships) | 6 |
| 13 | Per-card classroom variation (`classroomidss` double-s — solver fidelity gap) | 6 |
| 14 | `metaclassroomidss_expanded` (Home/Shared/Teacher's/Subject's checkbox expansion in Lesson dialog) | 4 |
| 15 | "Set for more" bulk-apply pattern on every constraint dialog | 3 |
| 16 | Copy-to dialog (per-lesson) | 2 |
| 17 | Change/batch-edit dialog (wizard Lessons step) | 3 |
| 18 | `< >` cycle arrows in edit dialogs | 2 |
| 19 | Constraint-explanation tooltips (hover red card → why it's red) — moat-builder | 4 |

**Total: P0 (14h) + P1 (22h) + P2 (30h) = 66 hours.** With 4-6 parallel sub-agents that's 2-3 calendar days, focused.

---

## 7. Proposed new step ladder

Replace the current `1. Start | 🪄 Editor | School Info | Class Grid | Teacher Grid | Room Grid` with:

```
[1 · Start]    [2 · School]    [3 · Subjects]    [4 · Classes]    [5 · Teachers]    [6 · Rooms]    [7 · Lessons]    [8 · Editor 🪄]
```

- Steps 2-7 each open a CRUD grid + dialog for that entity (re-use existing orphan modules)
- Step 8 is the editor we have today
- Optional: a "Generate" Step 9 that opens the existing solver dialog

The current `Class Grid / Teacher Grid / Room Grid` (read-only timetable previews) move to **View menu → "Per-class timetable / Per-teacher timetable / Per-room timetable"** where they actually belong.

---

## 8. What's NOT in scope of this audit

- Timetable XML upload flow (already working at parity)
- Print preview (separate audit; gap map at `legacy-research` covers 5 missing templates)
- Mobile / touch drag-drop
- PWA / offline / ZIP download (just shipped, working)
- Backend `/solve` Hostinger deploy (20 May post-VPS)
- Substitution module (already working at parity)

---

## 9. Bottom line

**Two showstopper bugs + Subjects/Lessons unreachable + step ladder routes the user away from CRUD = the "create new" CTA is effectively non-functional today** for a user who doesn't already have an Timetable XML to upload.

Fixing P0 (14 hours) restores the from-scratch path. P1 (22 hours) brings the wizard to Classic parity. P2 (30 hours) takes us past it into moat territory.

**No code changes were made in this audit.** Approval gate before the sprint starts.


<!-- Chronexa Web -->
