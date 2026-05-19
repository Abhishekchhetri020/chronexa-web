/* Wall poster — classrooms (landscape).
 *
 * One A4 landscape page with a big classroom × (day, period) grid — what
 * room is in use, when, by whom. Doubles as the corridor-display poster
 * Classic prints for invigilator orientation.
 */
(function () {
  "use strict";
  const U = window.APP.printTemplateUtils;
  if (!U) return;
  const { el, page, header, footer, emptyPage, DAYS } = U;

  function render(school /*, cards */) {
    if (!school || !school.classrooms || !school.classrooms.length) return [emptyPage("No classrooms")];
    const periods = school.bell?.periods || [];
    const byRoom  = school._idx?.cardsByRoom || {};

    const p = page(true);
    p.appendChild(header("Classrooms wall poster", school.schoolName || ""));

    const cols = 1 + DAYS.length * periods.length;
    const grid = el("div", {
      style: "display:grid;grid-template-columns:120px repeat(" + (cols - 1) + ",minmax(28px,1fr));gap:1px;background:#999;border:1px solid #444",
    });

    grid.appendChild(headerCell("Room"));
    for (let d = 0; d < DAYS.length; d++) {
      for (const per of periods) {
        grid.appendChild(headerCell(DAYS[d] + " P" + per.index));
      }
    }

    for (const r of school.classrooms) {
      grid.appendChild(headerCell(r.name, true));
      const list = byRoom[r.id] || [];
      for (let d = 0; d < DAYS.length; d++) {
        for (const per of periods) {
          const card = list.find(c => c.day === d && c.period === per.index);
          grid.appendChild(roomCell(card));
        }
      }
    }
    p.appendChild(grid);

    p.appendChild(el("div", { style: "margin-top:8px;font-size:9px;color:#555" },
      "Rooms: " + school.classrooms.length + "  ·  Slots/week: " + (DAYS.length * periods.length)));
    p.appendChild(footer());
    return [p];
  }

  function headerCell(s, sticky) {
    return el("div", {
      style: "background:#eee;padding:3px 5px;font-size:8.5px;font-weight:600;text-align:center;" + (sticky ? "text-align:left" : ""),
    }, s || "");
  }
  function roomCell(card) {
    if (!card) return el("div", { style: "background:#fff;padding:2px;min-height:18px" });
    return el("div", { style: "background:#fff;padding:2px;min-height:18px;font-size:8px;line-height:1.1" },
      el("div", { style: "font-weight:600" }, card.subjectAbbr || card.subject || ""),
      el("div", { style: "color:#666" }, (card.teachers || []).join(",").slice(0, 10)));
  }

  window.APP.printTemplates.register("wall_poster_classrooms", {
    name: "Wall poster — classrooms",
    render,
  });
})();
