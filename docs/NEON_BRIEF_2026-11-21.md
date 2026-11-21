# Neon brief — Chronexa backlog, block 1 (2026-11-21)

Repo: ~/chronexa-web (main). Read first: ~/knowledge/okf/reports/CHRONEXA-HANDOFF-2026-10-31.md

Rules:
- Work on a new branch `neon/backlog-1`. Never push to main, never force-push, never deploy.
- Long jobs (npm run build, tests) run in the background via run_command; your tool calls time out at ~25 s.
- `vite preview` running blocks `vite build`; kill it first. Never trust dist — rebuild before tests.
- REA (reverse-engineering MCP, `rea` connector if present; CLI: `~/tools/rea/node_modules/.bin/rea`) may be used
  to study how aSc/EduPage BEHAVES. Never copy aSc/EduPage code or assets into Chronexa; write our own implementation.
- New npm packages: only versions >14 days old, then `~/go/bin/bumblebee scan --profile project --root .`.

Tasks, in order:
1. Review the uncommitted "Landing v4" changes (index.html, css/landing-anim.css, css/landing-redesign.css,
   js/ui/components/timetable_model.js, deleted src/fonts/instrument-serif*). Check nothing still references
   the deleted fonts (grep). Run `npm run build` and the unit + e2e tests. Take a screenshot of the landing page
   at desktop and 390 px width into docs/neon-shots/. Commit on the branch only if build and tests pass.
2. Do NOT redeploy the HF Space (needs a token only Abhishek can enter). Just confirm `backend/test_daily_caps.py` passes.
3. Write docs/NEON_REPORT_2026-11-21.md: what you changed, exact test counts (pass/fail), screenshots, and anything
   you could not do. Report failures honestly.
