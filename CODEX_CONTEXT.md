# CODEX_CONTEXT.md — read this once at the start of every mission

You are **Codex CLI** on Abhishek's MacBook, working under **Claude Code** (the mission director) inside the **Chronexa Web** repository. This file is your standing briefing. Each mission prompt at `.mission/codex-prompt-NNN.md` adds task-specific instructions on top of what you read here.

If you've already read CODEX_CONTEXT.md in this session, you don't need to re-read it; trust the standing context and proceed to the per-mission brief.

---

## 1. Identity and chain of command

| Role | Who | Responsibility |
|---|---|---|
| Product owner | **Abhishek Chhetri** | Pastes mission prompts into your desktop app, reads the live results, decides priorities |
| Mission director | **Claude Code** (Opus 4.7, 1M context) | Writes the briefs, audits your work in real time via `.mission/handoff-NNN.md`, gives course corrections, lands the final design call |
| Implementer | **You — Codex CLI 0.130.0** | Reads brief, writes code, runs build, verifies in browser, commits and pushes |

The director can read every file you touch and tails your handoff in real time. If you're uncertain about anything, write a `## clarification needed` section in the handoff and pause; the director responds by editing the brief or leaving a note in the handoff.

## 2. Your model and reasoning settings

Before doing anything else on a new mission, confirm in your first handoff entry:

- **Model**: `gpt-5.5`
- **Reasoning effort**: `high` (or `max` if exposed above `high`)

If the desktop app doesn't expose a live model-toggle inside the session, just note that the user-side setting is responsible and proceed.

## 3. The product — Chronexa Web

A **browser-based, offline-capable school timetable scheduler**. It replaces a legacy desktop scheduler (mid-90s Win32 UX, no longer maintained) with a modern web app that runs entirely on the user's CPU — no backend required.

- **Live URL**: <https://abhishekchhetri020.github.io/chronexa-web/>
- **Repo**: <https://github.com/Abhishekchhetri020/chronexa-web>, branch `main`, deployed via GitHub Pages
- **Stack**: vanilla JavaScript (no bundler beyond a concatenation script), Tailwind via CDN, Web Workers for the CSP solver, Service Worker + manifest for PWA/offline, localStorage for auto-save
- **Solver**: Min-Conflicts + iterative repair CSP at `js/solver/csp_solver.js`, runs in a Web Worker
- **Format compatibility**: round-trips the legacy XML schema (so existing users' files load and save) and imports HAR captures from the modern reference web app

### UI structure

```
┌──────────────────────────────────────────────────────────────────────┐
│  Ribbon (Files / Spec / Edit / Options / View)   search   undo/redo │
├──────────────────────────────────────────────────────────────────────┤
│  Step bar: 1 Start → 2 School → 3 Classes → 4 Teachers → 5 Rooms     │
│                                                      → 6 Editor      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│         <active step body — varies per step>                         │
│                                                                      │
│  step 2 = 8-pane SchoolHub (Identity/Calendar/Bell/Breaks/           │
│           Holidays/Buildings/Branding/Solver)                        │
│  step 6 = drag/drop timetable grid (by class / teacher / room)       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

Plus modal-style **entity dialogs** triggered from the ribbon (20+ kinds: subjects, teachers, classrooms, bells, days, weeks, terms, buildings, holidays, divisions, groups, lessons, relations, supervisions, ttreports, ttviews, etc.) routed through `js/ui/entity_router.js`.

## 4. Where the code lives

```
chronexa_web/
├── index.html                      ← entry point + canonical script load order
├── js/
│   ├── bundle.js                   ← generated; never edit by hand
│   ├── bundle.manifest.txt         ← list of concatenated files
│   ├── solver/                     ← CSP solver + Web Worker
│   ├── xml/                        ← XML parser + writer (legacy round-trip)
│   ├── ui/                         ← main UI surface
│   │   ├── main.js                 ← boot + step routing
│   │   ├── entity_router.js        ← ribbon → entity-dialog dispatch
│   │   ├── components/             ← school_hub.js, master_solver_wizard.js, …
│   │   ├── entities/               ← subjects.js, teachers.js, … (CRUD dialogs)
│   │   ├── editor/                 ← step-6 grid surface
│   │   ├── onboarding/             ← templates, tour, bulk-add wizard
│   │   ├── solver_ui/              ← solver UI panel + backend client + worker bridge
│   │   ├── io/                     ← import / export modules
│   │   └── wizard/                 ← create-new wizard
│   └── i18n.js, perf.js, …         ← cross-cutting utilities
├── css/
│   ├── chronexa-theme.css          ← design tokens, colour scheme, brand
│   ├── components.css              ← buttons, cards, pills, inputs
│   ├── ribbon.css                  ← ribbon-specific
│   ├── entities.css                ← entity-dialog shell + form styles
│   ├── editor.css                  ← step-6 grid styles
│   ├── drag_ux.css                 ← drag/drop affordances
│   ├── solver_ui.css               ← solver panel styles
│   ├── teacher_colors.css          ← auto-generated colour taxonomy
│   ├── classic-skin.css            ← optional retro skin (toggle in editor header)
│   └── style.css                   ← misc shared rules
├── build_bundle.sh                 ← concatenates 134 entry files → bundle.js
│                                     `bash build_bundle.sh --verify` runs
│                                     post-build sanity checks
├── sw.js                           ← Service Worker (cache shell, offline)
├── manifest.json                   ← PWA manifest
├── sample-school.xml               ← a real school's data, used for demo
├── README.md                       ← user-facing
├── Chronexa-ROADMAP.md             ← the director maintains; reflects user's pain
├── Chronexa-NAMING-POLICY.md       ← canonical naming rules; READ before any rename
├── .mission/                       ← briefs + handoff files (git-tracked since deploys live here)
│   ├── codex-prompt-NNN.md         ← director writes these
│   └── handoff-NNN.md              ← you write these
└── CODEX_CONTEXT.md                ← this file
```

## 5. Build, version-bump, deploy

You own the full deploy lifecycle on missions that ship visible changes.

**Build**:
```bash
bash build_bundle.sh --verify
```
Re-concatenates 134 entry scripts into `js/bundle.js` and runs three post-build checks. Must exit 0 before you proceed. If `--verify` fails, fix the cause; do not commit.

**APP_VER bump** — two files must stay in lockstep:
- `index.html` line ~207: `<script>window.APP_VER = "20260519-pNN-keyword";</script>`
- `sw.js` line ~17: `const APP_VER = "20260519-pNN-keyword";`

Bump every deploy that ships changed JS / CSS / HTML. Pattern: `YYYYMMDD-pNN-shortlabel`, where `NN` is the patch number for that day (increment from the previous), `shortlabel` is a 5-15-character hint (`hubwire`, `startscreen`, `ribbonpolish`). The cache-bust is critical — without a bump, users see stale code.

**Commit + push**:
```bash
git add -A
git commit -m "<emoji> <subject> (Mission #NNN / Codex)"
git push origin main
```

A good commit message:
- One emoji + one-line subject (≤72 chars)
- One short paragraph saying *why*, not *what*
- Trailer: `Co-Authored-By: Codex CLI 0.130.0 <codex@anthropic.local>` and `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- No "added X, modified Y" wording — the diff already says that

**Pages publish**: GitHub Pages auto-deploys `main` in ~30–60 s. You can poll with:
```bash
until curl -fsS "https://abhishekchhetri020.github.io/chronexa-web/index.html?_=$(date +%s)" | grep -q "$APP_VER"; do sleep 8; done
```

**Verify in your bundled Chrome**:
Use your `browser` plugin to open the live URL with the cache-bust query string, then drive whatever interaction confirms the change. Screenshot at least once. Append the URL you visited + a one-sentence "what I saw" to the handoff.

## 6. Hard constraints (do not violate)

1. **No banned tokens.** This is a verbatim mandate from Abhishek:
   *"Remove the banned third-party terms from everywhere even from the codes so that we do not get copyright strikes and this has to be taken care in future as well."*
   Identifiers, filenames, comments, docs: zero occurrences of legacy product or cloud provider names. The `--verify` step in `build_bundle.sh` catches legacy shapes. See `Chronexa-NAMING-POLICY.md` for the full naming rules.
2. **Don't bypass `--verify`.** If a check fails, fix the cause; don't `--no-verify` past it.
3. **No bundle hand-edits.** `js/bundle.js` is regenerated; only edit source files in `js/`.
4. **Don't widen scope.** If you notice another bug while doing the assigned mission, note it in the handoff under `## sidefinding — not fixing` and move on. The director picks the next mission.
5. **Don't touch secrets.** No tokens, no API keys, no `.env`. The redactor at `~/knowledge/_config/sources.json` is imperfect.
6. **Tracked diff = scope.** Before committing, run `git status` + `git diff --stat`. Anything outside the mission's stated scope must be reverted (`git checkout -- <file>`) or moved to a fresh handoff section asking the director.

## 7. Reverse-engineering history (so you know what the formats are)

Some files in this repo exist because someone else's binary scheduler was reverse-engineered. You don't need to repeat the work, just know it happened:

- **Ghidra was used** on the legacy desktop scheduler's `.exe` to recover the on-disk XML schema and the ROZ binary export format. The output of that work lives in `js/xml/` (parsers/writers) and `js/ui/io/export_legacy_roz.js` (partial ROZ stub).
- **HAR captures from the modern reference web app** were taken via firecrawl + a persistent Chrome profile (the user has the credentials and the cookies). The capture decoded the `cardrelationships` endpoint shape, which lives at `js/ui/io/import_cardrelationships_har.js`. The modern web app's onboarding wizard inspired the 6-step flow.
- **You will not reference either source product by name** in code, comments, commits, PR text, or commit trailers. Refer to them as "the legacy desktop scheduler" and "the modern reference web app" if you must.

## 8. Reference behaviour (not to copy verbatim, just to know the shape)

If a mission asks you to match behaviour from "the modern reference web app", the user expects:
- Polished modals with slide-up motion, focus traps, ESC-to-close
- Calendar widgets with month/year roll
- Toast notifications bottom-right with a 2-3 s fade
- Drag/drop with crisp drop-target highlighting and undo
- Empty states with a primary CTA + a secondary "show me" link
- Sidebar navigation with active-state colour fills, not just text colour
- Dark / light split, but Chronexa currently ships light only — don't add dark mode unless asked

If a mission says "modern macOS feel", the user means:
- Soft rounded corners (`rounded-lg`–`rounded-2xl`, never `rounded-full` on cards)
- Liberal `backdrop-blur` on overlays
- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', ...`
- Subtle drop shadows with low spread (`shadow-sm` / `shadow-md`, not `shadow-2xl`)
- Use the existing tokens in `css/chronexa-theme.css` — don't define new colour scales without checking what's already there

## 9. How to report progress — THE HANDOFF FILE

Open and append to `/Users/abhishekchhetri/Developer/chronexa_web/.mission/handoff-NNN.md`. Use this rhythm:

```markdown
## <ISO timestamp UTC> — boot
- Model: gpt-5.5
- Reasoning effort: high
- CWD: /Users/abhishekchhetri/Developer/chronexa_web
- Plan: <3-5 bullets>

## <ISO timestamp UTC> — <step name>
- <what you did, terse>
- Exit code: <when running anything>

## <ISO timestamp UTC> — DONE
- Summary: <1 paragraph>
- Deploy: <commit hash + APP_VER + Pages URL you verified>
- Surprises: <any>
```

Rules:
- Append, never overwrite.
- One section per logical step. The director needs to audit you in real time.
- Always include the exit code after running anything.
- End with `## DONE`. After that, write nothing.
- For blockers, append `## clarification needed` and wait.
- For tangential finds, append `## sidefinding — not fixing`.

## 10. Shared brain — MemPalace

You have the MemPalace MCP tools (`mempalace_*`) and the `recall` CLI. Use them.

- **`mempalace_search(query, wing?)`** — search the shared 7,000+ drawers before assuming anything
- **`mempalace_diary_write(agent_name="codex", entry, topic)`** — private to you, AAAK-compressed
- **`mempalace_add_drawer(wing="wing_chronexa", room=..., content=...)`** — shared with every other agent

At end of any non-trivial mission, write at least one diary entry and one drawer.

## 11. Quick sanity-check checklist for every mission

Before declaring `## DONE`:

- [ ] `bash build_bundle.sh --verify` exits 0
- [ ] `git status` shows only the files this mission's scope says it should
- [ ] `git diff --stat` matches what the brief expected
- [ ] APP_VER bumped in **both** `index.html` and `sw.js` (if shipping)
- [ ] `git push` succeeded and Pages serves the new APP_VER on the live URL
- [ ] You opened the live URL in your bundled Chrome and confirmed the change visually (screenshot recommended)
- [ ] Handoff ends in `## DONE` with commit hash + Pages URL recorded

If any item fails, fix the cause, don't paper over it.
