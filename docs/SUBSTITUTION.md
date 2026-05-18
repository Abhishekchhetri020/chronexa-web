# Substitution module

Plans daily teacher substitutions when one or more teachers are absent. Ported
from the Apps Script Substitution Planner at
`~/Developer/gdgpsd/substitution_webapp/` into the in-browser chronexa-web
architecture (no server, no spreadsheet).

## How to use

1. Open chronexa-web and load a timetable XML (step 1).
2. Click ribbon → **Timetable → Substitutions…** (also fires `app:substitutions`).
3. **Step 1 — Absent teachers:**
   - Pick a date (defaults to today). The day-of-week badge shows whether
     it's a school day (Sundays are blocked).
   - Type a name in the search box and click the dropdown match to add a
     chip for that teacher. Repeat for every absentee.
   - Click **Generate substitutions**.
4. **Step 2 — Class-wise output:**
   - One row per slot to cover. Columns: Class · Period · Subject ·
     Original teacher · Substitute · Score.
   - Rows are tier-shaded (green / blue / yellow / red) by candidate
     quality.
   - Click any row to open a chooser sheet listing every free candidate
     ranked by score — pick a different teacher to override the
     auto-assignment.
5. **Step 3 — Teacher-wise output:**
   - Pivot view: which teachers are doing how many extras, in which
     classes, with what cumulative score-load.
6. **Step 4 — Print memo:**
   - Renders an A4-sized memo with class-wise + teacher-wise tables and
     an editable Notes block. Click **Print memo** for the browser print
     dialog (Save as PDF or send to printer).

## Scoring algorithm

For each (absent teacher, period) where the absent teacher was scheduled,
we collect every other teacher who:
- is not absent, and
- has no card scheduled in that period on that day.

Each candidate gets a score:

| Δ      | Reason                                              |
| ------ | --------------------------------------------------- |
| +100   | Teacher's regular teaching set contains this subject |
| +30    | Teacher already teaches this class on other periods  |
| +5     | Teacher is also free in the next period (continuity) |
| −5×N   | N substitutions already assigned to them today       |

Candidates are sorted high to low; we display the top 3 in the assignment
record and use the top-1 as the auto-pick. The user can change the pick
in the class-wise tab.

The simplification dropped from the GDGPSD planner: co-teacher bonus,
class-teacher bonus, on-duty pool bonus, mother-teacher penalty,
adjacent-gap bonus, weekly fatigue penalty. We can re-introduce them
when chronexa-web tracks the relevant rosters.

## Files

```
js/ui/substitution/
  main.js                  Entry point, dialog shell, tab nav.
  absence_input.js         Date + chip autocomplete + generate button.
  candidate_ranker.js      Pure scoring algorithm.
  classwise_output.js      Class-wise table + candidate chooser sheet.
  teacherwise_output.js    Pivot by teacher.
  print_memo.js            A4 memo + window.print() hook.
css/substitution.css       Module-scoped styling and @media print rules.
```

## Data dependencies

- `APP.school` is required (XML must be loaded).
- We read `school.teachers`, `school._idx.teacherById`,
  `school._idx.cardsByTeacher`, `school._idx.days`, and the per-card
  fields produced by `parse_asc_xml.js`.
- Day index: 0 = Mon … 5 = Sat (matches parser).

## Events

- `app:substitutions` — fires from the ribbon; opens the dialog.
- `substitution:generate` — fires after the user clicks **Generate**.
  `detail = { date, absentTeachers[], assignments[] }`. Other modules
  can listen to it (e.g. to push the plan to an audit log).

## State

`APP.substitution = { date, absent[], assignments[], notes }`

Persists for the session in memory (no save-to-disk yet — the planner's
backend persistence layer was Apps Script-specific; a chronexa-web
equivalent can layer on top of `js/ui/io/snapshot`).
