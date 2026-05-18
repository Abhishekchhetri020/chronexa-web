# Chronexa Web — Design System

This document is the contract between the visual design (CSS/JS components)
and everyone using them. If you're another agent (or a future me) wiring
the timetable grid, the wizard, or the verification flow — read this first.

Tokens live in `css/chronexa-theme.css`. Components live in
`css/components.css` and `js/ui/components/*.js`. All public names are
prefixed `chrx-` (CSS) and `Chronexa*` namespaced helpers on `window`
(JS — `Inspector`, `Palette`, `TimeOff`, `Stats`, `Verification`).

## Where to load

```html
<link rel="stylesheet" href="css/chronexa-theme.css">
<link rel="stylesheet" href="css/components.css">

<script src="js/ui/components/inspector.js"></script>
<script src="js/ui/components/palette.js"></script>
<script src="js/ui/components/time_off.js"></script>
<script src="js/ui/components/stats.js"></script>
<script src="js/ui/components/verification.js"></script>
```

The root element should carry `class="chrx-app"`. Theme can be pinned:
- `<html data-theme="light">` — force light
- `<html data-theme="dark">` — force dark
- Neither → follow the OS preference via `prefers-color-scheme`.

## Color tokens

All colors are CSS custom properties. Use them via `var(--chrx-...)`.

### Surfaces

| Token | Use |
| --- | --- |
| `--chrx-bg-window` | The viewport / app shell background |
| `--chrx-bg-canvas` | Grid background, content canvas |
| `--chrx-bg-sheet` | Modal sheets and matrices (translucent) |
| `--chrx-bg-panel` | Side inspector panel (translucent) |
| `--chrx-bg-tile` | Grid cells, KPI tiles |
| `--chrx-bg-tile-thin` | Empty grid cells / very subtle surfaces |
| `--chrx-bg-input` | Inputs, buttons (non-primary) |
| `--chrx-bg-modal` | Command palette body |
| `--chrx-bg-drawer` | Bottom verification drawer |
| `--chrx-bg-elev` | Solid elevated surface |
| `--chrx-bg-grid-line` | Optional grid divider line |

### Foreground (text)

| Token | Use | Contrast on `--chrx-bg-canvas` |
| --- | --- | --- |
| `--chrx-fg` | Body text, primary | 15:1 (AAA) |
| `--chrx-fg-secondary` | Metadata, secondary copy | 7:1 (AAA) |
| `--chrx-fg-tertiary` | Eyebrows, labels | 4.7:1 (AA body) |
| `--chrx-fg-faint` | Placeholder, hint | 3.1:1 (AA large only) |

`--chrx-fg-faint` is **only** for non-essential UI (placeholders, decorative
keys). Never use it for primary copy.

### Lines

| Token | Use |
| --- | --- |
| `--chrx-line` | Visible dividers, default borders |
| `--chrx-line-soft` | Hairlines, hover-only borders |

### Brand & semantic

| Token | Use |
| --- | --- |
| `--chrx-accent` | Brand action color (Apple blue) |
| `--chrx-accent-bg` | Subtle accent fill |
| `--chrx-accent-bg-strong` | Active row in command palette |
| `--chrx-green` / `--chrx-green-bg` / `--chrx-green-border` | Available, success, OK |
| `--chrx-red` / `--chrx-red-bg` / `--chrx-red-border` | Hard conflicts, unavailable, danger |
| `--chrx-orange` / `--chrx-orange-bg` | Soft conflicts, warning, off-target |
| `--chrx-yellow` / `--chrx-yellow-bg` | Lock state, gentle warning |
| `--chrx-purple` / `--chrx-purple-bg` | Apple Focus, secondary highlight |
| `--chrx-blue` / `--chrx-blue-bg` / `--chrx-blue-border` | Preferred time-off, neutral info |
| `--chrx-focus-purple` | Focus Filter integration (Apple Focus) |
| `--chrx-kbd-bg` / `--chrx-kbd-fg` | Keyboard chip |

### Subject hues

Used by the grid-cell tinting and by command-palette icons.

| Token | Hue | Subject |
| --- | --- | --- |
| `--chrx-hue-math` | 220 | Math |
| `--chrx-hue-eng`  | 12  | English |
| `--chrx-hue-hin`  | 32  | Hindi |
| `--chrx-hue-sci`  | 150 | Science |
| `--chrx-hue-sst`  | 50  | Social Studies |
| `--chrx-hue-mus`  | 285 | Music |
| `--chrx-hue-art`  | 330 | Art |
| `--chrx-hue-pe`   | 110 | PE |
| `--chrx-hue-it`   | 250 | IT |
| `--chrx-hue-lib`  | 200 | Library |

Apply via `data-subject="math"` on a `.chrx-grid-cell`, or by setting
`--chrx-cell-hue: var(--chrx-hue-math)` on any element that uses the same
HSL pattern (e.g. inspector flag bar).

## Typography

- `--chrx-font-sans`: system stack starting with `-apple-system` (San Francisco
  on macOS/iOS, Segoe UI on Windows, system-ui everywhere else).
- `--chrx-font-mono`: SF Mono → JetBrains Mono → ui-monospace.

Use mono for KPI numbers, timestamps, scores, anything numeric where
column alignment matters. CSS:

```css
font: var(--chrx-fw-semibold) var(--chrx-font-stat-big)/1 var(--chrx-font-mono);
font-variant-numeric: tabular-nums;
```

### Size scale

| Token | px | Use |
| --- | --- | --- |
| `--chrx-font-stat-big` | 28 | KPI numbers |
| `--chrx-font-sheet-title` | 17 | Modal/sheet title |
| `--chrx-font-section` | 13 | Section heading |
| `--chrx-font-body` | 12.5 | Body text |
| `--chrx-font-small` | 11.5 | Metadata |
| `--chrx-font-eye` | 10.5 | Uppercase eyebrows (`text-transform:uppercase`) |
| `--chrx-font-cell-s` | 10 | Grid cell subject line |
| `--chrx-font-cell-m` | 9  | Grid cell metadata |

### Weights

`--chrx-fw-regular` 400 · `--chrx-fw-medium` 500 · `--chrx-fw-semibold` 600
· `--chrx-fw-bold` 700.

## Spacing

A 4-pt grid. Use `--chrx-space-N` where N is the multiple:

```
space-1 = 4px   space-2 = 8px   space-3 = 12px   space-4 = 16px
space-5 = 20px  space-6 = 24px  space-8 = 32px   space-10 = 40px
```

Never write raw pixels for layout spacing — always use the scale. Internal
component padding can hand-tune (e.g. `padding: 6px 8px` in a grid cell)
but anything that affects layout flow uses the tokens.

## Radius

- `--chrx-radius-xs` 3px — small chips
- `--chrx-radius-sm` 4px — buttons, grid cells, badges
- `--chrx-radius-md` 6px — most form controls
- `--chrx-radius-lg` 8px — tiles, KPI cards (`tileCornerRadius` in Swift)
- `--chrx-radius-xl` 12px — sheets, drawers, modals (`sheetCornerRadius` in Swift)
- `--chrx-radius-pill` 999px — pills, progress tracks

## Shadows

Three tiers, all paired with a 0.5px-ring "hairline":

- `--chrx-shadow-sheet` — modals, side panel
- `--chrx-shadow-tile` — KPI cards, grid cells when lifted
- `--chrx-shadow-drawer` — bottom drawer (shadow goes UP)

## Motion

- `--chrx-duration-fast` 120ms — micro interactions, hover
- `--chrx-duration-base` 180ms — panel open, drawer slide
- `--chrx-duration-slow` 280ms — multi-stage transitions

All use `--chrx-ease`: `cubic-bezier(.22, .61, .36, 1)` (Apple-style ease-out).

`prefers-reduced-motion: reduce` zeroes all durations.

## Z-index

Don't invent new ones — use the scale.

```
--chrx-z-grid: 1
--chrx-z-drawer: 50
--chrx-z-sheet: 80
--chrx-z-palette: 90
--chrx-z-toast: 100
```

## Components

### `.chrx-grid-cell`

```html
<div class="chrx-grid-cell" data-subject="math" role="button" tabindex="0"
     aria-label="Math, period 1, Mrs Tiwari, room 204, Monday">
  <div class="chrx-grid-cell__subject">Maths</div>
  <div class="chrx-grid-cell__teacher">NT</div>
  <div class="chrx-grid-cell__room">R204</div>
</div>
```

Modifiers: `--selected`, `--dim`, `--empty`, `--conflict`, `--locked`.

Cells must be focusable (`tabindex="0"`) and carry an `aria-label` that
describes day + period + subject + teacher + room. VoiceOver should be
able to enumerate every cell — this is a kill-switch in CLAUDE.md.

### `.chrx-inspector-panel`

JS:
```js
Inspector.mount();
Inspector.open(card);            // card from DATA_SHAPES.md
Inspector.onAction((action, payload) => { ... });
Inspector.close();
```

Three tabs: Details, Conflicts, History. Esc closes. Focus is trapped.

### `.chrx-command-palette`

JS:
```js
Palette.mount();
Palette.register([
  { id, label, crumb, group, hue, action },
  ...
]);
Palette.onSelect((cmd) => { ... });
```

`⌘K` / `Ctrl+K` toggles. Arrow keys + Enter. Esc closes.

### `.chrx-time-off-matrix`

JS:
```js
const m = TimeOff.render(host, {
  title: "Ms. Sharma · time-off",
  days: ["Mon","Tue","Wed","Thu","Fri","Sat"],
  periods: 8,
  state: { "0_1": "preferred", "2_4": "unavailable" },
  onChange: (state, change) => { ... },
});
m.getState();          // current map
m.setState(newState);  // bulk-set
m.destroy();
```

Cell cycle on click/Space/Enter: `available → preferred → unavailable → available`.

### `.chrx-stats-panel`

JS:
```js
const s = Stats.render(host, {
  title: "Statistics",
  kpis: [
    { label: "Placed",    value: 944,  meta: "of 959",        tone: "green"  },
    { label: "Unplaced",  value: 15,   meta: "needs review",  tone: "red"    },
    { label: "Conflicts", value: 8,    meta: "hard",          tone: "orange" },
    { label: "Score",     value: 0.87, meta: "soft score",    tone: "purple" },
  ],
  sections: [
    {
      title: "Per-teacher load", meta: "Mon–Sat",
      bars: [{ name: "Mrs Tiwari", value: 28, max: 30, count: "28/30" }],
    },
  ],
});
s.update(nextData);
```

### `.chrx-verification-panel`

JS:
```js
Verification.mount();
Verification.update([
  { kind: "Teacher", level: "hard", title: "Mrs Tiwari clash Mon P3", body: "Math IV-A vs Eng IV-B" },
]);
Verification.open();
Verification.onSelect((v) => { ... });
```

Three default groups: Teachers / Classes / Rooms. Anything else falls into
"Other". Drawer is bottom-docked with a peeking handle (44px). The handle
is a button — click or Space/Enter to toggle.

## Accessibility checklist

- [x] All colors meet WCAG AA contrast on their default surface
      (fg/canvas 15:1 light, 14.8:1 dark; accent/canvas 4.51:1)
- [x] All interactive elements have a focus indicator
      (`.chrx-focus-ring` mixin or via the component's own outline)
- [x] All buttons / cells carry `aria-label`
- [x] Modal dialogs trap focus and return focus on close
- [x] `prefers-reduced-motion: reduce` zeroes durations
- [x] Live regions announce open/close state and counts
- [x] `<html data-theme>` lets users override OS pref

## Dark mode

- The site follows `prefers-color-scheme: dark` by default.
- `<html data-theme="dark">` forces dark.
- `<html data-theme="light">` pins light even if OS is dark.

To wire a toggle:

```js
const html = document.documentElement;
function toggleTheme() {
  const cur = html.getAttribute("data-theme");
  html.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
}
```

The `color-scheme` CSS property is set alongside, so native form controls
also pick up the right rendering.

## File sizes

- `chronexa-theme.css` ≈ 7.9 KB (target: under 8 KB)
- `components.css`    ≈ 23 KB (target: under 20 KB; soft over)

If you add tokens or components, prefer extending existing patterns over
creating new variables.
