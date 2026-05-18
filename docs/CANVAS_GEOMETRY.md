# Canvas geometry — chronexa-web editor

This document specifies the pixel geometry of the writable editor canvas.
The constants live in [`js/ui/editor/canvas_geometry.js`](../js/ui/editor/canvas_geometry.js)
as the exported `GEOMETRY` object and are mirrored by the EduPage skin
in [`css/edupage-skin.css`](../css/edupage-skin.css).

The chronexa-web editor uses a CSS flex-grid (not absolute positioning) for
the body, so most of the time the browser computes coordinates for us. The
constants below are still load-bearing for:

- the EduPage skin (`<html data-skin="edupage">`),
- the Floor / FD overlay injected by `CanvasGeometry.decorate`,
- future absolute-positioned card rendering (drag preview, conflict
  heat-map, multi-period span cards) that needs deterministic pixel math.

## Reference

Source-of-truth docs read for this geometry:

- `/Users/abhishekchhetri/Downloads/Cloning ASC/EDUPAGE_E2_GRID_INTERACTIONS_2026-05-03.md`
  — EduPage DOM model (absolute-positioned canvas with `vriadok` rows,
  `vline` period separators, `vkarta` cards; row height 25 px; period
  width 40–41 px; 6–12 px day gap).
- `/Users/abhishekchhetri/Downloads/Cloning ASC/EDUPAGE_E3_COLOR_TAXONOMY_2026-05-03.md`
  — Color1 (subject) / Color2 (teacher) priority + fallback grey.

## Constants

| Constant                  | px   | Notes                                                   |
|---------------------------|------|---------------------------------------------------------|
| `PERIOD_WIDTH`            | 40   | Configurable per-period (35–50).                        |
| `PERIOD_WIDTH_MIN`        | 35   | Lower bound for zoom presets.                           |
| `PERIOD_WIDTH_MAX`        | 50   | Upper bound for zoom presets.                           |
| `DAY_GAP`                 | 8    | Gap between day-blocks (EduPage uses 6–12 px).          |
| `ROW_HEIGHT`              | 26   | Default row height (EduPage = 25; +1 for AA crispness). |
| `ROW_HEIGHT_PRE_PRIMARY`  | 32   | Nursery / LKG / UKG (oral rows are taller).             |
| `HEADER_HEIGHT`           | 32   | Period-number header strip.                             |
| `PENDING_STRIP_HEIGHT`    | 80   | Sticky bottom rail.                                     |
| `ROW_LABEL_WIDTH`         | 130  | Sticky left column for entity name.                     |
| `FLOOR_LABELS`            | —    | `["1st Floor", "2nd Floor", "3rd Floor"]`.              |

## Helpers

### `x_for_day_period(d, p, periods = 8, pw = PERIOD_WIDTH)`

Absolute x-offset (px) for the cell at day `d` (0-indexed), period `p`
(1-indexed). Used by absolute-canvas renderers and by the conflict-overlay
math.

```
x = ROW_LABEL_WIDTH + d * (periods * PERIOD_WIDTH + DAY_GAP) + (p - 1) * PERIOD_WIDTH
```

Example: `x_for_day_period(2, 3)` with 8 periods/day and 40 px/period:

```
130 + 2 * (8 * 40 + 8) + (3 - 1) * 40 = 130 + 656 + 80 = 866
```

### `width_for_card(durationPeriods, pw = PERIOD_WIDTH)`

Pixel width of a card spanning N consecutive periods. Subtracts 2 px to
account for the 1-px inset on each side of `.chrx-vkarta` so cards stay
clear of the slot border.

```
width = max(1, durationPeriods) * PERIOD_WIDTH - 2
```

### `rowHeightFor(rowMeta)`

Returns `ROW_HEIGHT_PRE_PRIMARY` (32 px) when the row label starts with
`Nursery`, `LKG`, `UKG`, `Pre primary`, `KG`, `KG1`, `KG2`, or `Prep`;
otherwise `ROW_HEIGHT` (26 px).

## DOM overlay — `decorate(rootEl)`

Idempotent overlay injected by `canvas_geometry.js`. Runs after every
`Editor.render` (the function is wrapped additively on load) and on every
`editor:place` / `editor:pickup` event. Gated entirely on
`<html data-skin="edupage">` — with the skin off, the function clears any
prior overlay and returns.

| Perspective | Injection                                                         |
|-------------|-------------------------------------------------------------------|
| `class`     | `<span class="chrx-fd-tag">FD</span>` inside every empty slot.    |
| `room`      | 3 `.chrx-floor-row` rows under the header, each filled with FD.   |
| `teacher`   | No-op.                                                            |

## Skin activation

```html
<html data-skin="edupage">
```

Or, after page load:

```js
document.documentElement.setAttribute("data-skin", "edupage");
```

The stylesheet `css/edupage-skin.css` is always loaded via `index.html`;
every rule is scoped with the `html[data-skin="edupage"]` prefix, so until
the attribute is set the skin contributes zero specificity to the cascade.
A `MutationObserver` inside `canvas_geometry.js` re-runs the overlay
decorator whenever the attribute changes, so toggling is instant.

## Non-goals

- **Touching `grid_canvas.js`, `pending_strip.js`, or `editor.css`** —
  Agent E owns those files. The skin and the overlay are strictly additive.
- **Replacing the flex-grid body with an absolute-positioned canvas** —
  the constants are in place for a future migration, but the current
  renderer continues to use flex.
- **Cursor-following held-card ghost** — Phase-15 scope (see EduPage E2
  reference, section "GAP: Card-follows-cursor visual ghost").
