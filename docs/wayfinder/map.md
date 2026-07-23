# Wayfinder Map: Full React Rewriting of Chronexa Web with Astryx

## Destination
A complete, production-ready React web application rewriting Chronexa's frontend structure, utilizing the Meta Astryx design system throughout the entire interface (AppShell, sidebar layouts, dialog matrices, command palettes, and custom styled timetable grids).

## Decisions so far
- **Stack Definition:** Lock Vite + React 19 + Zustand + Astryx. This stack provides the modern compiler infrastructure, lightweight reactive state management, and the required AI-fluent UI library needed for co-authoring with AI agents.
- **DND Grid Preservation:** Retain the custom vanilla pointer event calculations rather than adopting a third-party React DND library. This prevents regressions in complex collision rendering, out-of-bell hatching, and card drag timing.

## Regression & Integration Strategy
Chronexa is in active production. To prevent regressions:
1. **Side-by-Side Verification:** The new React views will run in parallel with the current vanilla application. The entry point will support a fallback URL mapping or UI toggle to render the classic engine if needed.
2. **Playwright E2E Gating:** Every ticket must run and pass the existing Playwright E2E test suite (`npm run test:e2e`). If a ticket modifies interactive regions, new E2E tests target those changes.

## Notes
- **Target Repo:** `/Users/abhishekchhetri/chronexa-web/`
- **Design Stylebook:** `Chronexa-DESIGN.md` (Editorial paper, warm off-white `#f6f1e6`, primary ink `#1a1714`, deep teal accent `#0d4f54`).
- **Reference Skills:**
  - `astryx` (CLI commands and styling tokens)
  - `obra-test-driven-development` (for React unit and regression testing)

## Frontier Tickets
- [001: Set up React Bundling and Astryx AppShell](./tickets/001-bundling-and-shell.md) (Frontier)
- [002: Build the Zustand State Store for Timetable Data](./tickets/002-state-store.md) (Frontier)
- [003: Timetable Grid React Wrapper and Pointer Physics](./tickets/003-grid-react-wrapper.md) (Blocked by 002)
- [004: Implement useSolver Hook for Web Worker Synchronization](./tickets/004-solver-hook.md) (Blocked by 002)
- [005: Port the 18+ entity CRUD sheets to React & Astryx Modal Pods](./tickets/005-crud-pages-migration.md) (Blocked by 001)

## Not yet specified (Fog of war)
- **Kempe-chain Drag-and-Drop Optimization:** Aligning dynamic visual highlight rendering inside the grid wrapper when cards are actively held.
- **PWA Service Worker caching and WASM asset copies:** Fine-tuning the offline caching rules inside `sw.template.js` once React bundler outputs split assets.
- **Dynamic skin transition mappings:** Aligning theme toggles (`Classic` vs `Studio` vs `Dark`) to resolve cleanly via scoped CSS custom properties.

## Out of scope
- rewriting calculations of the core Node/WASM solver code (retained as-is).
