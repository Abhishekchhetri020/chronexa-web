/* Summary of subjects — one A4 landscape page with subject × class grid
 * showing periods-per-week. Lets the head check subject loading vs the
 * curriculum plan at a glance.
 */
(function () {
  "use strict";
  const U = window.APP.printTemplateUtils;
  if (!U) return;
  const { el, page, header, footer, emptyPage } = U;

  function render(school /*, cards */) {
    if (!school) return [emptyPage("No school")];
    const subjects = school.subjects || [];
    const classes  = school.classes  || [];
    if (!subjects.length) return [emptyPage("No subjects")];

    // Aggregate periods/week from lessons (primary source) and fall back to
    // cards count when no lesson rows exist.
    const grid = {};   // grid[subjectId][classId] = n
    for (const s of subjects) grid[s.id] = {};
    for (const l of (school.lessons || [])) {
      for (const cid of (l.classIds || [])) {
        const sid = l.subjectId;
        if (!grid[sid]) grid[sid] = {};
        grid[sid][cid] = (grid[sid][cid] || 0) + (l.periodsPerWeek || 0);
      }
    }

    const p = page(true);
    p.appendChild(header("Summary of subjects", school.schoolName || ""));

    const tbl = el("table", { style: U.tableCSS() });
    const thead = el("thead");
    const tr0 = el("tr");
    tr0.appendChild(el("th", { style: U.thCSS() }, "Subject"));
    tr0.appendChild(el("th", { style: U.thCSS() }, "Total"));
    classes.forEach(c => tr0.appendChild(el("th", { style: U.thCSS() }, c.name)));
    thead.appendChild(tr0);
    tbl.appendChild(thead);

    const tbody = el("tbody");
    for (const s of subjects) {
      const tr = el("tr");
      tr.appendChild(el("th", { style: U.thCSS() }, s.name + (s.abbr ? "  (" + s.abbr + ")" : "")));
      let tot = 0;
      const row = classes.map(c => {
        const n = (grid[s.id] && grid[s.id][c.id]) || 0;
        tot += n;
        return n;
      });
      tr.appendChild(el("td", { style: U.tdCSS() + ";text-align:right;font-weight:600" }, String(tot)));
      row.forEach(n => tr.appendChild(el("td", {
        style: U.tdCSS() + ";text-align:right;" + (n ? "" : "color:#ccc"),
      }, n ? String(n) : "·")));
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    p.appendChild(tbl);
    p.appendChild(footer());
    return [p];
  }

  window.APP.printTemplates.register("summary_of_subjects", {
    name: "Summary of subjects",
    render,
  });
})();
