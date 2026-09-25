// [vite-esm] imports
import "../state.js";

/**
 * PNG Exporter — renders a timetable page to an image using SVG foreignObject → canvas → toBlob.
 * No external dependencies.
 */
const APP = (typeof window !== "undefined" ? window.APP : null) || {};
const notify = (typeof window !== "undefined" && window._chrxNotify) || console.log;

const A4_LANDSCAPE_W = 1123; // 297mm @ 96dpi
const A4_LANDSCAPE_H = 794;  // 210mm @ 96dpi

const PREVIEW_CSS = `
  * { box-sizing: border-box; }
  body, div, table, th, td, p, h1, h2, h3, span {
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .chrx-preview-page {
    background: #ffffff;
    color: #1a1714;
    width: 100%;
    height: 100%;
    padding: 24px 32px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  }
  .chrx-preview-page h2 {
    font-size: 18px;
    font-weight: 700;
    color: #1e3a8a;
    margin-bottom: 4px;
  }
  .chrx-print-table, table.chrx-pivot-grid, table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    flex: 1;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 6px;
    vertical-align: middle;
    text-align: center;
  }
  th {
    background: #f1f5f9;
    font-weight: 600;
    font-size: 11px;
    color: #334155;
  }
  .chrx-print-th-day {
    background: #f8fafc;
    width: 80px;
    font-weight: 600;
  }
  .pp-cell-subj { font-weight: 700; font-size: 12px; }
  .pp-cell-meta { font-size: 10px; color: #64748b; margin-top: 2px; }
  .pp-cell-empty { color: #94a3b8; font-size: 12px; }
`;

export function renderSvgForPage(pageElement, options = {}) {
  const width = options.width || A4_LANDSCAPE_W;
  const height = options.height || A4_LANDSCAPE_H;

  // Clone element to sanitize or fix attributes for XML
  const clone = pageElement.cloneNode(true);
  if (!clone.style.width) clone.style.width = width + "px";
  if (!clone.style.height) clone.style.height = height + "px";
  clone.style.background = "#ffffff";

  const serializer = typeof XMLSerializer !== "undefined" ? new XMLSerializer() : null;
  let htmlContent = "";
  if (serializer) {
    htmlContent = serializer.serializeToString(clone);
  } else {
    htmlContent = clone.outerHTML || "";
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <style>
    ${PREVIEW_CSS}
  </style>
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px; height:${height}px; background:#ffffff;">
      ${htmlContent}
    </div>
  </foreignObject>
</svg>`.trim();
}

export async function renderPageToCanvas(pageElement, options = {}) {
  const width = options.width || A4_LANDSCAPE_W;
  const height = options.height || A4_LANDSCAPE_H;
  const scale = options.scale || 1.5;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let rendered = false;
  try {
    const svg = renderSvgForPage(pageElement, { width, height });
    const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    const img = new Image();

    await new Promise((resolve, reject) => {
      const tm = setTimeout(() => reject(new Error("SVG image load timeout")), 2000);
      img.onload = () => { clearTimeout(tm); resolve(); };
      img.onerror = (e) => { clearTimeout(tm); reject(new Error("SVG image load failed: " + e)); };
      img.src = dataUrl;
    });

    ctx.save();
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    rendered = true;
  } catch (err) {
    // In headless browsers, SVG foreignObject in <img> is often restricted by security policy.
    // Fall back to Canvas 2D rendering to guarantee high-res valid PNG output.
  }

  if (!rendered) {
    drawFallbackTimetableToCanvas(ctx, pageElement, canvas.width, canvas.height);
  }

  return canvas;
}

function drawFallbackTimetableToCanvas(ctx, pageElement, totalW, totalH) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalW, totalH);

  const pad = 40;
  const title = pageElement.querySelector("h2, .chrx-print-title, .pp-header")?.textContent || "Timetable";
  const sub = pageElement.querySelector(".chrx-print-sub, p")?.textContent || "Chronexa Schedule";

  ctx.fillStyle = "#1e3a8a";
  ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(title, pad, pad + 24);

  ctx.fillStyle = "#64748b";
  ctx.font = "16px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(sub, pad, pad + 52);

  const table = pageElement.querySelector("table");
  if (table) {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length > 0) {
      const topY = pad + 70;
      const availW = totalW - (pad * 2);
      const availH = totalH - topY - pad - 20;
      const rowH = Math.min(availH / rows.length, 120);

      rows.forEach((tr, rIdx) => {
        const cells = Array.from(tr.children);
        const y = topY + (rIdx * rowH);
        const dayCellW = 140;
        const periodCellW = (availW - dayCellW) / Math.max(1, cells.length - 1);

        cells.forEach((cell, cIdx) => {
          const isHeader = cell.tagName.toLowerCase() === "th" || rIdx === 0;
          const x = cIdx === 0 ? pad : pad + dayCellW + ((cIdx - 1) * periodCellW);
          const w = cIdx === 0 ? dayCellW : periodCellW;

          ctx.fillStyle = isHeader ? "#f1f5f9" : (cIdx % 2 === 0 ? "#ffffff" : "#f8fafc");
          ctx.fillRect(x, y, w, rowH);
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, w, rowH);

          const text = cell.innerText || cell.textContent || "";
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          if (isHeader) {
            ctx.fillStyle = "#1e293b";
            ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.fillText(lines[0] || "", x + (w / 2), y + (rowH / 2));
          } else {
            ctx.fillStyle = "#0f172a";
            ctx.font = "600 14px -apple-system, BlinkMacSystemFont, sans-serif";
            if (lines.length === 1) {
              ctx.fillText(lines[0], x + (w / 2), y + (rowH / 2));
            } else if (lines.length >= 2) {
              ctx.fillText(lines[0], x + (w / 2), y + (rowH / 2) - 8);
              ctx.fillStyle = "#64748b";
              ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
              ctx.fillText(lines.slice(1).join(" · "), x + (w / 2), y + (rowH / 2) + 10);
            }
          }
        });
      });
    }
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Chronexa Timetable · " + new Date().toLocaleDateString(), totalW - pad, totalH - 16);

  ctx.restore();
}

export async function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      }, "image/png");
    } else {
      // Fallback for environments lacking canvas.toBlob
      try {
        const dataUrl = canvas.toDataURL("image/png");
        const bin = atob(dataUrl.split(",")[1]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type: "image/png" }));
      } catch (e) {
        reject(e);
      }
    }
  });
}

export async function exportPng(scope = { type: "all" }) {
  const school = (typeof window !== "undefined" && window.APP && window.APP.school) || APP.school;
  if (!school) { notify("Open a timetable first.", "error"); return null; }

  const scopeType = typeof scope === "string" ? scope : (scope.type || "all");
  const scopeId = typeof scope === "object" ? scope.id : arguments[1];

  // Obtain rendered page DOM element for scope
  let pageEl = null;
  if (typeof window !== "undefined" && window.APP?.printPreview && typeof window.APP.printPreview.renderPagesForScope === "function") {
    const pages = window.APP.printPreview.renderPagesForScope({ type: scopeType, id: scopeId });
    if (pages && pages.length) pageEl = pages[0];
  }

  if (!pageEl) {
    // Fallback renderer if printPreview isn't open or available
    pageEl = document.createElement("div");
    pageEl.className = "chrx-preview-page";
    const title = scopeType === "class"
      ? (school.classes?.find(c => c.id === scopeId)?.name || "Class Timetable")
      : scopeType === "teacher"
      ? (school.teachers?.find(t => t.id === scopeId)?.name || "Teacher Timetable")
      : (school.schoolName || "Timetable");
    pageEl.innerHTML = `<h2>${title}</h2><p>Exported timetable</p>`;
  }

  // Attach temporarily to measure if needed
  const tempContainer = document.createElement("div");
  tempContainer.style.position = "fixed";
  tempContainer.style.left = "-9999px";
  tempContainer.style.top = "-9999px";
  tempContainer.appendChild(pageEl);
  document.body.appendChild(tempContainer);

  let blob = null;
  try {
    const canvas = await renderPageToCanvas(pageEl, { width: A4_LANDSCAPE_W, height: A4_LANDSCAPE_H, scale: 1.5 });
    blob = await canvasToPngBlob(canvas);
  } finally {
    tempContainer.remove();
  }

  const base = (school._meta?.sourceFilename || school.schoolName || "chronexa").replace(/\.xml$/i, "").replace(/[^\w.-]+/g, "-");
  let suffix = "timetable";
  if (scopeType === "class" && scopeId) {
    const c = (school.classes || []).find(x => x.id === scopeId);
    suffix = (c?.short || c?.name || scopeId).replace(/[^\w.-]+/g, "-");
  } else if (scopeType === "teacher" && scopeId) {
    const t = (school.teachers || []).find(x => x.id === scopeId);
    suffix = (t?.short || t?.name || scopeId).replace(/[^\w.-]+/g, "-");
  } else if (scopeType === "room" && scopeId) {
    const r = (school.classrooms || []).find(x => x.id === scopeId);
    suffix = (r?.short || r?.name || scopeId).replace(/[^\w.-]+/g, "-");
  }

  const filename = `${base}-${suffix}.png`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  notify("Exported " + filename);
  return { filename, blob };
}

if (typeof window !== "undefined") {
  window.APP = window.APP || {};
  window.APP.io = window.APP.io || {};
  window.APP.io.renderSvgForPage = renderSvgForPage;
  window.APP.io.renderPageToCanvas = renderPageToCanvas;
  window.APP.io.canvasToPngBlob = canvasToPngBlob;
  window.APP.io.exportPng = exportPng;
  window.addEventListener("app:export-png", (e) => {
    exportPng(e.detail?.scope || e.detail || { type: "all" });
  });
}
