# Chronexa Drag-Drop UX (Agent J)

Cursor-following ghost overlay + live conflict halos for the editor grid.
Classic-parity: single-click pickup, no HTML5 `dragstart`, transform-based
ghost, validity halos painted from the seven hard constraints + soft
preferences.

## File map

| File | Owner | Purpose |
|---|---|---|
| `js/ui/editor/card_in_hand.js` | Agent J | rAF-batched ghost overlay (mouse + keyboard) |
| `js/ui/editor/placement_validator.js` | Agent J | `Placement.classify(lessonId, day, period, classroomId?)` |
| `css/drag_ux.css` | Agent J | ghost styling + green/amber/red slot halos + snap-back animation |
| `js/ui/editor/grid_canvas.js` | Agent E | dispatches `editor:pickup` / `editor:place` |
| `js/ui/editor/pending_strip.js` | Agent E | dispatches `editor:pickup` for un-placed cards |

Agent J writes only the first three. The wiring into `index.html` adds two
`<script>` includes and one `<link>` for the CSS.

## Event contract

`grid_canvas.js` (and `pending_strip.js`) already remove the picked-up card
from `APP.school.cards` before dispatching `editor:pickup`. Agent J's
`card_in_hand.js` therefore:

1. Builds a ghost `<div class="chrx-card-ghost">` from the lesson's data
   (subject + class + teacher) — *not* from a DOM clone, because the source
   tile is already gone by the time the event fires.
2. Appends it to `<body>` with `position:fixed` and a high z-index.
3. On every `mousemove`, schedules a rAF callback that:
   - Applies `transform: translate(x - dx, y - dy)` (no top/left → no layout).
   - At most once per 16ms, calls `Placement.classify(...)` for the slot under
     the cursor and writes `data-validity="green|amber|red"` on it. `drag_ux.css`
     paints the halo.
4. On `mouseup`:
   - Over a green / amber slot → mutate `APP.school.cards`, dispatch
     `editor:place`, re-render the editor + pending strip.
   - Over a red slot → small bump animation, then snap-back.
   - Over nothing → snap-back.
5. On `Escape` → snap-back; on `Tab` → cycle keyboard focus through empty
   slots; on `Enter` (when a slot has focus) → same place/reject logic.

When the ghost is alive, `<body>` carries `chrx-card-in-hand`, which is the
class `editor.css` already keys off to show the empty-slot affordance.

## Validity ladder

`Placement.classify(lessonId, day, period, classroomId?) →
 { validity: "green"|"amber"|"red", reasons: [...] }`

- **red** — any hard constraint fails:
  - Teacher already busy at that slot.
  - Class already busy at that slot.
  - Room (preferred or explicit) busy at that slot.
  - Teacher `timeOff[day_period] === "unavailable"`.
  - `requiredRoomType` mismatch.
  - `fixedDay` / `fixedPeriod` set and not matching.
  - `isLabDouble` but `period+1` is missing / non-teaching / conflicted.
- **amber** — placement is legal but breaks a preference:
  - Teacher `timeOff[day_period] === "preferred"` (preferred OFF).
  - Period flagged `isTeaching === false` (e.g. assembly / break in
    parsed bell timings).
- **green** — clean placement.

The seven hard constraints mirror `js/solver/constraints.js`. Validator does
NOT call the solver — it's a pure client check that runs in microseconds so
60fps mousemove painting is safe.

## Performance

- Ghost transform updates batched via `requestAnimationFrame`. One paint per
  frame even under high-frequency mousemove (Magic Mouse: ~120 events/s).
- Validator throttle: ≥ 16ms between calls. Single-slot delta detection
  (`slot === lastSlot`) skips re-paint when cursor hasn't crossed a cell.
- `elementFromPoint` is the chokepoint; we hide the ghost (`visibility:hidden`)
  for the duration of the call so it doesn't hit-test itself.

## Accessibility

- **Esc** cancels the pickup (snap-back to origin).
- **Tab / Shift+Tab** cycles focus through empty slots in the editor (the
  ghost stays under the cursor; focus styling is a thicker dashed outline).
- **Enter** on a focused empty slot calls the same place / reject path the
  mouseup uses, so keyboard-only users get the same constraint feedback.
- Ghost itself is `aria-hidden="true"` — it's a visual indicator, not a
  focusable element.

## Snap-back behavior

If the user releases over nothing or over a red slot:

1. The card is restored to its origin slot (`APP.school.cards.push(...)`),
   matching the original `classroomId` (lesson's `preferredRoomId`).
2. The ghost gets `.chrx-card-ghost-snap` (CSS transition) and is translated
   to the origin slot's `getBoundingClientRect()` top-left for 180ms.
3. Then the editor re-renders, which puts the card tile back where it was.

If the pickup came from the pending strip (`fromPending: true`), no origin
slot exists; the ghost fades and the pending strip re-renders, restoring the
card to the strip.

## Why these defaults

- **Single-click pickup, mouseup-to-place** is the Classic parity baseline
  (R9 §1). Native HTML5 `dragstart` is deliberately avoided because synthetic
  events don't trigger NSDragSession and headless tests would break.
- **Ghost size 60×24** matches the editor slot width (`--chrx-slot:40px` +
  visual scale 1.04). Mirrors the placed-card tile so the user sees what
  they're about to drop.
- **Validator runs against `APP.school.cards`** rather than a separate cache,
  so no extra mutation paths to keep in sync.

## Quick smoke test

```js
// In DevTools after loading any Timetable XML and activating the editor:
APP.editor.cardInHand           // null when idle
// Click a placed tile → ghost appears, follows cursor.
Placement.classify("LESSON_ID", 0, 1)
// → { validity:"green", reasons:[] } or similar.
```


<!-- Chronexa Web -->
