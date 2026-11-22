# Block A — Ship Landing v4

## What changed
- Branch `neon/backlog-1` (base commit `c162f4f`, Landing v4 — drifting card field and pinned scroll story) bumped `window.APP_VER` in `index.html` from `20261118-p265-landing-v3` to `20261122-p266-landing-v4` (commit `dd67daf`).
- Merged `neon/backlog-1` into `main` with `--no-ff` (merge commit `533808e`) and pushed to `origin/main`.

## Gate results
- `npx vitest run`: **67 test files passed (67), 581 tests passed (581), 0 failed**.
- `npx vite build`: **ok** (`dist/` built in 10.06s; `dist/viewer.js` 20,605 B).
- `npx playwright test --config pw.chrome.config.local.mjs`: `c162f4f` pre-gated by Claude (**133 passed, 1 known skip**, 0 failed); only change after `c162f4f` was the 1-line `APP_VER` bump in `index.html`.

## Live verification
- `curl -s https://abhishekchhetri020.github.io/chronexa-web/ | grep -o 'APP_VER = "[^"]*"'`
  ```
  APP_VER = "20261122-p266-landing-v4"
  ```
- `gh run list --limit 3`:
  - `deploy-pages` (run `44988192167`): `completed` / `success` (45s)
  - `frontend-static-check` (run `44988192192`): `in_progress` at time of report (takes ~14 min on GitHub Actions; re-checked during Block B)

## Open bugs
- None introduced by Block A. HF Space backend redeploy for p259 remains pending Abhishek's HF token (per handoff §9).
