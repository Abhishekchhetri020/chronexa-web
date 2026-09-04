# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Chronexa is for school timetable administrators and academic coordinators who build, inspect, repair, and publish dense timetables. Their daily work involves many classes, teachers, rooms, subjects, days, and periods, and they need to make precise changes without losing context.

## Product Purpose

Chronexa opens existing school timetable files or starts a new school, visualizes the schedule from multiple perspectives, detects conflicts, supports manual repair, and generates or exports usable timetable outputs. Success means a user can understand the state of a real timetable and make a valid change quickly and confidently.

## Positioning

Chronexa combines local-first browser operation with a constraint-aware timetable editor: users can directly manipulate scheduled lessons while the system explains whether each move is valid.

## Operating Context

Users work with Classic/ASC-style timetable data, dense weekly grids, classes, teachers, rooms, subjects, pending lessons, local solving, optional cloud solving, and printable or machine-readable exports. Existing demo schools are part of evaluation and onboarding.

## Capabilities and Constraints

- Timetable files and local solving can remain in the browser; cloud CP-SAT is optional per solve.
- The editor must support mouse, touch, and keyboard interaction.
- Manual moves must preserve scheduling constraints and expose useful conflict reasons.
- Existing import, demo, editor, solver, and export behavior must remain intact during redesign.
- Print/PDF code is being changed independently and is outside this redesign boundary.

## Brand Commitments

The product name is Chronexa. The experience should feel purpose-built for serious timetable work, not like a generic school administration template. The landing experience may use ambitious spatial and three-dimensional storytelling, but must remain legible and useful.

## Evidence on Hand

The repository contains working timetable demos, real editor states, local solver behavior, import/export flows, and existing performance benchmarks. No customer names, testimonials, market-leading claims, or externally verified performance claims are available and none should be fabricated.

## Product Principles

- Direct manipulation must feel immediate: the object should remain visually attached to the pointer.
- Complexity should be revealed by focus, not compressed into an unreadable default view.
- Constraint feedback should help the user recover, not merely reject an action.
- The product should demonstrate its mechanism rather than rely on generic marketing claims.
- Local-first trust and existing timetable compatibility must remain visible and true.

## Accessibility & Inclusion

Core editing must be operable with keyboard and touch as well as mouse, preserve visible focus, respect reduced-motion preferences, and remain understandable without relying on color alone.
