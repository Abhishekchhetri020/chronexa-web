# Chronexa Lock System Audit — 2026-05-23

Triggered by goal step #4 ("Then tackle the lock-parsing bug separately"). No
specific symptom/repro was provided, so this is a survey of all lock-related
code paths and the bugs each one harbors. Patch decisions deferred until the
user picks which of these matches the symptom they observed.

## Two parallel lock mechanisms — only one is wired

| | `card.locked` (per-card) | `lesson.fixedDay/fixedPeriod` (per-lesson) |
|---|---|---|
| Set by | `ai_actions.js:53` ("AI → Lock all placed cells", event `app:ai-lock-all`) | `ai_menu.js:84-85` (Ribbon menu "AI → Lock all placed cells") |
| Read by solver | **No.** Grep `js/solver/` for `\.locked\b` returns zero hits. | Yes — `csp_solver.js:172-173, 263-269` build `lessonFixedSlot[i]`. |
| Read by editor UI | Yes — Inspector displays "Locked/Unlocked" badge (`inspector.js:147-148, 194`). CSS class on grid cells (`grid_canvas.js:262`). | No (UI badge only checks `card.locked`). |
| Persisted to XML | No (exporter doesn't serialize). | No (exporter doesn't serialize). |
| Parsed from XML | No (parser sets to `undefined`, `parse_timetable_xml.js:207-208`). | No (same). |

## Bug A — UI lock and solver lock are disconnected

`ai_actions.js` listens for `app:ai-lock-all` and sets `card.locked = true`,
showing the notification *"Locked N cards. Solver will not move them."* That
notification is false: the solver never reads `card.locked`. The user thinks
their schedule is pinned, runs Generate, and finds cards have moved.

The Ribbon-menu version (`ai_menu.js`) sets `lesson.fixedDay/fixedPeriod`
instead — that one IS read by the solver, but has its own bug (C below).

Two `lockAllPlacedCells` functions exist:
- `js/ui/components/ai_actions.js` — `card.locked` (dead path).
- `js/ui/ribbon/menus/ai_menu.js` — `lesson.fixedDay/fixedPeriod` (live path, bug C).

## Bug B — Inspector Lock button has no listener

`inspector.js:101-105` wires the footer Lock button to
`emit("toggle-lock", activeCard)`, and exposes
`Inspector.onAction(handler)` for subscribers. **No file in the repo
subscribes.** Grep confirms only the JSDoc and the definition exist. Clicking
Lock in the Inspector does nothing visible and changes no state.

## Bug C — Multi-session lessons can't be locked granularly

`csp_solver.js:142-178` expands `lesson.periodsPerWeek > 1` into `reps`
expanded sessions, each inheriting `l.fixedDay` and `l.fixedPeriod` verbatim
(line 172-173). If a lesson with `periodsPerWeek=6` gets `lesson.fixedDay=0,
fixedPeriod=7` (from `ai_menu.js`'s pick-first-card logic at lines 76-86),
all six expanded sessions are pinned to Mon-P7 — only one can ever place;
the other five become hard-unplaceable.

`ai_menu.js:76-86` selects the *first* placed card it sees for each lesson
and skips the rest (`alreadyFixed++`). So a 6-period lesson with cards at
six different slots ends up pinned to ONE of them, breaking the other five.

The schema needs per-session lock (or a per-card lock the solver actually
reads) — not a per-lesson lock that fans out via expansion.

## Bug D — XML round-trip drops lock state

`parse_timetable_xml.js:207-208` initializes `fixedDay/fixedPeriod = undefined`
and never reads them from XML attributes. `export_timetable_xml.js` does not
serialize them either (grep confirms). A user who locks placements, exports,
then re-imports loses every lock silently.

Same story for `card.locked`: not in XML at all.

## How any of these maps to "lock-parsing bug"

Without a repro the term "parsing" most naturally points at **Bug D** — the
parser doesn't extract any lock state, so locks appear to "vanish" after an
XML round-trip. But the same observable symptom ("my locks aren't being
respected") could come from Bug A (UI says locked, solver doesn't see) or
Bug C (only one session of a multi-period lesson stays put).

User clarification required before patching.

## Open finding from session #3

Cold-mode (`warmStart:false`) solve on sample-school.xml puts 33 cell-level
class-conflicts in `assignment[]` while reporting only 3 `hardConflicts` —
assignment-integrity bug in TIMEOUT state. Not a lock bug; recording here so
it doesn't get lost.
