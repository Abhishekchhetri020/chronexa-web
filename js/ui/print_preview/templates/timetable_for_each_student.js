/* Per-student timetable — one A4 portrait per enrolled student.
 *
 * Audit §15.3. Combines class assignment (cards-by-class), elective
 * enrollment (school.studentSubjects), and student records (school.students)
 * to render a personalised timetable: every class lesson the student is in,
 * plus their chosen electives, with conflicts highlighted in red.
 *
 * Schools without students[] populated: the template emits a single
 * "No students enrolled" stub page so the dropdown entry doesn't break.
 */
(function () {
  "use strict";
  const U = window.APP && window.APP.printTemplateUtils;
  if (!U || !window.APP.printTemplates) return;
  const { el, page, header, footer, emptyPage, DAYS } = U;

  function studentCards(school, student) {
    const cardsByClass = school._idx?.cardsByClass || {};
    const out = [];
    if (student.classId) {
      const list = cardsByClass[student.classId] || [];
      for (const c of list) out.push({ ...c, source: "class" });
    }
    // Electives — match student's subject enrollments in school.studentSubjects.
    const enrollments = (school.studentSubjects || []).filter(e => e.studentId === student.id);
    if (enrollments.length) {
      const subjectIds = new Set(enrollments.map(e => e.subjectId));
      // Find cards whose lesson's subjectId matches an enrollment and whose
      // class set overlaps with the student's class (typical elective grouping).
      const lessonById = school._idx?.lessonById ||
        Object.fromEntries((school.lessons || []).map(l => [l.id, l]));
      for (const c of (school.cards || [])) {
        const lesson = lessonById[c.lessonId];
        if (!lesson || !subjectIds.has(lesson.subjectId)) continue;
        // Avoid double-counting cards already in the student's class list.
        if (student.classId && (lesson.classIds || []).includes(student.classId)
            && out.some(o => o.day === c.day && o.period === c.period
                && o.lessonId === c.lessonId)) continue;
        out.push({ ...c,
          subjectAbbr: school._idx?.subjectById?.[lesson.subjectId]?.abbr,
          subject:     school._idx?.subjectById?.[lesson.subjectId]?.name,
          source: "elective" });
      }
    }
    return out;
  }

  function render(school) {
    if (!school || !Array.isArray(school.students) || !school.students.length) {
      return [emptyPage("No students enrolled — add via Specification → Students…")];
    }
    const periods = (school.bell && school.bell.periods) || [];
    const subjMap = school._idx?.subjectById || {};
    const pages = [];
    const sortedStudents = school.students.slice().sort((a, b) => {
      const an = ((a.lastName || "") + (a.firstName || "")).toLowerCase();
      const bn = ((b.lastName || "") + (b.firstName || "")).toLowerCase();
      return an.localeCompare(bn);
    });

    for (const st of sortedStudents) {
      const fullName = ((st.firstName || "") + " " + (st.lastName || "")).trim() || "(unnamed)";
      const cls = school._idx?.classById?.[st.classId];
      const p = page(false);
      p.appendChild(header(fullName,
        (cls ? cls.name : "(no class)") + " · " + (school.schoolName || "")));

      const cards = studentCards(school, st);
      // Bucket by day/period
      const grid = {};
      for (const c of cards) {
        const k = c.day + "_" + c.period;
        if (!grid[k]) grid[k] = [];
        grid[k].push(c);
      }

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
          const list = grid[d + "_" + per.index] || [];
          if (!list.length) {
            tr.appendChild(el("td", { style: U.tdCSS() + ";color:#bbb;text-align:center" }, "—"));
          } else if (list.length === 1) {
            const c = list[0];
            const lbl = c.subjectAbbr || (subjMap[c.lessonId]?.abbr) || c.subject || "?";
            tr.appendChild(el("td", { style: U.tdCSS() + (c.source === "elective" ? ";color:#1d4ed8" : "") }, lbl));
          } else {
            const txt = list.map(c => c.subjectAbbr || c.subject || "?").join(" / ");
            tr.appendChild(el("td",
              { style: U.tdCSS() + ";background:#fee2e2;color:#7f1d1d", title: "Conflict — " + txt },
              "⚠ " + txt));
          }
        }
        body.appendChild(tr);
      }
      tbl.appendChild(body);
      p.appendChild(tbl);
      p.appendChild(footer());
      pages.push(p);
    }
    return pages;
  }

  window.APP.printTemplates.register("timetable_for_each_student", {
    name: "Timetable for each student",
    render,
  });
})();
