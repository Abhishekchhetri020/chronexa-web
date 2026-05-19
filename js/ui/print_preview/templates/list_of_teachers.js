/* List of teachers — directory page with name, abbreviation, periods/week,
 * subjects taught, and primary classes assigned.
 *
 * EduPage parity: "List of teachers". One A4 portrait, multi-page if the
 * list is long (~30 rows/page). Useful as a back-cover roster for the
 * printed timetable booklet.
 */
(function () {
  "use strict";
  const U = window.APP.printTemplateUtils;
  if (!U) return;
  const { el, page, header, footer, emptyPage } = U;

  const PER_PAGE = 30;

  function render(school) {
    if (!school || !school.teachers || !school.teachers.length) return [emptyPage("No teachers")];
    const byTeacher = school._idx?.cardsByTeacher || {};
    const teachers = school.teachers.slice().sort((a, b) =>
      (a.name || "").localeCompare(b.name || ""));

    const pages = [];
    for (let i = 0; i < teachers.length; i += PER_PAGE) {
      const chunk = teachers.slice(i, i + PER_PAGE);
      const p = page(false);
      p.appendChild(header("List of teachers",
        (school.schoolName || "") + "  ·  page " + (i / PER_PAGE + 1) +
        "/" + Math.ceil(teachers.length / PER_PAGE)));

      const tbl = el("table", { style: U.tableCSS() });
      const tr0 = el("tr");
      ["#", "Name", "Abbr", "Per/wk", "Subjects", "Classes"]
        .forEach(h => tr0.appendChild(el("th", { style: U.thCSS() }, h)));
      tbl.appendChild(el("thead", null, tr0));

      const tbody = el("tbody");
      chunk.forEach((t, idx) => {
        const list = byTeacher[t.id] || [];
        const subjects = [...new Set(list.map(c => c.subjectAbbr || c.subject || ""))].filter(Boolean).sort();
        const classes  = [...new Set(list.flatMap(c => c.classes || []))].sort();

        const tr = el("tr");
        tr.appendChild(el("td", { style: U.tdCSS() + ";text-align:right;color:#666" }, String(i + idx + 1)));
        tr.appendChild(el("td", { style: U.tdCSS() + ";font-weight:600" }, t.name || ""));
        tr.appendChild(el("td", { style: U.tdCSS() }, t.abbr || ""));
        tr.appendChild(el("td", { style: U.tdCSS() + ";text-align:right" }, String(list.length)));
        tr.appendChild(el("td", { style: U.tdCSS() + ";font-size:8.5px" }, subjects.join(", ")));
        tr.appendChild(el("td", { style: U.tdCSS() + ";font-size:8.5px;color:#666" }, classes.join(", ")));
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      p.appendChild(tbl);

      p.appendChild(el("div", { style: "margin-top:8px;font-size:9px;color:#666" },
        "Total teachers: " + teachers.length));
      p.appendChild(footer());
      pages.push(p);
    }
    return pages;
  }

  window.APP.printTemplates.register("list_of_teachers", {
    name: "List of teachers",
    render,
  });
})();
