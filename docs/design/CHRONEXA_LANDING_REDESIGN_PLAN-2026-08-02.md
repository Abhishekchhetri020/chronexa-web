---
title: Chronexa Landing Page — Audit + Redesign Plan
date: 2026-08-02
audience: review agents (codex/claude/opus)
status: PROPOSED, awaiting critique
scope: landing only — editor (step-6) is out of scope for this pass
---

# Landing Page — Audit + Redesign Plan

## 1. What we have today (indexed for later review)

The current Step-1 landing mounts inside `index.html:103-175` and is
rendered by `js/ui/start_screen.js`. It boots inside the main app shell,
sits under the shared `<header>` gradient, and contains:

- Decorative pixel wordmark "CHRONEXA" (`.chrx-pixels` — motion pixel cells
  spelling the name; visually loud, not tied to the user's actual job).
- A static hero: `<h2>Chronexa</h2> + <p>Plan timetables in your browser.</p>`
- Two big cards: New / Open file (file input also accepts drop).
- A "Recent" section (autosave + snapshots) — hidden if no history.
- A "Try a complete demo school" card with Learn more / Launch demo.
- A tiny "Watch a timetable solve itself" animated preview
  (js/ui/components/landing_demo.js — 5×5 grid, places cards, surfaces a
  fake conflict, "resolves" it, loops).
- Docs link in a tertiary nav.

**Where it under-delivers (observed):**
- The page is visually sparse and reads like "an internal tool that
  happens to have a landing slot", not a product.
- The solver preview is small, labeled only by a kicker, and disconnected
  from the CTAs. Users can't act on what it shows.
- The Recent section appears abruptly once history exists — sudden layout
  shift, no transition choreography.
- "Complete demo school" and "Launch demo" are redundant ("launch" CTA
  appears twice; wording differs).
- The wordmark pixel grid runs on every load with no reduced-motion
  escape beyond the preview loop — it's the loudest animated element on
  the page and it's ornamental.
- No typographic hierarchy beyond hero + cards. Nothing communicates the
  *loop* the product exists to close: "load a school, see conflicts,
  fix them, ship a timetable".

## 2. What good looks like (target experience)

The landing is the only step of the wizard that should feel
like a *showcase*. Its sequence, in order:

1. **Establish framing** — what this is, who it's for, in 2 seconds.
2. **Magnitude signal** — this handles real schools (5-day × 8-period
   blocks, hundreds of classes). Not toys.
3. **Show the loop** — visually demonstrate solver + editor as one
   motion: the smaller grid we already have, but read as "input →
   work → result".
4. **Primary CTA** — one unmissable path. The deck should close on:
   "Open your school's XML or start a demo."
5. **Secondary surfaces** — recent timetables, demo, docs — exist but
   subordinate.

## 3. Specific changes (atomic, reviewable)

### 3.1 Visual refresh & hero framing (review amendment)

- **Ambient depth**: add a low-noise radial mesh behind the hero (`--glow-teal-indigo`), kept under `prefers-reduced-motion`. This is atmospheric, not texture.
- **Typography stack**: Fraunces display for hero wordmark + Inter Tight for body + JetBrains Mono for solver metrics/stats/tabular figures.
- **Subhero badge pills**: `⚡ Instant engine` / `🔒 100% private` / `🏫 50+ classes lifted per week` — tiny uppercaseish mono labels with metric support text.
- **Headline sharpening**: "Plan timetables in your browser" is generic. Rewrite to feature the actual work: "Real timetables, solved in your browser." Supporting clause references the audit truth: conflict detection + repair run on dense real schools (substantiated by `real_school.json` 951/951 placements).

- Drop the pixel-wordmark from the landing (it stays as an
  ornamental easter egg inside `docs/lessons/0001-what-is-vite.html`,
  where it's the right tool for that page's topic).
- Hero becomes:
  - H1: "Chronexa" — Fraunces display. Already on the token system at
    48px `font-variation-settings:"SOFT" 30,"opsz" 144;` — KEEP.
  - Tagline moves up: *"Real timetable work, in your browser."* (body-
    family Inter Tight, ink-3, same size as current tagline, but with
    two short support clauses under it instead of silence after).
- Add a subhero strip of three micro-facts rendered as small caps:
  - `5+ days · 8+ periods/day` (scale signal)
  - `Local solver + optional CP-SAT cloud` (capability signal)
  - `No upload, no tracking` (trust signal — this phrase is already
    the footer copy; this just surfaces it).

### 3.2 Action hub + drag-drop target (review amendment)

The two cards become one visual dropzone with a clear lead action:
- **Primary CTA**: whole `chrx-start-card--open` card doubles as drag target for .xml/.har with `dragover` highlight (`border-color: var(--chrx-accent)`, light scale). The strictest acceptance gotcha is that drop already works — we add visual acknowledgment.
- **Secondary**: `chrx-start-card--new` quieter, no dropzone role.
- **Ghost inline link**: "Try the bundled demo school →" which opens the existing demo-modal flow. (Committee note: reword to avoid two demo CTAs at same visual weight.)

Two cards (New / Open) graduate from card-with-icon rows to a paired
CTA system with an explicit lead action:

- **Primary:** "Open school XML or HAR" — full-bleed card, `teal-2`
  action tint, drop-shaded border, drag-drop active state (already built
  in logic, now visually distinct).
- **Secondary:** "New blank school" — same size, paper background,
  quiet border.
- Remove the third duplicate CTA: "Try a complete demo school" card's
  Launch-demo button folds into the Open card's secondary action
  ("or start with the demo" — an inline lower-emphasis link under the
  primary CTA on hover).

### 3.3 Solver loop preview — make it a teaching diagram

Replace the floating 5×5 grid with a wider, labeled flow:

```
[Lessons: 9 cards] → [Solver: placing…] → [Conflict at P7?] → [Reassign] →
[Timetable ready]
```

Surfaced as a horizontal multi-stage progression bar, not a stack of
cells. Every stage has a status line under it that's readable at a glance
even without watching: at first frame, "Reading lessons…"; later,
"Resolving one conflict"; after the loop completes, "Ready — same shape
for your data". The currently-used `landing_demo.js` machinery stays in
place; we're redrawing the chrome around it, slowing it down (the loop
currently resets every 7.6s and reads as a spinner — slow it to 12s,
add a small pause between phases so users can actually see the conflict
state), and labelling each phase.

### 3.3 Interactive stage-machine showcase (review amendment)

The solver preview sits inside an app-window chrome — mac titlebar glyphs (red/yellow/green) on the left, solver tab name on the right, status line on the bottom. Loop stays at 12s but with stage-step freeze:

- [ Less ] → [ Solve ] → [ Conflict ] → [ Reassign ] → [ Ready ]

Each stage is a clickable tab; clicking freezes the loop on that phase for manual inspection. The pre-existing `landing_demo.js` still owns the animation loop; we wrap it in a `<div class="app-window">` shell and add the stepper logic. `prefers-reduced-motion` halts at final state.

### 3.4 Capability Matrix — new section between demo and recents (review amendment)

Three frosted cards, uniform width:
- **⚡ Constraint engine** — Teacher availability, room capacity, double-loads, class bells — solved on dense real schools in seconds. Proof: relations_micro at 35/35 in 600ms; real school at 951/951 in <500ms.
- **🔒 Local-first data** — nothing leaves the browser. Optional cloud CP-SAT is opt-in per solve; landing ships zero trackers.
- **📊 Multi-format export** — XML roundtrip keeps relations; PDF printables + Excel register + ICS calendars; FET/GpUntis emit one-click.

### 3.5 Recents section (review amendment)

- Staggered entrance via existing `chrx-rise-stagger`.
- Two metadata pills per row: format tag (XML/HAR), last-modified HH:MM, plus class-count when available.
- Search/filter input appears when list length > 3.

- Render only when there is data; today it already hides/shows — we keep
  that. Add a small stagger-in (`chrx-rise-stagger`, the existing
  motion utility) so the single delayed mount doesn't flash.
- Each row carries a small "opened HH:MM" + school name +
  source tag. Already implemented; we just tighten type contrast.

### 3.5 Motion budget

- All landing motion respects `prefers-reduced-motion` — the pixel
  wordmark stays deleted from landing, the preview loop halts at the
  final state under reduce.
- One easing curve (`--chrx-ease-out`), three speeds — already in
  motion.css; we only consume, we don't invent new springs.

## 4. What stays untouched (explicitly)

- The app shell: ribbon, header strip, step nav, error slot, footer.
- All editor work (step-6) — separate concern.
- All solver-code paths — landing is decoration, not solver behavior.
- All existing interactive logic in `start_screen.js` — we only change
  markup, hierarchy, and which elements exist; the wiring (wireOpenCard,
  wireSampleInfo, renderRecent, mountLandingDemo) is preserved.

## 5. Measurements of "better" (how review agents will score this)

Treat these as fail-before tests for the redesign branch:

| Metric | Pre-fix | Target |
|---|---|---|
| Hero reading time to "what is this?" | multi-look (pixel art + name + tagline to decode) | <2s |
| CTA paths | 3 primary-ish (New / Open / Try demo) | 2 primary + 1 ghost link |
| Recents section motion | abrupt show/hide | staggered rise |
| Solver preview readability | rotating 5×5 with no state line | labeled multi-step loop |
| Reduced-motion users | nothing disables ambient pixel drift | preview halts at end-state |

## 6. Out of scope (so reviewers don't proposal-creep)

- aSc/EduPage pixel parity. That's a different axis; plan explicitly says
  not to chase visual parity.
- Dark-mode theming of landing specifically (the app shell has it via
  `data-astryx-theme`; landing simply picks it up — no extra knob here).
- Mobile bottom navigation tuning — out of scope.

## 7. File-touch list (estimated)

- `index.html` — rewrite the contents of `#step-1` (keep IDs that JS
  already binds to).
- `css/landing-anim.css` — mostly rewritten. Pixel wordmark styles move
  to `lessons/0001-what-is-vite.html`'s local stylesheet (or stay with
  a class rename if any public API references them — check before delete).
- `css/landing-pixels.css` — same orbit; either retired or stripped to
  what the demo module needs.
- `js/ui/start_screen.js` — minor markup-only adaptation (recents section
  may gain a "Clear all" affordance but no API change).
- **Untouched**: csp_solver.js, constraints.js, wasm/*, backend/*, all
  editor/ribbon/grid files.

## 8. Risks

- Existing users may recognize the pixel wordmark — flag in commit
  message; it's being retired to lessons page as the ornament it
  always was.
- Some hooks (cta-build-new, cta-landing-demo etc.) are caught by
  existing E2E specs (`npx playwright test e2e/solver-run.spec.js`).
  We'll need to keep all IDs that JS binds to (cta-build-new,
  xml-file, start-recent-section, cta-landing-demo, etc.) — they're
  contract, not decoration.
