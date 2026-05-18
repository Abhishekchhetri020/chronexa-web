/* Contract overview — teacher × subject matrix showing periods/week.
 *
 * One A4 landscape page. Mirrors the Excel "Contracts" export but as a
 * printable matrix instead of a flat list, so HR can spot empty columns
 * (subjects without coverage) and overloaded rows visually.
 */
(function () {
  "use strict";
  const U = window.APP.printTemplateUtils;
  if (!U) return;
  const { el, page, header, footer, emptyPage } = U;

  function render(school /*, cards */) {
    if (!school) return [emptyPage("No school")];
    const teachers = school.teachers || [];
    const subjects = school.subjects || [];
    if (!teachers.length || !subjects.length) return [emptyPage("Need teachers and subjects")];

    // matrix[teacherId][subjectId] = periods/week summed over classes
    const m = {};
    for (const l of (school.lessons || [])) {
      for (const tid of (l.teacherIds || [])) {
        if (!m[tid]) m[tid] = {};
        m[tid][l.subjectId] = (m[tid][l.subjectId] || 0) + (l.periodsPerWeek || 0) * (l.classIds?.length || 1);
      }
    }

    const p = page(true);
    p.appendChild(header("Contract overview (teacher × subject)", school.schoolName || ""));

    const tbl = el("table", { style: U.tableCSS() });
    const tr0 = el("tr");
    tr0.appendChild(el("th", { style: U.thCSS() }, "Teacher"));
    tr0.appendChild(el("th", { style: U.thCSS() }, "Total"));
    subjects.forEach(s => tr0.appendChild(el("th", { style: U.thCSS() }, s.abbr || s.name)));
    tbl.appendChild(el("thead", null, tr0));

    const body = el("tbody");
    for (const t of teachers) {
      const row = m[t.id] || {};
      const tot = Object.values(row).reduce((a, b) => a + b, 0);
      const tr = el("tr");
      tr.appendChild(el("th", { style: U.thCSS() }, t.name + (t.abbr ? "  (" + t.abbr + ")" : "")));
      tr.appendChild(el("td", { style: U.tdCSS() + ";text-align:right;font-weight:600" }, String(tot)));
      for (const s of subjects) {
        const n = row[s.id] || 0;
        tr.appendChild(el("td", {
          style: U.tdCSS() + ";text-align:right;" + (n ? "" : "color:#ccc"),
        }, n ? String(n) : "·"));
      }
      body.appendChild(tr);
    }
    tbl.appendChild(body);
    p.appendChild(tbl);

    p.appendChild(el("div", { style: "margin-top:10px;font-size:9px;color:#666" },
      "Cell = periods/week (lessons × classes). Empty cell = teacher not assigned to that subject."));
    p.appendChild(footer());
    return [p];
  }

  window.APP.printTemplates.register("contract_overview", {
    name: "Contract overview",
    render,
  });
})();
