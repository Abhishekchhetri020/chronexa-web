/**
 * Absence input tab — date picker + chip-style autocomplete for absent teachers.
 *
 * Mounts into the host element passed by main.js. Emits no events directly;
 * when the user clicks "Generate substitutions", we call
 *   candidate_ranker.rankAll(school, state.absent, dayOfWeek)
 * write the result into state.assignments, and invoke onGenerate() so the
 * shell can switch to the class-wise tab.
 *
 * Also fires `substitution:generate` so other modules can react.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const S = window.Substitution;
  if (!APP || !S) return;
  const el = S.el, esc = S.esc;

  function render(host, state, onGenerate) {
    host.innerHTML = "";

    const school = APP.school;
    const teachers = (school && school.teachers) || [];
    const day = S.ymdToDay(state.date);
    const dayLabel = day < 0 ? "Sunday (no school)" : (school._idx?.days?.[day] || "?");

    // ---- date row ----
    const dateInput = el("input", { type: "date", value: state.date,
      class: "chrx-sub-date",
      onchange: (e) => {
        state.date = e.target.value || S.todayYmd();
        const d = S.ymdToDay(state.date);
        dayBadge.textContent = d < 0
          ? "Sunday (no school)"
          : (school._idx?.days?.[d] || "?");
      },
    });
    const dayBadge = el("span", { class: "chrx-sub-daybadge" }, dayLabel);

    host.appendChild(el("div", { class: "chrx-sub-row" },
      el("label", { class: "chrx-sub-lbl", for: "chrx-sub-date" }, "Date"),
      dateInput, dayBadge,
    ));

    // ---- chips ----
    const chips = el("div", { class: "chrx-sub-chips" });
    function renderChips() {
      chips.innerHTML = "";
      if (!state.absent.length) {
        chips.appendChild(el("span", { class: "chrx-sub-hint" },
          "No teachers selected. Use the search box below."));
        return;
      }
      state.absent.forEach(tid => {
        const t = (school._idx?.teacherById?.[tid]) || { id: tid, name: "?", abbr: "" };
        chips.appendChild(el("span", { class: "chrx-sub-chip" },
          el("span", { class: "chrx-sub-chip__nm" }, t.name || tid),
          t.abbr ? el("span", { class: "chrx-sub-chip__abbr" }, t.abbr) : null,
          el("button", { class: "chrx-sub-chip__x", "aria-label": "Remove",
            onclick: () => {
              state.absent = state.absent.filter(x => x !== tid);
              renderChips();
              updateGenerate();
            }, type: "button" }, "×"),
        ));
      });
    }

    // ---- autocomplete ----
    const search = el("input", { type: "search",
      class: "chrx-sub-search",
      placeholder: "Type a teacher name…",
      autocomplete: "off",
    });
    const dropdown = el("div", { class: "chrx-sub-dropdown is-hidden" });

    function buildOptions(q) {
      const ql = q.trim().toLowerCase();
      const out = teachers.filter(t => {
        if (state.absent.includes(t.id)) return false;
        if (!ql) return true;
        return (t.name && t.name.toLowerCase().includes(ql)) ||
               (t.abbr && t.abbr.toLowerCase().includes(ql));
      }).slice(0, 30);

      dropdown.innerHTML = "";
      if (!out.length) {
        dropdown.appendChild(el("div", { class: "chrx-sub-opt is-empty" }, "No matches."));
        return;
      }
      out.forEach(t => {
        dropdown.appendChild(el("div", { class: "chrx-sub-opt",
          onclick: () => {
            if (!state.absent.includes(t.id)) state.absent.push(t.id);
            search.value = ""; dropdown.classList.add("is-hidden");
            renderChips(); updateGenerate();
            search.focus();
          } },
          el("span", { class: "chrx-sub-opt__nm" }, t.name || t.id),
          t.abbr ? el("span", { class: "chrx-sub-opt__abbr" }, t.abbr) : null,
        ));
      });
    }

    search.addEventListener("focus", () => {
      buildOptions(search.value);
      dropdown.classList.remove("is-hidden");
    });
    search.addEventListener("input", () => {
      buildOptions(search.value);
      dropdown.classList.remove("is-hidden");
    });
    search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { dropdown.classList.add("is-hidden"); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const first = dropdown.querySelector(".chrx-sub-opt:not(.is-empty)");
        if (first) first.click();
      }
    });
    document.addEventListener("click", (e) => {
      if (!host.contains(e.target)) return;
      if (e.target !== search && !dropdown.contains(e.target)) {
        dropdown.classList.add("is-hidden");
      }
    });

    host.appendChild(el("div", { class: "chrx-sub-row chrx-sub-row--col" },
      el("label", { class: "chrx-sub-lbl" }, "Absent teachers"),
      chips,
      el("div", { class: "chrx-sub-search-wrap" }, search, dropdown),
    ));

    // ---- generate button ----
    const generateBtn = el("button", { class: "chrx-sub-btn chrx-sub-btn--primary",
      onclick: () => generate(state, onGenerate, summary),
    }, "Generate substitutions");

    const summary = el("div", { class: "chrx-sub-summary" });

    host.appendChild(el("div", { class: "chrx-sub-row chrx-sub-row--actions" },
      generateBtn, summary,
    ));

    function updateGenerate() {
      const day = S.ymdToDay(state.date);
      generateBtn.disabled = state.absent.length === 0 || day < 0;
      generateBtn.title = day < 0
        ? "Sunday — pick a school day."
        : (state.absent.length ? "" : "Pick at least one absent teacher.");
    }

    renderChips();
    updateGenerate();
  }

  function generate(state, onGenerate, summaryEl) {
    const day = S.ymdToDay(state.date);
    if (day < 0) return;
    if (!state.absent.length) return;

    const school = APP.school;
    const ranker = window.SubstitutionRanker;
    state.assignments = ranker.rankAll(school, state.absent, day);

    window.dispatchEvent(new CustomEvent("substitution:generate", { detail: {
      date: state.date,
      absentTeachers: state.absent.slice(),
      assignments: state.assignments.slice(),
    } }));

    if (summaryEl) {
      const n = state.assignments.length;
      const filled = state.assignments.filter(a => a.chosen).length;
      summaryEl.innerHTML = `<span class="chrx-sub-ok">Generated <b>${n}</b> slot(s); <b>${filled}</b> filled, <b>${n - filled}</b> uncovered.</span>`;
    }
    if (typeof onGenerate === "function") setTimeout(onGenerate, 50);
  }

  window.SubstitutionAbsence = { render };
})();
