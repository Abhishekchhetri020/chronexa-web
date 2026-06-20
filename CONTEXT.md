# Chronexa — Glossary (ubiquitous language)

A glossary only. No implementation details, no specs. Terms are capitalised in prose when used in their canonical sense.

## Solving

- **Card** — one session of a Lesson to be placed at a (day, period). A Lesson expands into one or more Cards (e.g. a twice-a-week lesson → 2 Cards; a lab-double → 1 Card occupying two consecutive periods).

- **Solver** — an *algorithm* that assigns Cards to time-slots subject to constraints. Chronexa has exactly **two** Solvers:
  - **JS CSP Solver** — the homegrown backtracking constraint solver plus metaheuristics (LAHC / LNS / Great Deluge). Lower timetable quality, maximum compatibility.
  - **CP-SAT** — Google OR-Tools' industrial constraint solver. Higher quality.

- **Backend** — a *deployment* of a Solver. There are **three**, exposed in the Generate dialog's "Algorithm" choice. "Three solvers" is imprecise: it is two Solvers across three Backends, because CP-SAT runs in two of them.
  - **JS-Worker Backend** — the JS CSP Solver in a Web Worker ("Run on this computer").
  - **WASM-CP-SAT Backend** — CP-SAT compiled to WebAssembly, in-browser, offline ("CP-SAT in browser").
  - **Cloud-CP-SAT Backend** — CP-SAT running natively on the Hugging Face Space ("Run on cloud").

- **Generate** — produce a timetable *from scratch* (no starting placement).
- **Improve** — start from an existing timetable (the current Cards as a warm-start) and search outward to better it. Distinct from Generate: the Solver repairs/polishes rather than searches blind. WASM-CP-SAT is the primary Improve engine (see ADR-0001).
- **Best** — a one-click mode that silently chains the two: a fast Draft (JS CSP Solver) then a Polish (WASM-CP-SAT Improve). The "two-stage pipeline" (see ADR-0002).
- **Draft** — the intermediate timetable produced by Stage 1 of Best; the warm-start for Stage 2. Not shown to the user.

- **Fallback ladder** — the relationship between Backends: a single capability ("place a timetable") served by Backends in preference order, not three rival products. Confirmed. Concretely: **Best** (JS draft → WASM-CP-SAT polish) is the offline default-quality path; **Cloud-CP-SAT** is the premium from-scratch path when the backend is available; the bare JS-Worker is the lowest-compatibility floor.
