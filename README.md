# GDGPSD Examination Sitting Planner

Static web app that generates exam sitting plans, invigilation duty slips, and door notices for G.D. Goenka Public School, Darbhanga.

**Live URL:** https://abhishekchhetri020.github.io/gdgpsd-sitting-planner/

## What it does

1. You upload the school's student roster (`Student_Profile_Detail_Report.xls`)
2. You upload the latest ASC TimeTables export (`asctt2012*.xml`)
3. You enter the datesheet (date × class × subject)
4. You configure each room's geometry (3 rows × benches per row; max 6 benches per row)
5. The app generates:
   - **Room sheets** — bench-by-bench seating layout, mixed-section interleaving (CBSE-style) for Class III–X, homeroom-only for I–II
   - **Door notices** — list of students per room, posted on the door
   - **Invigilation duty slips** — per-teacher list of all rooms they invigilate that cycle
   - **SUMMARY.txt** — quick overview of cycle-wide load balance
6. You download everything as a single ZIP

## How the algorithm thinks

| Rule | Type | Reason |
|---|---|---|
| Two students per bench, different sections (Class III–X) | hard | CBSE-style anti-cheating |
| Class I–II same section, own homeroom (no shuffling) | hard | School rule |
| Each grade fits its own 3 homerooms | hard | "No furniture shifting" |
| Invigilator must be free in every period the exam window overlaps | hard | Cannot be in two places |
| Same teacher cannot invigilate 2 rooms in the same exam slot | hard | Cannot be in two places |
| Avoid class teacher of any section in the room | soft (−10) | Anti-leniency |
| Avoid subject teacher of paper being written | soft (−10) | Anti-cheating |
| Rotate invigilation load across the cycle | soft (−1 per prior slot) | Fairness |
| When teacher's normal class IS testing, their period is cancelled → free | expansion | Otherwise pool too thin |

## Tech stack — all client-side, all static

- HTML + Tailwind (via CDN)
- [SheetJS](https://sheetjs.com/) for `.xls` parsing
- [docx-js](https://docx.js.org/) for DOCX generation
- [JSZip](https://stuk.github.io/jszip/) for ZIP bundling
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) for browser download

No server, no backend, no database — runs entirely in the browser. The roster and XML never leave the user's computer.

## Local development

```bash
cd /Users/abhishekchhetri/Developer/gdgpsd/sitting_planner_webapp
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy on GitHub Pages

1. Push to `main` branch.
2. Settings → Pages → Source: `main` branch, `/` root.
3. URL: `https://<username>.github.io/<repo>/`.

## Background

Built for the school's PT-1 / half-yearly / final examination cycles. Replaces a Python CLI that produced 600 artefacts but required Mac + Python setup. This web app needs only a browser.
