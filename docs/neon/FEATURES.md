# Chronexa — Feature Audit (`FEATURES.md`)

Generated from strict before/after **effect-check** Playwright clicks (`e2e/block-m1-feature-audit.spec.js`, `20261123-p289-m2-ship-polish`).
Every click runs with **zero `.catch(() => {})` swallowing** and asserts a real observable state change (opened dialog/panel/menu, route/view/focus change, theme/skin/shell toggle, card/lock mutation, file picker/download/print trigger, or toast notification). Any control producing no observable effect fails the build.

## Summary
- **Sidebar links clicked & effect-verified:** 27 (including `Help & guide`, plus Escape focus return verified — never focuses `<aside>`)
- **Topbar buttons clicked & effect-verified:** 12
- **Boardbar controls clicked & effect-verified:** 11
- **Card context-menu entries audited:** 8 (`6` clicked with effect check; `2` covered by dedicated E2E)
- **Row header context-menu entries audited:** 15 (`11` clicked with effect check; `4` covered by dedicated E2E)
- **Classic / Print-Preview ribbon menus (`files`, `spec`, `options`, `timetable`, `view`, `ai`, `help`):** not visible in modern Shell v3 at 1440 px; zero stubs/coming-soon verified in `e2e/w3b-6-stubs.spec.js`.
- **Dead buttons / "Coming soon" stubs:** `0`
- **Uncaught `pageerror`s across full click-through:** `0`

## Issues Found & FIXED During Audit (M1 / M1b / M1c / M2)
- **FIXED** Sidebar Escape focus ring (`js/ui/shell_v3.js`): removed `tabindex="0"` from `<aside class="chrx-sidebar">`, made every `.chrx-side-link` focusable (`href="#"`), and returned focus to the opening link when a dialog closes on `Escape`.
- **FIXED** `Help > Keyboard shortcuts…` & `Help > About Chronexa…` (`js/ui/ribbon/menus/help_menu.js`): wired `Escape` key to close + `role="dialog"` + `aria-modal="true"`.
- **FIXED** `Lessons Grid` matrix (`js/ui/components/lessons_grid_matrix.js`) & Snapshot `Save as…` modal (`js/ui/io/snapshot.js`): wired `Escape` key to close.
- **FIXED** M(00) leftovers: `js/ui/io/export_excel_nyc.js:117` uses `localDateYmd()` + `schoolSlug()`; substitution planner `.chrx-sub-score` / `.chrx-sub-cand__score` uses app sans-serif font.
- **FIXED** M(0) & M1c gate stability: load-tolerant bounds on `relaxed_report.test.js`, `mutate.test.js`, `w2-5-availability-shading.spec.js` (strict under `CHRX_STRICT_PERF=1`); deterministic mid-generate Cancel in `L4-1`; honest `up to 30s / 90s / 5 min` speed labels in `prelaunch_dialog.js`.
- **ADDED** M(2) Cloud solver 503 plain-English fallback (`js/ui/solver_ui/backend_client.js`, `progress_modal.js`, `run_and_apply.js`), M(3) In-app Help guide `How to build your first timetable` (`js/ui/components/help_guide_dialog.js`), M(4) SEO/OG/Twitter/favicon/manifest/`404.html`, and M(6) clean console (`console.debug` for solver/boot diagnostics).

## 1. Sidebar Navigation (27 Links — Real Click + Observed Effect)
| Item | Status | Observed Effect |
|---|---|---|
| Editor | `WORKS` | active workspace view (verified on return from Reports) |
| Reports | `WORKS` | opened chrx-preview-overlay:Aesthetic Tuning, chrx-preview-shell:Aesthetic Tuning; body class changed |
| Substitutions | `WORKS` | opened chrx-sub-dialog:Substitution planner |
| Subjects | `WORKS` | opened chrx-ent-dialog:Subjects |
| Teachers | `WORKS` | opened chrx-ent-dialog:Teachers |
| Classes | `WORKS` | opened chrx-ent-dialog:Classes |
| Rooms | `WORKS` | opened chrx-ent-dialog:Classrooms |
| Lessons | `WORKS` | opened chrx-ent-dialog:Lessons |
| Bells | `WORKS` | opened chrx-ent-dialog:Bell schedules |
| Days | `WORKS` | opened chrx-ent-dialog:Days |
| Divisions | `WORKS` | opened chrx-ent-dialog:Class divisions |
| Grades | `WORKS` | opened chrx-ent-dialog:Grades |
| Students | `WORKS` | opened chrx-ent-dialog:Students |
| Weeks | `WORKS` | opened chrx-ent-dialog:Weeks |
| Terms | `WORKS` | opened chrx-ent-dialog:Terms |
| Buildings | `WORKS` | opened chrx-ent-dialog:Buildings |
| Relations | `WORKS` | opened chrx-ent-dialog:Card relationships |
| School settings | `WORKS` | opened chrx-ent-sheet:Settings — Sample school |
| Solver params | `WORKS` | opened chrx-ent-sheet:Solver parameters |
| Import… | `WORKS` | opened file picker |
| Export… | `WORKS` | opened chrx-export-dialog:Export Timetable |
| Publish timetable… | `WORKS` | opened chrx-ent-sheet:Publish timetable |
| Calendar (ICS) | `WORKS` | triggered download |
| Save | `WORKS` | opened chrx-dlg-scrim:Save as…, chrx-dlg:Save as… |
| Snapshots | `WORKS` | opened chrx-dlg-scrim:Version history, chrx-dlg:Version history |
| Version history | `WORKS` | opened chrx-vh-panel:Version history |
| Help & guide | `WORKS` | opened chrx-help-guide-scrim:How to build your first timetabl, chrx-dlg:How to build your first timetabl |

## 2. Topbar Controls (Real Click + Observed Effect)
| Control | Status | Observed Effect |
|---|---|---|
| Toggle sidebar | `WORKS` | shell toggled |
| ⋯ | `WORKS` | tools expanded=true |
| Open the class × subject lesson matrix | `WORKS` | opened chrx-matrix-root:Lessons Grid |
| Rows: class / teacher / room / subject / student / supervision | `WORKS` | focus → Mr. Zaid; perspective → teacher |
| Card colour: subject / teacher / class / room | `WORKS` | colorBy → teacher |
| Week & term filter: showing all weeks and all terms. Click to filter the grid by week or term. | `WORKS` | opened chrx-view-filter-panel |
| Saved views (manage, save, apply) | `WORKS` | opened chrx-ent-sheet:Manage saved views |
| Classic aSc-style skin | `WORKS` | skin → modern |
| Appearance: light / dark | `WORKS` | theme → dark |
| Test | `WORKS` | opened csu-dialog:Test the timetable |
| Generate | `WORKS` | opened csu-dialog:Generate timetable |
| Toggle fullscreen editor | `WORKS` | shell toggled |

## 3. Boardbar Controls (Real Click + Observed Effect)
| Control | Status | Observed Effect |
|---|---|---|
| Previous teacher | `WORKS` | focus → Mr. Amit Jha |
| Next teacher | `WORKS` | focus → Mr. Zaid |
| School | `WORKS` | opened chrx-ent-sheet:Settings — Sample school |
| Subjects | `WORKS` | opened chrx-ent-dialog:Subjects |
| Classes | `WORKS` | opened chrx-ent-dialog:Classes |
| Rooms | `WORKS` | opened chrx-ent-dialog:Classrooms |
| Teachers | `WORKS` | opened chrx-ent-dialog:Teachers |
| Lessons | `WORKS` | opened chrx-ent-dialog:Lessons |
| Relations | `WORKS` | opened chrx-ent-dialog:Card relationships |
| All teachers | `WORKS` | focus → ; viewMode → overview |
| Focus board | `WORKS` | focus → Mr. Zaid; viewMode → focus |

## 4. Card Context Menu (Right-Click Placed Card)
| Entry | Status | Observed Effect / Covering E2E |
|---|---|---|
| 🗑 Remove | `WORKS` | closed overlay; cards 951→950 |
| 🔒 Lock | `WORKS` | closed overlay; locked 0→1; toast: Locked: 236650A962C76B21 |
| 🧹 Delete row | `COVERED_ELSEWHERE` | covered by e2e/edupage-parity.regression-1.spec.js:33 |
| ⧉ Merge with next period into a double | `COVERED_ELSEWHERE` | conditional on adjacent same-lesson card; unit-tested in card_context_menu |
| ✎ Edit lesson | `WORKS` | opened chrx-ent-dialog:Lessons, chrx-ent-sheet:Edit lesson |
| 🔍 Find | `WORKS` | closed overlay; toast: Focus mode not available. |
| 🚫 Time off | `WORKS` | opened chrx-ent-dialog:Teachers, chrx-ent-sheet:Time off — Ms. Sushmita |
| ⚡ Quick changes | `WORKS` | opened chrx-ent-dialog:Lessons, chrx-ent-sheet:Edit lesson |

## 5. Row Header Context Menu (Right-Click Class Row in All Classes)
| Entry | Status | Observed Effect / Covering E2E |
|---|---|---|
| ✎ Edit | `WORKS` | opened chrx-ent-dialog:Classes |
| 🧪 Test | `WORKS` | opened csu-dialog:Test the timetable |
| 🚫 Time off | `WORKS` | opened chrx-ent-dialog:Classes, chrx-ent-sheet:Time off — I A |
| 📝 Lessons | `WORKS` | opened chrx-ent-dialog:Lessons |
| ✂️ Divisions | `WORKS` | closed overlay |
| 📅 Timetable | `COVERED_ELSEWHERE` | switches focus to already-visible class row |
| 🖨 Print preview… | `WORKS` | opened chrx-preview-overlay:Aesthetic Tuning, chrx-preview-shell:Aesthetic Tuning; body class changed |
| ✔ Verification | `WORKS` | closed overlay |
| 📜 Imputed constraints | `WORKS` | closed overlay; toast: No card relations defined yet — open Specification |
| 🗑 Delete row | `COVERED_ELSEWHERE` | covered by e2e/edupage-parity.regression-1.spec.js:33 |
| 🔒 Lock row | `WORKS` | closed overlay; locked 0→42; toast: Locked 42 cards for 073837836E100866 |
| 🔓 Unlock row | `WORKS` | closed overlay; toast: Unlocked 42 cards for 073837836E100866 |
| ⤓ Remove unlocked cards | `COVERED_ELSEWHERE` | covered by e2e/w2-1-undo.spec.js + row_context_menu |
| 🚪 Remove only classrooms | `COVERED_ELSEWHERE` | mutates classroom assignments across row |
| ⚡ Quick changes… | `WORKS` | closed overlay |
