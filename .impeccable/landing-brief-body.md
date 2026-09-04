# Chronexa landing — approved surface brief

The approved direction is Composition A, **Diagonal Assembly**, with one deliberate carry-forward from Composition B: the timetable plane rises from the bottom edge like a horizon and fills the lower two-thirds of the first viewport.

## First viewport

- Full-bleed ink-black spatial field; app chrome is absent while the Start step is active.
- Chronexa wordmark at upper-left.
- Headline and actions anchor the lower-left: “Build a timetable that behaves.”
- The right side is occupied by a perspective timetable board assembled from many lesson tiles.
- Cards begin in controlled disorder and settle into the board; a single red conflict visibly reroutes into a cyan valid slot.
- Primary action: open a timetable file. Secondary action: launch the bundled demo. Quiet tertiary action: create a blank school.

## Visual system

- Ground: `#000102`; raised dark fields: `#121417`; cards: `#292a30` and `#35383f`.
- Signal cyan: `#9fe7e7`; conflict red: `#ec6753`; mineral white: `#f2f0e9`.
- Large tight grotesque display type; small labels may use the existing technical mono face only for schedule data.
- Depth comes from perspective, overlap, soft offset shadow, and lighting—not glass cards or decorative blur.

## Media and implementation inventory

- One code-rendered real-time lattice scene: WebGL geometry plus a transparent 2D label/path layer.
- Semantic HTML remains the source of all copy and actions.
- No decorative stock imagery, video, starfield, icon cards, gradient text, fabricated metrics, or purple accent.
- Approved mockup: `.impeccable/mocks/time-lattice-a.png`.
- Horizon reference only: `.impeccable/mocks/time-lattice-b.png`.
- Mockups are design references and do not ship as page backgrounds.

## Motion and performance

- One authored moment: scattered cards resolve into a stable six-day timetable field.
- Pointer movement changes perspective subtly; scroll advances order. Movement must remain bounded and never compete with the controls.
- Reduced-motion users receive the fully resolved static lattice.
- The scene must degrade to a composed static canvas when WebGL is unavailable.
- Landing rendering must pause when the Start step is hidden.

## Responsive behavior

- Desktop keeps the diagonal board on the right and the copy/action cluster at lower-left.
- Mobile moves the horizon behind and below the copy, reduces tile count, and preserves full-size touch targets.
- Copy, file input, demo action, recent files, documentation link, and status messages remain accessible without the canvas.
