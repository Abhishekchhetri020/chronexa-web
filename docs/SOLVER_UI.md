# Solver UI

Wires the CSP solver (`js/solver/`, Agent C) and the OR-Tools backend
(`backend/`, Agent B) into a user-facing Generate / Test / Verify flow.

## Files

| File | Bytes | Purpose |
| --- | --- | --- |
| `js/ui/solver_ui/prelaunch_dialog.js` | ~9.5 KB | Test/Generate gate + Complexity × Conditions × Algorithm matrix |
| `js/ui/solver_ui/backend_client.js`   | ~6.4 KB | Worker + cloud HTTP source adapter |
| `js/ui/solver_ui/progress_modal.js`   | ~10 KB  | Source-agnostic live progress modal |
| `js/ui/solver_ui/result_panel.js`     | ~9.4 KB | Final stats + apply / discard / view |
| `js/ui/solver_ui/verification_panel.js` | ~5.2 KB | Tabs + ruleId → kind/level normalisation |
| `js/ui/solver_ui/test_dialog.js`      | ~5.6 KB | Validate-only run + routing |
| `css/solver_ui.css`                   | ~7 KB   | All `csu-*` styles |

All under the 15 KB / 8 KB caps in the task spec.

## Surface

The header gains two CTAs (visible after an XML is parsed):

- **Generate** → `SolverUI.PreLaunch.open({defaultMode:"generate", ...})`
- **Test** → `SolverUI.Test.open({...})`

Both open the same `progress_modal` once a run starts, and route results
through the same `result_panel` + `verification_panel`.

## Source-object contract

Both the browser worker and the cloud HTTP client expose the same shape:

```js
const source = SolverUI.run({ school, options, algorithm });
// source = { subscribe(cb), cancel(), pause(), resume(), mode }
```

`subscribe()` returns an unsubscribe function. Events:

- `{type:"progress", iter, softScore, hardConflicts, durationMs}`
- `{type:"done",     result: SolveResponse}`
- `{type:"error",    message}`
- `{type:"cancelled"}` — fired exactly once after `cancel()`

This is what lets `progress_modal.js` be source-agnostic.

## Cloud vs browser

`algorithm: "cloud"` → POSTs to `${CHRONEXA_BACKEND_URL}/solve`.

- The backend (FastAPI + OR-Tools, see `docs/DEPLOY.md`) exposes only the
  synchronous `POST /solve` endpoint today — there is no `/solve/status/:id`
  yet. While awaiting the response, `backend_client.js` synthesizes
  heartbeat progress every 750 ms so the modal stays alive.
- When the backend grows a real status endpoint, swap the heartbeat for
  polling — the source interface doesn't change.
- If `CHRONEXA_BACKEND_URL` is empty, the network call refuses, or the
  fetch errors out, the client **soft-falls-back** to the browser worker
  and fires `onFallback(why)` so the orchestrator can toast the user.

## Pause / Resume / Accept-partial caveats

- `pause()` / `resume()` are **visual freezes** only. The worker keeps
  running in the background; we just stop forwarding `progress` events to
  the modal. The next event after `resume()` carries the latest snapshot.
- `Accept partial result` calls `cancel()` then checks whether a `done`
  event raced in just before. The solver's progress payload does NOT
  contain the partial assignment — Agent C's `worker.js` only emits
  `{iter, softScore, hardConflicts, durationMs}`. So Accept-partial is
  "stop and use whatever the last `done` event delivered" rather than
  "rescue the in-flight half-solution". When Agent C extends the
  progress contract to include `bestAssignment`, switch this to a real
  partial-extract.

## Field mapping (EduPage names → our progress payload)

The pre-launch dialog mirrors EduPage's `Test the timetable` / `Generate
timetable` confirm. The progress modal's labels intentionally use plain
English; for reference:

| EduPage field      | Our field             | How we compute it |
| ------------------ | --------------------- | ----------------- |
| `p1` (overall)     | "Overall" bar         | `durationMs / (timeLimitSec*1000)`, clamped 0..1 |
| `p2` (sub)         | "Current branch" bar  | `(iter % 1000) / 1000` (cosmetic; Agent C doesn't expose per-branch progress) |
| `m_nRychlost`      | Schedules / sec       | rolling `(Δiter / Δsec)` average |
| `m_nTries`         | Iterations            | `iter` |
| `p_VykaslalSa`     | Stuck counter         | "—" — `worker.js` doesn't emit `backtracks` today |
| `nNeumiestnenych`  | Unplaced              | `stats.unplaced` from `SolveResponse` |
| `nZliav`           | Relaxations           | not produced today; we show `hardConflicts` instead |
| `nBodov`           | Soft score            | `stats.softScore` |

## Verification routing

`SolverUI.Verification.show(violations, school?)` consumes the
`SolveResponse.violations[]` array (`{ruleId, description}`), heuristically
maps each `ruleId` to a `kind` (Teacher / Class / Room / Subject /
Constraint) and `level` (hard / soft), then hands the normalised list to
Agent D's `window.Verification` drawer. A tab strip is injected above the
drawer body so users can filter big lists by kind.

Clicking a violation row dispatches a `CustomEvent("editor:focusCard",
{detail:{cardId, kind}})` on `document`. The grid views (Agent E's
`class_grid.js` / `teacher_grid.js` / `room_grid.js`) can listen and
scroll the affected cell into view — wire-up on that side is not in this
agent's scope.

## Smoke check (real GDGPSD data)

1. `python3 -m http.server 8080` in the repo root.
2. Visit `http://localhost:8080/` and drop `asctt2012 (3).xml` into the
   upload zone.
3. Click **Generate**, pick `Large` + `Allow relaxation` + `Run on this
   computer`, hit Start.
4. Watch the modal: schedules/sec rises into ~50–80k on an M3, iterations
   climb to hundreds of thousands, hard-conflict count falls.
5. After ~60 s, the result panel shows placed/unplaced/hard/soft tiles
   and the per-slot heatmap. Click **View violations** to drop into the
   verification drawer with the typed list.
6. **Apply to timetable** swaps `APP.school.cards` for the new placement;
   the existing Class / Teacher / Room grids re-render the next time
   their `render()` runs. **Discard** restores the snapshot.
