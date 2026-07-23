# Ticket 002: Build the Zustand State Store for Timetable Data

- **Type:** Research / Prototype (AFK)
- **Status:** Open (Frontier)
- **Assignee:** Unassigned
- **Dependencies:** None

## Question
What is the design schema for the Zustand state manager to drive timetable CRUD actions, selections, constraints, and the undo/redo stack?

## Context
Chronexa needs a unified, reactive state store to replace the legacy global `window.APP` state checks. We need a clean Zustand repository structure that coordinates:
1. `school` data schema (Classes, Bells, Lesson entities).
2. Selection states (currently dragged card, active filtering row, active view configurations).
3. Session history (undo/redo command stack).

## Deliverables
- Select and configure the state repository framework (Zustand).
- Define types and interfaces representing state boundaries.
- Build a prototype store (`src/store/useTimetableStore.ts`) that manages CRUD updates for basic entities.

## Verification
- **Unit Testing:** Write unit tests (`vitest` suite) confirming CRUD modifications, history stack offsets (undo/redo hooks), and mutations resolve correctly under state actions.
- **E2E Smoke Tests:** Assert `npm run test:unit` passes with 100% success.
