---
name: Chronexa
description: A local-first timetable studio where spatial clarity and direct manipulation make constraints legible.
colors:
  primary-teal: "#0d4f54"
  primary-teal-hover: "#084146"
  signal-cyan: "#9fe7e7"
  conflict-rust: "#9c4322"
  conflict-coral: "#ec6753"
  paper: "#f6f1e6"
  paper-canvas: "#fbf7eb"
  paper-tile: "#efe9da"
  paper-line: "#d8cfbb"
  ink: "#1a1714"
  ink-secondary: "#4a4339"
  ink-tertiary: "#837a6d"
  lattice-black: "#000102"
  lattice-field: "#121417"
  lattice-card: "#292a30"
  lattice-card-raised: "#35383f"
  mineral-white: "#f2f0e9"
typography:
  display:
    fontFamily: '"Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: "clamp(52px, 6.7vw, 96px)"
    fontWeight: 600
    lineHeight: 0.91
    letterSpacing: "-0.04em"
  headline:
    fontFamily: '"Fraunces", "Iowan Old Style", Georgia, serif'
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: '"Fraunces", "Iowan Old Style", Georgia, serif'
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.012em"
  body:
    fontFamily: '"Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.005em"
  label:
    fontFamily: '"Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    fontSize: "10.5px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.12em"
  data:
    fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, "Courier New", monospace'
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.05em"
rounded:
  square: "0px"
  landing-tight: "2px"
  landing-control: "3px"
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "22px"
  pill: "999px"
spacing:
  0: "0px"
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "22px"
  6: "24px"
  8: "32px"
  10: "40px"
components:
  landing-action-primary:
    backgroundColor: "{colors.mineral-white}"
    textColor: "{colors.lattice-black}"
    typography: "{typography.body}"
    rounded: "{rounded.landing-control}"
    padding: "0 20px"
    height: "48px"
  landing-action-primary-hover:
    backgroundColor: "{colors.signal-cyan}"
    textColor: "{colors.lattice-black}"
    rounded: "{rounded.landing-control}"
    height: "48px"
  landing-action-secondary:
    backgroundColor: "rgba(18, 20, 23, 0.72)"
    textColor: "{colors.mineral-white}"
    typography: "{typography.body}"
    rounded: "{rounded.landing-control}"
    padding: "0 20px"
    height: "48px"
  workbench-button-primary:
    backgroundColor: "{colors.primary-teal}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  workbench-button-primary-hover:
    backgroundColor: "{colors.primary-teal-hover}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
  workbench-input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
  navigation-active:
    backgroundColor: "rgba(13, 79, 84, 0.08)"
    textColor: "{colors.primary-teal}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "7px 10px"
  lesson-card:
    backgroundColor: "hsl(var(--chrx-card-hue, 210) 76% 47%)"
    textColor: "#ffffff"
    rounded: "{rounded.square}"
    padding: "2px 3px 2px 2px"
---

# Design System: Chronexa

## Overview

**Creative North Star: "Time Lattice Studio"**

Chronexa is one instrument expressed in two deliberate modes. The landing is a cinematic ink-black field where timetable geometry rises into view, controlled disorder resolves into a six-day lattice, and one conflict visibly reroutes to a valid slot. The workbench is a serious paper studio: warm, typographic, information-dense, and built for long sessions of exact schedule repair.

The visual bridge is functional rather than cosmetic. Cyan/teal indicates valid movement, selection, and confident action; rust/coral marks conflict and recovery. Both surfaces expose the timetable as something directly manipulable, keep constraint feedback beside the object being changed, and preserve local-first trust in semantic copy rather than decorative claims.

The landing earns drama through perspective, geometry, overlap, and one authored assembly sequence. The editor earns calm through paper tones, Fraunces headings, Inter Tight interface text, compact data labels, strict grid alignment, and layered but restrained depth.

**Key Characteristics:**

- Two complementary surfaces: cinematic ink-black spatial landing and warm-paper editorial workbench.
- Timetable geometry is the signature visual material, never generic dashboard decoration.
- Cyan/teal means valid action; rust/coral means conflict, always reinforced with text, shape, or pattern.
- Direct manipulation keeps the moved lesson visually attached to the pointer and its source visible until commit.
- Motion explains assembly, placement, or state change and resolves to a static equivalent for reduced motion.

## Colors

The palette exchanges ground and figure between surfaces while preserving one signal grammar: cool cyan/teal for valid action and warm rust/coral for conflict.

### Primary

- **Workbench Teal** (`primary-teal`): the editor's active navigation, primary buttons, focus borders, and valid drop guidance.
- **Deep Workbench Teal** (`primary-teal-hover`): the pressed or hovered continuation of a teal primary action.

### Secondary

- **Signal Cyan** (`signal-cyan`): the landing's guide rails, valid destination, active demonstration states, and high-contrast interaction feedback.

### Tertiary

- **Workbench Rust** (`conflict-rust`): hard-conflict emphasis and destructive or danger-adjacent actions on paper surfaces.
- **Conflict Coral** (`conflict-coral`): the brighter landing-space conflict tile and reroute origin.

### Neutral

- **Studio Paper** (`paper`): the workbench shell, buttons, sheets, and primary warm surface.
- **Canvas Paper** (`paper-canvas`): the lighter working ground beneath dense schedule content.
- **Paper Tile** (`paper-tile`): secondary controls, header cells, and tonal grouping without excess border weight.
- **Paper Line** (`paper-line`): the warm structural divider used by the editor shell and tables.
- **Editorial Ink** (`ink`): primary workbench text and decisive structure.
- **Secondary Ink** (`ink-secondary`): explanatory copy and secondary controls.
- **Tertiary Ink** (`ink-tertiary`): metadata, quiet labels, and disabled hierarchy.
- **Lattice Black** (`lattice-black`): the full-bleed landing ground.
- **Lattice Field** (`lattice-field`): the spatial board and dark raised control field.
- **Lattice Card** (`lattice-card`): the default lesson tile in the landing scene.
- **Raised Lattice Card** (`lattice-card-raised`): selected or optically lifted spatial tiles.
- **Mineral White** (`mineral-white`): landing copy, light sections, and the primary landing action.

### Named Rules

**The Surface Exchange Rule.** Keep the landing ink-black and spatial; keep the workbench warm-paper and editorial. Their contrast is intentional, not a theme mismatch to smooth away.

**The Signal Continuity Rule.** Cyan/teal means valid action and rust/coral means conflict across both surfaces; never reverse those meanings.

**The Never-Color-Alone Rule.** Pair conflict and validity color with labels, warning marks, dashed targets, directional paths, outlines, or changed shape.

## Typography

**Display Font:** Inter Tight (with system sans-serif fallbacks) for the landing's large, tight grotesque statements.

**Body Font:** Inter Tight (with system sans-serif fallbacks) for controls, explanations, and dense workbench interface copy.

**Editorial Font:** Fraunces (with Iowan Old Style and Georgia fallbacks) for workbench headings, breadcrumb character, and lesson emphasis.

**Label/Mono Font:** JetBrains Mono (with system monospace fallbacks) for schedule data, compact status, shortcuts, and technical metadata.

**Character:** Inter Tight makes the product precise and contemporary; Fraunces makes the editor feel like serious planning material rather than generic administration software. JetBrains Mono is deliberately rare and appears only where alignment or data character matters.

### Hierarchy

- **Landing Display** (600, fluid `52px–96px`, `0.91` line-height): first-viewport statements, tightly tracked and kept to short line lengths.
- **Proof Headline** (560, fluid `42px–82px`, `0.98` line-height): large explanatory statements on mineral-white sections.
- **Workbench Headline** (600, `22px`, `1.15` line-height): editor headings and primary panel titles in Fraunces.
- **Workbench Title** (600, `18px`, `1.2` line-height): breadcrumbs, card titles, and sheet-level emphasis in Fraunces.
- **Body** (400, `13.5px`, `1.5` line-height): compact working copy; landing leads may open to `14px–17px` and `1.55–1.65` line-height.
- **Label** (600, `10.5px`, `0.12em` tracking, uppercase): headers, eyebrows, sections, and grid metadata.
- **Data** (500, `10px`, `0.05em` tracking): timetable coordinates, statuses, shortcuts, and technical labels in JetBrains Mono.

### Named Rules

**The Dual-Voice Rule.** Use Inter Tight for spatial persuasion and operational interface text; use Fraunces to give the paper workbench editorial hierarchy, not to decorate the landing.

**The Mono-Is-Data Rule.** JetBrains Mono is for schedule data, coordinates, state, and shortcuts only; never use it for long prose or primary marketing headlines.

## Layout

The landing uses a full-bleed spatial composition. On desktop, navigation sits within fluid `24px–78px` side insets, copy anchors at the lower-left in a width no greater than `610px` or `47vw`, and the diagonal timetable board occupies the right side while rising from the bottom edge as a horizon. Subsequent sections alternate mineral-white explanation, a near-black live demonstration, and a full-width cyan capability band. At `980px`, split layouts collapse; at `640px`, the lattice moves behind and below the copy, tile density reduces, and actions wrap without shrinking below touch size.

The workbench uses a fixed application frame: a `216px` sidebar, `56px` top bar, flexible main canvas, and `36px` status bar. The default Focus Board shows one human-scale timetable at a time with a `76px` period column and six day columns at a readable `138px` minimum. Dense overview grids auto-fit until the `34px` per-period floor, then scroll instead of compressing into illegibility. The lower inspector and pending region use a `260px / flexible` split, becoming one column below `767px`.

Spacing follows the implemented 4-point rhythm with one deliberate `22px` bridge between `16px` and `24px`. Use `4`, `8`, `12`, `16`, `22`, `24`, `32`, and `40px`; page-scale landing spacing is fluid and much larger because it controls cinematic pacing rather than workbench density.

Reveal complexity by focusing one schedule or relevant target set rather than shrinking the whole school into an unreadable default view. When timetable cells reach their readable floor, preserve their size and allow controlled scrolling.

## Elevation & Depth

Depth is surface-specific. The landing uses perspective, overlap, visible top and side faces, cyan rails, lighting, and soft offset shadows; it does not use glass cards or decorative blur. The workbench is flat at the grid level, then uses warm tonal layers and restrained multi-stop shadows for sheets, drawers, floating cards, and focused tools. Translucency is limited to structural chrome such as the top bar, pending drawer, scrims, and modals.

### Shadow Vocabulary

- **Workbench Low** (`0 1px 0 rgba(26, 23, 20, 0.04), 0 1px 2px rgba(26, 23, 20, 0.06)`): tiles, compact cards, and quiet bounded surfaces.
- **Workbench Medium** (`0 1px 0 rgba(26, 23, 20, 0.04), 0 2px 4px rgba(26, 23, 20, 0.06), 0 8px 16px rgba(26, 23, 20, 0.05)`): intermediate lifted controls and panels.
- **Workbench Sheet** (`0 1px 0 rgba(26, 23, 20, 0.04), 0 4px 8px rgba(26, 23, 20, 0.06), 0 12px 24px rgba(26, 23, 20, 0.08), 0 24px 48px rgba(26, 23, 20, 0.06)`): dialogs, sheets, and the strongest paper elevation.
- **Landing Action** (`0 12px 36px rgba(0, 0, 0, 0.34)`): the mineral-white file action against ink-black space.
- **Landing Instrument** (`0 28px 80px rgba(0, 0, 0, 0.48)`): the embedded timetable demonstration window.

### Named Rules

**The Geometry-First Rule.** On the landing, create depth with perspective, card thickness, overlap, rails, and light before adding any shadow.

**The Structural-Elevation Rule.** In the workbench, shadows indicate hierarchy, lift, or interaction; grid organization comes from alignment, tonal fields, and lines.

## Shapes

The landing is machined and precise: actions use nearly square `3px` corners, compact statuses and stages use `2px`, and the demonstration window uses `5px`. Circular geometry is reserved for the information control, signal dot, and compact status markers.

The workbench uses a warmer ladder of `4`, `6`, `10`, `14`, and `22px`, with `999px` pills for compact selectors and counts. Everyday controls favor `6–10px`; grids and timetable cards stay square or nearly square so adjacent lessons read as one schedule rather than a collection of floating stickers; sheets may reach `22px`.

Keep overview lesson cards edge-to-edge and square; use spacing and larger radii for surrounding tools, sheets, and Focus Board cards.

## Components

### Buttons

- **Landing Primary:** a mineral-white `48px`-high file action with tight `3px` corners and `20px` horizontal padding; hover and keyboard focus shift it to Signal Cyan, lift it `2px`, and add a visible cyan ring.
- **Landing Secondary:** a dark translucent field with the same height and corner geometry, mineral-white text, and a fine light border; its hover/focus border and ring turn cyan.
- **Workbench Primary:** a compact teal button with `10px` corners and `7px 14px` padding; hover deepens the teal, focus remains visible, and active state moves down `1px`.
- **Workbench Secondary / Ghost:** Studio Paper or transparent against a warm line, with ink text and a quiet Paper Tile hover.

### Chips

- **Style:** compact pills or tight rectangles depending on surface. Workbench counts and filters use the `999px` pill; landing status chips use `2px` corners and JetBrains Mono.
- **State:** active/valid shifts to cyan or teal; conflict shifts to coral/rust and includes explicit text such as `CLASH` or `Conflict`.

### Cards / Containers

- **Lesson Cards:** overview cards fill grid cells edge-to-edge, use subject-derived HSL fills, a darker left stripe, white type, and square corners. Focus Board cards gain a `9px` radius and inset spacing because they are read at human scale.
- **Paper Containers:** use Studio Paper, Paper Tile, or white elevation with warm lines; quiet cards use the low shadow and sheets use the full layered sheet shadow.
- **Lattice Tiles:** use dark graphite faces, visible side depth, soft offset shadow, and cyan/coral signal variants. They are geometry in a shared field, not independent rounded cards.

### Inputs / Fields

- **Style:** Studio Paper background, warm `1px` line, `6px` corners, compact Inter Tight text, and `5px 8px` padding.
- **Focus:** teal border plus a `3px` translucent teal ring; landing search fields instead use the ink surface with a cyan border and `2px` outline.
- **Error / Disabled:** use rust/coral plus a label or icon; disabled controls reduce emphasis but retain readable text.

### Navigation

- **Workbench:** a `216px` paper sidebar, Fraunces breadcrumb, and compact Inter Tight links. Active links receive a soft teal field and teal text; hover is tonal rather than elevated.
- **Landing:** only the Chronexa wordmark and a quiet `TIMETABLE STUDIO` label occupy the first viewport. Application chrome is absent while the Start step is active.
- **Mobile:** the workbench sidebar collapses below `767px`; landing navigation keeps only the brand below `640px`.

### Time Lattice

The signature landing component is a procedural six-day timetable plane with dark lesson tiles, cyan guide rails, one labeled coral conflict, a dashed cyan destination, and a directional reroute path. Cards begin in controlled disorder and settle over approximately `2700ms`; pointer movement alters perspective subtly, scroll advances order, and reduced motion renders the final board once.

### Focus Board

The signature editor component shows one class, teacher, room, or subject schedule at human scale. Its toolbar combines previous/next controls, a labeled selector, context text, and an overview escape hatch; the board uses larger cells and inset rounded cards while preserving the same direct-manipulation and constraint feedback model as the dense overview.

## Do's and Don'ts

### Do:

- **Do** make timetable geometry the visual and interactive protagonist on both surfaces.
- **Do** keep landing copy and every product action semantic and usable when canvas or WebGL is unavailable.
- **Do** keep direct-manipulation objects attached to the pointer and preserve the source until a move commits.
- **Do** pair cyan/teal validity and rust/coral conflict with labels, marks, outlines, patterns, or paths.
- **Do** preserve visible keyboard focus, `44px` touch targets on coarse pointers, and settled reduced-motion states.
- **Do** use Fraunces for the workbench's editorial hierarchy, Inter Tight for interface clarity, and JetBrains Mono only for data.

### Don't:

- **Don't** turn the landing into a generic SaaS hero, feature-card grid, or stock-image campaign.
- **Don't** add starfields, decorative blur, glass cards, gradient text, purple accents, fabricated metrics, testimonials, or performance claims.
- **Don't** flatten the approved diagonal assembly and rising timetable horizon into a background screenshot or video.
- **Don't** apply landing drama to the editor; the workbench must remain calm, dense, and precise for sustained use.
- **Don't** round dense overview timetable cards into floating stickers or compress them below their readable floor.
- **Don't** hide constraint reasons in color alone or in canvas-only content.
