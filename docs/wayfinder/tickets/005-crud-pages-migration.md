# Ticket 005: Port the 18+ entity CRUD sheets to React & Astryx Modal Pods

- **Type:** Task (HITL)
- **Status:** Open (Blocked by 001)
- **Assignee:** Unassigned
- **Dependencies:**
  - Blocked by: [Ticket 001: Set up React Bundling and Astryx AppShell](../tickets/001-bundling-and-shell.md)

## Question
What is the migration strategy to port Chronexa's 18 custom HTML dialog sheets into React using Astryx form inputs and layout structures?

## Context
Each entity (Subjects, Teachers, Classes, Rooms, Bells, Breaks, etc.) has its own dialog form inside Chronexa. We will migrate these forms dynamically into React components utilizing Astryx’s semantic inputs like `<TextSelect>`, `<Form>`, `<Button>`, and `<Accordion>`.

## Deliverables
- Define a generic `<EntityDialog>` layout structure.
- Write individual React component files for the high-priority dialogs (e.g., `TeacherDialog`, `ClassConstraintsDialog`) utilizing Astryx layout elements.

## Verification
- **Form Regression Auditing:** Match every property field and matrix block in the new dialog layouts side-by-side with original dialog spec models.
- **E2E verification:** Execute the default browser E2E test suite to verify form values are submitted and stored accurately in the state representation.
