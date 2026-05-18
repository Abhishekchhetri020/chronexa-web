/* Teacher-wise timetable + companion table.
 *
 * One A4 portrait per teacher. Top: day × period grid showing class +
 * subject. Bottom: contract summary (class → subject → periods/week).
 */
(function () {
  "use strict";
  const U = window.APP.printTemplateUtils;
  if (!U) return;
  const { el, page, header, footer, emptyPage, DAYS, cardAtFor, subjectLabel } = U;

  function render(school /*, cards */) {
    if (!school || !school.teachers || !school.teachers.length) return [emptyPage("No teachers")];
    const periods = school.bell?.periods || [];
    const byTeacher = school._idx?.cardsByTeacher || {};
    const pages = [];

    for (const t of school.teachers) {
      const list = byTeacher[t.id] || [];
      const p = page(false);
      p.appendChild(header(t.name + " — teacher-wise with table",
        (school.schoolName || "") + (t.abbr ? "  (" + t.abbr + ")" : "")));

      // Grid
      const tbl = el("table", { style: U.tableCSS() });
      const head = el("tr");
      head.appendChild(el("th", { style: U.thCSS() }, ""));
      periods.forEach(per => head.appendChild(el("th", { style: U.thCSS() }, "P" + per.index)));
      tbl.appendChild(el("thead", null, head));
      const body = el("tbody");
      for (let d = 0; d < DAYS.length; d++) {
        const tr = el("tr");
        tr.appendChild(el("th", { style: U.thCSS() }, DAYS[d]));
        for (const per of periods) {
          const card = cardAtFor(list, d, per.index);
          if (card) tr.appendChild(el("td", { style: U.tdCSS() },
            el("div", { style: "font-weight:600" }, subjectLabel(card)),
            el("div", { style: "font-size:8.5px;color:#666" }, (card.classes || []).join(",")),
            el("div", { style: "font-size:8.5px;color:#888" }, card.classroom || "")));
          else tr.appendChild(el("td", { style: U.tdCSS() + ";color:#bbb;text-align:center" }, "—"));
        }
        body.appendChild(tr);
      }
      tbl.appendChild(body);
      p.appendChild(tbl);

      // Contract table
      const tally = {};   // "class|subject" → n
      for (const card of list) {
        const k = ((card.classes || []).join(",") || "?") + "|" + (card.subjectAbbr || card.subject || "?");
        tally[k] = (tally[k] || 0) + 1;
      }
      const t2 = el("table", { style: U.tableCSS() + ";margin-top:10px" });
      const h2 = el("tr");
      ["Class", "Subject", "Periods/week"].forEach(h => h2.appendChild(el("th", { style: U.thCSS() }, h)));
      t2.appendChild(el("thead", null, h2));
      const b2 = el("tbody");
      let total = 0;
      Object.keys(tally).sort().forEach(k => {
        const [cls, sub] = k.split("|");
        total += tally[k];
        const r = el("tr");
        r.appendChild(el("td", { style: U.tdCSS() }, cls));
        r.appendChild(el("td", { style: U.tdCSS() }, sub));
        r.appendChild(el("td", { style: U.tdCSS() + ";text-align:right" }, String(tally[k])));
        b2.appendChild(r);
      });
      const totRow = el("tr");
      totRow.appendChild(el("td", { style: U.tdCSS() + ";font-weight:600", colspan: 2 }, "Total"));
      totRow.appendChild(el("td", { style: U.tdCSS() + ";text-align:right;font-weight:600" }, String(total)));
      b2.appendChild(totRow);
      t2.appendChild(b2);
      p.appendChild(t2);
      p.appendChild(footer());
      pages.push(p);
    }
    return pages;
  }

  window.APP.printTemplates.register("teacherwise_with_table", {
    name: "Teacher-wise with contract table",
    render,
  });
})();
