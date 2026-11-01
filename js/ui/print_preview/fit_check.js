// Print-area fit check — does the rendered page actually fit the paper?
//
// Nothing verified this before: a page is authored at a fixed mm size, and a
// tall table or an over-wide grid simply got clipped (or silently scaled by the
// browser's own "fit to page"), which is how a printout comes back wrong after
// the paper is already spent.
//
// Pure maths here (testable), measurement in the browser:
//   printableArea(settings)            → the box inside the margins, in mm
//   evaluateFit({page..., content...}) → does it fit, and by how much it spills
//   measurePage(pageEl)                → real geometry of a rendered page

export const PX_PER_MM = 96 / 25.4;

export function mmFromPx(px) {
  return px / PX_PER_MM;
}

export function printableArea(settings) {
  const s = settings || {};
  const margin = Math.max(0, Math.min(40, parseInt(s.marginMM, 10) || 0));
  // Imported lazily to keep this module dependency-free under test.
  const PAPER = { A4: [210, 297], A3: [297, 420], A5: [148, 210],
    Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8] };
  const base = PAPER[s.pageSize] || PAPER.A4;
  const landscape = s.orientation === "landscape";
  const w = (landscape ? base[1] : base[0]) - margin * 2;
  const h = (landscape ? base[0] : base[1]) - margin * 2;
  return { w: Math.max(1, w), h: Math.max(1, h), margin };
}

/**
 * @param {{pageWmm:number,pageHmm:number,contentWmm:number,contentHmm:number,
 *          areaWmm?:number,areaHmm?:number}} m
 * @returns {{ok:boolean, okX:boolean, okY:boolean, overflowXMm:number,
 *            overflowYMm:number, scale:number}}
 */
export function evaluateFit(m) {
  const pageW = m.pageWmm, pageH = m.pageHmm;
  const areaW = m.areaWmm != null ? m.areaWmm : pageW;
  const areaH = m.areaHmm != null ? m.areaHmm : pageH;
  const contentW = m.contentWmm, contentH = m.contentHmm;
  // Overflow is measured against BOTH the page and the printable box: a page
  // authored wider than the printable area already spills, however short it is.
  const overflowX = Math.max(0, contentW - areaW, pageW - areaW);
  const overflowY = Math.max(0, contentH - areaH, pageH - areaH);
  const scale = Math.min(1,
    areaW / Math.max(contentW, pageW),
    areaH / Math.max(contentH, pageH));
  return {
    okX: overflowX <= 0.5,
    okY: overflowY <= 0.5,
    ok: overflowX <= 0.5 && overflowY <= 0.5,
    overflowXMm: Math.round(overflowX * 10) / 10,
    overflowYMm: Math.round(overflowY * 10) / 10,
    scale: Math.round(scale * 1000) / 1000,
  };
}

/** Real geometry of a rendered page, in mm. */
export function measurePage(pageEl) {
  if (!pageEl || !pageEl.getBoundingClientRect) return null;
  const rect = pageEl.getBoundingClientRect();
  // scrollHeight/Width catch content that overflows a fixed-size box.
  const contentH = Math.max(pageEl.scrollHeight || 0, rect.height || 0);
  const contentW = Math.max(pageEl.scrollWidth || 0, rect.width || 0);
  return {
    pageWmm: mmFromPx(rect.width),
    pageHmm: mmFromPx(rect.height),
    contentWmm: mmFromPx(contentW),
    contentHmm: mmFromPx(contentH),
  };
}

/** Measure a page against the chosen paper and say whether it fits. */
export function checkPage(pageEl, settings) {
  const m = measurePage(pageEl);
  if (!m) return null;
  const area = printableArea(settings);
  const fit = evaluateFit({ ...m, areaWmm: area.w, areaHmm: area.h });
  return { ...fit, page: m, area };
}

export default { PX_PER_MM, mmFromPx, printableArea, evaluateFit, measurePage, checkPage };
