/* Custom 1 / Custom 2 / Custom 3 — empty user-editable report slots.
 *
 * EduPage exposes 3 user-customizable slots in the print preview dropdown.
 * Each is empty by default; users compose via the cell-style editor +
 * a basic class×period skeleton.
 *
 * Persisted on APP.printCustomTemplates[N] = { title, settings } (future).
 * For now we render a stub page explaining how to populate the slot.
 */
(function () {
  "use strict";
  if (!window.APP || !window.APP.printTemplates) return;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false)
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function makeCustom(slot) {
    return function render(school) {
      const stored = (window.APP.printCustomTemplates || {})[slot];
      const out = [];
      out.push(el("h1", null, `Custom ${slot} — ${school?.schoolName || ""}`));
      if (!stored) {
        out.push(el("p", { style: "color:#64748b;max-width:600px;line-height:1.5" },
          `This custom slot is empty. Open the Cell-style editor from the Print preview ribbon, configure the card layout, then save here. Future opens of this slot will render with your settings.`));
        out.push(el("p", { style: "color:#94a3b8;font-size:11px;margin-top:30px" },
          `Tip: Custom slots are useful for parent communications, exam-week schedules, or rotating-day patterns that don't fit a standard report.`));
      } else {
        // Render a basic class×period grid using stored settings
        const classes = school?.classes || [];
        const periods = (school?.bell?.periods?.length) || 8;
        const tbl = el("table", { style: "width:100%;border-collapse:collapse;font-size:11px" });
        // Header row
        const headRow = el("tr", null, el("th", { style: "background:#f1f5f9;padding:4px" }, "Class"));
        for (let p = 0; p < periods; p++) {
          headRow.appendChild(el("th", { style: "background:#f1f5f9;padding:4px" }, "P" + (p + 1)));
        }
        tbl.appendChild(el("thead", null, headRow));
        // Body
        const tbody = el("tbody");
        for (const c of classes) {
          const tr = el("tr");
          tr.appendChild(el("td", { style: "padding:4px;font-weight:600" }, c.name));
          for (let p = 0; p < periods; p++) tr.appendChild(el("td", { style: "padding:4px;border:1px solid #e2e8f0" }, "·"));
          tbody.appendChild(tr);
        }
        tbl.appendChild(tbody);
        out.push(tbl);
      }
      return out;
    };
  }

  for (const n of [1, 2, 3]) {
    window.APP.printTemplates.register({
      id: "custom_" + n,
      title: "Custom " + n,
      category: "custom",
      render: makeCustom(n),
    });
  }
})();
