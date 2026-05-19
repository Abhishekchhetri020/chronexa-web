# Chronexa Web

Browser-based school timetable viewer, editor, and builder. Same problem as native Chronexa (Mac) — exposed via the web so any teacher / student / principal can use it from any device.

- **Live URL (frontend):** TBA on GitHub Pages
- **Backend URL (solver):** TBA on Hostinger VPS (post 20 May 2026)

## Architecture

```
                    ┌──────────────────────────────────┐
                    │   abhishekchhetri020.github.io   │
                    │       /chronexa-web/             │
                    │  (static — HTML / CSS / JS)      │
                    │  • XML upload + parse            │
                    │  • Class / Teacher / Room grid   │
                    │  • Drag / drop editor            │
                    │  • Browser CSP solver (default)  │
                    └──────────────┬───────────────────┘
                                   │  (optional, for big schools)
                                   ▼
                    ┌──────────────────────────────────┐
                    │   Hostinger VPS (16GB / 200GB)   │
                    │  Docker Compose:                 │
                    │   • Nginx (TLS + routing)        │
                    │   • FastAPI app /solve           │
                    │   • Python OR-Tools CP-SAT       │
                    └──────────────────────────────────┘
```

## Repository layout

```
chronexa-web/
├── index.html             — main shell
├── css/                   — Chronexa theme (translated from Swift ChronexaTheme)
├── js/
│   ├── ui/                — Step wizards, grid views, editor
│   ├── xml/               — Parse + serialize Timetable XML (round-trip)
│   ├── solver/            — Browser CSP solver (TypeScript port of SmartCspSolver.kt)
│   └── lib/               — vendored deps if any (mostly CDN)
├── backend/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── app/main.py        — FastAPI + OR-Tools solver
│   └── nginx/             — Nginx config + Let's Encrypt
└── docs/
    ├── DEPLOY.md          — Hostinger VPS deploy steps
    └── XML_SCHEMA.md      — Timetable XML schema notes
```

## Quickstart (local dev)

```bash
# Frontend (any static server)
python3 -m http.server 8000
# open http://localhost:8000/

# Backend (optional — defaults to in-browser solver if not running)
cd backend && docker-compose up -d
# FastAPI on http://localhost:8001/
```

## Deploy

- **Frontend:** push to `main`, GitHub Pages serves it automatically.
- **Backend:** `cd backend && docker-compose up -d` on the Hostinger VPS. SSL via Let's Encrypt embedded in nginx.

See `docs/DEPLOY.md` for the full Hostinger checklist.

## Status

- 2026-05-18 — Scaffold; 4 parallel agents building Phases 0-3.
- 2026-05-20 — VPS deploy target.
- See `Chronexa-WEB-ROADMAP-2026-05-18.md` (project root: `~/Downloads/Cloning CLASSIC/`) for the full 5-phase plan.
