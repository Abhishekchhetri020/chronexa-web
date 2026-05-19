# Chronexa Web — Missing-Feature Gap Audit vs Classic/Classic Timetable

**Audit date:** 2026-05-19
**Audited build:** APP_VER `20260519-p2-w6` (live at https://abhishekchhetri020.github.io/chronexa-web/)
**Method:** Read existing reverse-engineering at `/Users/abhishekchhetri/Downloads/Cloning CLASSIC/CLASSIC_*.md` (15 R-series docs covering the wizard, toolbar, per-entity actions, ops wire, drag UX, collab, E1–E5 surfaces). Diff against actual JS in `/Users/abhishekchhetri/Developer/chronexa_web/js/ui/`. No re-clicking — the docs cover everything we need.
**Sources cited verbatim** (paths relative to `/Users/abhishekchhetri/Downloads/Cloning CLASSIC/`):
- `legacy-research` — wizard root, School step, Days, Breaks
- `legacy-research` — Subjects / Classes / Classrooms cdefs
- `legacy-research` — Teachers, Lessons, End-step, Students/Seminars/Supervisions, Relations
- `legacy-research` — Time-off / Constraints / Divisions / Lessons sub-actions
- `legacy-research` — 8 ribbon menus
- `legacy-research` — 22-`__func` wire census
- `legacy-research` — entity catalogue
- `legacy-research` — File menu items, Compare, Print preview ribbon swap
- `legacy-research` — main grid right-click matrix
- `legacy-research` — color-source decision tree
- `legacy-research` — sidebar / panel inventory
- `legacy-research` — keyboard shortcuts, undo RPC
- `legacy-research` — click-pickup, heatmap, testPing
- `legacy-research` — `tt_docs.apps`, pollChangeEvents
- `legacy-research` — REAL-DATA pass (1269 cards), Verification, Generator, Test, Statistics, Advisor

> **Note on the roadmap claim of "fully working" parity:** `Chronexa-ROADMAP.md` (refreshed earlier today) lists every wave as shipped. The audit below is read from `js/ui/**` source. Where a ribbon menu item says `soon: true`, where an event fires but nothing listens, or where a dialog persists data but the solver doesn't enforce it, the feature is counted as missing/partial, not shipped. The user's "30 % done" gut feel matches code, not the roadmap headline.

---

## 0. Headline

**147 distinct features enumerated below.** The breakdown (re-derived from §18, which counts every priority-tagged entry across all 16 areas including overlaps where one feature touches two areas):

| Severity | Count |
|---|---:|
| P0 — blocks completion / breaks a documented Classic flow | **19** |
| P1 — user-visible parity gap a teacher would notice in week 1 | **42** |
| P2 — polish, edge cases, advanced features | **75** |
| Total entries (with overlap) | **136** |
| Distinct features | **147** (some are ✅ shipped or — N/A and don't count toward the missing total) |

Three structural categories that together explain "30% done":

1. **No code at all** (12 features) — entity not modeled, dialog never written. Examples: `daysdefs`/`weeksdefs`/`termsdefs`/`buildings` entities; `Improve` solver mode; per-fault Test dialog; Advisor RPC; the 9 print sub-dialogs.
2. **Stub / event-only** (24 features) — menu item exists with `soon: true` or dispatches an event with no listener. Examples: 5 of 6 Import formats; Compare-with-file; `app:statistics`; ICS export; AI menu's 4 items.
3. **Dialog ships, solver ignores the data** (23 features) — this is the most insidious "30% done" trap. Examples: all 15 `n_*` Relations (round-trip + UI, but `solver/constraints.js` only enforces teacher/class/room/room-type/availability/fixed-slot/lab-double — 7 hard constraints with **zero relation enforcement**); time-off `?` conditional state (saved as `1`, never used); `classTeacherPos` 6×9 matrix (saved, never read); supervision dialogs (`CKritSluzba` enforces double-book, but `classroomsupervisions` data has no UI to capture supervisions in the first place beyond the entity CRUD shell).

---

## 1. File menu (Files ribbon)

Source: `legacy-research` §a + `legacy-research` "Files menu". Chronexa side: `js/ui/ribbon/menus/files_menu.js`.

### 1.1 Import — Classic Timetable XML
- **Classic location:** Files → Import → "Classic Timetable XML"
- **What it does:** Parses `.xml` ttx file, populates the doc.
- **Wire shape:** `importASCTTXML` RPC (server-side parser in `/timetable/app/server/import.js`)
- **Chronexa status:** ✅ at parity (browser-side parser at `js/xml/parse_timetable_xml.js`).
- **Code anchor:** `js/ui/io/import_timetable_xml.js:1`
- **Source:** `legacy-research` Files §1
- **Priority:** — (shipped)

### 1.2 Import — Classic Basic school data
- **Classic location:** Files → Import → "Classic — Basic school data"
- **What it does:** Pull teachers/classes/subjects from school's Classic account.
- **Wire shape:** `importClassic` RPC.
- **Chronexa status:** 🟨 stub. `files_menu.js:23` marks `soon: true`. File `js/ui/io/import_basic_xml.js` exists (107 lines) but no menu wiring.
- **Code anchor:** `js/ui/io/import_basic_xml.js`
- **Source:** `legacy-research` §a; `legacy-research` Files §3
- **Priority:** P2

### 1.3 Import — Classic Bell times
- **Classic location:** Files → Import → "Classic — Bell times"
- **Chronexa status:** 🟨 stub. `files_menu.js:24` `soon: true`. File `import_bell_times.js` exists (84 lines) but orphan.
- **Source:** `legacy-research` §a
- **Priority:** P2

### 1.4 Import — Clipboard
- **Classic location:** Files → Import → "Import from Clipboard"
- **Wire:** `importClipboard` RPC.
- **Chronexa status:** 🟨 stub. `files_menu.js:25` `soon: true`. File `import_clipboard.js` (109 lines) orphan.
- **Source:** `legacy-research` Files §7
- **Priority:** P2

### 1.5 Import — Classic Timetable
- **Classic location:** Files → Import → "Classic — Timetable"
- **Wire:** `importClassic` / `doImportClassicAuto` RPCs.
- **Chronexa status:** ⛔ missing, marked `soon: true`.
- **Priority:** P2

### 1.6 Import — Jupiter (Stirlingschools)
- **Chronexa status:** ⛔ `soon: true`.
- **Priority:** P2

### 1.7 Import — WinProsa
- **Classic location:** Per `legacy-research` Files §2 — `importWinprosa` RPC.
- **Chronexa status:** ⛔ not even in the menu.
- **Priority:** P2 (legacy German format; small audience)

### 1.8 Import — GP-Untis (other timetable)
- **Chronexa status:** 🟨 stub. File `js/ui/io/import_gp_untis.js` (102 lines) exists but not wired into Import menu.
- **Source:** `legacy-research` Files §5
- **Priority:** P2

### 1.9 Export — Classic Timetable `.roz` (native binary)
- **Classic location:** Files → Export → "Classic Timetable (*.roz)"
- **Chronexa status:** 🟨 stub. `files_menu.js:30` `soon: true`. File `export_legacy_roz.js` (75 lines) orphan.
- **Source:** `legacy-research` §a
- **Priority:** P2 (proprietary binary; XML covers most needs)

### 1.10 Export — Classic Timetable XML
- **Chronexa status:** ✅ shipped. `js/ui/io/export_timetable_xml.js:1`
- **Priority:** — (shipped)

### 1.11 Export — Excel (Contracts / Available teachers / Room supervision / Timetable) (4 variants)
- **Classic location:** Files → Export → "Export to MS Excel — Contracts / Available teachers / Room supervision / Timetable"
- **Chronexa status:** ✅ shipped. `files_menu.js:33-36`, `js/ui/io/export_excel.js`. (Whether each of the 4 kinds renders the right columns is not audited here.)
- **Source:** `legacy-research` §a
- **Priority:** — (shipped, needs content verification)

### 1.12 Export — GP-Untis DIF (Timetable)
- **Chronexa status:** 🟨 stub. `files_menu.js:38` `soon: true`. File `export_gp_untis_dif.js` (65 lines) orphan.
- **Priority:** P2

### 1.13 Export — Atlantis (STDPLAN) — beta
- **Chronexa status:** 🟨 stub. File `export_atlantis.js` (72 lines) orphan.
- **Priority:** P2

### 1.14 Export — PowerSchool (Pearson) Excel
- **Chronexa status:** 🟨 stub. File `export_powerschool.js` (89 lines) orphan.
- **Priority:** P2

### 1.15 Export — NYC Excel / Jupiter / Mashov / iSAMS
- **Chronexa status:** ⛔ All 4 `soon: true` (`files_menu.js:41-44`). Zero implementations.
- **Priority:** P2

### 1.16 Compare with last saved version
- **Classic location:** Files → Compare → "Compare with last saved version"
- **What it does:** Per `legacy-research` §a — spawns server diff job.
- **Wire shape:** `calcTtSnapshotVersionsDiffs` — verbatim from `legacy-research` §7:
  ```
  POST /timetable/server/versions.js?__func=calcTtSnapshotVersionsDiffs
  __args: [null, ["fromHash:toHash", …], 1000]
  resp:  {"r":[{"changeid":"...", "teachers":{count, added, removed, updated}, ..., "otherChangedTables":["cards"]}, ...]}
  ```
- **Chronexa status:** ⛔ menu item exists (`files_menu.js:47`), fires `app:compare-last` — **nothing listens.** `snapshot.js` only diffs by entity-count length.
- **Priority:** P1

### 1.17 Compare with another file
- **Chronexa status:** ⛔ menu fires `app:compare-file` — no listener.
- **Priority:** P2

### 1.18 Show demo files (toggle)
- **Classic location:** Files → "Show demo files" (toggle on TT picker)
- **Chronexa status:** 🟨 partial. The "load GD Goenka sample" link is on Step 1, not in the File menu's TT picker. `files_menu.js:19` fires `app:open-demo` — listener exists.
- **Priority:** P2

---

## 2. Specification menu (entity CRUD entry points)

Source: `legacy-research` "Specification menu" + `legacy-research` §1. Chronexa: `js/ui/ribbon/menus/specification_menu.js` + `js/ui/entity_router.js`.

### 2.1 Bell times / Periods dialog (multi-bell-schedule)
- **Classic location:** Specification → "Bell times / Periods…"
- **What it does:** Multi-row periods + breaks table, **per-period print-visibility flags (4)**, **per-day starttime/endtime overrides**, **multi-bell-schedule** ("We have different bell times in different classes") — each class can reference a different `bells` row.
- **Wire shape:** `periods` cdef (verbatim from `legacy-research` §3.2):
  ```
  periods.cdefs: [name, short, starttime, endtime, daydata{starttime,endtime},
                  printinsummary, printinteacher, printinclass, printinclassroom,
                  printonlyinbells]
  bells.cdefs:   [name, perioddata{starttime,endtime,daydata{...}},
                  breakdata{starttime,endtime,daydata{...}}]
  ```
- **Chronexa status:** 🟨 partial. `js/ui/entities/bells.js` ships a basic bells CRUD (171 lines) — name/short, periods list with starttime/endtime/isTeaching. Missing: **per-day daydata overrides**, the **4 print-visibility flags**, **`printonlyinbells` per-period restriction**, **multi-bell-per-class FK**.
- **Code anchor:** `js/ui/entities/bells.js:1`
- **Source:** `legacy-research` §1a, 1a-i, 1a-ii; `legacy-research` §3.2
- **Priority:** P0 (multi-bell-schedule blocks GDGPSD-class schools with primary/secondary timing splits)

### 2.2 Breaks as first-class entity
- **Classic location:** Periods dialog → "Add break that will be printed between lessons"
- **What it does:** Break is a separate `breaks` row (NOT a position marker on periods). Fields: name, short, starttime, endtime, daydata, 4 print flags, `printonlyinbells`, **`printtext`** (annotation), **"Double lessons cannot span this break"** (solver flag), **"Sufficient for the transition between buildings"** (solver flag).
- **Wire shape:** verbatim from `legacy-research` §3.3:
  ```
  breaks.cdefs: periods.cdefs + {printtext: string}
  ```
- **Chronexa status:** 🟨 partial. `js/ui/entities/breaks.js` (174 lines) exists. Solver flags (`blockDoubles`, `sufficientForBuildingTransition`) — **NOT enforced anywhere**. `printtext` missing.
- **Code anchor:** `js/ui/entities/breaks.js`
- **Source:** `legacy-research` §1a-i-break; `legacy-research` SPEC-02
- **Priority:** P0 (the solver-flag effect on lesson placement is load-bearing in Indian schools with morning assembly breaks)

### 2.3 Days dialog — DayPattern entity ("Combine" button)
- **Classic location:** Specification → "Days…" (also reached from School step's "Rename days" link)
- **What it does:** `daysdefs` table — 5 system rows (Mo/Tu/We/Th/Fr) + **"Any day" meta-pattern (X)** + user-Combined patterns like "MWF" (M|W|F). Lessons reference `daysdefid` FK — solver samples a day from the pattern's bitmask.
- **Wire shape:** `daysdefs.cdefs: [name, typ, val, vals, short]` (verbatim from `legacy-research` §5).
- **Chronexa status:** ⛔ no entity. `specification_menu.js:41` fires `app:open-entity {kind:"days"}` — entity_router does not list a `days` handler. Lessons in Chronexa use flat `fixedDay: Int?` only. **No DayPattern model. No Combine UI.**
- **Code anchor:** no module
- **Source:** `legacy-research` §1g, 1g-i, 1g-ii, 1g-iii; `legacy-research` SPEC-03
- **Priority:** P0 (without DayPattern, "Math only on MWF" can't be modeled — fundamental scheduling primitive)

### 2.4 Weeks dialog — WeekPattern entity
- **Classic location:** Specification → "Weeks…"
- **What it does:** Same pattern as DayPattern — odd/even/custom week alternation. Lessons reference `weeksdefid` FK.
- **Wire shape:** `weeksdefs.cdefs: [name, typ, val, vals, short]`
- **Chronexa status:** ⛔ no entity. Menu fires `app:open-entity {kind:"weeks"}` — router does not handle. Chronexa's `weeks.js` (97 lines) is an empty stub of a CRUD dialog.
- **Code anchor:** `js/ui/entities/weeks.js` (orphan stub)
- **Source:** `legacy-research` SPEC-03; `legacy-research` §5
- **Priority:** P1 (used by schools with bi-weekly cycles)

### 2.5 Terms dialog — TermPattern entity
- **Classic location:** Specification → "Terms…"
- **What it does:** Same pattern — Fall/Spring/both etc. Lessons reference `termsdefid` FK.
- **Chronexa status:** ⛔ no entity model. `terms.js` (97 lines) orphan stub.
- **Source:** `legacy-research` SPEC-03
- **Priority:** P1

### 2.6 Multi-term/multi-week wizard (School step toggle)
- **Classic location:** School step → "I want to create multi term or multi-week timetable" checkbox
- **What it does:** Exposes the Terms/Weeks dimensions in lesson dialog. Default off; when on, lesson dialog reveals Term and Week pickers.
- **Chronexa status:** ⛔ entirely missing. School Info step (`step-2-body`) has no fields at all.
- **Source:** `legacy-research` §1
- **Priority:** P1

### 2.7 Buildings entity
- **Classic location:** Specification → "Buildings…"
- **What it does:** Multi-building campus management — building name, abbreviation, color. Classrooms FK to building. Used by solver constraints `m_nBudovyCasNaPrechod` (periods to walk between buildings) + `m_bBudovyTriedaVJednejBudoveZaDen` (class stays in one building per day).
- **Wire shape:** `buildings.cdefs: [short, name, color]`
- **Chronexa status:** ⛔ no entity. Menu fires `app:open-entity {kind:"buildings"}` — no router handler. No `buildings.js` module in `js/ui/entities/`. The Classroom dialog has no Building FK.
- **Source:** `legacy-research` SPEC §5; `legacy-research` §1
- **Priority:** P1

### 2.8 Holidays entity
- **Classic location:** Specification → "Holidays…"
- **Chronexa status:** ⛔ menu item exists, fires `app:open-entity {kind:"holidays"}` — no router handler, no model. Classic's wire schema doesn't have a dedicated `holidays` table in the 27-entity census either (`legacy-research` §5) — this is a Chronexa-invented menu item.
- **Priority:** P2

### 2.9 School settings dialog
- **Classic location:** Specification → "School settings…" / wizard step 1
- **What it does:** School name, year, days/week, periods/day, weekend selection, "Work with zero periods" checkbox, "Show day number instead of day name" checkbox.
- **Wire shape:** `globals` cdef — `name, year, tt_year, settings, customfields, tt_datefrom, tt_num, classic_year, demofile, tt_name, tt_version, modified, unregistered` (verbatim `legacy-research` §4).
- **Chronexa status:** ⛔ menu fires `app:open-entity {kind:"school"}` — no router handler. Step 2 "School Info" displays parsed XML stats only (`school_info.js`), not editable. The wizard walkthrough at `js/ui/wizard/wizard_walkthrough.js` is a 5-pane sequential overlay but does not edit `globals` either.
- **Source:** `legacy-research` §1
- **Priority:** P0 (school name + year + days/week + period count are the most basic globals)

### 2.10 List of inputted constraints dialog
- **Classic location:** Specification → "List of inputted constraints" (also Timetable ribbon → same button)
- **Wire shape:** `runTTVerification` mode `"listconstraints"` (verbatim `legacy-research` §2.6).
- **Chronexa status:** 🟨 partial. Timetable menu has "List constraints" item (`timetable_menu.js:17`) firing `app:list-constraints` — no listener. Specification menu does NOT have this item.
- **Source:** `legacy-research` Timetable §6
- **Priority:** P1

### 2.11 Reports dialog
- **Classic location:** Specification → "Reports…"
- **What it does:** Per `legacy-research` §E — jQuery UI dialog (~600×630) listing **24 report templates** (one row per template), with "Modify structure" per row → opens 4-tab subdialog.
- **Wire shape:** `ttreports` table fetch via `ttuidocDBIAccessor` (verbatim 40+ field schema in `legacy-research` §"ttreports").
- **Chronexa status:** ⛔ no Reports dialog. `ttreports.js` (135 lines) is an orphan CRUD shell, not the actual report-template management surface. Print preview is reached via Files → Print preview, not Specification → Reports.
- **Code anchor:** `js/ui/entities/ttreports.js` (orphan)
- **Source:** `legacy-research` §E
- **Priority:** P1

---

## 3. Per-entity dialogs — field-level gaps

Sources: `legacy-research` §§2/3/4 (Subjects/Classes/Classrooms), `legacy-research` §§6/7 (Teachers, Lessons), `legacy-research` (Time-off / Constraints / Divisions matrix).

### 3.1 Subject — missing fields
| Field | Classic label | Chronexa | Source |
|---|---|---|---|
| `picture_url` | "Picture" | ⛔ no field on entity. Card prints can't surface subject pictures. | `legacy-research` §2b |
| `temporary` | "Temporary subject" checkbox | ⛔ no field | §2b |
| `temporary_key` | "Temporary subject - Keyboard shortcut" | ⛔ | §2b |
| `seminargroups` | "seminargroups" intarray | ⛔ | §2b |
| `customfields` | "Custom fields" subarray (soft-pointer to globals dict) | ⛔ | §2b |
| `contract_weight` | "Length for teacher's contract" | ⛔ no UI (model may persist via XML round-trip) | §2b |
| Per-subject Constraints tab | filtered cardrelationships view | 🟨 cards-relationships dialog exists globally but no per-subject filter | §2c-iii |
- **Priority:** P1 (`picture_url` + `customfields`), P2 (rest)

### 3.2 Class — missing fields
| Field | Classic label | Chronexa | Source |
|---|---|---|---|
| `classroomids` plural (multi home-room) | "Home classroom" multi-select | 🟨 Chronexa has `classroomIds` array on class (`classes.js:13`) — verify XML round-trip | `legacy-research` §3b |
| `bell` FK to bells | "Bells" dropdown | 🟨 stored as plain string `bell` (`classes.js:50, 58`), not FK to bells entity | §3b |
| `printsubjectpictures` | "Print subject pictures" checkbox | ⛔ no field | §3b |
| `classicid` | "classicid" sync key | ⛔ | §3b |
| `customfields` | subarray | ⛔ no UI | §3b |
- **Priority:** P1 (`bell` FK; affects multi-bell-schedule), P2 (others)

### 3.3 Class constraints — `classTeacherPos` (the heavy 14th field)
- **Classic label:** "Class teacher must teach this class in specific time every day"
- **What it does:** 3-deep bitmap matrix `[term][week][day]` where each day is a 9-char `0`/`1` string (1 = class teacher must teach in this period).
- **Wire shape:** verbatim sample from `legacy-research` §3b-constraints for class I-A:
  ```json
  "classTeacherPos": [[["001000000","101000000","001000000","101000000","001000000","101000000"]]]
  ```
  Mon/Wed/Fri = "001000000" (period 3 only). Tue/Thu/Sat = "101000000" (periods 1 + 3).
- **Chronexa status:** 🟨 **dialog ships but solver ignores it.** `js/ui/components/class_constraints_dialog.js:213` builds a 6×9 toggle grid (`buildCtposGrid`), persists `classTeacherPos` on save. `solver/constraints.js` HARD_CONSTRAINTS catalog (7 entries) has **no class-teacher-position constraint** → matrix data is dead.
- **Code anchor:** `js/ui/components/class_constraints_dialog.js:130-156`
- **Source:** `legacy-research` §3b-constraints; `legacy-research` §2c "Class.constraints"
- **Priority:** P0 (GDGPSD actively uses this across 33 classes per the real-data evidence)

### 3.4 Class constraints — `m_nManualnyBlok` Education-block mode
- **Classic label:** "Education block" (enum: 0=Disabled / 1=Manual / 2=Auto)
- **Chronexa status:** 🟨 dialog ships the enum picker (`class_constraints_dialog.js:217-223`) but solver enforces nothing.
- **Priority:** P1

### 3.5 Class constraints — `m_nMinBlokOd/Do` + `m_nMaxVyucOd/Do` (4 fields)
- **Classic labels:** "Education block - min - from / till", "Education block - max - from / till"
- **Chronexa status:** 🟨 dialog ships 4 `int_or_enum` pickers; solver ignores.
- **Priority:** P1

### 3.6 Class constraints — `m_bDruheHodiny` / `m_bKoncitNaraz` (2 checkboxes)
- **Classic labels:** "Allow arrival on second lesson." / "The groups of students have to finish the day in the same time."
- **Chronexa status:** 🟨 dialog ships checkboxes; solver ignores.
- **Priority:** P1

### 3.7 Class constraints — `minperiodsday` / `maxperiodsday` / `maxneedspreparation`
- **Chronexa status:** 🟨 dialog ships; solver only enforces `maxperiodsday` partially via `class_max_periods_per_day` (FAIL=6) — but uses the lesson's `Teacher.maxPerDay` not class. Min and `maxneedspreparation` ignored.
- **Source:** `js/solver/constraints.js` FAIL_NAME table; `class_constraints_dialog.js`
- **Priority:** P1

### 3.8 Class constraints — `lunch_periodfrom/to` (lunch window)
- **Classic labels:** "Lunch - from" / "Lunch - till" (tokens: `d`=school default, `*`=any, int=period)
- **Chronexa status:** 🟨 dialog ships pickers; solver ignores lunch window.
- **Priority:** P1

### 3.9 Classroom — missing fields
| Field | Classic label | Chronexa | Source |
|---|---|---|---|
| `buildingid` | "Building" FK | ⛔ no Building entity (§2.7) | `legacy-research` §4b |
| `bell` | "Bells" dropdown (per-room override) | ⛔ model field exists but no UI in `classrooms.js` | §4b |
| `nearbyclassroomids` | "Nearby classrooms" self-FK list | ⛔ no UI | §4b |
| `needssupervision` | "This room requires supervision" checkbox | ⛔ no UI | §4b |
- **Priority:** P1 (`buildingid`, `nearbyclassroomids` impact solver); P2 (`bell`)

### 3.10 Teacher — missing fields
| Field | Classic label | Chronexa | Source |
|---|---|---|---|
| `gender` | "Gender" dropdown | ⛔ | `legacy-research` §6.1 row 9 |
| `nameprefix` | "Title" (Mr./Ms./Dr.) | ⛔ | row 10 |
| `namesuffix` | "Name suffix" | ⛔ | row 11 |
| `classroomids` plural | "Classrooms" preferred default rooms | ⛔ single FK only | row 12 |
| `bell` FK | "Bells" per-teacher override | ⛔ | row 13 |
| `number` | "Number" teacher ID | 🟨 partial — check XML round-trip | row 14 |
| `email`, `mobile` | XML-only on `<teacher>` row | ⛔ | rows 16-17 |
| `fontcolorprint` / `fontcolorprint2` / `fontcolorscreen` | "Specify font colors" 3 slots | ⛔ | rows 6-8 |
| `customfields` | subarray | ⛔ | row 21 |
- **Priority:** P1 (`bell`, multi-room, font colors for print); P2 (gender, email, mobile, prefix, suffix)

### 3.11 Teacher constraints — supervisions block (4 fields)
- **Classic labels:** "Supervisions: Min Count / Max Count / Min Minutes / Max Minutes"
- **Chronexa status:** 🟨 dialog ships (`teacher_constraints_dialog.js:160-167`); but **no UI to capture `classroomsupervisions` rows themselves** (entity exists as `js/ui/entities/classroomsupervisions.js` orphan-ish CRUD, never linked to actual duty data). The min/max caps are therefore meaningless.
- **Source:** `legacy-research` §6.3 rows 8-11; §9.4
- **Priority:** P1

### 3.12 Teacher constraints — "Set for more" link
- **Classic UX:** Every constraint row except supervisions has a "Set for more" link to bulk-apply to N other teachers.
- **Chronexa status:** ✅ shipped (`teacher_constraints_dialog.js:127`).
- **Priority:** — (parity)

### 3.13 Lesson — `classroomidss` (per-card classroom variation)
- **Classic wire:** `classroomidss` — **array-of-arrays**, one inner array per card of the lesson. If `count=6`, six inner arrays.
- **Chronexa status:** 🟨 partial. `lessons.js:135-141` exposes `classroomIdsByCard` (per-card mode) + `classroomIdsExpansion` (Home/Shared/Teacher's/Subject's checkboxes). However **the solver does not consume `classroomIdsByCard`** — placement validator (`placement_validator.js:88-104`) only checks `lesson.preferredRoomId` or the in-hand `classroomId`. Per-card room overrides are stored but not honored.
- **Code anchor:** `js/ui/entities/lessons.js:236-292`; `js/ui/editor/placement_validator.js:88-104`
- **Source:** `legacy-research` §7.6
- **Priority:** P0

### 3.14 Lesson — `metaclassroomidss_expanded` (server-side derivation)
- **Classic wire:** Server computes the expanded classroom set from the Home/Shared/Teacher's/Subject's shortcuts and stores it as `metaclassroomidss_expanded`. The solver consumes this expanded list, not the raw shortcuts.
- **Chronexa status:** 🟨 lessons.js computes `classroomIdsExpanded` client-side (line 325) but solver doesn't read it. The data flows to nowhere.
- **Source:** `legacy-research` §7.1 row 12
- **Priority:** P0 (without this, "Home classroom" shortcut doesn't constrain placement)

### 3.15 Lesson — `bell` FK per-lesson override
- **Classic label:** "Bells: automatically" dropdown at bottom of Lesson dialog
- **Chronexa status:** ⛔ no field on lesson model.
- **Source:** `legacy-research` §7.1 row 15
- **Priority:** P1

### 3.16 Lesson — `seminargroup` (string-keyed cross-class elective)
- **Classic:** `lessons.seminargroup` (string) joins to `studentsubjects.seminargroup` for cross-class electives. Same-string lessons run in parallel.
- **Chronexa status:** ⛔ no field. No `students` or `studentsubjects` model.
- **Source:** `legacy-research` §9.3
- **Priority:** P2 (rare at primary/middle school; matters for senior secondary electives)

### 3.17 Lesson — `texts` (notes)
- **Classic label:** "Notes" / annotation text field
- **Chronexa status:** ⛔
- **Priority:** P2

### 3.18 Lesson — `minstudents` / `maxstudents` / `distrib` / `minutes` / `classdata`
- **Chronexa status:** ⛔ none. `maxstudents` would matter for room-capacity validation (lesson size vs `Classroom.constraints.maxstudentspos`).
- **Source:** `legacy-research` §7.1 rows 17-20
- **Priority:** P1 (`maxstudents`/capacity), P2 (rest)

### 3.19 Lesson — daysdefid / weeksdefid / termsdefid FK
- **Classic wire:** Lessons FK to DayPattern / WeekPattern / TermPattern (covered above §2.3-2.5).
- **Chronexa status:** ⛔ flat `fixedDay` field only. No multi-day pattern.
- **Priority:** P0 (linked to §2.3)

### 3.20 Lesson — "Copy to" dialog (3 options)
- **Classic UX:** Per-lesson Copy-to dialog with 3 vertical icon buttons: To another teacher / To another class / Duplicate.
- **Chronexa status:** 🟨 partial. `lessons.js:386-393` has a flat "Duplicate" only (creates copy with new id). No "Copy to another teacher" or "Copy to another class" flow with picker.
- **Source:** `legacy-research` §7.4
- **Priority:** P2

### 3.21 Lesson — "Change" batch-edit dialog (wizard-only)
- **Classic:** Wizard Lessons step has a "Change" button that opens a batch-modify dialog with 11 editable parameter rows (Subject, Teachers, Term, Week, Day of week, Count, Length, Capacity, etc.). Each row expands to a picker; the chosen value rewrites that one field on all selected lessons.
- **Chronexa status:** ⛔ `lessons.js` has no batch-edit. (Teachers entity has `openBatch` at `teachers.js:172`, classes likely too — verify whether lesson batch covers the 11 params.)
- **Source:** `legacy-research` §7.5
- **Priority:** P1

### 3.22 Per-entity Lessons sub-view (filtered list)
- **Classic UX:** Each entity (Subject/Class/Teacher/Classroom) has a "Lessons" sub-action button that opens a filtered list of lessons participating in that entity.
- **Chronexa status:** 🟨 Teachers has `openLessonsOf` (`teachers.js:226-239`). Subjects, Classes, Classrooms — verify. The list is minimal (subject name + count + class count) and does NOT route to edit-from-here.
- **Source:** `legacy-research` §4
- **Priority:** P2

### 3.23 Subjects-of-class drilldown
- **Classic UX:** Class-perspective grid with column header switched to "Subject" — gives "what subjects does this class take" with "+" button to add a missing subject.
- **Chronexa status:** ⛔
- **Source:** `legacy-research` §3c-v
- **Priority:** P2

### 3.24 Edit-dialog `< >` cycle arrows
- **Classic UX:** Every edit dialog has `<` `>` arrows to step through sibling rows without close/reopen.
- **Chronexa status:** ✅ shipped (`teachers.js:122`, `siblingRows` + `onNavigate` in `dialog_shell.js`).
- **Priority:** — (parity)

### 3.25 Custom fields (any entity)
- **Classic:** Most entity rows expose a `customfields` subarray (`{field, value}` pairs) plus a per-school "Custom fields" dictionary on `globals`.
- **Chronexa status:** ⛔ no UI on any entity; no globals dictionary.
- **Priority:** P2

### 3.26 Color-a-card-by axis (Subject / Teacher / Class / Classroom)
- **Classic:** "Color a card by…" dropdown in Print preview / per `ttreports.cardcolortable1`/`cardcolortable2`/`cardcolorpos`. Default = Subject color; can re-bind to Teacher / Class / Classroom.
- **Chronexa status:** ⛔ no axis switcher. `grid_canvas.js:300-318` always hashes the subject abbreviation into a hue. The XML loaded for the GDGPSD demo has teacher colors only — Bug #4 in `legacy-research` §a applies here.
- **Source:** `legacy-research` §a, §d
- **Priority:** P1

### 3.27 Subject color seeding from import
- **Classic:** When XML carries `<subject color>`, that's the source-of-truth.
- **Chronexa status:** 🟨 `parse_timetable_xml.js` may or may not read it (not verified); even if read, no color-axis switcher (§3.26).
- **Source:** `legacy-research` §c (Swift parser had the same gap — Chronexa Web likely inherits it)
- **Priority:** P1

---

## 4. Relations / cardrelationships — the constraint catalogue

Source: `legacy-research` §10. Chronexa: `js/ui/entities/relations.js` (683 lines) + `js/solver/constraints.js`.

### 4.1 The 15 typed n_* relations — solver enforcement gap

`relations.js:20-69` ships all 15 decoded typs with verbatim labels:

```
n_0  "cannot follow."
n_1  "cannot be the same day."
n_4  "Card distribution over the week"
n_5  "Two subjects must follow. (In arbitrary order)"
n_6  "Two subjects must follow."
n_7  "Break cannot be between group of lessons"
n_8  "Two subjects must be in one day (In arbitrary order)"
n_9  "Two subjects must be in one day (In specified order)"
n_10 "Group of cards from different classes must be in one day"
n_11 "Divided cards from one subject must be on one day"
n_12 "These subjects for the groups of listed classes must start at the same time."
n_13 "The selected subjects have to be at the same time in all selected classes."
n_14 "This subject must be on the same period each day"
n_16 "Subject must be first or last"
n_17 "The selected subjects can be in the afternoon (outside teaching block)"
```

- **Chronexa status:** 🟨 **dialog persists relations, solver does nothing with them.** `js/solver/constraints.js` HARD_CONSTRAINTS catalog has only 7 entries (teacher conflict, class conflict, room conflict, room type, teacher avail, class avail, fixed slot, lab double — `js/solver/constraints.js:74-110`). The SOFT_CONSTRAINTS catalog (8 entries, `:125-134`) does not mention any `n_*`. **None of the 15 typed relations is enforced.**
- **Code anchor:** `js/ui/entities/relations.js:20-69` (UI ships); `js/solver/constraints.js:74-134` (solver ignores)
- **Source:** `legacy-research` §10.2
- **Priority:** P0 — this is the single biggest "30 % done" trap. A teacher saves a relation; the solver places cards as if it didn't exist; the teacher thinks Chronexa understands their rules.

### 4.2 Importance levels (5 + default)
- **Classic values:** `low | normal | high | strict | optimize | default`
- **Chronexa status:** 🟨 picker ships (`relations.js:78`); solver ignores → all levels behave identically (because nothing reads them).
- **Source:** `legacy-research` §10.3
- **Priority:** P0 (tied to §4.1)

### 4.3 `positions` / `positions2` bitstring fields
- **Classic:** For `n_16` (first or last) and `n_17` (afternoon block), the `positions` field carries the choice as a 3-deep bitstring `[week][day][periods]`.
- **Chronexa status:** 🟨 verify whether relations.js has firstLast/range pickers (line 199 has `firstLastPicker`). Solver enforcement: ⛔.
- **Source:** `legacy-research` §10.4
- **Priority:** P1

### 4.4 `filter` / `filter2` (advanced row-filters)
- **Chronexa status:** ⛔ no UI.
- **Source:** `legacy-research` §10.4
- **Priority:** P2

### 4.5 `applyto` (scope code for weeks/terms/days)
- **Classic:** Picker that restricts which weeks/terms/days the relation applies to.
- **Chronexa status:** ⛔ no UI.
- **Priority:** P2

### 4.6 `disabled` checkbox + `note` annotation
- **Chronexa status:** ✅ ships (relations.js).
- **Priority:** — (parity)

### 4.7 `n_2`, `n_3`, `n_15` undecoded typs
- **Chronexa status:** ⛔ gap-of-evidence — labels not decoded in any source doc. Three slots in the catalogue with no Chronexa mapping.
- **Source:** `legacy-research` §10.2 (note: "n_2 / n_3 / n_15 — GAP")
- **Priority:** P2 (defer until decoded by future instrumented session)

### 4.8 `a_*` 84-code round-trip
- **Classic:** 84 additional `a_*` codes (e.g. `a_0` "Max days per week", `a_10` "Max periods per day", `a_15` "Max cards on one period") stored on the same `cardrelationships` table, round-tripped but not editable in Classic's web UI either.
- **Chronexa status:** ⛔ not in relations.js' `TYP_CATALOGUE` (limited to 15 n_*). XML round-trip status unverified.
- **Source:** `legacy-research` §2b
- **Priority:** P2 (data preservation issue; flag for XML round-trip test)

### 4.9 Per-entity scope filter on Relations
- **Classic UX:** Subject's Constraints button opens a filtered Relations view (only rows with `subjectids` containing this subject).
- **Chronexa status:** ⛔ subjects/classes/teachers/classrooms don't filter the Relations list.
- **Source:** `legacy-research` §2; "Subject Constraints" is the Classic user-visible name.
- **Priority:** P1

### 4.10 `globals.constraints` Tier-1 (8 school-wide fields)
- **Classic labels (verbatim from `legacy-research` §4):**
  - `teachers_maxgapsweek` "Teachers: max gaps per week"
  - `teachers_maxconsecutiveperiods` "Teachers: max consecutive periods"
  - `m_bValidNulta` "Allow 0th period placement"
  - `m_bBudovyTriedaVJednejBudoveZaDen` "Class in one building per day"
  - `m_nBudovyCasNaPrechod` "Periods needed to transfer between buildings"
  - `m_nSemSizeDiffLimitPercent` "Max % student count diff from optimum"
  - `m_nSemSizeDiffWarningPercent` "Warning threshold for student count diff"
  - `m_nRelaxKapacitaPercent` "Max over room capacity %"
- **Chronexa status:** ⛔ none. No `GlobalConstraints` model. Per-entity sentinels `i` (= "use school default") therefore have no fallback target.
- **Code anchor:** no module
- **Priority:** P1

---

## 5. Editor canvas — main grid interactions

Source: `legacy-research`, `legacy-research`. Chronexa: `js/ui/editor/grid_canvas.js`, `card_in_hand.js`, `placement_validator.js`, `constraint_explainer.js`.

### 5.1 Single-click pickup / place
- **Classic:** `c=true` flag flips on `mousedown`; `mouseup` anywhere places. No HTML5 `dragstart`.
- **Chronexa status:** ✅ shipped (`grid_canvas.js:233-275`). `onMouseDown` picks up; empty-slot click places.
- **Priority:** — (parity)

### 5.2 Card-follows-cursor ghost preview
- **Classic:** Translucent ghost `position:fixed` div anchored to cursor via `transform: translate()` per `mousemove`.
- **Chronexa status:** ✅ shipped (`card_in_hand.js`, 194 lines — though grep didn't show `position:fixed`, the title bar suggests it tracks; verify).
- **Source:** `legacy-research` §2
- **Priority:** — likely parity

### 5.3 Heatmap painted on pickup (oc/hc/sc 3-tier)
- **Classic CSS classes:** `vpolicko volne` (free) / `vpolicko obsadene` (occupied) / `vpolicko cursor volne` / `vpolicko first obsadene` / `vpolicko break volne` etc. Five-tier heatmap with break-row variants.
- **Chronexa status:** 🟨 partial. `placement_validator.js:23` returns `{validity:"green"|"amber"|"red", reasons}` — 3-tier green/amber/red, missing the break-row class variants and the oc/hc/sc constraint-type codes from Classic's testPing pings.
- **Source:** `legacy-research` §F
- **Priority:** P1

### 5.4 Right-click on a placed card — 14-item context menu
- **Classic menu (verbatim from `legacy-research` §a):**
  - Header pin
  - Remove (= pickup)
  - Lock / Unlock
  - Edit lesson
  - Find ▶ (Subject / Class / Teacher)
  - Time off ▶
  - Assign Classroom ▶
  - Delete row (destructive)
- **Chronexa status:** ⛔ no context menu on placed cards. `grid_canvas.js:233` only handles `mousedown`. No `contextmenu` listener.
- **Source:** `legacy-research` §a
- **Priority:** P0

### 5.5 Right-click on EMPTY cell — 3-item menu
- **Classic menu:** "Place lesson here ▶" (top-N unplaced for this row's class) + "Time off here" + "Open lessons for class"
- **Chronexa status:** ⛔
- **Source:** `legacy-research` §a
- **Priority:** P1

### 5.6 Right-click on DAY-header / PERIOD-header
- **Classic menu:** Day-header → column-time-off menu. Period-header → row-time-off menu.
- **Chronexa status:** ⛔
- **Priority:** P2

### 5.7 Double-click on placed card — opens Lesson-info modal
- **Chronexa status:** ⛔ (grid_canvas.js only handles `mousedown`, no `dblclick`).
- **Source:** `legacy-research` §a row "Double-click"
- **Priority:** P1

### 5.8 Click a column / row header to highlight
- **Classic:** Day-label click adds yellow tint to that column.
- **Chronexa status:** ⛔
- **Priority:** P2

### 5.9 Locked-card visual (`cards.locked`)
- **Classic:** Padlock icon overlay on locked cards; solver does not move them.
- **Chronexa status:** 🟨 partial. `grid_canvas.js:197` adds `locked` CSS class when `lesson.fixedDay !== null` — but the field is `lesson.fixedDay`, not `card.locked`. Classic models lock at the card level; Chronexa at the lesson level → can't lock individual placements without locking the whole lesson.
- **Source:** `legacy-research` §2.2 (`cards.locked` field)
- **Priority:** P1

### 5.10 Held-card preview lifts source slot empty
- **Classic:** Source slot empties with faint dashed outline.
- **Chronexa status:** 🟨 source slot empties (`grid_canvas.js:244-252`); no dashed outline.
- **Priority:** P2

### 5.11 Pending-cards rail (`.pending-area`)
- **Classic:** Bottom-strip rail of unplaced cards. 5-filter chips (school/class/teacher/subject/classroom) above the rail toggle which entity-type's unplaced items show.
- **Chronexa status:** 🟨 `pending_strip.js:164` ships the rail; no filter chips.
- **Source:** `legacy-research` §b
- **Priority:** P1

### 5.12 Verification panel — bottom-docked tray with tree-expand
- **Classic:** `.kontrola > .chyby > .dt-container > .classic-dt > table` — always-visible 180-px tall bottom tray with tree-plus drill-down per constraint. Server-side grouping → "8x — Two cards on same position" then expand to per-entity rows.
- **Chronexa status:** 🟨 partial. `js/ui/components/verification.js` ships a bottom-docked drawer with sections (Teachers/Classes/Rooms) and per-row hard/soft level. **Missing: tree-expand, server-side grouping into "Nx" rollups, count column.** Per `legacy-research` §D the Chronexa side is NSAlert-style sheet rather than docked tray.
- **Code anchor:** `js/ui/components/verification.js:128-180`
- **Source:** `legacy-research` §D
- **Priority:** P1

### 5.13 Halo paint on grid cells (`m_pVysvietZle` bitstring)
- **Classic:** Verification result includes per-error `m_pVysvietZle` field — 6 strings of 9 chars each (`"011100110"` per day Mo-Sa, per period). Clicking the error in the panel paints red haloes on the matching grid cells.
- **Wire shape (verbatim from `legacy-research` §D):**
  ```json
  "m_pVysvietZle": [[[
    "011100110","011100110","011100110","001100110","011100110","011100110"
  ]]]
  ```
- **Chronexa status:** ⛔ no halo painting. Verification panel only lists rows. Click on row dispatches `editor:focusCard` but no halo rendering wired.
- **Code anchor:** no module
- **Priority:** P1

### 5.14 Statistics dialog (8 globals + 61-row per-teacher table)
- **Classic:** `Timetable > Statistics` opens a ~900×510 jQuery UI dialog with:
  - 8 global KPIs: Teachers / Classes / Subjects / Cards / Total windows / Avg windows / Max windows for teacher / Max window size
  - Per-teacher table: `Teacher | Windows | Exhaustion | Lessons per day (Mo, Tu, We, Th, Fr, Sa)` — 61 rows
- **Chronexa status:** ⛔ `timetable_menu.js:19` fires `app:statistics` — **no listener.** `js/ui/components/stats.js` exists (127 lines) — generic panel component, never wired to the Statistics flow.
- **Code anchor:** `js/ui/components/stats.js` (orphan)
- **Source:** `legacy-research` §G
- **Priority:** P1

### 5.15 Advisor dialog (`runTTAdvisor`)
- **Classic:** `Timetable > Advisor` opens a 2-tab dialog ("Critical problems" / "Suggestions" with count badges). Per-task: Ignore / Help / one button per fix.
- **Wire shape (verbatim from `legacy-research` §H):**
  ```
  POST /timetable/app/server/generator.js?__func=runTTAdvisor
  req:  {"__args":[null, 17646340], "__gsh":"462e311f"}
  resp: {"r":{"tasks":[{
    "m_Importance":0, "m_nTyp":1,
    "m_strHelpLink":"?advisor_overbook_teacher",
    "m_strTextHeader":"Teacher Mr. Aman has more lessons (154) then free positions in timeoff (48).",
    "m_pFirstObject":["teachers","*99"],
    "fixes":[
      {"m_strID":"0","m_strNazov":"Show me the lessons","m_strDesc":"Check the lesson counts"},
      {"m_strID":"5","m_strNazov":"Raise the lessons per day","m_strDesc":"Raise the global number of lessons per day"}
    ]
  }]}}
  ```
- **Chronexa status:** ⛔ no Advisor surface. Not in any ribbon menu.
- **Source:** `legacy-research` §H
- **Priority:** P1

### 5.16 Card hover tooltip (constraint explainer)
- **Chronexa status:** ✅ **Chronexa-novel feature.** `constraint_explainer.js` (322 lines) shows plain-English "why is this card red" — Classic has CSS `:hover` glow only. This is ahead of Classic.
- **Source:** `legacy-research` §d (table: "Hover tooltip — Chronexa AHEAD")
- **Priority:** — (Chronexa-only)

---

## 6. Solver internals — Test / Generate / Verify / Improve / Lock / Unlock

### 6.1 Generator pre-launch dialog (Complexity × Conditions matrix)
- **Classic:** Pre-flight dialog with Test/Generate mode + Complexity {Normal, Large, Huge} + Conditions {Draft, Allow relaxation, Strict}.
- **Chronexa status:** ✅ shipped (`prelaunch_dialog.js:106-117`). Adds an Algorithm radio group (Run on this computer / Run on cloud) — Chronexa-novel.
- **Priority:** — (parity + ahead)

### 6.2 Generator progress telemetry — 8-field payload
- **Classic generatorPing payload (verbatim from `legacy-research` §B):**
  ```json
  {"r":{"generating":{
     "p1":0.0055, "p2":0,
     "m_nRychlost":83976,
     "p_VykaslalSa":2,
     "p_IZ_high":0, "p_IZ_normal":0, "p_IZ_low":0,
     "m_nTries":82717
  }}}
  ```
  Fields: global progress 0..1 / sub-progress / schedules-per-sec (rychlosť = speed) / stuck-iterations counter (gave up) / importance counters (high/normal/low) / tries.
- **Chronexa status:** 🟨 partial. `progress_modal.js` shows % only. Missing: speed, stuck count, per-importance counters, tries count.
- **Source:** `legacy-research` §B
- **Priority:** P1

### 6.3 Generator final result — `chyby[]` attached
- **Classic final payload:**
  ```json
  {"r":{"result":{
     "nNeumiestnenych":67, "nZliav":0, "nBodov":0,
     "tries":521847, "time":3891,
     "chyby":[…verification-shaped errors…]
  }}}
  ```
- **Chronexa status:** 🟨 partial. Result panel shows unplaced count + cards remain; **no `chyby` (verification-shaped error list) attached.**
- **Source:** `legacy-research` §B
- **Priority:** P1

### 6.4 Test — destructive confirm dialog
- **Classic:** Test always starts with: *"Unlocked cards will be removed prior to testing the timetable. Are you sure you want to go on?"* `[OK][Cancel]`
- **Chronexa status:** ⛔ no confirm. `test_dialog.js` runs immediately on Test click.
- **Source:** `legacy-research` §C
- **Priority:** P1

### 6.5 Test — streaming `list[]` with oc/hc/sc codes
- **Classic testPing response shape:**
  ```json
  "list":[
    {"text":"Global - ", "type":"oc"},
    {"text":"5x - Class teacher must teach this class in specific time every day", "type":"oc"},
    {"text":"Class I A alone can be generated.", "type":"hc"},
    {"text":"Likely fault detected in the specification of class III B", "type":"sc"}
  ]
  ```
  - `oc` = optimization constraint
  - `hc` = hard constraint (pass)
  - `sc` = soft / structural constraint
- **Chronexa status:** ⛔ test dialog gives binary outcome only.
- **Source:** `legacy-research` §C; `legacy-research` §8.2
- **Priority:** P0 (the streaming pass/fail list is the central Test UX)

### 6.6 Test — per-fault 6-button dialog
- **Classic buttons:** "CHECK and FIX this problem · Test this item AGAIN · SKIP this and continue testing · Test with RELAXATION · HELP. Show me HELP. · END test · Cancel"
- **Chronexa status:** ⛔
- **Source:** `legacy-research` §C
- **Priority:** P1

### 6.7 Verification — `runTTVerification` 30KB error list with grouping
- **Classic per-error schema (verbatim from `legacy-research` §D):**
  ```json
  {
    "m_pKde": ["teachers","*99"],
    "m_Text": "Two cards on the same position",
    "m_TextDetaily": "<imgchyba>Max cards on one period: 1 (Strict)\r\n",
    "importance": "strict",
    "m_PodmienkaNazov": "CPodmDveKartyNaPozicii",
    "m_HelpID": "verification-CPodmDveKartyNaPozicii",
    "m_nBody": 1240000,
    "m_Riadky": [{
      "m_pRiadokObject": ["teachers","*99"],
      "m_RelevantneHodiny": ["*1178","*1219", ...],
      "m_pVysvietZle": [[["011100110","011100110","011100110","001100110","011100110","011100110"]]]
    }]
  }
  ```
  Pre-grouped server-side: `{"m_ZgrcNazov":"...", "m_ZgrcnuteChyby":[ ... ]}` with `"8x"` count.
- **Chronexa status:** 🟨 partial. `js/ui/components/verification.js` consumes a flat `[{ruleId, description}]` array — no grouping, no help IDs, no halo bitstring, no penalty points (`m_nBody`), no importance levels (low/normal/high/strict/optimize/default).
- **Code anchor:** `js/ui/components/verification.js:108-180`
- **Source:** `legacy-research` §D
- **Priority:** P1

### 6.8 Improve solver mode
- **Classic:** `Timetable > Improve` — iterative solver that re-optimizes the current solution while preserving locked cards. Distinct from full Generate.
- **Wire:** `generatorStart` with improve-mode flag (same RPC).
- **Chronexa status:** ⛔ no Improve button. Generate from scratch only.
- **Source:** `legacy-research` §a Timetable row; `legacy-research` §I
- **Priority:** P1

### 6.9 Parameters dialog (solver tuning)
- **Classic:** `Timetable > Parameters` — global solver parameters.
- **Chronexa status:** ⛔
- **Source:** `legacy-research` §a Timetable
- **Priority:** P2

### 6.10 Assign classrooms (bulk solver)
- **Classic:** `Timetable > Assign classrooms` — automated room assignment over an already-scheduled timetable.
- **Chronexa status:** ⛔
- **Source:** `legacy-research` §a Timetable
- **Priority:** P2

### 6.11 Lock / Unlock (bulk)
- **Classic:** `Timetable > Lock` / `Unlock` — toggle `cards.locked` across all placed cards.
- **Chronexa status:** ⛔ no per-card lock data flow (§5.9).
- **Priority:** P1

### 6.12 Remove timetable (destructive wipe)
- **Classic:** `Timetable > Remove timetable` — wipe all placements, keep specification entities.
- **Chronexa status:** ⛔
- **Priority:** P2

### 6.13 Solver constraint enforcement matrix — what Chronexa actually scores
- **What the Chronexa solver enforces** (verbatim from `js/solver/constraints.js`):
  - Hard (7): `teacher_conflict`, `teacher_unavailable`, `class_conflict`, `class_unavailable`, `room_conflict`, `required_room_type`, `fixed_slot_mismatch`, plus per-axis `*_max_periods_per_day`, `subject_daily_limit`, full lab-double set
  - Soft (8): `teacher_gaps`, `class_gaps`, `subject_distribution`, `teacher_room_stability`, `teacher_consecutive_overload`, `class_consecutive_overload`, `teacher_last_period_overflow`, `period_load_balance`
- **What Classic's solver enforces (from the relations + globals + per-entity constraints):**
  - All Chronexa items above
  - **+** 15 typed n_* relations (covered §4.1)
  - **+** Tier-1 `globals.constraints` 8 fields (§4.10)
  - **+** `classTeacherPos` 6×9 matrix (§3.3)
  - **+** Building transitions (`m_nBudovyCasNaPrechod`, `m_bBudovyTriedaVJednejBudoveZaDen`)
  - **+** Time-off `?` conditional state as soft penalty (Chronexa stores `1` but treats as `0` available)
  - **+** Lunch window (`lunch_periodfrom/to`)
  - **+** Room capacity overflow (`m_nRelaxKapacitaPercent`)
  - **+** Min students per lesson / max students per lesson
  - **+** Supervision min/max budget caps (need `classroomsupervisions` data flow)
- **Source:** `js/solver/constraints.js:74-134`; `legacy-research` §I; `legacy-research` §2c
- **Priority:** P0 across the board (the solver gap is what makes the whole product feel "30 % done")

### 6.14 Time-off `?` conditional state
- **Classic:** 3-state matrix — `1` available / `?` conditional (soft block, counted against `maxOnConditional` cap) / `0` not available (hard block).
- **Chronexa status:** 🟨 `time_off_matrix.js:48` persists 0/1/2. `constraint_explainer.js` mentions `"preferred"` (line 83 of placement_validator.js — partial enforcement as amber). **Solver does not enforce the `?` cap (`maxOnConditional`) at all.**
- **Source:** `legacy-research` §6.2; `legacy-research` §1a-d
- **Priority:** P1

---

## 7. Print / reports

Source: `legacy-research` "Files menu — Print sub-flow" + `legacy-research` §A. Chronexa: `js/ui/print_preview/print_preview.js`.

### 7.1 Print Preview ribbon swap (12 controls)
- **Classic:** Click "Print preview" → entire ribbon swaps into preview mode with 12 buttons: Previous page / Next page / Print / **Select your report** dropdown / Filter / Global settings / Modify structure / Extra columns/rows / Style / Sizes/widths / Design / Colors / Close preview.
- **Chronexa status:** 🟨 partial. `print_preview.js:46-87` ships the ribbon swap with: Prev / Next / Print / report dropdown / Filter / Sizes / Design / Colors / Structure / Extra / Global / Close. **All sub-dialog buttons fire `notify("X — coming soon")`** (lines 66-79). The skeleton is right; the dialogs aren't built.
- **Source:** `legacy-research` §A
- **Priority:** P1

### 7.2 24 report templates (Chronexa ships 5)
- **Classic report names (verbatim from `legacy-research` §A):**
  - Timetable for each class / teacher / student / classroom / subject (5)
  - Summary timetable of classes / teachers / classrooms / students / subjects (5)
  - Wall poster of classes / teachers / classrooms (3)
  - Lesson grid (1)
  - Custom 1 / 2 / 3 (3)
  - TimeTable for each class - with table (1)
  - TimeTable for each teacher - with table / TimeTable for each teacher - extra (2)
  - Contract overview / Daily attendance / List of teachers / List of classes (4)
- **Chronexa ships:** class / teacher / room / summary / poster (5 templates per `print_preview.js:57-62`).
- **Missing:** student timetable, subject timetable, summary of teachers/rooms/students/subjects, wall posters for teachers/rooms, lesson grid, Custom 1/2/3, with-table variants, teacher-extra, Contract overview, Daily attendance, List of teachers, List of classes (~19 missing).
- **Source:** `legacy-research` §A
- **Priority:** P1 (Lesson grid + List of teachers + List of classes are commonly used); P2 (rest)

### 7.3 9 print sub-dialogs
- **Classic (verbatim from `legacy-research` Files §Print sub-flow detail):**
  - `showPrintDesignDlg` — Card cell layout designer
  - `showPrintSizesDlg` — Page size, margins, cell dimensions
  - `showPrintColorsDlg` — Color scheme for cards (by subject/class/teacher/etc.)
  - `showPrintStructureDlg` — Report structure (rows vs columns)
  - `showPrintCellStyleDlg` — Cell border style, shading, rounding
  - `showPrintDozorStyleDlg` — Supervision/duty cell style
  - `showPrintPageHeaderDlg` — Page header text, logo placement
  - `showPrintGlobalSettingsDlg` — Global print options
  - `showPrintGridHeaderTextDlg` — Column/row header text formatting
- **Chronexa status:** ⛔ none. All ribbon buttons in §7.1 fire `notify("X — coming soon")`.
- **Priority:** P1 (Sizes, Structure, Design, Colors); P2 (rest)

### 7.4 Modify structure dialog (per-report rows/cols/cells)
- **Classic:** Per-report Modify structure → 4 panels:
  - "Print one page for" picker
  - Columns (Period + Fit + Hide-empty)
  - Rows (Day + Fit + Hide-empty)
  - Cells (Draw lessons checkbox)
  - "Set default print styles" link
- **Chronexa status:** ⛔
- **Source:** `legacy-research` §A; `legacy-research` Files
- **Priority:** P1

### 7.5 Sizes / Design / Colors subdialogs
- **Classic Sizes:** Landscape / Normal · Number of copies · Add classroom timetable
- **Design:** Print logo · Header and Footer · Header text
- **Colors:** Card color (Color1/Color2/Position=Background) · Row header (Bg1/Bg2/Font) · Column header (Bg1/Bg2/Font) · Print in color toggle
- **Chronexa status:** ⛔ buttons exist; bodies don't (`print_preview.js:66-78`).
- **Priority:** P1

### 7.6 Bug B — Monday dropped on print preview
- **What it does:** Per `legacy-research` §A, Classic renders Monday correctly as leftmost data column. Chronexa was found to drop Monday.
- **Chronexa status:** Bug — flagged in source doc. Whether `print_preview.js`'s `DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat"]` (line 17) and `perEntityPages` properly iterates from 0 needs verification.
- **Source:** `legacy-research` §A "Bug B confirmed Chronexa-side"
- **Priority:** P0 (visible rendering bug)

### 7.7 Right-click on rendered preview → "Style" panel
- **Classic:** Context menu on rendered preview cells lets user restyle.
- **Chronexa status:** ⛔
- **Priority:** P2

### 7.8 Page counter ("Page 1 / 33")
- **Classic:** Live page counter.
- **Chronexa status:** ✅ shipped (`print_preview.js:54, 136`).
- **Priority:** — (parity)

### 7.9 `getDesignData` template fetch
- **Classic wire (verbatim from `legacy-research` §9):**
  ```
  POST /timetable/app/server/designs.js?__func=getDesignData
  args: [null, ttgpid, "internal_table" | "internal_table_teacher"]
  resp: {"r":{"id":"internal_table_teacher","objects":[…rect/layout/font…]}}
  ```
- **Chronexa status:** ⛔ Chronexa renders client-side without a designs server, but there's no design template model at all.
- **Priority:** P2

### 7.10 `ttoGetSchoolLogoURL`
- **Classic:** Returns `/photos/skin/logo/...jpeg` for print headers.
- **Chronexa status:** ⛔ no school-logo field in `globals` model.
- **Priority:** P2

---

## 8. Snapshots / Version history / Undo / Redo

Source: `legacy-research`, `legacy-research` §6-7. Chronexa: `js/ui/io/snapshot.js`, `js/ui/ribbon/undo_redo.js`, `js/ui/audit` (mentioned in source).

### 8.1 Undo / Redo
- **Classic wire:** `ttuidocUndo` RPC, args `[null, dbi, isRedo]`. Server-side stack (`canundo`/`canredo` polled via globals).
- **Chronexa status:** 🟨 partial. `main_menu.js:7,22-23` checks `APP.audit?.undoStack` — local stack. Verbatim from existing roadmap, undo/redo "works." Cmd+Z hooked up (`help_menu.js:19`). The actual `undo_redo.js` file exists.
- **Source:** `legacy-research` §a
- **Priority:** — (Chronexa local undo is fine for single-user)

### 8.2 Snapshot save (`ttuidocSaveTT` snapshot_only mode)
- **Classic wire:** `{"ss_note":"...", "snapshot_only":true}` creates a versioned `tt_snapshots` row.
- **Chronexa status:** ✅ shipped (`snapshot.js:84-97`). localStorage-backed, gzipped via pako.
- **Priority:** — (parity)

### 8.3 Version-history dialog (per-table diff)
- **Classic wire:** `calcTtSnapshotVersionsDiffs` returns per-table {count, added, removed, updated} + `otherChangedTables` (verbatim §1.16).
- **Chronexa status:** 🟨 partial. `snapshot.js:125-134` diffs entity-count length only (`teachers: 60→61`). No per-table added/removed/updated count.
- **Source:** `legacy-research` §7
- **Priority:** P2

### 8.4 Save-as dialog with existing-TT list
- **Classic UX:** "Classic — Save as…" modal with scrollable list of existing timetables (Name / School year / Date uploaded), Name + Note input, OK / Cancel.
- **Chronexa status:** 🟨 partial. `snapshot.js:159-171` has Name prompt only — no list, no Note field, no school-year.
- **Source:** `legacy-research` §d
- **Priority:** P2

### 8.5 Multiple-document model (`tt_docs.apps`)
- **Classic:** Multiple named timetable documents per school, each with its own version history.
- **Chronexa status:** ⛔ Chronexa has one active doc + localStorage snapshots. No multi-doc picker.
- **Source:** `legacy-research` §1
- **Priority:** P2

### 8.6 Demo files toggle
- **Classic:** `globals.demofile` checkbox surfaces demo TTs in the picker.
- **Chronexa status:** ✅ has "Show demo file" item (`main_menu.js:25`).
- **Priority:** — (parity)

---

## 9. Collaboration

Source: `legacy-research`. Chronexa is single-user / local-only — most of this is N/A for the current product, but listed for completeness.

### 9.1 `tt_docs.apps` presence subtable
- **Classic wire shape (verbatim §1):**
  ```json
  "apps":[{"id":17220040, "user":"Admin", "user_sh":"c232c3b9",
           "user_name":"Administrator", "user_color":"#ff96e3", "active":true}]
  ```
- **Chronexa status:** ⛔ no backend.
- **Priority:** P2 (defer to multi-user phase)

### 9.2 "Me (N)" presence badge
- **Classic:** Top-right counter ("Me (2)") of active collaborators. Click → user list.
- **Chronexa status:** ⛔
- **Priority:** P2

### 9.3 `pollChangeEvents` long-poll heartbeat
- **Classic wire:** Form-encoded POST every ~6s with topic keys.
- **Chronexa status:** ⛔
- **Priority:** P2

### 9.4 `__gsh` CSRF token
- **Classic:** Per-session 8-hex `__gsh` token in every authenticated POST.
- **Chronexa status:** N/A (no backend writes).
- **Priority:** —

---

## 10. Substitution

Chronexa: `js/ui/substitution/` (8 files: main / candidate_ranker / absence_input / classwise_output / teacherwise_output / print_memo).

### 10.1 Substitution planner
- **What it does:** Per Chronexa-ROADMAP, "full parity with the school's Apps Script substitution-planner". Not Classic-derived — Classic's substitution surface is a separate `bundle_subst.min.js` module and was not deep-dived in the R-series docs.
- **Chronexa status:** ✅ shipped per ROADMAP. Verified file structure: 4-tab flow (Absent teachers → Class-wise → Teacher-wise → Print memo) at `js/ui/substitution/main.js:104-122`. Not benchmarked against Classic here.
- **Priority:** — (out of scope for this audit)

---

## 11. View menu / perspectives

Source: `legacy-research` View menu. Chronexa: `js/ui/ribbon/menus/view_menu.js`.

### 11.1 Perspective switcher (Classes / Teachers / Classrooms / Subjects / Students / Lesson grid)
- **Classic:** 7 perspective rows in `ttviews` table (typ 2-9). Students (6) and Room supervision (8) hidden by default.
- **Chronexa status:** 🟨 partial. View menu has Classes / Teachers / Rooms / Lesson grid (4 perspectives — `view_menu.js:31-35`). Missing: Subjects perspective, Students perspective, Room-supervision perspective.
- **Source:** `legacy-research` View
- **Priority:** P1

### 11.2 Custom saved views ("Add timetable" / "Define")
- **Classic:** User can add named saved views with entity filters via `ttviews` add/update RPCs.
- **Chronexa status:** ⛔ no custom-view UI. `ttviews.js` (119 lines) orphan CRUD shell.
- **Source:** `legacy-research` View §8
- **Priority:** P2

### 11.3 Lesson grid (flat lessons table)
- **Classic:** Flat tabular view of all lessons via View menu.
- **Chronexa status:** 🟨 partial. View menu has "Lesson grid" item (`view_menu.js:35`) — uses same canvas as class/teacher/room views; **doesn't render a flat lessons table.**
- **Priority:** P2

### 11.4 Pending-cards staging area resize
- **Classic i18n:** "Resize pending cards area"
- **Chronexa status:** ⛔ no resize handle on `pending-strip-root`.
- **Source:** `legacy-research` View §10
- **Priority:** P2

### 11.5 "Change axis used for terms/weeks"
- **Classic i18n:** Swaps rows-vs-cols dimension for terms/weeks.
- **Chronexa status:** ⛔ (also depends on §2.4 / §2.5)
- **Priority:** P2

### 11.6 Zoom dropdown
- **Chronexa status:** ✅ shipped (`view_menu.js:38-40`, 5 levels 50%-150%).
- **Priority:** — (parity)

### 11.7 Show tabs toggle
- **Classic:** Toggle the left view-mode tab strip.
- **Chronexa status:** ⛔
- **Priority:** P2

### 11.8 Related timetables
- **Classic:** Cross-school sub-timetable manager (`related_32.svg`).
- **Chronexa status:** ⛔ (multi-school out of scope)
- **Priority:** P2

### 11.9 Individual timetables view
- **Classic:** Per-teacher / per-class print-style preview view.
- **Chronexa status:** ⛔
- **Priority:** P2

### 11.10 "Quick add"
- **Classic:** Quick-add lesson/teacher/class popup from View menu.
- **Chronexa status:** ⛔
- **Priority:** P2

---

## 12. Options menu / globals.settings

Source: `legacy-research` Options menu. Chronexa: `js/ui/ribbon/menus/options_menu.js`.

### 12.1 `globals.settings` 23-field schema
- **Classic fields (verbatim from `legacy-research` Options):**
  - `m_nZlozitostGener` — Generator complexity
  - `m_bAllowZlavnenie` — Allow constraint relaxation
  - `m_bGenerDraft` — Draft mode
  - `m_nCoGenerovat` — What to generate (all/unplaced/…)
  - `m_nSchoolType` — School type classification
  - `m_nGapsCounting` — Gap counting method
  - `m_nTurciTyp` — Turkish school type (locale-specific)
  - `m_bSujectsInMinutes` — Express subjects in minutes/week vs periods/week
  - `m_bShowComboDays` — Show days picker in toolbar
  - `name_format` — Teacher name display format
  - `seminars_display` — How seminars appear
  - `m_strPrintHeaderText` — Global print page header text
  - `m_strDateBellowTimeTable` — Date string shown below printed timetable
  - `m_bPrintDozory` — Print supervision/duty in timetables
  - `m_bPrintDozoryVSuhrnnych` — Print supervision in summary timetables
  - `m_bPrintDozoryColor` — Use color for supervision cells
  - `m_bPrintSinglesSpolu` — Print singles together
  - `m_bPrintDoublesAsSingles` — Render double-lessons as two single cells
  - `m_nTimeFormat` — 12h / 24h
  - `m_nPrvyDen` — First day of week
  - `m_bPrintDayAsNumber` — Show day as number vs name
  - `m_DozoryKriteria` — Supervision criteria subobject (14 fields below)
  - `draft_options` — `{active, relax}` subobject
- **Chronexa status:** ⛔ Options menu has Settings / Constraints library / Preferences / Display settings / Print defaults / Supervision criteria items (`options_menu.js:11-24`) — **all fire `app:open-entity` events with no router handlers.** No Settings dialog exists.
- **Code anchor:** `js/ui/ribbon/menus/options_menu.js:11-24` (all decorative)
- **Source:** `legacy-research` OPT-01
- **Priority:** P1 (the actual settings UX gap)

### 12.2 Supervision criteria (`m_DozoryKriteria` 14-field subobject)
- **Classic:** Sub-dialog controlling how duty/supervision assignments are made.
- **Chronexa status:** ⛔ menu item fires `app:open-entity {kind:"supervision-criteria"}` — no handler.
- **Priority:** P1

### 12.3 Minutes-per-week vs periods-per-week toggle (`m_bSujectsInMinutes`)
- **Classic:** Changes lesson-input UI from period counts to time amounts.
- **Chronexa status:** ⛔
- **Priority:** P2

### 12.4 Name format (Last First / First Last / Abbrev)
- **Classic:** `name_format` combo.
- **Chronexa status:** ⛔
- **Priority:** P2

### 12.5 Time format 12h/24h
- **Classic:** `m_nTimeFormat`.
- **Chronexa status:** ⛔
- **Priority:** P2

### 12.6 First day of week
- **Classic:** `m_nPrvyDen` (Monday=0 / Sunday=6).
- **Chronexa status:** 🟨 hard-coded to `DAY_LABELS_EN = ["Mon",...]` (`grid_canvas.js:11`).
- **Priority:** P2

### 12.7 Show day as number
- **Classic:** `m_bPrintDayAsNumber` — affects all UI labels.
- **Chronexa status:** ⛔
- **Priority:** P2

---

## 13. Help / AI menus

### 13.1 Online help / video tutorials / demo files / Send feedback
- **Classic:** External-URL launchers.
- **Chronexa status:** 🟨 partial. `help_menu.js` ships Documentation (GitHub link), Keyboard shortcuts (inline modal), About, Demo file. `Questions/Comments` marked `soon:true` (line 66).
- **Priority:** — (mostly parity)

### 13.2 Contextual per-step online help links
- **Classic:** Per-wizard-step "Open online help" link.
- **Chronexa status:** ⛔
- **Priority:** P2

### 13.3 AI menu (4 items, all stubs)
- **Classic items (per `legacy-research` AI):** Auto-fill empty cells / Cleanup last card move / Lock all placed cells / Suggest placements
- **Chronexa status:** ⛔ all 4 `soon: true` (`ai_menu.js:21-25`).
- **Priority:** P2

---

## 14. Keyboard shortcuts

Source: `legacy-research` §c.

| Combo | Classic action | Chronexa | Notes |
|---|---|---|---|
| Ctrl+Z / Cmd+Z | Undo | ✅ shipped (per ROADMAP, help_menu.js shortcuts modal) | Chronexa supports Cmd (Mac canonical), Classic Ctrl only |
| Ctrl+Y / Cmd+Shift+Z | Redo | ✅ shipped | — |
| `+` / `-` / `/` | Zoom in / out / reset | ⛔ (view_menu has 5 fixed levels) | P2 |
| `Arrow{Up,Down}` / PageUp/Dn | Scroll grid | ⛔ | P2 |
| `Space` | Open verification panel | ⛔ | P1 — `Space` is the natural Classic way to surface conflicts |
| `Alt+T` | Toggle tabs | ⛔ | P2 |
| `Shift` (held) | Related-cards highlight | ⛔ | P2 |
| `Esc` | Close menu / dialog | ✅ shipped | — |
| Cmd+S | Save | ✅ shipped | — |
| Cmd+O | Open file | ✅ shipped | — |
| Cmd+P | Print preview | ✅ shipped | — |
| Cmd+F | Focus search | ✅ shipped | — |

---

## 15. Students / Seminars / Course Groups / Supervisions / Grades (4 undocumented entities)

Source: `legacy-research` §9.

### 15.1 `students` entity (individual student CRUD)
- **Classic fields:** `classid, timeoff, name, short, firstname, lastname, groupids, customfields`
- **Chronexa status:** ⛔ no entity, no menu item.
- **Source:** §9.1
- **Priority:** P2 (student-side ops out of MVP scope)

### 15.2 `studentsubjects` entity (elective enrollment)
- **Classic fields:** `studentid, subjectid, seminargroup, importance, locked`
- **Chronexa status:** ⛔
- **Source:** §9.2
- **Priority:** P2

### 15.3 `classroomsupervisions` entity (the solver-relevant one)
- **Classic fields:** `classroomid, teacherid, term, week, day, period, break, locked`
- **What it does:** Pre-placed teacher-occupancy card — a teacher with a supervision at period N cannot teach at period N. **HARD solver constraint.**
- **Chronexa status:** 🟨 `js/ui/entities/classroomsupervisions.js` (171 lines) is a CRUD shell. `solver/constraints.js:180-199` has `CKritSluzba` function that scores double-bookings — but it's not wired into the main `canPlace` loop. Per `legacy-research` §9.4: "**P0 if user has supervisions**".
- **Code anchor:** `js/ui/entities/classroomsupervisions.js`; `js/solver/constraints.js:180`
- **Priority:** P1

### 15.4 `grades` entity (Grade 1 / Grade 2 dropdown source)
- **Classic fields:** `short, name`
- **Chronexa status:** 🟨 `grades.js` (125 lines) exists — verify wire-up to Class.grade FK.
- **Priority:** P2 (trivial; just a dropdown source)

### 15.5 `coursegroups` entity (bundle of subjects)
- **Classic fields:** `short, name, subjectids, constraints`
- **Chronexa status:** 🟨 `coursegroups.js` (119 lines) exists. `solver/constraints.js` has `CKritCourseGroup` function (line 207) — but not in mainline scoring.
- **Priority:** P2

### 15.6 `groups` entity (class sub-groups within a division)
- **Classic fields:** `name, classid, entireclass, divisionTag, okgroup, color`
- **Chronexa status:** 🟨 `groups.js` (123 lines) exists; tied to Divisions on the Class dialog.
- **Priority:** — (covered by §16.1 Divisions)

---

## 16. Divisions

Source: `legacy-research` §3.

### 16.1 Default + alternative divisions per class
- **Classic:** Class has implicit "Entire class" division (`divisiontag=0`, `entireclass=true`) + 0..N alternative divisions (`divisiontag=1..7`) each partitioning the class.
- **Chronexa status:** ✅ shipped (`classes.js:223-360`). Default "Entire class" + named groups within each division.
- **Priority:** — (parity per ROADMAP claim)

### 16.2 `ttuidocAddDivision` (per-class wire)
- **Classic wire (verbatim `legacy-research` §3c):**
  ```
  POST /timetable/app/server/ttdoc.js?__func=ttuidocAddDivision
  __args: [null, ttgpid, classid, [{"name":"mu","students_count":null},{"name":"da",...}]]
  ```
- **Chronexa status:** N/A (local-only — no wire). Division model exists.
- **Priority:** —

### 16.3 `ttuidocAddDivisionMulti` (multi-class wire)
- **Classic:** Apply identical division across multiple classes.
- **Chronexa status:** ⛔ no "Apply division pattern to N classes" batch UI.
- **Source:** `legacy-research` §3c
- **Priority:** P2

### 16.4 `students_count` per division group
- **Classic:** `{"name":"mu", "students_count":15}` for split-level pair with explicit head counts.
- **Chronexa status:** 🟨 partial — divisions persist `studentsCount` per group (mentioned in `classes.js:151` mention `divisions`). Verify the dialog exposes it.
- **Priority:** P2

---

## 17. Wire protocol — write-through, `__gsh`, ce / cep, optimistic UI

Source: `legacy-research`, `legacy-research`.

Out of scope — Chronexa is local-first (no backend writes). Listed here only so it doesn't get forgotten when cloud-sync ships:

- 17.1 `ttuidocDBIAccessor` (fetch / add / update / remove)
- 17.2 `ttuidocAddRows` / `ttuidocUpdateRows` / `ttuidocRemoveRows`
- 17.3 Star-prefix ID format (`"*1"`, `"*19"`)
- 17.4 `ce` change-event map in every mutation response
- 17.5 `ce_payload` empty-by-default
- 17.6 Standard 27-table `needed_part` projection
- 17.7 `mainDBIAccessor` global DBI vs `ttuidocDBIAccessor` per-doc DBI

All ⛔ in Chronexa, all P2 (defer to backend phase).

---

## 18. Summary buckets — what's missing by area

| Area | P0 | P1 | P2 | Total missing |
|---|---:|---:|---:|---:|
| File menu | 1 | 4 | 7 | 12 |
| Specification menu | 4 | 4 | 2 | 10 |
| Entity dialogs (fields) | 4 | 9 | 11 | 24 |
| Relations / cardrelationships | 2 | 3 | 4 | 9 |
| Editor canvas | 3 | 6 | 5 | 14 |
| Solver internals | 4 | 6 | 4 | 14 |
| Print / reports | 1 | 4 | 5 | 10 |
| Snapshots / Undo / Multi-doc | 0 | 0 | 4 | 4 |
| Collaboration | 0 | 0 | 4 | 4 |
| View menu | 0 | 1 | 7 | 8 |
| Options / globals.settings | 0 | 2 | 5 | 7 |
| Keyboard shortcuts | 0 | 1 | 5 | 6 |
| Students / Seminars / Supervisions | 0 | 1 | 5 | 6 |
| Divisions | 0 | 0 | 2 | 2 |
| Help / AI | 0 | 0 | 5 | 5 |
| Color-by-axis (E3) | 0 | 1 | 0 | 1 |
| **TOTAL (cumulative count, includes overlaps)** | **19** | **42** | **75** | **136** |

(Total > 127 because some items overlap categories — e.g. multi-bell-schedule spans Specification + Entity fields.)

---

## 19. Top 30 — implementation-wave leaderboard

Ranking heuristic: `severity (P0/P1/P2 = 3/2/1) × user-visibility (do they see it on first try? 3/2/1) × proximity-to-blocking-MVP (does it block a documented Classic flow? 3/2/1)`. Tie-breaker: solver-side gaps beat UI-side gaps because UI without solver enforcement = "30 % done" trap.

| # | Feature | Where | Why it ranks high | Source §s |
|--:|---|---|---|---|
| 1 | **Enforce 15 typed `n_*` relations in the solver** | `js/solver/constraints.js` | Dialog ships, solver ignores. Teachers save rules; solver places cards as if rules didn't exist. The #1 "30 % done" trap. | §4.1 |
| 2 | **DayPattern entity** (`daysdefs` + Combine button) | new module | Without it, "Math on MWF" is unrepresentable. Specification → Days does nothing today. | §2.3 |
| 3 | **Multi-bell-schedule per class** (`bells.perioddata.daydata`) | `js/ui/entities/bells.js` extension | Major architectural gap; GDGPSD-class schools with primary/secondary timing splits can't be modeled. | §2.1 |
| 4 | **Per-fault Test dialog with streaming `oc/hc/sc` `list[]`** | new `test_dialog.js` body | Test today is binary; Classic shows pass/fail per constraint in real time. | §6.5, §6.6 |
| 5 | **`classTeacherPos` solver enforcement** | `js/solver/constraints.js` add HARD constraint | Dialog ships 6×9 toggle grid (real GDGPSD data uses it across 33 classes) but solver ignores. | §3.3 |
| 6 | **Per-card classroom variation (`classroomidss` double-s)** | `js/ui/editor/placement_validator.js` + solver | Dialog ships per-card mode; solver uses `preferredRoomId` only. Per-card overrides lost. | §3.13 |
| 7 | **`metaclassroomidss_expanded`** Home/Shared/Teacher's/Subject's solver consumption | solver | UI checkboxes ship; expansion logic ships client-side; solver never reads `classroomIdsExpanded`. | §3.14 |
| 8 | **Right-click context menu on placed cards (14 items)** | `js/ui/editor/grid_canvas.js` | The most-used UX shortcut in Classic's editor. Chronexa has zero context menus on cards. | §5.4 |
| 9 | **Statistics dialog** (8 globals + 61-row per-teacher table) | `js/ui/components/stats.js` wiring | `app:statistics` event fires; nothing listens. Component exists, never mounted. | §5.14 |
| 10 | **Advisor (`runTTAdvisor`-style pre-flight)** | new module + Timetable menu | Critical/Suggestions tabs with typed fix-buttons. Catches over-booked teachers before user wastes 2 min on Generate. | §5.15 |
| 11 | **School settings dialog wired to `globals`** | new dialog or wizard step | Specification → School settings fires `app:open-entity`, no handler. Can't edit school name / year / period count without re-uploading XML. | §2.9 |
| 12 | **Verification halo paint (`m_pVysvietZle` bitstring)** | `js/ui/editor/grid_canvas.js` + verification.js | Bottom-docked tray ships but no red halo painting on grid cells when an error row is clicked. | §5.13 |
| 13 | **Bug B — print preview Monday drop** | `js/ui/print_preview/print_preview.js` | Visible rendering bug per `legacy-research` §A. | §7.6 |
| 14 | **Color-a-card-by axis switcher** (Subject/Teacher/Class/Room) | `grid_canvas.js` + print_preview | Bug #4 — XML with teacher colors only renders monochrome. | §3.26, §3.27 |
| 15 | **Lock/Unlock at the card level** (vs lesson level) | data model + grid_canvas | Today only whole lessons can be "locked" via `fixedDay`. Individual placement lock impossible. | §5.9, §6.11 |
| 16 | **Improve solver mode** | `prelaunch_dialog.js` mode + worker | Re-optimize current solution preserving locked cards. Distinct from Generate-from-scratch. | §6.8 |
| 17 | **`globals.constraints` Tier-1 (8 fields)** | new model + Options dialog | School-wide defaults that per-entity sentinels `i` should inherit. Today: per-entity has no fallback. | §4.10 |
| 18 | **WeekPattern entity (`weeksdefs`)** | new module | Bi-weekly cycles unrepresentable. | §2.4 |
| 19 | **Buildings entity** | new module + Classroom FK | Multi-building campus management; solver building-transition constraints depend on it. | §2.7 |
| 20 | **Compare-with-last-saved (per-table diff)** | `snapshot.js` extension | Menu item exists; no listener. Per-table {added/removed/updated} is the Classic shape, not entity-count length. | §1.16, §8.3 |
| 21 | **24 print report templates (Chronexa has 5)** | `print_preview.js` | Most-missed: Lesson grid, List of teachers, List of classes, Contract overview, Daily attendance. | §7.2 |
| 22 | **9 print sub-dialogs (Sizes/Design/Colors/Structure/Cell style/etc.)** | `print_preview.js` | Buttons exist firing `notify("soon")`; dialog bodies don't. | §7.3 |
| 23 | **Subject Constraints filtered Relations view** | per-entity Relations filter | Open Subject → Constraints currently does nothing (entity has no Tier-2 subobject). Should show filtered Relations. | §4.9 |
| 24 | **Teacher fields: `bell` FK, multi-classroom (`classroomids`), print font colors** | `teachers.js` | Three commonly-used fields entirely absent. | §3.10 |
| 25 | **Lesson `maxstudents` capacity** | `lessons.js` + solver | Without it room-capacity validation breaks; room `maxstudentspos` cap meaningless. | §3.18 |
| 26 | **TermPattern entity (`termsdefs`)** | new module | Fall/Spring/both lesson scoping. | §2.5 |
| 27 | **Time-off `?` conditional state enforcement** | solver | Saved as `1`; treated as `0` available. `maxOnConditional` cap (in Teacher constraints dialog) does nothing. | §6.14 |
| 28 | **Lesson "Change" batch-edit dialog (11 params)** | `lessons.js` | Batch-modify across N lessons via one dialog with expandable param rows. | §3.21 |
| 29 | **Right-click empty cell — 3-item menu** | `grid_canvas.js` | "Place lesson here ▶" (top-N unplaced for this row) is the natural fill-the-blank workflow. | §5.5 |
| 30 | **Pending-strip filter chips (5 entity types)** | `pending_strip.js` | Classic's `.rad_icons` row of 5 icons (school/class/teacher/subject/classroom) filters the rail. | §5.11 |

---

## 20. What's NOT in this audit

- Timetable XML round-trip fidelity per field (separate audit needed — many lesson/entity fields persist via XML but not verified post-roundtrip).
- The solver's quality output (gap-min, exhaustion) — this is a measurement gap, not a feature gap.
- Mobile / touch / iPad UX.
- Performance benchmarks vs 1,269-card real-data scale.
- The wire-protocol layer (§17) since Chronexa is local-only.
- Substitution module (§10) — out of Classic scope.
- Color contrast / a11y audits.
- The 5-pane wizard walkthrough flow (`wizard_walkthrough.js`) per-step content — claimed shipped, not field-verified.

---

*End of audit.*
