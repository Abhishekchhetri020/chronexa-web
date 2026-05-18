# Entity Dialogs

The six EduPage-parity CRUD dialogs that pop up from the ribbon. All live
under `js/ui/entities/` and share a single reusable shell. They edit
`window.APP.school` in place; every save appends to `window.APP.audit`
so the global Undo/Redo mechanism can replay the action history.

## File layout

| File | Size budget | Purpose |
|------|-------------|---------|
| `js/ui/entities/dialog_shell.js` | < 12 KB (currently ~14 KB) | Reusable list dialog with right-side action sidebar, sortable+filterable table, sub-sheet host, keyboard contract, color swatch picker, time-off matrix helper. |
| `js/ui/entities/subjects.js` | < 8 KB (~6 KB) | Subjects CRUD + Lessons / Time off / Constraints sub-actions. |
| `js/ui/entities/classes.js` | < 8 KB (~9 KB) | Classes CRUD + Time off / Constraints / Divisions / Subjects-of-class. |
| `js/ui/entities/classrooms.js` | < 8 KB (~6 KB) | Classrooms CRUD + Time off / Constraints. |
| `js/ui/entities/teachers.js` | < 8 KB (~8 KB) | Teachers CRUD + Lessons / Time off / Constraints. |
| `js/ui/entities/lessons.js` | < 8 KB (~8 KB) | Lessons CRUD + Copy-to. Drives the scheduler. |
| `js/ui/entities/relations.js` | < 8 KB (~9 KB) | Card-relationships (`n_0..n_22`). Dual-pattern matcher (Pattern A / Pattern B). |
| `css/entities.css` | n/a | Styles for the shell + all sub-sheets. |

## Public API

Every entity module exposes `Entity<Name>.open()`. The ribbon (Agent H)
should call them by name:

```js
EntitySubjects.open();
EntityClasses.open();
EntityClassrooms.open();
EntityTeachers.open();
EntityLessons.open();
EntityRelations.open();
```

The shell itself is reusable; if anyone wants a generic list dialog they
can call `EntityDialog.open({entity, title, columns, rows, extras, onAction})`
directly. See top of `dialog_shell.js` for the contract.

## Keyboard contract (verified)

| Key | Action |
|-----|--------|
| `Esc` | Close sub-sheet first, then the dialog. |
| `Enter` (on a focused row) | Open Edit for that row. |
| Double-click row | Open Edit. |
| `⌘N` / `Ctrl+N` | New row. |
| `⌘Z` / `Ctrl+Z` | Undo (dispatched to entity handler). |
| `⌘⇧Z` / `Ctrl+Shift+Z` | Redo. |
| Click column header | Toggle sort by that column. |
| Type in search box | Debounced 120ms text filter across all columns. |

## Data sources

All reads come from `window.APP.school` populated by `parseAscXml`
(`js/xml/parse_asc_xml.js`). The parser currently emits:

- `teachers`: `{id, name, abbr?}` — entity modules extend in place with
  `firstName/lastName/color/timeOff/constraints/maxGapsPerDay/maxConsecutivePeriods`
  via the Edit dialog. Last-name fallback splits `name` on the last whitespace.
- `classes`: `{id, name, sections?}` plus parser's `_teacherId` / `_classroomIds`
  back-channel; entity modules write to `teacherId`, `classroomIds`, `bell`,
  `color`, `constraints`, `divisions`, `timeOff` on save.
- `classrooms`: `{id, name, capacity?, roomType?}` extended with
  `color`, `building`, `needsSupervision`, `bell`, `constraints`, `timeOff`.
- `subjects`: `{id, name, abbr?}` extended with
  `color`, `contractWeight`, `pictureUrl`, `constraints`, `timeOff`.
- `lessons`: full canonical shape per `docs/DATA_SHAPES.md`.
- `cardrelationships`: a new array added lazily by relations.js
  (`window.APP.school.cardrelationships = []`) — not in the canonical
  contract; persisted only to the in-memory state until the XML
  serializer learns the round-trip.

## Audit trail (`window.APP.audit`)

The shell stubs `APP.audit` if no one else has installed it:

```js
APP.audit.append({ entity, op, before?, after?, id? })
APP.audit.pop()  // last record
```

Records are pushed on every entity-level mutation:

| Op | Payload |
|----|---------|
| `add` | `{ after: {...new row} }` |
| `update` | `{ before: {...old}, after: {...new} }` |
| `remove` | `{ before: {...removed} }` |
| `timeoff` | `{ id, before, after }` |
| `constraints` | `{ id, before, after }` |
| `divisions` | `{ id, after }` |
| `copy` | `{ after }` (Lessons only) |

If another module installs a real audit engine before this loads, our
modules detect it via `window.APP.audit` and use that instead. The
shell-installed stub is replaced at load if the real one is present.

## Time-off matrix

The shared `EntityDialog.openTimeOffSheet(ref, entity, onSave)` helper
opens a 6-day × N-period sub-sheet (N = `school.bell.periods.length`,
defaulting to 8 if periods aren't parsed). Three states per cell, cycled
on click: `available` (green) → `preferred` (yellow) → `unavailable` (red).
Stored on `ref.timeOff` as a flat `Record<"d_p", state>` map. Matches the
`AvailabilityState` enum shape from R6 / R8.

## Relations (cardrelationships)

`n_0..n_22` typs with verbatim labels where decoded (R6 §10) and raw-typ
fallback for the rest. The dual-pattern matcher exposes:

- **Pattern A**: Subjects + Classes + Teachers + Classrooms (multi-pickers)
- **Pattern B**: Subjects + Classes (only enabled when typ is binary:
  `n_5`, `n_6`, `n_8`, `n_9`)

Importance is the 6-value EduPage scale: `low / normal / high / strict /
optimize / default`. Each row also carries a `note` and `disabled` flag.

## Verification (GD Goenka XML)

`/Users/abhishekchhetri/Downloads/asctt2012 (3).xml` is the canonical test
fixture. On load it produces:

| Entity | Rows |
|--------|------|
| Teachers | 61 |
| Classes | 33 |
| Subjects | 37 |
| Classrooms | 10 |
| Lessons | 621 |

All six dialogs render every row at full count when their `open()` is
called after the XML is parsed.

## Known deferrals

- `printsubjectpictures` / `customfields` are read but not exposed for
  editing (would push the Class dialog past budget).
- `seminargroups` / `studentsubjects` not modelled (P2 per R6 §9).
- Time-off matrix is single-week / single-term — no `[term][week][day]`
  3-deep nesting yet. Matches Chronexa Swift today, but R5 flags it.
- Relations: `filter` / `filter2` / `param1` / `param2` advanced fields
  not exposed yet — `note`, `importance`, `disabled` are enough for
  the 16 implemented typs.
- Undo is event-logged on every change but the shell doesn't auto-replay
  yet; that's the global undo-redo agent's job. We trust whoever wires
  the undo button to pop+replay our records.
