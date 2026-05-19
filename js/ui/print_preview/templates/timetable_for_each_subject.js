/* Timetable for each subject — one A4 portrait page per subject.
 *
 * EduPage parity: "Timetable for each subject". For each subject, render a
 * day × period grid showing which class/teacher uses that subject in each
 * slot. Lets HoDs check subject-specific room/teacher load.
 */
(function () {
  "use strict";
  const U = window.APP.printTemplateUtils;
  if (!U) { console.warn("[timetable_for_each_subject] helpers missing"); return; }
  const { el, page, header, footer, emptyPage, DAYS } = U;

  function render(school) {
    if (!school || !school.subjects || !school.subjects.length) return [emptyPage("No subjects")];
    const periods = school.bell?.periods || [];
    const cards   = school.cards || [];
    const sById   = Object.fromEntries((school.subjects   || []).map(s => [s.id, s]));
    const cById   = Object.fromEntries((school.classes    || []).map(c => [c.id, c]));
    const tById   = Object.fromEntries((school.teachers   || []).map(t => [t.id, t]));
    const rById   = Object.fromEntries((school.classrooms || []).map(r => [r.id, r]));
    const lById   = (school._idx && school._idx.lessonById) || {};

    // Build subject → list-of-cards index by re-scanning. Cards in school.cards
    // store lessonId; resolve subjectId via lessonById.
    const bySubject = {};
    for (const c of cards) {
      const l = lById[c.lessonId];
      if (!l) continue;
      const sid = l.subjectId;
      if (!sid) continue;
      (bySubject[sid] = bySubject[sid] || []).push({
        day: c.day, period: c.period,
        classes: (l.classIds || []).map(id => cById[id]?.name || id).join(", "),
        teachers: (l.teacherIds || []).map(id => tById[id]?.abbr || tById[id]?.name || id).join(", "),
        room: c.classroomId ? (rById[c.classroomId]?.name || "") : "",
      });
    }

    const pages = [];
    for (const s of school.subjects) {
      const list = bySubject[s.id] || [];
      const p = page(false);
      p.appendChild(header(
        s.name + (s.abbr ? "  (" + s.abbr + ")" : "") + " — subject timetable",
        (school.schoolName || "") + " · " + list.length + " sessions/week"));

      const tbl = el("table", { style: U.tableCSS() });
      const tr0 = el("tr");
      tr0.appendChild(el("th", { style: U.thCSS() }, "Day"));
      periods.forEach(per => tr0.appendChild(el("th", { style: U.thCSS() },
        "P" + per.index,
        el("div", { style: "font-weight:400;font-size:8.5px;color:#666" }, per.label || ""))));
      tbl.appendChild(el("thead", null, tr0));

      const tbody = el("tbody");
      for (let d = 0; d < DAYS.length; d++) {
        const tr = el("tr");
        tr.appendChild(el("th", { style: U.thCSS() }, DAYS[d]));
        for (const per of periods) {
          const hits = list.filter(x => x.day === d && x.period === per.index);
          if (!hits.length) {
            tr.appendChild(el("td", { style: U.tdCSS() + ";color:#bbb;text-align:center" }, "—"));
          } else {
            const cell = el("td", { style: U.tdCSS() });
            hits.forEach(h => {
              cell.appendChild(el("div", { style: "font-weight:600;font-size:9px" }, h.classes));
              cell.appendChild(el("div", { style: "font-size:8.5px;color:#666" }, h.teachers));
              if (h.room) cell.appendChild(el("div", { style: "font-size:8.5px;color:#888" }, h.room));
            });
            tr.appendChild(cell);
          }
        }
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      p.appendChild(tbl);
      p.appendChild(footer());
      pages.push(p);
    }
    return pages;
  }

  window.APP.printTemplates.register("timetable_for_each_subject", {
    name: "Timetable for each subject",
    render,
  });
})();
