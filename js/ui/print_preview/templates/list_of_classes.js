/* "List of classes" report template — final missing EduPage parity item.
 * Registers via window.APP.printTemplates.register(...).
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

  function render(school) {
    school = school || (window.APP && window.APP.school);
    const out = [];
    out.push(el("h1", null, `List of classes — ${school?.schoolName || ""}`));
    out.push(el("p", { style: "color:#64748b" }, `${(school?.classes || []).length} classes total. Generated ${new Date().toLocaleString()}.`));

    const tbl = el("table", { class: "tt-list", style: "width:100%;border-collapse:collapse;font-size:12px" });
    const thead = el("thead", null,
      el("tr", null,
        el("th", { style: "background:#f1f5f9;padding:6px;text-align:left;border:1px solid #cbd5e1" }, "#"),
        el("th", { style: "background:#f1f5f9;padding:6px;text-align:left;border:1px solid #cbd5e1" }, "Name"),
        el("th", { style: "background:#f1f5f9;padding:6px;text-align:left;border:1px solid #cbd5e1" }, "Short"),
        el("th", { style: "background:#f1f5f9;padding:6px;text-align:left;border:1px solid #cbd5e1" }, "Class teacher"),
        el("th", { style: "background:#f1f5f9;padding:6px;text-align:right;border:1px solid #cbd5e1" }, "Lessons"),
        el("th", { style: "background:#f1f5f9;padding:6px;text-align:right;border:1px solid #cbd5e1" }, "Periods/week"),
      ));
    tbl.appendChild(thead);

    const lessons = school?.lessons || [];
    const teachers = school?.teachers || [];
    const tbody = el("tbody");
    (school?.classes || []).forEach((c, i) => {
      const tch = teachers.find(t => t.id === c.teacherId);
      const myLessons = lessons.filter(l => (l.classIds || []).includes(c.id));
      const totalPpw = myLessons.reduce((s, l) => s + (l.periodsPerWeek || 0), 0);
      const tr = el("tr", null,
        el("td", { style: "padding:5px;border:1px solid #e2e8f0" }, String(i + 1)),
        el("td", { style: `padding:5px;border:1px solid #e2e8f0;color:${c.color || "#0f172a"}` }, c.name || "—"),
        el("td", { style: "padding:5px;border:1px solid #e2e8f0" }, c.short || ""),
        el("td", { style: "padding:5px;border:1px solid #e2e8f0" }, tch?.name || "—"),
        el("td", { style: "padding:5px;border:1px solid #e2e8f0;text-align:right" }, String(myLessons.length)),
        el("td", { style: "padding:5px;border:1px solid #e2e8f0;text-align:right" }, String(totalPpw)),
      );
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    out.push(tbl);
    return out;
  }

  window.APP.printTemplates.register({
    id: "list_of_classes",
    title: "List of classes",
    category: "lists",
    render,
  });
})();
