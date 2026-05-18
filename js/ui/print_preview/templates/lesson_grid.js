/* Lesson grid — one A4 landscape page listing every lesson row (subject,
 * class, teacher, periods/week, day/period if pinned). Mirrors the ASC
 * "Lessons" report developers use when auditing curriculum coverage.
 */
(function () {
  "use strict";
  const U = window.APP.printTemplateUtils;
  if (!U) return;
  const { el, page, header, footer, emptyPage } = U;

  const PER_PAGE = 36;  // ~36 rows per A4 landscape at 9.5px font

  function render(school /*, cards */) {
    if (!school || !school.lessons || !school.lessons.length) return [emptyPage("No lessons")];

    const tById = Object.fromEntries((school.teachers  || []).map(t => [t.id, t]));
    const sById = Object.fromEntries((school.subjects  || []).map(s => [s.id, s]));
    const cById = Object.fromEntries((school.classes   || []).map(c => [c.id, c]));
    const rById = Object.fromEntries((school.classrooms|| []).map(r => [r.id, r]));

    const lessons = school.lessons.slice().sort((a, b) => {
      const sa = (sById[a.subjectId]?.name || "").localeCompare(sById[b.subjectId]?.name || "");
      if (sa) return sa;
      return (cById[a.classIds?.[0]]?.name || "").localeCompare(cById[b.classIds?.[0]]?.name || "");
    });

    const pages = [];
    for (let i = 0; i < lessons.length; i += PER_PAGE) {
      const chunk = lessons.slice(i, i + PER_PAGE);
      const p = page(true);
      p.appendChild(header("Lesson grid", (school.schoolName || "") + "  ·  page " + (i / PER_PAGE + 1)));

      const tbl = el("table", { style: U.tableCSS() });
      const thead = el("thead");
      const tr0 = el("tr");
      ["#", "Subject", "Class(es)", "Teacher(s)", "Room pref.", "Per/wk", "Lab×2", "Pinned"]
        .forEach(h => tr0.appendChild(el("th", { style: U.thCSS() }, h)));
      thead.appendChild(tr0);
      tbl.appendChild(thead);

      const tbody = el("tbody");
      chunk.forEach((l, idx) => {
        const tr = el("tr");
        tr.appendChild(el("td", { style: U.tdCSS() + ";text-align:right;color:#666" }, String(i + idx + 1)));
        tr.appendChild(el("td", { style: U.tdCSS() },
          (sById[l.subjectId]?.abbr || sById[l.subjectId]?.name || l.subjectId || "")));
        tr.appendChild(el("td", { style: U.tdCSS() },
          (l.classIds || []).map(id => cById[id]?.name || id).join(", ")));
        tr.appendChild(el("td", { style: U.tdCSS() },
          (l.teacherIds || []).map(id => tById[id]?.abbr || tById[id]?.name || id).join(", ")));
        tr.appendChild(el("td", { style: U.tdCSS() },
          rById[l.preferredRoomId]?.name || l.preferredRoomId || (l.requiredRoomType ? "(" + l.requiredRoomType + ")" : "—")));
        tr.appendChild(el("td", { style: U.tdCSS() + ";text-align:right" }, String(l.periodsPerWeek || 0)));
        tr.appendChild(el("td", { style: U.tdCSS() + ";text-align:center" }, l.isLabDouble ? "✓" : ""));
        tr.appendChild(el("td", { style: U.tdCSS() },
          (l.fixedDay != null && l.fixedPeriod != null)
            ? "D" + l.fixedDay + " P" + l.fixedPeriod : ""));
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      p.appendChild(tbl);
      p.appendChild(footer());
      pages.push(p);
    }
    return pages;
  }

  window.APP.printTemplates.register("lesson_grid", {
    name: "Lesson grid",
    render,
  });
})();
