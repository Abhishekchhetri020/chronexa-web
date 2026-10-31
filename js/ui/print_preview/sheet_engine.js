// Print sheet engine — the aSc report options that change the PAPER, not the
// content: paper size, N-up / poster split, copies, page numbers, and hiding
// empty rows/columns.
//
// aSc exposes these per report in `ttreports`:
//   landscape · repeatpage (copies) · splitpage_w / splitpage_h /
//   splitpageorder (poster, 2-up) · hideemptyrows · hideemptycolumns ·
//   pageheaderprefixenabled
// Chronexa had page size and orientation in settings but never drove the actual
// @page rule, so "Save as PDF" ignored them; and it had no multi-up, copies,
// page numbers or empty-row hiding at all.
//
// Everything here is applied at PRINT time and undone afterwards, so the
// on-screen preview keeps its single-page layout.

export const PAPER_MM = Object.freeze({
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
  Tabloid: [279.4, 431.8],
});

/** Sheet size in mm for a paper + orientation pair. */
export function sheetSize(pageSize, orientation) {
  const base = PAPER_MM[pageSize] || PAPER_MM.A4;
  const landscape = orientation === "landscape";
  const w = landscape ? base[1] : base[0];
  const h = landscape ? base[0] : base[1];
  return { w, h };
}

/** How many mini-pages fit on one sheet, and in what order. */
export function sheetPlan(settings) {
  const s = settings || {};
  const cols = Math.max(1, Math.min(4, parseInt(s.splitW, 10) || 1));
  const rows = Math.max(1, Math.min(4, parseInt(s.splitH, 10) || 1));
  const copies = Math.max(1, Math.min(9, parseInt(s.repeatCopies, 10) || 1));
  return {
    cols, rows,
    perSheet: cols * rows,
    copies,
    byColumns: s.splitOrder !== "rows",
    multi: cols * rows > 1 || copies > 1,
  };
}

/**
 * Visual order of the cells on one sheet — aSc `splitpageorder`.
 * `byColumns` fills down a column first (reading order for a fold), the default
 * `byRows` fills across a row first. Returns, for each page slot i, the visual
 * position it should occupy.
 */
export function cellOrder(perSheet, cols, rows, byColumns) {
  const out = [];
  for (let i = 0; i < perSheet; i++) {
    if (byColumns) {
      const col = Math.floor(i / rows);
      const row = i % rows;
      out.push(row * cols + col);
    } else {
      out.push(i);
    }
  }
  return out;
}

/** Group pages into sheets; pure so the ordering is testable. */
export function groupIntoSheets(pages, plan) {
  const per = plan.perSheet;
  const sheets = [];
  for (let i = 0; i < pages.length; i += per) sheets.push(pages.slice(i, i + per));
  return sheets;
}

/** True when a table row carries no visible text (aSc "hide empty rows"). */
export function isEmptyRow(tr) {
  if (!tr) return true;
  const cells = tr.querySelectorAll ? tr.querySelectorAll("td,th") : [];
  if (!cells.length) return true;
  for (const c of cells) {
    const t = (c.textContent || "").replace(/\s+/g, "");
    if (t) return false;
  }
  return true;
}

/** Column indices where every body cell is blank (aSc "hide empty columns"). */
export function emptyColumnIndexes(table) {
  if (!table || !table.querySelectorAll) return [];
  const rows = [...table.querySelectorAll("tbody tr")]
    .filter((tr) => !tr.dataset || !tr.dataset.chrxInjected);
  if (!rows.length) return [];
  const width = Math.max(...rows.map((r) => r.children.length));
  const empty = [];
  for (let c = 0; c < width; c++) {
    let any = false;
    for (const r of rows) {
      const cell = r.children[c];
      if (cell && (cell.textContent || "").replace(/\s+/g, "")) { any = true; break; }
    }
    if (!any) empty.push(c);
  }
  return empty;
}

const STYLE_ID = "chrx-print-sheet-style";

function styleText(settings) {
  const s = settings || {};
  const { w, h } = sheetSize(s.pageSize, s.orientation);
  const margin = Math.max(0, Math.min(40, parseInt(s.marginMM, 10) || 0));
  const plan = sheetPlan(s);
  const cellW = w / plan.cols;
  const cellH = h / plan.rows;
  return `
@page chrx-sheet { size: ${w}mm ${h}mm; margin: ${margin}mm; }
@media print {
  /* Refined output: colours must survive, backgrounds stay white, and nothing
     decorative leaks into the PDF from the app shell. */
  html, body {
    background: #fff !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    -webkit-font-smoothing: antialiased;
  }
  .chrx-preview-page {
    background: #fff !important;
    box-shadow: none !important;
    border: 0 !important;
  }
  .chrx-preview-page img { max-width: 100%; }
  .chrx-preview-page a { color: inherit; text-decoration: none; }
  .chrx-preview-page p { orphans: 2; widows: 2; }
  .chrx-preview-page table { break-inside: auto; }
  .chrx-preview-page { page: chrx-sheet; }
  .chrx-print-sheet {
    display: flex; flex-wrap: wrap;
    width: ${w}mm; height: ${h}mm;
    page-break-after: always; break-after: page;
    overflow: hidden;
  }
  .chrx-print-sheet:last-child { page-break-after: auto; break-after: auto; }
  .chrx-print-sheet > .chrx-sheet-cell {
    width: ${cellW}mm; height: ${cellH}mm;
    overflow: hidden; position: relative;
  }
  .chrx-print-sheet > .chrx-sheet-cell > .chrx-preview-page {
    transform: scale(${1 / plan.cols}, ${1 / plan.rows});
    transform-origin: top left;
    page-break-after: auto; break-after: auto;
  }
  .chrx-print-pagenum {
    position: absolute; right: 4mm; bottom: 2mm;
    font-size: 8px; color: #555;
  }
}`;
}

/** Stamp "Page X of Y" (aSc pageheaderprefixenabled) onto a page node. */
function stampPageNumber(pageEl, index, total, mode) {
  if (!mode || mode === "none") return null;
  if (!pageEl || !pageEl.appendChild) return null;
  const stamp = document.createElement("div");
  stamp.className = "chrx-print-pagenum";
  stamp.dataset.chrxInjected = "1";
  stamp.textContent = mode === "of-total"
    ? `Page ${index + 1} of ${total}`
    : `Page ${index + 1}`;
  if (getComputedStyle(pageEl).position === "static") pageEl.style.position = "relative";
  pageEl.appendChild(stamp);
  return stamp;
}

/**
 * Apply the sheet settings to a set of rendered page nodes.
 * Returns a restore() that puts the DOM back exactly as it was.
 */
export function prepare(pages, settings, host) {
  const s = settings || {};
  const plan = sheetPlan(s);
  const restoreFns = [];

  // 1. the @page rule — without this "Save as PDF" ignores size/orientation
  let styleEl = document.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
    restoreFns.push(() => styleEl.remove());
  } else {
    const prev = styleEl.textContent;
    restoreFns.push(() => { styleEl.textContent = prev; });
  }
  styleEl.textContent = styleText(s);

  // 2. page numbers + empty row/column hiding
  const stamps = [];
  pages.forEach((p, i) => {
    const stamp = stampPageNumber(p, i, pages.length, s.pageNumbers);
    if (stamp) stamps.push(stamp);
    if (s.hideEmptyRows) {
      p.querySelectorAll("tbody tr").forEach((tr) => {
        if (isEmptyRow(tr)) {
          const prev = tr.style.display;
          tr.style.display = "none";
          restoreFns.push(() => { tr.style.display = prev; });
        }
      });
    }
    if (s.hideEmptyColumns) {
      p.querySelectorAll("table").forEach((tbl) => {
        const empties = emptyColumnIndexes(tbl);
        if (!empties.length) return;
        tbl.querySelectorAll("tr").forEach((tr) => {
          for (const c of empties) {
            const cell = tr.children[c];
            if (!cell) continue;
            const prev = cell.style.display;
            cell.style.display = "none";
            restoreFns.push(() => { cell.style.display = prev; });
          }
        });
      });
    }
  });
  restoreFns.push(() => stamps.forEach((n) => n.remove()));

  // 3. sheets: N-up / poster + copies
  if (plan.multi && host) {
    const parent = pages[0] && pages[0].parentNode;
    // Snapshot the host's child ORDER, not sibling pointers: the siblings get
    // moved too, so `insertBefore(page, oldSibling)` fails with NotFoundError
    // once that sibling is detached. Re-appending the snapshot restores exactly.
    const originalOrder = parent ? [...parent.childNodes] : [];
    const originals = pages.map((p) => ({ page: p, parent: p.parentNode }));
    // Detach FIRST. Building the sheets moves the pages into cells, so removing
    // "the originals" afterwards would pull them straight back out of the
    // sheets and print a stack of empty ones.
    originals.forEach((o) => o.page.remove());
    const sheets = [];
    for (const group of groupIntoSheets(pages, plan)) {
      const order = cellOrder(plan.perSheet, plan.cols, plan.rows, plan.byColumns);
      for (let copy = 0; copy < plan.copies; copy++) {
        const sheet = document.createElement("div");
        sheet.className = "chrx-print-sheet";
        sheet.dataset.chrxInjected = "1";
        // Cells are placed in VISUAL order: slot i gets the page at order[i],
        // so "fill down first" (booklet fold) really fills down.
        const cells = [];
        for (let slot = 0; slot < order.length; slot++) {
          const cell = document.createElement("div");
          cell.className = "chrx-sheet-cell";
          cells.push(cell);
        }
        group.forEach((page, i) => {
          const target = cells[order[i]];
          if (target) target.appendChild(page);
        });
        cells.forEach((c) => sheet.appendChild(c));
        sheets.push(sheet);
      }
    }
    const target = host || parent || document.body;
    sheets.forEach((sh) => target.appendChild(sh));
    restoreFns.push(() => {
      sheets.forEach((sh) => sh.remove());
      if (originalOrder.length && parent) {
        originalOrder.forEach((node) => parent.appendChild(node));
        return;
      }
      originals.forEach((o) => (o.parent || target).appendChild(o.page));
    });
  }

  return function restore() {
    while (restoreFns.length) {
      try { restoreFns.pop()(); } catch { /* never break printing */ }
    }
  };
}


/** Which companion reports to append (aSc `withclassroomtt`, generalised). */
export function companionIds(settings, ownTemplate, available) {
  const s = settings || {};
  const raw = Array.isArray(s.companionReports) ? s.companionReports : [];
  const known = new Set((available || []).map((t) => (typeof t === "string" ? t : t.id)));
  return raw.filter((id) => id && id !== ownTemplate && (!known.size || known.has(id)));
}

export default { PAPER_MM, sheetSize, sheetPlan, groupIntoSheets, isEmptyRow, emptyColumnIndexes, prepare, companionIds };
