2026-11-22 10:31 | setup | STARTED | Claude wrote MASTER_BRIEF.md
2026-11-22 10:33 | A | STARTED | Shipping Landing v4 (neon/backlog-1 -> main, p266)
2026-11-22 10:41 | A | RELEASED 20261122-p266-landing-v4 | Merged neon/backlog-1 (533808e), deploy-pages green, live APP_VER verified
2026-11-22 10:41 | A | DONE | Wrote docs/neon/BLOCK_A.md
2026-11-22 10:41 | B | STARTED | Production QA sweep on built preview (1440px & 390px)
2026-11-22 11:28 | B | RELEASED 20261122-p267-print-qa-b2 | Fixed 8 bugs (7 print B2 + 1 palette race), 581 unit + 137 e2e (1 skip), deploy-pages green, live verified
2026-11-22 11:28 | B | DONE | Wrote docs/neon/BUGS.md and docs/neon/BLOCK_B.md (includes B2 print preview)
2026-11-22 11:43 | D | STARTED | D1 curtain flake fix + D2 BUG-P08 dense matrix auto-pagination
2026-11-22 12:07 | D | RELEASED 20261122-p268-curtain-print-pagination | D1 curtain 5/5 + D2 5 dense matrices Fits A4, 581 unit + 138 e2e (1 skip), deploy-pages green, live verified
2026-11-22 12:07 | D | DONE | Wrote docs/neon/BLOCK_D.md (ready for Claude verification before Block C)
2026-11-22 12:10 | D3 | STARTED | Respect fitToPage in pivot_engine & contract_overview auto-pagination (p269)
2026-11-22 12:35 | D3 | RELEASED 20261122-p269-fit-to-page-respect | Skip auto-split when fitToPage=true, 581 unit + 139 e2e (1 skip), deploy-pages green, live verified
2026-11-22 12:35 | D3 | DONE | Appended D3 to docs/neon/BLOCK_D.md
2026-11-22 12:35 | C | STARTED | Multi-week/term solver engine + a_48/a_57/a_73 (round5/multi-week-term.md)
2026-11-22 13:11 | C | RELEASED 20261122-p270-multi-week-term | Multi-week/term slice engine + a_48/a_57/a_73 (69/86 parity), 587 unit + 140 e2e (1 skip), live=APP_VER = "20261122-p270-multi-week-term"
2026-11-22 13:11 | C | DONE | Wrote round5/multi-week-term.md and docs/neon/BLOCK_C.md
2026-11-22 13:28 | C2 | STARTED | C2a WASM CP-SAT multi-week/term slices + C2b REA clean run
2026-11-22 14:05 | C2 | RELEASED 20261122-p271-wasm-multi-week-term | WASM CP-SAT multi-week/term slice support + 0-based availability mask fix (merge 427f227), 587 unit + 141 e2e (1 skip), live=APP_VER = "20261122-p271-wasm-multi-week-term"
2026-11-22 14:05 | C2 | DONE | Wrote docs/neon/BLOCK_C2.md; REA clean run (435 nodes / 848 edges) in round5/rea_ttonline.json and round5/multi-week-term.md
2026-11-22 14:30 | E | STARTED | Full QA pass after p266-p271 (E0-E4)
2026-11-22 15:53 | E | RELEASED 20261122-p272-qa-weeks-terms-mobile | E0 docs tracked + E-03 weeksDefs/termsDefs sync & XML round-trip + E-04 390px mobile overflow fix (merge 56a8524), 587 unit + 143 e2e (1 skip), live=APP_VER = "20261122-p272-qa-weeks-terms-mobile"
2026-11-22 15:53 | E | DONE | Wrote docs/neon/BLOCK_E.md & logged E-01..E-04 in docs/neon/BUGS.md (E-01/E-02 queued for Block F)
2026-11-22 17:55 | F | STARTED | F0 reload-after-import persistence + E-01 WASM Phase 2 robustness + E-02 non-negative soft score
2026-11-22 18:22 | F | RELEASED 20261122-p273-solver-robustness-autosave | F0 reload-after-import/create persistence + E-01 WASM Phase 2 OOM guard (LATEST.xml 1441/1441, 116.53s, 0 pageerror) + E-02 non-negative soft penalties (merge d313378), 587 unit + 146 e2e (1 skip), live=APP_VER = "20261122-p273-solver-robustness-autosave"
2026-11-22 18:22 | F | DONE | Wrote docs/neon/BLOCK_F.md & updated docs/neon/BUGS.md; awaiting Claude review
2026-11-22 18:25 | G | STARTED | Performance: Vite code-splitting & first-load JS/TTI measurement
