# Ticket 001: Set up React Bundling and Astryx AppShell

- **Type:** Research / Task (AFK)
- **Status:** Open (Frontier)
- **Assignee:** Unassigned
- **Dependencies:** None

## Question
How should we configure our Vite React bundler and structure the primary layout shell (`AppShell` and `SideNav`) in the migrated application?

## Context
Chronexa currently has a static `index.html` structure wrapping a layout. In the new React environment, we must build a clean entry point (e.g., `main.tsx`) and mount Astryx `AppShell` layout components using the global `chronexa` theme variables.

## Deliverables
- Setup `@vitejs/plugin-react` inside `vite.config.js` to process React components.
- Establish a React mounting wrapper in `index.html`.
- Build the core Page layout using Astryx `<AppShell>`, `<SideNav>`, and `<Panel>` components.
- **Dynamic UI Toggle Mechanism:** Bind a wrapper toggle query parser (inspecting `?ui=react` query string or reading a `localStorage.chronexa_ui_engine` key). When the React engine is toggled, mount the React container; otherwise, bypass it and execute the default vanilla Chronexa shell. This establishes our fallback/strangler-fig path.

## Verification
- **Build Check:** Run `npm run build` to verify compilation finishes cleanly.
- **E2E Smoke Tests:** Execute `npm run test:e2e` to confirm that adding the bundler and mounting wrapper does not cause regressions or break the current vanilla layout.
