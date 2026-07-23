# Ticket 003: Timetable Grid React Wrapper and Pointer Physics

- **Type:** Prototype (HITL)
- **Status:** Open (Blocked by 002)
- **Assignee:** Unassigned
- **Dependencies:**
  - Blocked by: [Ticket 002: Build the Zustand State Store for Timetable Data](../tickets/002-state-store.md)

## Question
How do we wrap Chronexa's highly custom pointer-events timetable editor grid in a React element wrapper without breaking visual collision feedback and performance?

## Context
Decided: We will keep the legacy pointer gesture physics grid (since it is highly optimized for performance) and wrap it inside a React context component `<EditorGrid>`. It will mount dynamically using refs, mapping state modifications from the Zustand store as React props.

## Deliverables
- Prototype a `<EditorGrid>` component using React `ref` handles.
- Wire grid events (pickup, hover highlights, slot collisions) to trigger updates on the Zustand state slices.

## Verification & Parity Gate
- **Side-by-Side Comparison:** Mount both the new React-wrapped grid and the legacy vanilla grid container side-by-side in development. Compare pointer latency, hover feedback (validation halos), and drag-drop positioning.
- **E2E Validation:** Verify the wrapper by running the Playwright spec `e2e/drag-card.spec.js`. Ensure dragging from the pending strip and placing on the grid passes cleanly.
