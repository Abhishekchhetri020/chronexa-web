# Chronexa Design v2 — "Studio"

Shipped 2026-05-22 as `css/design-v2.css` (loaded last so it wins the cascade).
APP_VER `p72-design-v2`.

## Why

The pre-v2 UI inherited too many Classic 2012 tropes — mid-blue toolbars, dense
ribbons, Material-era cards. This version restarts from a single intent:
"editorial software" rather than "school admin tool".

## Anti-references (deliberate non-influences)

- Classic TimeTables 2012 — slate-blue ribbons, dense info grids
- Classic web UI — heavy chrome, multi-row toolbars
- Office Ribbon — tabs of icon-buttons with text labels
- Bootstrap / Material defaults — slate-on-blue clichés

## Influences

- Linear — restraint, single accent, layered shadows
- Vercel — type rhythm, generous spacing on shipped surfaces
- Notion — translucent drawers + backdrop-blur
- Things 3 — calmness in dense list views
- Raycast — chip-shaped controls, pill tabs, soft hover states

## Design language

### Type
- **UI:** Inter Tight (`cv11 + ss01 + ss02` opened) — variable Inter with
  the tight-tracking optical size at smaller sizes
- **Numerics:** JetBrains Mono — tabular figures for the stat tiles
- **Display:** Inter Tight at bold-650 weight with `-0.015em` tracking
- Letter-spacing `-0.005em` throughout body so multi-word labels don't
  feel like Slack messages

### Color
- **Neutrals:** warm-grey leaning (`#f7f6f3` canvas, `#14141a` ink) —
  NOT cool-blue slate
- **Accent:** electric indigo `#5b6cff` — used SPARINGLY (primary button,
  active tab, focus ring)
- **Functional:** muted modern red/amber/green (Tailwind 600 stops with
  10% bg-tints), not the legacy bright Material palette
- **Card hue:** still HSL-rotated per subject/teacher/class/room, but the
  gradient + 3-layer shadow ladder makes cards feel like glass tiles
  instead of flat rectangles

### Surfaces
- Ribbon + Pending Strip + Tab Bar: `rgba(255,255,255,.78)` with
  `backdrop-filter: blur(24px) saturate(180%)` — soft translucent glass
- Sheets/Dialogs: solid white with the layered-shadow ladder (4-stop
  shadow instead of one hard drop)
- Editor canvas: warm off-white `#fbfaf7` for the grid background;
  cards float on top with their own elevation

### Radii ladder
4 → 6 → 10 → 14 → 18 px. Most controls land at 6 or 10; sheets at 18; pills
(tabs) at 999.

### Motion
- **Micro (60ms):** color/background swaps on hover
- **Fast (180ms):** transforms, shadow layers, drawer slides
- **Base (240ms):** sheet open/close
- **Curve:** `cubic-bezier(0.2, 0.7, 0.2, 1)` — a snappy ease-out
- `@media (prefers-reduced-motion)` zeroes all transitions

## What changed at the surface level

| Element | Before | After |
|---|---|---|
| Toolbar | Slate ribbon, 2 rows, ~64px tall | 32px translucent bar, single row |
| Card | Solid colored rect, flat shadow | Gradient HSL fill, 3-layer shadow, hover lift |
| Verification halo | 1px solid ring | 2px ring + 2px soft halo + 6px outer glow |
| Buttons | Rectangle, hard border | 10px radius, layered shadow on primary |
| Tab bar (multi-doc) | Square buttons | 999px pills with bg-tile hover |
| Sheets | Hard white drop | 18px radius, 4-stop layered shadow, blurred scrim |
| Inputs | Browser default | 6px radius, 3px accent-soft focus ring |
| Empty hero | Tile cards | Same tiles, but with new shadow ladder and accent hover |
| Scrollbars | OS default | 12px translucent track with line-colour thumb |
| Type rendering | System font | Inter Tight via rsms.me CDN |

## What's NOT changed

- DOM structure is identical — design-v2.css is a pure overlay
- All existing keyboard shortcuts, accessibility roles, ARIA attributes
- The Classic skin (`html[data-skin="classic"]`) still loads its own
  rules — design-v2 is the default but the old look survives behind the
  skin toggle

## Iteration anchors

If a future session wants to push the redesign further, the four highest-
leverage next moves:

1. **Sidebar navigation** — replace ribbon menu-drilling with a left rail
   of entity icons. Top-bar shrinks to title + Generate + user menu.
2. **Command palette (⌘K)** — fuzzy-search every entity / setting /
   menu action. Cuts the ribbon load further.
3. **Inline cell editing in entity tables** — click a cell, edit in place,
   tab to next. Replaces the "open edit sheet for every change" loop.
4. **Editor toolbar collapse on scroll** — preserves vertical real estate
   on small screens; recovers on scroll-up.

These are each a single session of focused work.

## Skins

Three skins now coexist:

| Skin | Toggle | Use case |
|---|---|---|
| **Studio (default)** | implicit | Daily admin work in 2026 |
| **Classic** | `data-skin="classic"` on `<html>` | Users coming from Classic who want familiarity |
| **Dark** | `data-theme="dark"` on `<html>` | Late-evening editing sessions |

(Dark works on top of Studio — palette is overridden in the `:root` of
design-v2.css.)
