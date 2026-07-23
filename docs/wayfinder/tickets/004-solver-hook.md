# Ticket 004: Implement useSolver Hook for Web Worker Synchronization

- **Type:** Research / Prototype (AFK)
- **Status:** Open (Blocked by 002)
- **Assignee:** Unassigned
- **Dependencies:**
  - Blocked by: [Ticket 002: Build the Zustand State Store for Timetable Data](../tickets/002-state-store.md)

## Question
How should the `useSolver` hook coordinate solver status, progress stream events, stuck violation lists, and state-writeback locks?

## Context
Solver tasks (WASM and Node cloud) communicate asynchronously via Web Worker thread events. We need a single React entry point hook `useSolver` to coordinate worker starts/halts and map the progress parameters directly to State properties.

## Deliverables
- Design the API for the `useSolver` custom hook.
- Integrate worker message listeners to stream progress state and stuck lesson arrays directly into Zustand.

## Verification
- **Functional Testing:** Run unit/integration tests asserting worker trigger communications.
- **E2E Validation:** Execute `e2e/solver-run.spec.js` using Playwright to confirm the solver generates files and computes placements properly under the React store context.
