/**
 * Print memo — renders an A4 daily substitution memo and pops window.print().
 *
 * Layout:
 *   Header — "DAILY SUBSTITUTION MEMO" + date + school name
 *   Class-wise table (Class · Period · Subject · Original · Substitute)
 *   Teacher-wise summary (Teacher · Periods · Classes)
 *   Notes textarea (user can type before printing — content stays in the
 *   printed output via contenteditable + a `print: visible` div).
 *
 * Opens a separate overlay sized to A4 so the user previews exactly what
 * the printer sees. Print stylesheet (@page A4) is in css/substitution.css.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const S = window.Substitution;
  if (!APP || !S) return;
  const el = S.el;

  function fmtDate(ymd) {
    if (!ymd) return "";
    const parts = ymd.split("-").map(Number);
    if (parts.length !== 3) return ymd;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function render(host, state) {
    host.innerHTML = "";

    if (!state.assignments.length) {
      host.appendChild(el("div", { class: "chrx-sub-empty" },
        el("p", null, "No substitutions generated yet."),
        el("p", { class: "chrx-sub-hint" },
          "Generate substitutions on step 1 first."),
      ));
      return;
    }

    const school = APP.school;
    const schoolName = (school && school.schoolName) || "School";

    // Toolbar
    host.appendChild(el("div", { class: "chrx-sub-print-toolbar" },
      el("button", { class: "chrx-sub-btn chrx-sub-btn--primary",
        onclick: () => window.print(),
      }, "Print memo"),
      el("span", { class: "chrx-sub-hint" },
        "Opens your browser's print dialog. Save as PDF or send to printer."),
    ));

    const memo = el("div", { class: "chrx-sub-memo", id: "chrx-sub-memo-print" });

    memo.appendChild(el("header", { class: "chrx-sub-memo__head" },
      el("h1", null, "DAILY SUBSTITUTION MEMO"),
      el("div", { class: "chrx-sub-memo__meta" },
        el("div", null, el("b", null, schoolName)),
        el("div", null, fmtDate(state.date)),
      ),
    ));

    // Absent teachers chip strip
    if (state.absent.length && school._idx?.teacherById) {
      const names = state.absent.map(tid =>
        school._idx.teacherById[tid]?.name || tid).join(", ");
      memo.appendChild(el("div", { class: "chrx-sub-memo__absent" },
        el("b", null, "Absent: "), names));
    }

    // Class-wise table
    memo.appendChild(el("h2", { class: "chrx-sub-memo__h2" }, "Class-wise substitutions"));
    const cwTable = el("table", { class: "chrx-sub-memo__table" });
    cwTable.appendChild(el("thead", null, el("tr", null,
      el("th", null, "Class"),
      el("th", null, "Period"),
      el("th", null, "Subject"),
      el("th", null, "Original"),
      el("th", null, "Substitute"),
    )));
    const cwBody = el("tbody");
    state.assignments.forEach(a => {
      cwBody.appendChild(el("tr", null,
        el("td", null, a.classSection || "—"),
        el("td", null, `P${a.period}`),
        el("td", null, a.subject || "—"),
        el("td", null, a.originalTeacher || "—"),
        el("td", null, a.chosen ? a.chosen.teacher : "— UNCOVERED —"),
      ));
    });
    cwTable.appendChild(cwBody);
    memo.appendChild(cwTable);

    // Teacher-wise summary
    const pivot = window.SubstitutionTeacherwise.pivotByTeacher(state.assignments);
    if (pivot.length) {
      memo.appendChild(el("h2", { class: "chrx-sub-memo__h2" },
        "Substitute teacher summary"));
      const tw = el("table", { class: "chrx-sub-memo__table" });
      tw.appendChild(el("thead", null, el("tr", null,
        el("th", null, "Teacher"),
        el("th", null, "Extra periods"),
        el("th", null, "Classes covered"),
      )));
      const twBody = el("tbody");
      pivot.forEach(g => {
        twBody.appendChild(el("tr", null,
          el("td", null, g.teacher),
          el("td", null, g.rows.map(r => `P${r.period}`).join(", ")),
          el("td", null, g.rows.map(r =>
            `${r.classSection} (${r.subject || "—"})`).join(" · ")),
        ));
      });
      tw.appendChild(twBody);
      memo.appendChild(tw);
    }

    // Notes (editable)
    memo.appendChild(el("h2", { class: "chrx-sub-memo__h2" }, "Notes"));
    const notes = el("div", { class: "chrx-sub-memo__notes",
      contenteditable: "true", "data-placeholder": "Click here to add notes…" });
    notes.textContent = state.notes || "";
    notes.addEventListener("input", () => { state.notes = notes.textContent; });
    memo.appendChild(notes);

    // Signature line
    memo.appendChild(el("div", { class: "chrx-sub-memo__sign" },
      el("div", null, "________________________"),
      el("div", { class: "chrx-sub-hint" }, "Principal / In-charge"),
    ));

    host.appendChild(memo);
  }

  window.SubstitutionPrintMemo = { render };
})();
