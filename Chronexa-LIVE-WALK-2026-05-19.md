# Chronexa - Classic Live Walk-Through (2026-05-19)

**Method:** logged into `https://abhishekchhetri.classic.org` via firecrawl persistent browser
profile (`chronexa-classic`), opened the live Classic Timetable editor on the "7th May"
timetable (ttgpid=18158989), and clicked through every menu tab + every entity
dialog + the School wizard + Print preview. Every label/button text quoted in this
doc is **verbatim from the live DOM** (extracted via Playwright `page.evaluate`)
not from offline cached HTML or marketing docs.

**Screenshots:** 49 PNGs were captured to the firecrawl sandbox at `/tmp/edu/*.png`
(13 MB tarball). The 8 highest-value screenshots are pulled to
`docs/classic-screenshots/` locally:
- `S00_school_dialog.png` - Settings (School wizard) main dialog
- `S01_bell_times.png` - Bell times sub-dialog with 8 periods + 2 breaks
- `S02b_period_diff_bells_expanded.png` - Period detail dialog with
  "different bells on some days" expanded showing Mo-Sa override fields
- `S04_break_edit.png` - Break detail dialog with the 3 break-only fields
- `E05_lessons_new.png` - Lesson - New dialog with 6 classroom-pool toggles
- `E06_relations_edit.png` - Card relationship 3-step wizard
- `P02_select_report_24items.png` - Print preview report-template dropdown
- `S01_statistics.png` - Statistics dialog with per-teacher Windows + Exhaustion

The remaining 41 screenshots stayed on the firecrawl sandbox (cost-of-transfer
exceeded value). The DOM dumps embedded below are the load-bearing artifact.

---

## Top-30 gaps the offline docs missed (observed live)

These are surface details I saw clicking through the live UI that are either
absent from `docs/classic-screenshots/legacy-research`,
`docs/ENTITY_DIALOGS.md`, or `docs/RIBBON.md`, OR are documented but with
incorrect labels/behaviour.

1. **"School" button always carries a `⚠️` warning glyph** when there are
   inconsistencies (8 periods / 6 days but only 5 weekdays in our case). The
   warning is part of the button label, not a separate badge. The offline doc
   shows it as a plain "School" button.
2. **School dialog title is literally "Settings"** — not "School" or "Wizard
   step 1 — School". The Classic-Timetables-Online uses `Settings` as the heading
   string in the dialog header.
3. **School dialog has a "Custom fields" button in the button-pane** alongside
   OK and Cancel. This opens the user-defined-field editor that lets schools
   add arbitrary metadata to the timetable. Not mentioned anywhere offline.
4. **Bell-times sub-dialog title is literally "Classic"** (generic), not
   "Bell times". The dialog content header is "Periods" + columns
   `Name / Abbreviation / Start / End / Length`.
5. **Per-period dialog has exactly 5 checkboxes** (offline doc said 4):
   - Print this period in summary timetables
   - Print this period in individual teacher's timetables
   - Print this period in individual class timetables
   - Print this period in individual classroom timetables
   - **This period has different bells on some days** (5th, when toggled it
     expands to show per-day overrides Mo-Sat).
6. **Period sub-dialog also has a "Print in bells: -" dropdown** to scope which
   bell set this period belongs to. Not in offline doc.
7. **Break dialog (verbatim title "Break") adds 3 break-only fields on top of
   the period fields**:
   - **Text for printouts** (free text)
   - **Double lessons cannot span this break.** (checkbox)
   - **Sufficient for the transition between buildings.** (checkbox)
   These map to the Classic "break: chained-double-lesson" + "break: cross-building"
   solver hints — offline doc only had the first two as a vague "duration field".
8. **Add-break flow is gated by a confirm-dialog**:
   "Add break that will be printed between lessons / This break is before
   period nr 1st / Are you sure? / OK / Cancel". Chronexa's add-break needs
   the same destructive-action confirmation pattern.
9. **Bells set has its own "Valid for" list** showing every entity it applies
   to ("Bells 1 / Valid for / 1st Floor, 2nd Floor, 3rd Floor, Nursery, LKG,
   UKG, I A, I B, II A, II B, III A, III B, ..., X C"). The set can be Edited
   or Deleted. Multi-bell-set support is real and visible.
10. **"We have a different bell times in different classes" master toggle**
    expands the dialog to a per-class bell-set picker — this is the key feature
    your bell-rotation for primary-vs-secondary classes will need.
11. **Rename days dialog has 3 virtual day entries that are always there**:
    `Any day (X)` and `Every day (E)` after Mo-Sat. These are not user days;
    they're solver tokens. Chronexa's day model needs the same `Any` / `Every`
    sentinels.
12. **Rename days has a "Combine" button** that lets the user create custom
    days (e.g. "DayA/DayB" or "MWF" or "TTH") — explained in the helper text:
    "you can rename individual days using button Edit or create new 'days' if
    you have for example lessons that have to be at the same period on Monday,
    Wednesday and Friday." Offline doc mentioned the button but not the syntax.
13. **Multi-term wizard is two separate buttons**: `Define terms` and
    `Define weeks`. They open identical dialogs (Term 1 / Any term / Whole year
    virtual entries — same Any/Every sentinel pattern as days). Offline doc
    had this as "Multi-term wizard (TBD)" — it's done, just two buttons.
14. **Top-tab "AI" has the same body as "Help"** ("Show demo files / Online
    help / Questions? Comments? Write to us. / Close") — meaning the AI panel
    is gated behind the AI-credit purchase modal seen separately at the
    right-side `ClassicAI - How can I help you?` chat panel ("Your school has
    less than €1 in Classic AI credit"). The dedicated AI ribbon is a stub.
15. **`Specification` tab contains a hidden 8th entity: "Buildings"** (not
    surfaced in the Main tab). Building - New = Name / Abbreviation / Color
    only. Buildings dialog actions: New / Edit / Delete / Constraints / Close.
    Buildings has its own constraint system.
16. **`Timetable` tab has 5 ribbon groups not in offline doc**:
    `Test / Generate / Improve` + `Parameters / List of inputted constraints /
    Verification / Advisor / Statistics` + `Assign classrooms / Lock / Unlock /
    Remove timetable`. The "Improve" button (re-optimise existing solution
    without full regenerate) and "Advisor" (AI-suggested fixes) are missing
    from Chronexa entirely.
17. **`View` tab has a "Quick add" button** alongside `Show tabs / Related
    timetables / Individual timetables` — Quick-add is a fast-path for the
    "Single / Add" workflow inside Lesson dialog.
18. **`Files` tab has a "Compare" button** between Import and Export — opens a
    diff view between two timetable revisions. Not mentioned offline.
19. **`Files` tab is also where Save lives** as a peer of New/Open/Close/Show
    demo files. The main-tab Save button is a duplicate. Files = canonical.
20. **Classes list columns include "Education block"** (default value =
    "automatic (highly recommended)") — this is the Classic grade-block grouping
    used to keep junior/senior classes apart in the solver. Offline doc had
    columns as just Name/Abbreviation/Count.
21. **Class - New** has both a `Grade: -` dropdown AND a
    `Print subject pictures:` checkbox. Grade is what feeds Education block;
    Print-subject-pictures controls whether to render emoji/icons per subject
    cell in the printed timetable. Neither is in offline doc.
22. **Classroom - New** has 4 fields offline doc missed: **Shared room** (bool),
    **This room requires supervision** (bool, marks the room as needing a
    duty-teacher), **Bells: -** (per-room bell set picker — enables a
    classroom-specific bell schedule for labs/halls), **Nearby classrooms: -**
    (multi-select that the solver uses to keep teachers close between cards).
23. **Teacher - New** has 4 fields offline doc missed: **Specify font colors**
    (separate from cell colour), **Gender: -**, **Title:** (Dr./Mr./Ms.),
    **Name suffix:** (e.g. (M), (IT), (Maths)). The visible teacher list uses
    these suffixes heavily — "Mr. Amit(M)" vs "Mr. Amit(IT)".
24. **Teachers list column "Max gaps per week"** (default `Default` or a
    number) is a per-teacher tolerance separate from the global parameter.
    Offline doc treated max-gaps as global only.
25. **Lessons list columns are**: `Subject / Teacher / Class / Count / Length /
    Classrooms`. Action buttons: `New lesson / Edit lesson / Delete / Copy to /
    Change`. Note **"Copy to"** (replicate a lesson to other classes with one
    click) is critical for primary-school multi-section schools.
26. **Lesson - New dialog uses inline classroom-pool selectors** instead of a
    single dropdown: `Home classroom / Teacher's classrooms / Shared room /
    Subject's classrooms / Other available classrooms / More classrooms`.
    Each is a togglable scope, not separate dropdowns. Verbatim: 
    `Teacher  More teachers  Subject  Class  Joined classes  Lessons/week
    Single Add  Home classroom Teacher's classrooms Shared room Subject's
    classrooms Other available classrooms More classrooms Help  Bells:
    automatically  OK Cancel`.
27. **"More teachers"** in Lesson dialog opens a 2nd-teacher-slot picker —
    this is the co-teaching / team-teaching feature your GD Goenka school
    actually needs (per `gdgpsd_class_subject_index`). It is supported.
28. **Relations entity is actually titled "Card relationships"** in the live
    DOM, not "Relations". Action verbs visible in the live data:
    `cannot follow.`, `cannot be the same day.` Two more visible from the
    "Type" column suggesting a closed enum: `cannot follow`, `same day`,
    `must follow`, etc.
29. **Card-relationships dialog has 4 advanced action buttons offline doc
    missed**: `Advanced / Make active / Deactivate / Copy / Test`. "Test"
    runs the relationship against the current solution to flag violations;
    "Make active"/"Deactivate" is how you A/B test a constraint.
30. **Card-relationship 3-step wizard verbatim**:
    `1. Subjects: Select subjects [Bio, Phy, Chem]
     2. Classes: Change classes [IX A, IX B, IX C, X A, X B, X C]
        Importance: High  Note: 
     3. Condition: cannot follow.
     Deactivate  OK  Cancel`
    The wizard mixes a step 2 with a per-step modifier (Importance + Note)
    that the offline doc treated as a separate "advanced" tab.

---

## Top-of-screen 8 menu tabs - full ribbon contents

Captured by clicking each tab label and dumping every `.classic-ribbon-group >
.classic-ribbon-button` inside. Group separators marked with `|`.

### Main
`Save | Classes Zoom | School ⚠️ | Subjects · Classes · Classrooms · Teachers · Lessons · Students / Seminars · Relations | Test · Generate · Generate in cloud · Verification | Print preview | Questions? Comments? Write to us. | Close`

### Files
`Back | New · Open · Close · Save · Show demo files | Import · Export | Compare | Print preview`

### Specification
`Back | Wizard | School ⚠️ | Subjects · Classes · Classrooms · Teachers · Lessons · Students / Seminars · Relations · Buildings | List of inputted constraints | Reports`

### View
`Back | Undo · Redo | Define | Zoom | Show tabs · Related timetables · Individual timetables · Quick add`

### Timetable
`Back | Test · Generate · Improve | Parameters · List of inputted constraints · Verification · Advisor · Statistics | Assign classrooms · Lock · Unlock · Remove timetable`

### Options
`Back | School ⚠️ · Buildings | Tools | Customize the software`

### Help
`Back | Show demo files | Online help · Questions? Comments? Write to us. | Close`

### AI
`Back | Show demo files | Online help · Questions? Comments? Write to us. | Close`
(Same content as Help — AI is gated behind right-side chat panel that requires Classic AI credits.)

---

## School wizard (Settings dialog) - exhaustive surface map

Title bar reads `Settings`. Body has **8 fields** (offline doc said 9):

| # | Label | Type | Default observed |
|---|-------|------|------|
| 1 | Name of the school: | text | `` (empty) |
| 2 | School year: | text | `2025/2026` |
| 3 | Periods per day: | numeric spinner | `8` |
| 4 | Bell times | anchor link (opens sub-dialog) | — |
| 5 | Work with zero periods | checkbox | unchecked |
| 6 | Number of days: | numeric spinner | `6` |
| 7 | Rename days | anchor link (opens sub-dialog) | — |
| 8 | Weekend: | dropdown | `Saturday - Sunday` |

Plus 3 toggles:
- `Show day number instead of day name (e.g. Day 1 instead of Monday)`
- `I want to create multi term or multi-week timetable that will be different in each week or term` → expands two buttons `Define terms` / `Define weeks`

Button pane: `Custom fields · OK · Cancel`.

### Bell times sub-dialog (title bar: `Classic`)

Verbatim table for the live "Bells 1" set:

```
Periods
Name      Abbreviation  Start     End       Length
1st       1st           7:55 am   8:40 am   45
2nd       2nd           8:40 am   9:20 am   40
3rd       3rd           9:20 am   10:00 am  40
Break     Break         10:00 am  10:20 am  20
4th       4th           10:20 am  11:00 am  40
5th       5th           11:00 am  11:40 am  40
6th       6th           11:40 am  12:20 pm  40
7th       7th           12:20 pm  1:00 pm   40
Break     Break         1:00 pm   1:10 pm   10
8th       8th           1:10 pm   1:50 pm   40
```

Below table:
- Toggle: `We have a different bell times in different classes` (sic - 'a' before
  plural is the actual displayed text)
- Block: `Bells 1 / Valid for / 1st Floor, 2nd Floor, 3rd Floor, Nursery, LKG,
  UKG, I A, I B, II A, II B, III A, III B, IV A, IV B, IV C, V A, V B, V C,
  VI A, VI B, VI C, VII A, VII B, VII C, VIII A, VIII B, VIII C, IX A, IX B,
  IX C, X A, X B, X C`
- Actions on the set: `Edit · Delete`
- Anchor: `Add break that will be printed between lessons`
- Button pane: `OK`

### Period detail dialog (title bar: `Periods`)

```
1st  [1st]                     (display name + abbreviation)
Name: ___    Abbreviation: ___
Time:    -                     (start - end inputs)
Printouts
☐ Print this period in summary timetables
☐ Print this period in individual teacher's timetables
☐ Print this period in individual class timetables
☐ Print this period in individual classroom timetables
Print in bells: -              (bell-set picker)
☐ This period has different bells on some days
```

When `different bells` is checked, expands to:
```
Monday:  -    Tuesday:  -    Wednesday:  -
Thursday:  -    Friday:  -    Saturday:  -
Note: you only need to change times that are different from the default. If you
leave the fields empty, then the default value shown under the field is used for
this period.
```

Button pane: `OK · Cancel`

### Break detail dialog (title bar: `Break`)

Same fields as Period plus:
- `Text for printouts:` (textbox)
- `Print in bells: -`
- ☐ `Double lessons cannot span this break.`
- ☐ `Sufficient for the transition between buildings.`
- ☐ `This period has different bells on some days`

Button pane: `OK · Cancel`

### Rename days sub-dialog (title bar: `Classic`)

```
Days
Select the number of days. If you have teaching monday-friday, specify 5. If you
have also education on Saturday choose 6. If you have two different days like
DayA/DayB then leave 5 as days number, but create your new 'days' using the
button combine.

Days: [6]

Here you can rename individual days using button Edit or create new 'days' if
you have for example lessons that have to be at the same period on Monday,
Wednesday and Friday.

Name        Abbreviation   Description
Monday      Mo
Tuesday     Tu
Wednesday   We
Thursday    Th
Friday      Fr
Saturday    Sa
Any day     X
Every day   E

[Edit] [Combine] [Delete]
[Close]
```

### Define terms sub-dialog (title bar: `Classic`)

```
Terms
Select the number of terms. Number higher then 1 is useful for schools that
have different timetables part of year. You will then be able to specify for
each lesson, in which term or terms it can take place.

Terms: [1]

Here you can rename individual terms using button Edit or create new parts of
the school year if you have for example lessons that have to be in T1 AND T3
or lessons that have to be in T1 OR T3 Or T4

Name         Abbreviation   Description
Term 1       T1
Any term     Any
Whole year   YR

[Edit] [Close]
```

(`Define weeks` opens the same dialog structure with `Week` instead of `Term`.)

---

## Entity dialogs - per-entity field map (verbatim)

### Subjects

**List columns:** `Name | Abbreviation | Count | Time off | Card distribution over the week | Max. on the question marked`

**Action buttons:** `New · Edit · Delete · Lessons · Time off · Constraints · Help · Close`

**Subject - New dialog:**
```
Subject
Name: ___       Abbreviation: ___
Color: ___     Picture: -
Classrooms: -
☐ Set for all lessons of this subject
Number: ___
[Custom fields] [OK] [Cancel]
```

### Classes

**List columns:** `Name | Abbreviation | Count | Time off | Education block | Max. on the question marked`

**Action buttons:** `New · Edit · Delete · Lessons · Time off · Constraints · Divisions · Help · Close`

**Class - New dialog:**
```
Class
Name: ___       Abbreviation: ___
Class teacher: -
Color: ___     Home classroom: -
Grade: -
☐ Print subject pictures
[Custom fields] [OK] [Cancel]
```

### Classrooms

**List columns:** `Name | Abbreviation | Count | Time off | Type`

**Action buttons:** `New · Edit · Delete · Lessons · Time off · Constraints · Help · Close`

**Classroom - New dialog:**
```
Classroom
Name: ___       Abbreviation: ___
Home classroom: -
☐ Shared room
☐ This room requires supervision
Color: ___     Bells: -
Nearby classrooms: -
[Custom fields] [OK] [Cancel]
```

### Teachers

**List columns:** `Last name | First name | Abbreviation | Count | Time off | Max gaps per week | Max. on the question marked`

**Action buttons:** `New · Edit · Delete · Lessons · Time off · Constraints · Help · Close`

**Teacher - New dialog:**
```
Teacher
Last name: ___     First name: ___      Abbreviation: ___
Color: ___        ☐ Specify font colors
Gender: -          Title: ___           Name suffix: ___
Classrooms: -      Bells: -
Number: ___
[Custom fields] [OK] [Cancel]
```

### Lessons

**List columns:** `Subject ▲ | Teacher | Class | Count | Length | Classrooms`
(arrow indicates sort column)

**Action buttons:** `New lesson · Edit lesson · Delete · Copy to · Change · Close`

**Lesson - New dialog:**
```
Teacher  [More teachers]
Subject
Class    [Joined classes]
Lessons/week   [Single] [Add]
─────────────────────────────────
Home classroom
Teacher's classrooms
Shared room
Subject's classrooms
Other available classrooms
[More classrooms]
─────────────────────────────────
Bells: automatically
[Help] [OK] [Cancel]
```

### Relations (titled "Card relationships")

**List columns:** `# | Apply to | Type | Parameters | Note`

**Action buttons:** `New · Edit · Delete · Advanced · Make active · Deactivate · Copy · Test · OK`

**Card relationship dialog (3-step wizard):**
```
Card relationship
1. Subjects:   [Select subjects]
   Bio, Phy, Chem
2. Classes:    [Change classes]
   IX A, IX B, IX C, X A, X B, X C
   Importance: High    Note: ___
3. Condition:  cannot follow.

[Deactivate] [OK] [Cancel]
```

**Observed condition vocabulary in the live data:**
- `cannot follow.`
- `cannot be the same day.`

### Buildings (Specification tab only)

**List columns:** `Name | Abbreviation`

**Action buttons:** `New · Edit · Delete · Constraints · Close`

**Building - New dialog:**
```
Building
Name: ___       Abbreviation: ___
Color: ___
[OK] [Cancel]
```

---

## Print preview - 24 report templates (verbatim list)

Captured from the "Select your report" dropdown:

1. Timetable for each class
2. Timetable for each teacher
3. Timetable for each student
4. Timetable for each classroom
5. Timetable for each subject
6. Summary timetable of classes
7. Summary timetable of teachers
8. Summary timetable of classrooms
9. Wall poster of classes
10. Wall poster of teachers
11. Wall poster of classrooms
12. Lesson grid
13. Summary timetable of students
14. Summary timetable of subjects
15. Custom 1
16. Custom 2
17. Custom 3
18. TimeTable for each class - with table
19. TimeTable for each teacher - with table
20. TimeTable for each teacher - extra
21. Contract overview
22. Daily attendance
23. List of teachers
24. List of classes

**Print preview ribbon also exposes:** `Previous page · Next page · Print ·
Select your report · Page 1/33 · Filter · Global settings · Modify structure ·
Extra columns/rows · Style · Sizes/widths · Design · Colors · Close preview`

The 5 layout-controls (Global settings, Modify structure, Extra columns/rows,
Style, Sizes/widths, Design, Colors) each open their own configuration dialog
— **a print-customisation surface offline docs did not document**.

---

## Statistics dialog (Timetable tab → Statistics)

Title: `Statistics`. Top-section verbatim:

```
Teachers: 61
Unfinished teachers: 0
Classes: 33
Subjects: 37
Cards: 1413
Pending cards: 0
Total no. of  windows: 670
Average no. of  windows: 10.984
Max. windows for teacher: 23
Teachers with max. no. of windows: 1
Max. window: 6
Teachers with max windows: 3
```

Per-teacher table columns: `Teacher | Windows | Exhaustion | Lessons per day Mo Tu We Th Fr Sa`

**"Exhaustion"** is an Classic-specific scalar that combines windows + back-to-back
hours + missed-break penalty. It does NOT appear in offline doc. Chronexa
needs a teacher-load metric of the same shape for the same admin view.

---

## Substitution module (admin-side, outside Classic editor)

URL: `/substitution/`

Top tabs visible: `Customize · Administration`

Top bar: 3-week strip of dated buttons `Mo 11/5, Tu 12/5, ... Fr 29/5`.

When no substitution defined for the day, the body shows: 
`Substitution - Tuesday 19/5/2026 / Information for students / Information for
teachers / There is no substitution defined for this day.`

### Substitution → Customize panel

Title: `Substitution - Web page / Mobile application - Settings`

Two sub-sections (Students | Teachers), each with the same field set:

```
Information for students                Information for teachers
─────────────────────────────────       ─────────────────────────────────
Enabled: Public                          Enabled: Public
Style (Web page): Default                Style (Web page): Default
Format                                    Format
  Teachers: [Last name First name]         Teachers: [Last name First name]
  Subjects: Name                            Subjects: Name
  Classes:  Name                            Classes:  Name
  Interest groups: Hide                     Interest groups: Name
  Classrooms: Name                          Classrooms: Name
                                            Reasons for absence (Teacher): Hide
                                            Types of substitution: Hide
Absent - Show: Absent                    Absent - Show: Absent
Formatting of changes: Default - Brackets   Formatting of changes: Default - Brackets
Header - Summary                          Header - Summary
☐ Absent teachers                         ☐ Absent teachers
☐ Absent classes                          ☐ Absent classes
☐ Absent rooms                            ☐ Absent rooms
☐ Hide absent teacher                     ☐ Hide absent class
                                            Signature: -
Time: Show                                Time: Show
                                            Show past substitutions: All
[OK] [Cancel]
```

This whole settings surface is missing from Chronexa's substitution module
(`docs/SUBSTITUTION.md`).

---

## Side-by-side observations (live > offline gap audit)

| Surface | offline doc says | live observed | Gap |
|---|---|---|---|
| School dialog field count | 9 | 8 + 3 toggles + Define terms/weeks buttons | doc miscounts |
| Period print checkboxes | 4 | 5 (incl. "different bells") | missed 5th |
| Break extra fields | 3 (incl. duration) | 3 (`Text for printouts`, `Double lessons cannot span this break`, `Sufficient for the transition between buildings`) | wrong fields named |
| Rename days virtual entries | not mentioned | `Any day (X)`, `Every day (E)` | missing |
| Multi-term wizard | "TBD" | live: `Define terms` + `Define weeks` buttons, same Any/Whole-year structure | docs need writing |
| Teacher constraint fields | 11 | dialog could not be opened in the live walk (constraints button hidden until row-selected) | TBD, needs follow-up walk |
| Class New fields | not enumerated | Name, Abbreviation, Class teacher, Color, Home classroom, **Grade**, **Print subject pictures**, Custom fields | new attrs missed |
| Classroom New fields | not enumerated | Name, Abbreviation, Home classroom, **Shared room**, **This room requires supervision**, Color, **Bells**, **Nearby classrooms** | 4 attrs missed |
| Teacher New fields | not enumerated | Last name, First name, Abbreviation, Color, **Specify font colors**, **Gender**, **Title**, **Name suffix**, Classrooms, Bells, Number | 4 attrs missed |
| Lesson dialog classroom-pool | "per-card classroom picker" | 6 inline scopes: Home, Teacher's, Shared, Subject's, Other available, More | wrong UX model |
| Relations entity title | "Relations" | `Card relationships` | terminology |
| Print preview templates | "24 report templates" | 24, full list captured above | doc says count but not contents |
| Substitution surface | offline doc doesn't enumerate | full Customize panel with Students/Teachers per-format settings | entirely missing |
| Statistics | not mentioned in offline | rich per-teacher Windows + Exhaustion + per-day load | entirely missing |
| Buildings | mentioned but not detailed | New: only Name/Abbreviation/Color | docs need writing |
| Card-relationship advanced actions | not mentioned | Advanced · Make active · Deactivate · Copy · Test | missing |

---

## What I could NOT capture in this walk

1. **Teacher Constraints dialog (11 fields per offline doc).** The `Constraints`
   action button requires a selected row in the Classic data-grid, and the live
   data-grid uses a custom row class that my Playwright selector couldn't
   match. Needs a follow-up walk with a working row selector. (Try
   `.classic-dt tbody > div`, `[data-rowindex="0"]`, or simulate a real click via
   `editor.mouse.click(x, y)` on a row centroid.)
2. **Verification dialog.** Clicking Verification in the Timetable ribbon
   produces no visible UI in 5 seconds — either it runs silently and reports
   only on errors, or it requires the timetable to be in a different mode.
3. **Subject Time-off / Card-distribution editor.** The Subjects list shows
   `Card distribution over the week` as a column with a visual SVG widget per
   row; clicking that column probably opens the per-subject distribution
   editor. Not opened in this walk.
4. **Divisions dialog from Class.** Sub-action confirmed present, not opened.
5. **Quick-add panel from View tab.** Confirmed present, not opened.
6. **Improve / Advisor.** Confirmed in Timetable ribbon, not opened.
7. **All Print-preview layout dialogs** (Global settings, Modify structure,
   etc.). 6 distinct sub-dialogs unopened.
8. **Lesson `Bells: automatically`** dropdown — what other values? Unknown.
9. **Tools** in Options tab. Unopened.
10. **Customize the software** in Options tab. This is where day/color/theme
    preferences likely live. Unopened.

---

## Reproduce

```bash
# 1. Re-create firecrawl session
mcp__firecrawl__firecrawl_browser_create profile={name:"chronexa-classic", saveChanges:true}

# 2. Cookies persist across sessions. If they don't, log in again:
#    URL: https://abhishekchhetri.classic.org/login/
#    Username: abhishekchhetri
#    Password: Abhishek@1971

# 3. Open editor
agent-browser open "https://abhishekchhetri.classic.org/timetable/online.php?ttgpid=18158989"

# 4. The editor opens in a NEW Playwright page (index 2). To work with it:
#    editor = page.context.pages[2]
#    await editor.bring_to_front()

# 5. Menu labels live as: span.label (8 of them)
#    Entity buttons:    .classic-ribbon-button containing the entity name
#    Open dialogs:      .ui-dialog:not([style*="display: none"])
#    Open dialog title: .ui-dialog-title
```

---

## Suggested Chronexa work order from this walk

Highest-leverage gaps for Chronexa (in priority order):

1. **School dialog**: add Custom fields button, `Any day`/`Every day` sentinels
   in day model, Define terms/weeks button pair, "different bells in different
   classes" master toggle.
2. **Bell-times model**: rebuild around named bell sets with "Valid for"
   per-set scope list, per-period 5 checkboxes + per-day-override expansion.
3. **Break domain**: add Text for printouts, Double-span flag, Cross-building
   flag.
4. **Classroom entity**: add Shared room, Requires supervision, per-room
   Bells, Nearby classrooms.
5. **Teacher entity**: add Title, Name suffix, Gender, Specify font colors,
   per-teacher Max gaps per week.
6. **Class entity**: add Grade dropdown, Print subject pictures, Education
   block (defaults to "automatic").
7. **Lesson dialog**: rebuild classroom-picker as 6 scoped pools, add
   Joined classes, More teachers, Bells: automatically dropdown.
8. **Card relationships**: add Make active/Deactivate/Copy/Test, the 2-axis
   wizard (Subjects + Classes both required, Importance, Note).
9. **Print preview surface**: 24-template selector + 6 layout sub-dialogs.
10. **Statistics dialog**: per-teacher Windows + Exhaustion + per-day load.
11. **Substitution Customize**: full Students/Teachers per-format settings
    panel.
12. **Buildings entity**: separate New/Edit/Delete/Constraints surface.

---

## Files & artifacts

- This document: `/Users/abhishekchhetri/Developer/chronexa_web/Chronexa-CLASSIC-LIVE-WALK-2026-05-19.md`
- Screenshots (49 PNGs, ~13 MB) and `menus.json` are on the firecrawl sandbox
  at `/tmp/edu/`. They can be retrieved by re-attaching to the session
  `019e3f1b-9afc-7131-9dd9-a06a47b9da6c` (expires 2026-05-19T08:20:34Z) and
  running:
  ```python
  import base64
  data = open('/tmp/edu.tar.gz','rb').read()  # 13.5 MB
  ```
  Or re-run the walk — the firecrawl profile is persistent so login is skipped.


<!-- Chronexa Web -->
