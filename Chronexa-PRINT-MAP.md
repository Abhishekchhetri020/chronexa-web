# Chronexa ↔ Classic Print System — Feature Parity Map

**Drafted:** 2026-05-22 (eighth-session research)
**Sources:**
- 25 Classic print-UX screenshots (cached at `~/.claude/image-cache/4248d083-3ef1-42ec-b72a-4dad7b00cccf/`) — 15 initial + 10 follow-up on the Modify-structure dialog
- Ghidra-decompiled Classic print code at `/Users/abhishekchhetri/Downloads/Cloning Classic/GhidraProject/`
- Print blueprint: `/Users/abhishekchhetri/Downloads/Cloning Classic/docs/CLASSIC_PRINT_EXPORT_SOLVER_BLUEPRINT.md`
- Current Chronexa print module at `js/ui/print_preview/`

**⚠ Important context discovered from screenshot 25's URL bar:** what we're studying is **Classic's online Classic engine** (`abhishekchhetri.classic.org/timetable/online.php`), not the Windows desktop. Classic runs Classic's print module in the browser — which proves every UI pattern below is achievable in a web app, because Classic already shipped it. The Ghidra-decompiled Windows binary and the Classic web version share the same engine.

---

## How Classic's print pipeline is architected (from the decompiled C)

Classic's print is **not a single render function** — it's a 4-layer composition pipeline:

| Layer | Decompiled symbol | What it does |
|---|---|---|
| 1. Document dispatch | `CRozDoc::vtable[70]` → `FUN_00a11c28` (`rozdoc_print.c`) | Decides preview vs direct-print, sets up exception handling, iterates the page list anchored at `*(this+0x638)` |
| 2. Per-page composer | `FUN_00a0ca35` (`per_page_render.c`) | Page geometry (width/height/scale at offsets `+0x250/0x254/0x25c`), enumerates `PrintObject` list, dispatches header/footer at offsets `+0x290/0x291` |
| 3. Cell renderer | `FUN_00a092c2` (`final_renderer.c`) | Constructs 6 `CPen` line-styles + 3 `CBrush` backgrounds; renders the actual card content for each cell |
| 4. Leaf renderers | `FUN_00877a91` (lines, 7 modes), `FUN_00983a31` (text, 6 modes) (`leaf_renderers.c`) | Low-level grid lines + multi-element text rendering |

Each printed cell has up to **7 independent text elements** (Subject / Teacher / Class / Group / Classroom / Count / Bell times). Classic stores per-element position, size, font, style — that's what the per-card style dialog (screenshot 5) is editing.

Templates are dispatched via a `PrintObject` enumeration — the choice of report ("Timetable for each class" vs "Summary for each teacher") swaps the enumerated object list, not the renderer. **Design files** (`asc_extracted/designs/*/def.xml`) drive the visual constants — pen colors, brush palettes, font defaults.

---

## Where Chronexa stands today

We have a **shell** of the print system: 17 template renderers + a settings dialog + a cell-style dialog. Crucially though, every template currently produces a single layout shape and the cell-style dialog only configures ONE shared anchor + ONE shared font + ONE shared bg/fg color for the entire template. Classic's per-element style storage is not there.

Current files (`js/ui/print_preview/`):
- `print_preview.js` (367 lines) — page composer + canvas
- `print_settings_dialog.js` (236 lines) — 7-tab global settings (Sizes / Globals / Structure / Colors / Supervision / Page header / Header text)
- `cell_style_dialog.js` (248 lines) — **one** shared anchor + **one** shared font + **one** bg/fg for the whole template
- `templates_registry.js` — registry
- `templates/*.js` (17 files, 66–115 lines each) — 17 template renderers

---

## Feature-by-feature parity matrix

Status legend: ✅ parity / 🟡 partial (gap noted) / ⛔ missing entirely.

### A. The per-card style dialog (screenshot 5) — the headline feature

Classic lets the user click any single card in the print preview and edit how its 7 elements render — **each element independently**.

| Sub-feature | Classic behaviour | Chronexa today | Status |
|---|---|---|---|
| 7-element toolbar (Subject / Teacher / Class / Group / Classroom / Count / Bell times) | All 7 shown side-by-side, each with own checkbox to enable | All 7 checkboxes present, but flat list | 🟡 — UI exists, semantics shared not per-element |
| Per-element 3×3 position grid | Each element has its OWN 9-position chooser | ONE 9-position chooser applies to whole card | ⛔ — needs split: 7 anchors instead of 1 |
| Per-element size slider | Each element has own size in % of cell (e.g. Subject 23 %, Teacher 14 %, Count 20 %) | No size control | ⛔ |
| Per-element font family | Bahnschrift / Arial / … picker per element | One font picker for whole card | ⛔ |
| Per-element bold/italic/underline | B / I / U toggle per element | No | ⛔ |
| Per-element text format (Abbreviation vs Full name) | Dropdown per element | No (template renderers hard-code) | ⛔ |
| "Print group instead of class" toggle (Class element) | Yes, when Class shown | No | ⛔ |
| "Do not print if entire class" toggle (Group element) | Yes | No | ⛔ |
| "Do not print if home classroom" toggle (Classroom element) | Yes | No | ⛔ |
| Live preview swatch (top-left of dialog) | Big sample card updates as you edit | Yes (right side, smaller) | ✅ — equivalent |
| **"Set for more" popup** (screenshot 6) | Apply this card's style to N other cards. Filters by: Selection / Position / Font (3 checkboxes) | No bulk-apply | ⛔ |
| "Edit texts ▼" button | Per-element label/abbreviation overrides — rename what "Mathematics" shows as on the card ("Math" / "M") without touching the underlying subject record | No | ⛔ |
| Defaults invert per report context | A **Class** report defaults Subject + Teacher + Classroom on, Class off (page title is class). A **Teacher** report defaults Subject + Class on, Teacher + Classroom off (page title is teacher). Confirmed in screenshots 5 vs 30 | Static defaults regardless of template | ⛔ |
| Multi-class activity cells | Friday 4th period in screenshot 29 shows `ACTIVITY / IX B/IX A/X A/X B/IX C` — one card representing one activity attended by 5 classes, label concatenated with slashes | Renderer not implemented for multi-class cards | ⛔ |

**This single dialog is what makes Classic's print feel mature.** The current Chronexa dialog covers the surface area but misses the fundamental shape (per-element settings, not whole-card).

### B′. **Modify Structure / Print report properties** — the pivot-table report builder (screenshots 19–28)

**This is the single biggest architectural difference between Classic and Chronexa.** Classic does not have 17 hardcoded templates — it has **one composable pivot engine with four axes**, and the 17 named "templates" are just preset axis configurations. The "Modify structure" dialog lets the user pick any axis combination at runtime.

The four axes:

| Axis | Classic selector | Allowed values | Levels | Purpose |
|---|---|---|---|---|
| **Pages** | "Print one page for" (3 dropdowns) | -, Day, Period, Week, Term, Class, Teacher, Subject, Classroom, Student | 1–3 nested | Each page covers one combination of the nested levels (e.g. "Class" → 23 pages, "Class × Day" → 138 pages) |
| **Columns** | "Columns" (3 dropdowns) | same 9 values + `-` | 1–3 nested | What runs horizontally on the page |
| **Rows** | "Rows" (3 dropdowns) | same 9 values + `-` | 1–3 nested | What runs vertically on the page |
| **Cells** | "Cells" (1 dropdown) | Draw lessons / Print count of placed cards / Print count of lessons | 1 | What goes in each intersection: the card-grid renderer, or a number |

Plus per-axis controls:
- "Fit width to one page" (Columns) — auto-shrinks columns
- "Hide empty columns" — drops dimensions with no cards
- "Fit height to one page" (Rows) — auto-shrinks rows
- "Hide empty rows" — drops empty dimensions

Bottom: "Set default print styles" (writes the current axis config + per-element styles as the new default for this report).

**What this means in practice — the same engine produces every template:**

| Pre-canned template | Pages | Rows | Columns | Cells |
|---|---|---|---|---|
| Timetable for each class | Class | Day | Period | Draw lessons |
| Timetable for each teacher | Teacher | Day | Period | Draw lessons |
| Timetable for each classroom | Classroom | Day | Period | Draw lessons |
| Timetable for each subject | Subject | Day | Period | Draw lessons |
| Summary timetable of classes | — | Class | Day × Period | Draw lessons |
| Summary timetable of teachers | — | Teacher | Day × Period | Draw lessons |
| Wait points of teachers | Teacher | — | — | Print count of placed cards |
| Lesson plan | Class | Subject | Day | Print count of lessons |
| Teacher workload | — | Teacher × Subject | Class | Print count of lessons |
| Custom 1/2/3 | (user picks all 4 axes) | — | — | — |

**Implication for Chronexa:** the right long-term shape is NOT 17 hardcoded template `.js` files — it's **one pivot-renderer + one Modify-Structure dialog**, plus a presets layer that ships the 17 named configurations as JSON. The current Chronexa templates work but they're 17× the code surface Classic has, and they can't compose new reports.

| Sub-feature | Classic | Chronexa today | Status |
|---|---|---|---|
| "Modify structure" ribbon button opens the Print report properties modal | Yes | No (we have `print_settings_dialog.js` but it does global settings, not per-report axis config) | ⛔ |
| Pages axis with 3-level nesting | Yes | No — each template is a fixed page-loop | ⛔ |
| Columns axis with 3-level nesting | Yes | No — most templates hardcode "periods are columns" | ⛔ |
| Rows axis with 3-level nesting | Yes | No — most templates hardcode "days are rows" | ⛔ |
| Cells dropdown (Draw / Count placed / Count lessons) | Yes | Only "Draw lessons" equivalent | 🟡 |
| Fit width / height to one page | Yes — auto-scale to fit | Not surfaced as a toggle | 🟡 |
| Hide empty columns/rows | Yes | No | ⛔ |
| "Set default print styles" button | Persists current axis config + per-element styles as the report's default | Per-template settings persist, but no axis-config concept | 🟡 |

### B. Report-template picker (screenshots 7 + 8)

Classic's "Select your report" dropdown lists ~17 entries grouped into 4 families.

| Classic entry | Chronexa template | Status |
|---|---|---|
| Timetable for each class | `classwise_with_table.js` | ✅ |
| Timetable for each teacher | `teacherwise_with_table.js` | ✅ |
| Timetable for each classroom | `wall_poster_classrooms.js` | 🟡 — variant exists |
| Timetable for each subject | `timetable_for_each_subject.js` | ✅ |
| Summary timetable of classes | `list_of_classes.js`? | 🟡 — naming mismatch, behaviour unclear |
| Summary timetable of teachers | `summary_of_teachers.js` | ✅ |
| Summary timetable of classrooms | `summary_of_classrooms.js` | ✅ |
| Summary timetable of students | `summary_of_students.js` | ✅ |
| Summary timetable of subjects | `summary_of_subjects.js` | ✅ |
| Wait points of classes | — | ⛔ |
| Wait points of teachers | — | ⛔ |
| Wait points of classrooms | — | ⛔ |
| Lesson plan | `lesson_grid.js` | 🟡 — exists, layout differs |
| Custom 1 / Custom 2 / Custom 3 | `custom_slots.js` | ✅ — 3 slots wired |
| Timetable for each class — with table | `classwise_with_table.js` | ✅ |
| Timetable for each teacher — with extra | `teacherwise_extra.js` | ✅ |
| Contract overview | `contract_overview.js` | ✅ |
| Daily attendance | `daily_attendance.js` | ✅ |
| Timetable for each day — with table | — | ⛔ |
| Timetable for each student | `timetable_for_each_student.js` + `timetable_for_student.js` | ✅ |

**Coverage:** ~17 of 20 Classic templates have a Chronexa counterpart. The 3 Wait-points + Day-with-table reports are missing. Naming and visual parity inside each template is a separate pass — we haven't done a side-by-side audit.

### C. Filter dialog (screenshots 9 → 15)

Classic has a global filter modal with 6 sections (Classes / Teachers / Classrooms / Subjects / Periods / Days), each opening a two-pane transfer-list dialog.

| Sub-feature | Classic | Chronexa | Status |
|---|---|---|---|
| Global Filter modal entry point | Yes — `Filter` button in print ribbon | No equivalent | ⛔ |
| Classes filter (transfer list) | Two-pane left/right with selected on right (green highlight), blue swap arrows, ↑ × ↓ reorder controls | No | ⛔ |
| Teachers / Classrooms / Subjects filter | Same pattern | No | ⛔ |
| Periods / Days filter | Same pattern | No | ⛔ |
| "Clear filter — print ALL items" reset | Yes | No | ⛔ |
| Filter persists across print sessions | Implicit | No | ⛔ |

**This is the second-biggest unmodeled Classic feature.** Without it, the user cannot say "print just the teachers Mr Sharma and Mrs Singh's timetables" — they have to print the whole set and discard pages.

### D. Print setup dialog (screenshot 18)

Classic's `Print setup` covers global rendering choices.

| Classic section | Classic detail | Chronexa | Status |
|---|---|---|---|
| Axis orientation | "Days are represented by columns OR Days are represented by rows" | Limited — buried inside a few templates | 🟡 |
| Header text | School name + free-text field | Chronexa `Print settings → Page header tab` | ✅ |
| Room supervision | 3 toggles (in individual / in summary / in color) | Chronexa `Supervision tab` | ✅ |
| "Text below the timetable" | Multi-line textarea (e.g., "W.E.F. 18.08.2025") | No | ⛔ |
| "Set default print style" button | Resets all per-element styles to default | No equivalent reset | ⛔ |
| Save defaults across documents | Implicit | Per-school only | 🟡 |

### E. Header (Periods) sub-dialog (screenshot 17)

Classic lets the user separately configure how the period-header row looks.

| Sub-feature | Classic | Chronexa | Status |
|---|---|---|---|
| Position 3×3 grid for period number | Yes — 40 % default | Single setting in `print_settings_dialog.js` Sizes tab | 🟡 |
| Size slider + font + B/I/U for period number | Yes | No B/I/U | 🟡 |
| "Print time intervals" toggle | Yes | No | ⛔ |
| Position + size + font for time intervals | Yes | No | ⛔ |
| "Print time in two lines" toggle | Yes | No | ⛔ |

### F. Ribbon-level controls (always-visible row in screenshots 4, 7, 16)

Classic's print ribbon has 9 grouped buttons in addition to Print / Prev / Next.

| Ribbon control | Classic behaviour | Chronexa | Status |
|---|---|---|---|
| Print | Send to printer | ✅ — `printAllPages` (p47-print-all-pages fix) | ✅ |
| Previous / Next page | Walk through pages | Yes | ✅ |
| Page X/Y indicator | Live count | Yes | ✅ |
| Select your report | Dropdown of 17 templates | Dropdown (templates registry) | ✅ |
| Filter | Opens global filter modal | No | ⛔ (see §C) |
| Style | Opens per-card style dialog | Opens cell-style dialog (shared) | 🟡 (see §A) |
| Modify structure | Per-template structure overrides | Wired but only 1 of 24 templates opts in | 🟡 |
| Extra columns/rows | Toggle extra info columns | No equivalent | ⛔ |
| Setup | Global setup dialog | `Print settings` (7 tabs) | ✅ — equivalent |
| Design | Color/theme presets | `Print settings → Colors tab` | 🟡 — fewer presets |

### G. Design-file system (no screenshot, but documented in `def.xml`)

Classic reads `designs/*/def.xml` files at startup. Each design defines:
- Pen colors + widths (6 line styles per decompiled evidence at `final_renderer.c:73–96`)
- Brush palettes (3 brush styles per `final_renderer.c:97–101`)
- Font defaults
- Image assets (logos)

| Sub-feature | Classic | Chronexa | Status |
|---|---|---|---|
| Pluggable design XML files | Yes — `Sample Blue 2`, `Sample Grey`, etc. | No XML loader | ⛔ |
| Color preset switcher | Yes — Design ribbon button | Limited — Colors tab | 🟡 |
| Custom-uploaded designs | Yes | No | ⛔ |

---

## H. Patterns surfaced by screenshots 31–44 (added 2026-05-22 evening, user-supplied second batch)

The second batch of screenshots showed every other report type rendered with real data plus their per-card style defaults. Four architectural patterns become visible that the first batch didn't expose. None of them is a separate feature — each is a behaviour that the pivot engine + per-element styles must support.

### H1. Multi-card-per-cell rendering with comma concatenation

When multiple cards land in the same (row, col) intersection — which happens whenever the pivot axes don't fully partition the data — Classic renders all matching cards in one cell, joining each element with a comma.

Evidence:
- **Image 33** (Subject = English page, 6 days × 8 periods grid): Monday 1st-period cell reads `Ms. Sushmita, Ms. Bindhya, Ms. Palmu, Ms. Tresha, Mr. Aswani / I A, III B, IV A, V A, VII A`. Five lessons share that slot because each class has English at Mon-1, taught by a different teacher. Same cell, 5 cards merged.
- **Image 35** (Summary timetable of classes, one page only): rows are classes, columns are Day×Period — every cell shows the one card for that class at that time, abbreviated to fit.
- **Image 42** (Summary timetable of subjects): cells show count + class list. `5 / I A, III B, IV B, X B, VIII C` means 5 classes share English at Mon-1.
- **Image 34** (Subject report's print-setup dialog): live preview swatch shows 4 teachers stacked on 4 classes in a single card — the renderer literally joins the per-element strings.

Implication: the cell renderer must accept a **list** of card objects and render each element as a joined string (one element-config governs all the joined cards). It's not "one card per cell" — it's "N cards per cell, all rendered through the same element-style template".

### H2. Per-card defaults invert based on what's in the page title (confirmed for all 5 report types)

I asserted this earlier from images 5 + 30. Images 32 + 34 now confirm it for every report type. The rule is consistent: **whatever the page title already says, the card hides.**

| Report | Page title | Defaults: Subject | Teacher | Class | Classroom |
|---|---|:-:|:-:|:-:|:-:|
| Timetable for each class | the class name (image 4) | ✓ | ✓ | ✗ | ✓ |
| Timetable for each teacher | the teacher name (image 29) | ✓ | ✗ | ✓ | ✗ |
| Timetable for each classroom | the room name (image 31) | ✗ | ✓ | ✓ | ✗ |
| Timetable for each subject | the subject name (image 33) | ✗ | ✓ | ✓ | ✗ |

Per-card style is one config object, but the **defaults table** is keyed by `(reportType, element)`. Chronexa currently uses a flat default — needs a lookup.

### H3. "Extra columns/rows" — derived side-panel content (the seventh axis I missed)

Images 43 and 44 show the **with-table** variants: the same daily timetable plus a **right-side panel** listing subject counts. The panel is the "Extra columns/rows" ribbon button output (visible in the print ribbon of every screenshot, never explained until now).

Evidence:
- **Image 43** (Class IV A with table): right panel reads `ENGLISH 7 / HINDI 6 / MATHS 6 / MATHS LAB PERIOD 2 / SCI LAB PERIOD 2 / E.V.S 6 / INFORMATION TECHNOLOGY 3 / GENERAL KNOWLEDGE 2 / GAMES 2 / LIBRARY 1 / ART & CRAFT 2 / DANCE 2 / MUSIC 2 / Emotional Well-being 1 / ACTIVITY PERIOD 1 / CLUB PERIOD. 3 / Lessons/week 48`
- **Image 44** (Teacher Mr. Amit with table): right panel reads `INFORMATION TECHNOLOGY 15 / ACTIVTY PERIOD 1 / Lessons/week 16`

The side panel is a small inner pivot: for the current page entity (class / teacher), it groups cards by subject and totals each. There's also a grand total at the bottom (`Lessons/week`).

Implication for the pivot model: it's not just (Pages × Rows × Columns × Cells). There's also an **Extras** axis that adds derived columns/rows alongside the main grid. The dialog (not shown in screenshots) likely lets you pick what summary appears in the side panel.

### H4. Duty / Free-period markers as first-class cards

Images 39 (Wall poster of teachers) and 36 (Summary timetable of teachers) show cells containing `FD / 1st Floor` repeated across many cells. "FD" is not a subject — it's a **floor-duty marker** that occupies a teacher's free period to show where they're stationed (probably "Floor Duty"). These cards print like lessons but have a separate semantic.

Evidence:
- **Image 39**: Mr. Anil's row on Monday shows `FD 1st Floor` for periods 1–8 except RECESS/BREAK. Mr. Amit's row shows actual subject cards. Mr. Anil is the floor supervisor.
- **Image 36**: same pattern, denser. The `FD` token appears in every free slot of certain teachers.

Implication: Chronexa needs a card-type for non-lesson duties (the school already tracks Floor Duty in the Substitution Planner via memory `project_substitution_planner.md`). The print renderer needs to read both lessons and duties from the school and render both through the same per-element template — but with different label sources (`subject` element pulls "FD" instead of the subject's name, `classroom` element pulls "1st Floor" instead of a room name).

### H5. Cell-density adaptation (text shrinks to fit, multi-line wrapping)

Look at image 35 (summary of classes) vs image 43 (one class with table). In the summary, columns are Day×Period (≈48 columns) so each cell is ~25 px wide and the text shrinks dramatically — subject names abbreviated, wrapped to multiple lines, no teacher name. In the one-class report, columns are Period only (8 columns) so each cell is 110 px wide and the full subject name + teacher fits.

Classic has a built-in **text-shrink-to-fit** algorithm. The per-element `size` slider in the style dialog (e.g., Subject 19%) is the **maximum** size; the renderer shrinks below that if the cell is too narrow. Long names like "MATHS LAB PD" wrap to two lines automatically.

Implication: the cell renderer needs:
1. A `measureText` pass to detect overflow
2. A shrink ratio (clamped to a minimum readable size, probably 6 px)
3. Multi-line wrapping for words that won't shrink further

Without this, narrow summary reports become unreadable.

### H6. Wall-poster format = Pages-axis becomes Day, Rows-axis becomes entity

Images 38, 39, 40 are "wall poster" reports. The pivot configuration:

| Axis | Wall poster of classes | Wall poster of teachers | Wall poster of classrooms |
|---|---|---|---|
| Pages | Day | Day | Day |
| Rows | Class | Teacher | Classroom |
| Columns | Period | Period | Period |
| Cells | Draw lessons | Draw lessons | Draw lessons |

So a school with 6 days produces 6 pages, and each page shows ALL classes/teachers/rooms stacked vertically with their schedule for that one day. Different axis assignment, same engine.

This confirms the pivot model is the right abstraction — the 20 named templates are 20 different axis configurations.

### H7. "Lesson grid" = Class × Subject matrix with teacher list as cell content

Image 41 shows a single page where:
- Rows = Class (IV A, IV B, VI A)
- Columns = Subject (English, Hindi, Maths, Sci, Phy, Chem, Bio, E.V.S, S.S.T, His, Pol Sci, Geo, Eco, I.T, Urdu, Sans, GK, Games, Lib, A&C, Dance, Music, E.W, ACTIVITY PD, CLUB PD, Fin Lit, CLUB PD, CIRCLE TIME, Literacy, Numeracy, Skills, ...)
- Cells = teacher list + period count per week

This is yet another pivot config: Pages=1 (all on one page), Rows=Class, Cols=Subject, Cell="teacher list + count". The "Cells" dropdown in the Modify-Structure dialog (screenshot 26: Draw lessons / Print count of placed cards / Print count of lessons) needs at least one more option — "Print teacher list + count" — or this is built by combining the count cell with the per-element Teacher rendering enabled.

### H8. Subject report has 40 pages (one per subject)

Image 33's page indicator: **Page 1/40**. The school has 40 subjects, so the "Timetable for each subject" report produces 40 pages. Useful sanity check on the pivot engine's page-count derivation: it's exactly `count(distinct values of the page-axis dimension)` filtered by the current filter set.

### H9. Print Setup dialog vs Single-Card Style dialog are the same UI

Image 34 (titled "Print setup") and image 5 (titled "Set the print style for the cards where: Length: 1, Size: 1/1") show the **same dialog with the same 6 element panels**. The only difference is the title and what they save to:
- "Print setup" = global defaults for this report
- "Set the print style for the cards where ..." = override for the clicked card(s)

The "Set for more" button in the single-card mode (image 6) lets the user push a per-card override back up to multiple cards. The "Set default print styles" button (image 18) in Print Setup mode lets the user push the defaults down to be the new global default.

This means we ship **one dialog component** with two modes, not two dialogs.

---

## I. The remaining 4 ribbon dialogs (added 2026-05-22 night, batch 45–56)

The final image batch showed me each of the remaining ribbon buttons opened: `Extra columns/rows`, `Sizes/widths`, `Design`, `Colors`. I had referenced them earlier in §F but hadn't seen their UI bodies. Now I have all 4.

### I1. `Extra columns/rows` dialog (images 45–48)

Stacked dialog with two collapsible sections — Extra columns (top) and Extra rows (bottom). Each section starts with just an **Add** button. Clicking Add appends a new row to that section with three controls + a delete `x`:

| Control | Behaviour |
|---|---|
| **Type** dropdown | `Empty` / `Sum of lessons` / `Teachers who teach these lessons` / `Classrooms where these lessons are taught` / `Subjects` / `Sum of covered lessons` |
| **Header text** | Free-text field; defaults to the type name. The label that appears at the top of the extra column or the start of the extra row. |
| **Width** | Numeric in % units (0–100), default 10 % of the printable width |

Each added extra is rendered alongside the main timetable grid — extras columns to the right of the grid, extras rows below it. The "Timetable for each class — with table" preset (image 43) uses extras with type = `Subjects` + `Sum of lessons` (one row per subject, with the count). The teacher version (image 44) uses the same shape filtered to the teacher.

**Image 49** catches the Classic save-changes prompt that triggers when the dialog is closed with unsaved edits — a generic dirty-close guard. Chronexa needs equivalent dirty-state handling on all print dialogs.

### I2. `Sizes/widths` dialog (images 50–52)

Four controls in one sheet:

| Control | Values |
|---|---|
| **Print setup** (orientation) | `Portrait` / `Landscape` |
| **Print setup** (page-fit mode) | `Normal` / `4 → 1 page` (4 logical pages tiled 2×2 on one physical page) / `Specify counts per page` (manual) |
| **Number of copies** | 1, 2, 3, … |
| **Add classroom timetable** | checkbox; when on, appends a classroom-timetable section after the main report |

The two "Print setup" labels are unfortunate UX duplication in Classic; we'd rename ours `Page orientation` and `Pages per sheet` for clarity.

### I3. `Design` dialog (image 53)

Two simple sections:

| Section | Detail |
|---|---|
| **Print logo** | Checkbox + uploaded image. When on, the image renders top-left of every page. Image upload via click-on-preview. |
| **Header and Footer** | "Header text" free-text field. Same text appears in the page header line (e.g. `G.D Goenka Public School, Darbhanga`). |

Footer text is its own thing — Classic shows `W.E.F 18.08.2025` on the left and `Classic Timetables Online` on the right at the bottom of every page. The footer text isn't directly editable in this dialog (probably configured elsewhere or auto-generated from school metadata).

### I4. `Colors` dialog (images 54–56)

Three independently-toggleable color sections, each with a master checkbox:

| Section | Controls | Effect |
|---|---|---|
| **Card's color and background** | `Print in color` toggle · `Color 1` · `Color 2` · `Position` dropdown (`Subject` / `Teacher` / `Class` / `Group` / `Classroom` / `Building`) | When on, each card's background is painted from the selected entity's stored color. Two colors = stripe / alternate per cell. |
| **Print row header in color** | `Print row header in color` toggle · `Background 1` · `Background 2` · `Font color` | Two backgrounds (alternating?) + custom font color for the row labels (Mo/Tu/We/…) |
| **Print column header in color** | Same shape | Same for column labels (1st/2nd/…) |

**Image 56** confirms what "Print in color" produces: SCI LAB PD cells render green (the Subject's stored color in the entity table), Bio cells render grey. Color is sourced from the entity record, not the print config — meaning the entity-editor's color field directly feeds the print renderer. Chronexa already has per-subject colors on the entity dialogs, so this is wiring work, not new data modelling.

The "two backgrounds" pattern hasn't shown rendered output yet in any of the 53 screenshots, so its exact semantic is still ambiguous. Working hypotheses: (a) odd/even row striping for the header band, (b) gradient between Color 1 and Color 2 within a single cell, (c) one color for "regular" cells + the other for a special class (e.g. lab cells). Worth confirming with one more screenshot or by reading the Classic JS bundle when we start implementing.

---

## Comprehensive 10-phase roadmap — from the beginning, covering all 53 screenshots

This is the version after seeing every dialog (4–56). It replaces every earlier draft. Each phase names what gets built, which screenshots it satisfies, which files it touches, what depends on it, and the cost in focused days.

The architecture rests on **one realisation** confirmed across every screenshot: Classic's print module is **one composable pivot engine** with surrounding dialogs that edit pieces of one shared `PrintReport` document. The 20 "templates" are presets. Cloning means rebuilding around a `PrintReport` JSON shape, not extending the current 17-template approach. Total time: **12.5 focused days** (Phases 0–9) for full parity; +2 optional days for Phase 10.

### Phase 0 — Spec freeze + module scaffold (½ day)

Before any UI: produce the `PrintReport` JSON schema in `js/ui/print_preview/print_report_schema.js`. Shape:

```
PrintReport {
  id, name, schoolId, version,
  // pivot axes
  pages:   [dim, dim?, dim?],
  rows:    [dim, dim?, dim?],
  cols:    [dim, dim?, dim?],
  cells:   "draw-lessons" | "count-placed" | "count-lessons" | "teacher-list-with-count",
  // fit + visibility
  fitWidth, fitHeight, hideEmptyCols, hideEmptyRows,
  // 7 per-element card styles (subject/teacher/class/group/classroom/count/bell)
  elementStyles: [ { enabled, anchor, size, font, bold, italic, underline,
                     textFormat, conditional, labelOverride } ],
  // filters
  filters: { classes:[], teachers:[], rooms:[], subjects:[], periods:[], days:[] },
  // extras axis (H3 / I1)
  extraCols: [ { type, header, width } ],
  extraRows: [ { type, header, width } ],
  // sizes/widths (I2)
  pageSetup: { orientation, pagesPerSheet, copies, addClassroomTimetable },
  // design (I3)
  design: { logoEnabled, logoDataUrl, headerText, footerText },
  // colors (I4)
  colors: { cardOn, cardKey, cardColor1, cardColor2,
            rowHeaderOn, rowBg1, rowBg2, rowFont,
            colHeaderOn, colBg1, colBg2, colFont },
  // header sub-dialog (screenshot 17)
  periodHeader: { anchor, size, font, bold, italic, underline,
                  showTimeIntervals, timeAnchor, timeSize, timeFont, timeTwoLines },
}
```

`dim ∈ { day, period, week, term, class, teacher, subject, classroom, student }`.

Also: `presets/print_presets.json` — 20 named configurations matching Classic's "Select your report". JSON-only at this stage.

**Dependencies:** none. **Output:** one schema + 20 presets. **Risk:** zero.

### Phase 1 — Pivot engine + Modify-Structure dialog (3 days)

Satisfies screenshots 4, 7, 8, 19–28.

1. `js/ui/print_preview/pivot_engine.js` — `renderReport(report, school) → PageDoc[]`. Loops Page axis to N pages; for each page builds Row × Col grid; consults filters; calls cell renderer per intersection. Output is DOM, not paint commands.
2. `js/ui/print_preview/cell_renderer.js` — given N cards + 7 element-style configs, lays out a single cell. Handles **multi-card-per-cell** (H1) via comma-joined element strings.
3. `js/ui/print_preview/modify_structure_dialog.js` — exact UX of screenshots 19–28. Three Page dropdowns × three Col dropdowns × three Row dropdowns + Cells dropdown + 4 fit/hide toggles + Set-default / OK / Cancel.
4. Wire "Select your report" to load presets from Phase 0.
5. **Retire** the 17 template `.js` files behind a flag `APP.PRINT_PIVOT_ENGINE`. Fallback for one release, then delete.

**Dependencies:** Phase 0. **Verification:** visually diff each of 17 existing templates against pivot engine output. **Risk:** medium (load-bearing). Mitigation: feature flag + A/B.

### Phase 2 — Per-element cell-style dialog (2 days)

Satisfies screenshots 5, 6, 30, 32, 34.

Rewrite `cell_style_dialog.js`. 7 element panels, each with: enabled / 3×3 anchor / size % / font / B / I / U / text format / conditional / label override / live preview swatch.

**Context-aware defaults table** (H2):
| Report | Subject | Teacher | Class | Group | Classroom | Count | Bell |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Class | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Teacher | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Classroom | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Subject | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |

Plus **Set for more** popup (image 6): Selection / Position / Font checkboxes.

Two operating modes: Print Setup (defaults editor, image 18/34) and Single-Card Style (override editor, image 5/30). Same component.

**Dependencies:** Phase 1.

### Phase 3 — Filter modal (1 day)

Satisfies screenshots 9–15.

`js/ui/print_preview/filter_dialog.js`. Top-level modal with 6 sections (Classes / Teachers / Classrooms / Subjects / Periods / Days). Each opens a two-pane transfer-list with ⇄ swap arrows, ↑/×/↓ reorder, Select all / Clear selection / OK.

State on `report.filters`. Phase 1's pivot engine reads it inside the dimension enumerator.

**Dependencies:** Phase 1.

### Phase 4 — Extra columns/rows dialog (1 day)

Satisfies screenshots 43, 44, 45–49.

`js/ui/print_preview/extras_dialog.js`. Two stacked sections (columns / rows), each with Add. Each entry: Type / Header text / Width % / × delete.

**Type behaviours** the renderer computes:
- `Empty` — placeholder
- `Sum of lessons` — count per page
- `Teachers who teach these lessons` — distinct teacher names
- `Classrooms where these lessons are taught` — distinct room names
- `Subjects` — subjects in entity's schedule + per-subject count column (image 43 panel)
- `Sum of covered lessons` — substitution-covered count

Pivot engine paints extras as additional columns (right of grid) + rows (below).

Phase 4 also introduces the **shared dirty-close prompt** matching image 49 — all print dialogs plug into it.

**Dependencies:** Phase 1. **Verification:** "Timetable for each class — with table" produces the 17-row Subjects panel from image 43.

### Phase 5 — Sizes/widths + Design + Colors dialogs (2 days)

Satisfies screenshots 50–56.

- **`sizes_widths_dialog.js`** (images 50–52): Orientation (Portrait/Landscape), Pages-per-sheet (Normal / 4→1 / specify), Copies, Add classroom timetable.
- **`design_dialog.js`** (image 53): Logo toggle + image upload (data-URL); Header text input.
- **`colors_dialog.js`** (images 54–55): three sections — Card / Row header / Col header. Card colour sourced from entity table (subject.color, teacher.color, …) keyed by the Position dropdown.

Image 56 confirms output: SCI LAB PD = green, Bio = grey, sourced from subject.color (Chronexa already stores this).

**Dependencies:** Phase 1.

### Phase 6 — Multi-class cells + Floor-Duty cards (1 day)

Satisfies screenshots 29, 36, 39, 44.

- **Multi-class activity cells**: when `card.classIds.length > 1`, render Class element as slash-joined (`IX B/IX A/X A/X B/IX C`).
- **Duty cards**: pivot engine consumes both `school.lessons` and `school.duties`; renders duties with `subject="FD"` + `classroom="1st Floor"` through the same template.

**Dependencies:** Phase 1, Phase 2.

### Phase 7 — Text-shrink-to-fit + multi-line wrap (1 day)

Satisfies screenshots 35–37, 42.

`cell_renderer.js` gets a `measureText` pass: try configured size, scale down by 5 % until it fits or hits 6 px minimum, then wrap by words to up to 3 lines, then abbreviate. Required for summary reports where columns become narrow.

**Dependencies:** Phase 1, Phase 2.

### Phase 8 — Header (Periods) sub-dialog (½ day)

Satisfies screenshot 17.

`report.periodHeader` config: anchor + size + font + B/I/U for period number; "Print time intervals" toggle + anchor + size + font for the time label; "Print time in two lines" toggle.

**Dependencies:** Phase 1.

### Phase 9 — Print Setup polish + missing presets (½ day)

Satisfies screenshot 18 + 3 missing report types.

- "Text below the timetable" → `report.design.footerText`.
- "Set default print style" reset button.
- 3 new presets: `Wait points of classes / teachers / classrooms` (`cells:"gap-count"`).
- 1 new preset: `Timetable for each day — with table`.

**Dependencies:** Phase 1, Phase 4.

### Phase 10 — Pluggable designs (optional, 2 days)

`def.xml` parser. 4 starter designs (paper / classic / modern / dark). Theme override via `report.design.theme`. **Lowest priority** — skippable for v1.

---

## Total cost rollup

| Phase | What | Days | Cumulative |
|---|---|:-:|:-:|
| 0 | Spec freeze | 0.5 | 0.5 |
| 1 | Pivot engine + Modify-Structure | 3.0 | 3.5 |
| 2 | Per-element cell style | 2.0 | 5.5 |
| 3 | Filter modal | 1.0 | 6.5 |
| 4 | Extra columns/rows | 1.0 | 7.5 |
| 5 | Sizes/widths + Design + Colors | 2.0 | 9.5 |
| 6 | Multi-class + duty cards | 1.0 | 10.5 |
| 7 | Text-shrink-to-fit | 1.0 | 11.5 |
| 8 | Period-header config | 0.5 | 12.0 |
| 9 | Polish + missing presets | 0.5 | 12.5 |
| 10 | Pluggable designs (optional) | 2.0 | 14.5 |

Phases 0–9 = **12.5 focused days** for full parity. Phase 10 = +2 optional days.

---

## Independent shipping

Each phase produces a user-visible improvement; no big-bang. Order rationale:
- **Phase 1** unblocks every other phase.
- **Phase 2** is the perceived "wow" — felt on every report.
- **Phases 3, 4, 5** can ship in any order after Phase 1; suggested order maximises compounding visible value.
- **Phases 6–9** polish what Phases 1–5 built.
- **Phase 10** optional.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Pivot engine output diverges from existing 17 templates | Ship behind feature flag; visual diff each template; fallback for one release. |
| `Set for more` semantics ambiguous | Start with conservative interpretation: applies to currently-selected cards in the preview. |
| `Two background colours` semantics ambiguous in Phase 5 | Hypothesis: odd/even stripes. Confirm by reading Classic JS bundle or ship single-colour for v1. |
| `def.xml` schema complexity in Phase 10 | Skip Phase 10 for v1. |
| Text-shrink-to-fit not pixel-exact with Classic | Acceptance criterion: text never overflows. Pixel match not required. |

---

## My recommendation for first move

Approve **Phase 0 + Phase 1 together** (3.5 days) as the first commit:
1. Locks the `PrintReport` schema.
2. Ships the pivot engine + Modify-Structure dialog behind a feature flag.
3. Proves the architecture on 17 templates without breaking output.
4. Sets up every subsequent phase to be 1–2 days each.

If you'd rather de-risk, **1-day proof-of-concept**: pivot engine + 3 presets ("Timetable for each class", "Timetable for each teacher", "Summary timetable of classes"). Proves architecture on the 3 most-used reports.

Awaiting your approval. Either:
- **"Approve full Phase 0 + Phase 1"** (3.5 days, behind flag) — most efficient
- **"Approve 1-day PoC first"** — most cautious
- **"Approve start-to-end Phases 0–9"** (12.5 days, multi-session) — full commitment up front
- **"Hold for more screenshots / questions"** — still research mode
- **"Pick different phase to start with"** — I'll re-order

No code touched until you say go.
