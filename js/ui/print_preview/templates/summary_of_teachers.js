/* Summary of teachers — single A4 landscape with one row per teacher.
 *
 * EduPage parity: "Summary timetable of teachers". Per-day period count
 * across the week, plus a total. Quick way for the principal to spot
 * teacher-load imbalances on one page.
 */
(function () {
  "use strict";
  const U = window.APP.printTemplateUtils;
  if (!U) return;
  const { el, page, header, footer, emptyPage, DAYS } = U;

  function render(school) {
    if (!school || !school.teachers || !school.teachers.length) return [emptyPage("No teachers")];
    const periods   = school.bell?.periods || [];
    const byTeacher = school._idx?.cardsByTeacher || {};
    const totalSlots = DAYS.length * periods.length;

    const p = page(true);
    p.appendChild(header("Summary of teachers", school.schoolName || ""));

    const tbl = el("table", { style: U.tableCSS() });
    const tr0 = el("tr");
    tr0.appendChild(el("th", { style: U.thCSS() }, "Teacher"));
    tr0.appendChild(el("th", { style: U.thCSS() }, "Abbr"));
    DAYS.forEach(d => tr0.appendChild(el("th", { style: U.thCSS() + ";text-align:right" }, d)));
    tr0.appendChild(el("th", { style: U.thCSS() + ";text-align:right" }, "Total"));
    tr0.appendChild(el("th", { style: U.thCSS() + ";text-align:right" }, "Util %"));
    tbl.appendChild(el("thead", null, tr0));

    const tbody = el("tbody");
    for (const t of school.teachers) {
      const list = byTeacher[t.id] || [];
      const perDay = DAYS.map((_, d) => list.filter(x => x.day === d).length);
      const total = perDay.reduce((a, b) => a + b, 0);
      const util = totalSlots ? Math.round(100 * total / totalSlots) : 0;

      const tr = el("tr");
      tr.appendChild(el("td", { style: U.tdCSS() }, t.name));
      tr.appendChild(el("td", { style: U.tdCSS() + ";color:#666" }, t.abbr || ""));
      perDay.forEach(n => tr.appendChild(el("td",
        { style: U.tdCSS() + ";text-align:right;" + (n ? "" : "color:#ccc") },
        n ? String(n) : "·")));
      tr.appendChild(el("td", { style: U.tdCSS() + ";text-align:right;font-weight:600" }, String(total)));
      tr.appendChild(el("td", { style: U.tdCSS() + ";text-align:right;" + (util > 85 ? "color:#a00" : util < 30 ? "color:#888" : "") }, util + "%"));
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    p.appendChild(tbl);

    p.appendChild(el("div", { style: "margin-top:8px;font-size:9px;color:#666" },
      "Teachers: " + school.teachers.length + "  ·  Weekly slots/teacher: " + totalSlots + "  ·  Util > 85% highlighted."));
    p.appendChild(footer());
    return [p];
  }

  window.APP.printTemplates.register("summary_of_teachers", {
    name: "Summary of teachers",
    render,
  });
})();
