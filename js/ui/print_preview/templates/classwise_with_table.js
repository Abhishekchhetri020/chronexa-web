/* Class-wise timetable + companion table.
 *
 * One A4 portrait per class: top half = the standard day × period grid,
 * bottom half = subject summary (subject → periods/week, teacher, room).
 * Matches the Classic "Timetable with companion table" report variant.
 */
(function () {
  "use strict";
  const U = window.APP.printTemplateUtils;
  if (!U) return;
  const { el, page, header, footer, emptyPage, DAYS, cardAtFor, subjectLabel, teacherList } = U;

  function render(school /*, cards */) {
    if (!school || !school.classes || !school.classes.length) return [emptyPage("No classes")];
    const periods = school.bell?.periods || [];
    const byClass = school._idx?.cardsByClass || {};
    const pages = [];

    for (const c of school.classes) {
      const list = byClass[c.id] || [];
      const p = page(false);
      p.appendChild(header(c.name + " — class-wise with table", school.schoolName || ""));

      // Grid — honour per-template structure override (Item 5).
      const structure = (U.structureFor && U.structureFor("classwise_with_table")) || "rows-days";
      const tbl = el("table", { style: U.tableCSS() });
      const head = el("tr");
      head.appendChild(el("th", { style: U.thCSS() }, ""));
      if (structure === "columns-days") {
        DAYS.forEach(d => head.appendChild(el("th", { style: U.thCSS() }, d)));
      } else {
        periods.forEach(per => head.appendChild(el("th", { style: U.thCSS() }, "P" + per.index)));
      }
      tbl.appendChild(el("thead", null, head));
      const body = el("tbody");
      if (structure === "columns-days") {
        for (const per of periods) {
          const tr = el("tr");
          tr.appendChild(el("th", { style: U.thCSS() }, "P" + per.index));
          for (let d = 0; d < DAYS.length; d++) {
            const card = cardAtFor(list, d, per.index);
            tr.appendChild(el("td", { style: U.tdCSS() + (card ? "" : ";color:#bbb;text-align:center") },
              card ? subjectLabel(card) : "—"));
          }
          body.appendChild(tr);
        }
      } else {
        for (let d = 0; d < DAYS.length; d++) {
          const tr = el("tr");
          tr.appendChild(el("th", { style: U.thCSS() }, DAYS[d]));
          for (const per of periods) {
            const card = cardAtFor(list, d, per.index);
            tr.appendChild(el("td", { style: U.tdCSS() + (card ? "" : ";color:#bbb;text-align:center") },
              card ? subjectLabel(card) : "—"));
          }
          body.appendChild(tr);
        }
      }
      tbl.appendChild(body);
      p.appendChild(tbl);

      // Companion table — subject summary
      const tally = {};   // subject → { n, teachers:Set, rooms:Set }
      for (const card of list) {
        const k = card.subjectAbbr || card.subject || "?";
        if (!tally[k]) tally[k] = { n: 0, teachers: new Set(), rooms: new Set() };
        tally[k].n += 1;
        (card.teachers || []).forEach(t => tally[k].teachers.add(t));
        if (card.classroom) tally[k].rooms.add(card.classroom);
      }
      const t2 = el("table", { style: U.tableCSS() + ";margin-top:10px" });
      const h2 = el("tr");
      ["Subject", "Periods/week", "Teacher(s)", "Room(s)"]
        .forEach(h => h2.appendChild(el("th", { style: U.thCSS() }, h)));
      t2.appendChild(el("thead", null, h2));
      const b2 = el("tbody");
      Object.keys(tally).sort().forEach(k => {
        const row = el("tr");
        row.appendChild(el("td", { style: U.tdCSS() + ";font-weight:600" }, k));
        row.appendChild(el("td", { style: U.tdCSS() + ";text-align:right" }, String(tally[k].n)));
        row.appendChild(el("td", { style: U.tdCSS() }, [...tally[k].teachers].join(", ")));
        row.appendChild(el("td", { style: U.tdCSS() }, [...tally[k].rooms].join(", ")));
        b2.appendChild(row);
      });
      t2.appendChild(b2);
      p.appendChild(t2);
      p.appendChild(footer());
      pages.push(p);
    }
    return pages;
  }

  window.APP.printTemplates.register("classwise_with_table", {
    name: "Class-wise with companion table",
    render,
  });
})();
