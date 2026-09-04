# Chronexa landing asset manifest

## Decision

**Ship the landing as code-rendered media. No new raster, video, texture, sprite sheet, HDR environment, or 3D-model asset is required.** Composition A is the approved spatial/topological reference; Composition B contributes only the timetable plane rising from the bottom edge and filling the lower two-thirds of the first viewport.

The comp's visible materials are precise geometry and motion—cards, rails, grid lines, labels, shadows, and a reroute path—so WebGL plus a transparent 2D canvas is the faithful medium. A flattened hero image or looped video would lose responsiveness, resolution independence, reduced-motion control, and the product-specific assembly interaction.

## Implementation inventory

| Ingredient | Shipping medium | Asset requirement |
|---|---|---|
| Timetable plane, scattered/settling tiles, perspective, lighting, soft shadows, guide rails | Procedural WebGL geometry/shaders; use instancing or batched draws | None; no tile textures or model files |
| Day/time/subject labels, dashed target, warning mark, reroute path | Transparent high-DPI 2D canvas over WebGL | None; draw at runtime and keep page copy out of canvas |
| Chronexa wordmark, headline, body copy, privacy note, file input, demo and blank-school actions | Semantic HTML/CSS; small interface marks as inline authored SVG | None; do not rasterize text or controls |
| Schedule demonstration data | Small code-authored illustrative dataset using generic subjects/classes/rooms | None; treat as illustrative, not a factual customer schedule |
| WebGL fallback | Fully resolved timetable composed at runtime in 2D canvas from the same scene data | None; do not use the approved mock as a fallback image |
| Display and schedule type | Existing `Inter Tight` and `JetBrains Mono` families are sufficient | No new face required; if self-hosted later, store WOFF2 source and licence provenance |
| PWA icons | Existing `assets/icon-192.png`, `assets/icon-512.png`, and `assets/icon.svg` | Existing app assets only; not hero imagery |

The WebGL scene should be a small purpose-built renderer. Pulling in a full 3D engine for rectangles, lines, and one camera move is avoidable bundle weight unless the implementation proves it materially reduces total shipped code.

## Reference and provenance

- `.impeccable/mocks/time-lattice-a.png` is the approved north-star comp. Its prompt and approval/carry-forward record live beside it in `.prompt.txt` and `.png.json`.
- `.impeccable/mocks/time-lattice-b.png` is a horizon-only reference. It is not approved as the overall composition; its prompt and status live beside it.
- Both mock PNGs are design evidence only and must not be referenced by production HTML/CSS/JS or copied into `assets/`.
- The provenance scan reports missing embedded origin metadata for `assets/icon-192.png` and `assets/icon-512.png`. Determine their real origin—do not infer it—then embed that origin before final ship. If they were derived from `assets/icon.svg`, record the SVG's actual author/source and the conversion relationship.
- If any raster is later introduced, add a row here and embed the exact generation prompt, or the real source URL/file origin and licence, then run `embed-prompt.mjs --scan` over the shipping asset directory. Do not ship unrecorded alternates.

## Accessibility and fallback contract

- Keep the complete canvas stack `aria-hidden="true"`; all meaning, copy, actions, status, recent files, and documentation access remain semantic and keyboard reachable outside it.
- Red conflict and cyan destination must also differ by shape/pattern: warning mark, dashed destination, and directional path. Color cannot be the sole signal.
- `prefers-reduced-motion: reduce` receives the fully assembled board rendered once: no swarm, reroute animation, pointer parallax, or scroll-driven camera motion.
- On WebGL creation failure or context loss, replace the scene with the resolved 2D-canvas composition. If scripting/canvas is unavailable, omit the decorative scene cleanly while preserving the complete start flow.
- Cap device-pixel-ratio, reduce mobile tile density, and keep full-size touch targets. Pause animation when the Start step is hidden, the page is not visible, or the hero is off-screen.
- Canvas labels are decorative. Any label or state that becomes necessary to understand or operate the page must be duplicated in semantic DOM, not exposed only through pixels.

## Weight guardrail

New hero media budget: **0 bytes**. Do not add a screenshot background, MP4/WebM loop, animated GIF, particle texture, normal map, environment map, or per-tile bitmap. The two reference PNGs are roughly 1500 x 1045 working comps and are not delivery assets; shipping either would add weight while producing a blurrier, less accessible, non-responsive result.
