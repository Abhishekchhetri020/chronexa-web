/* Wall poster — teachers (landscape).
 *
 * Classic parity: "Wall poster of teachers". One A4 landscape with a big
 * teacher × (day, period) grid showing the subject + class in each slot.
 * Doubles as the staff-room display board.
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

    const p = page(true);
    p.appendChild(header("Teachers wall poster", school.schoolName || ""));

    const cols = 1 + DAYS.length * periods.length;
    const grid = el("div", {
      style: "display:grid;grid-template-columns:130px repeat(" + (cols - 1) + ",minmax(28px,1fr));gap:1px;background:#999;border:1px solid #444",
    });

    grid.appendChild(headerCell("Teacher"));
    for (let d = 0; d < DAYS.length; d++) {
      for (const per of periods) {
        grid.appendChild(headerCell(DAYS[d] + " P" + per.index));
      }
    }

    for (const t of school.teachers) {
      grid.appendChild(headerCell(t.abbr || t.name, true));
      const list = byTeacher[t.id] || [];
      for (let d = 0; d < DAYS.length; d++) {
        for (const per of periods) {
          const card = list.find(c => c.day === d && c.period === per.index);
          grid.appendChild(teacherCell(card));
        }
      }
    }
    p.appendChild(grid);

    p.appendChild(el("div", { style: "margin-top:8px;font-size:9px;color:#555" },
      "Teachers: " + school.teachers.length + "  ·  Slots/week: " + (DAYS.length * periods.length)));
    p.appendChild(footer());
    return [p];
  }

  function headerCell(s, sticky) {
    return el("div", {
      style: "background:#eee;padding:3px 5px;font-size:8.5px;font-weight:600;text-align:center;" + (sticky ? "text-align:left" : ""),
    }, s || "");
  }
  function teacherCell(card) {
    if (!card) return el("div", { style: "background:#fff;padding:2px;min-height:18px" });
    return el("div", { style: "background:#fff;padding:2px;min-height:18px;font-size:8px;line-height:1.1" },
      el("div", { style: "font-weight:600" }, card.subjectAbbr || card.subject || ""),
      el("div", { style: "color:#666" }, (card.classes || []).join(",").slice(0, 10)));
  }

  window.APP.printTemplates.register("wall_poster_teachers", {
    name: "Wall poster — teachers",
    render,
  });
})();

// Chronexa Web
