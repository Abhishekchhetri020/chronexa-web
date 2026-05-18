/**
 * Class-wise output — one row per (class, period) needing a substitute.
 *
 * Columns: Class · Period · Subject · Original teacher · Substitute · Score
 *
 * Score tiers (color-coded):
 *    ★★★ green  ≥100  (same subject)
 *    ★★  blue    ≥30  (same class but not subject)
 *    ★   yellow  <30, has candidate (generic free)
 *    —   red     uncovered (no free teacher)
 *
 * Click the substitute cell to pop a chooser with all candidates ranked.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const S = window.Substitution;
  if (!APP || !S) return;
  const el = S.el, esc = S.esc;

  function tierClass(c) {
    if (!c) return "is-tier-none";
    if (c.score >= 100) return "is-tier-3";
    if (c.score >= 30)  return "is-tier-2";
    return "is-tier-1";
  }
  function tierStars(c) {
    if (!c) return "—";
    if (c.score >= 100) return "★★★";
    if (c.score >= 30)  return "★★";
    return "★";
  }

  function render(host, state, onRefresh) {
    host.innerHTML = "";

    if (!state.assignments.length) {
      host.appendChild(el("div", { class: "chrx-sub-empty" },
        el("p", null, "No substitutions generated yet."),
        el("p", { class: "chrx-sub-hint" },
          "Go back to step 1, pick a date and add absent teachers, then click Generate."),
      ));
      return;
    }

    const total    = state.assignments.length;
    const filled   = state.assignments.filter(a => a.chosen).length;
    const strong   = state.assignments.filter(a => a.chosen && a.chosen.score >= 100).length;
    const ok       = state.assignments.filter(a => a.chosen && a.chosen.score >= 30 && a.chosen.score < 100).length;
    const weak     = state.assignments.filter(a => a.chosen && a.chosen.score < 30).length;
    const uncovered = total - filled;

    host.appendChild(el("div", { class: "chrx-sub-banner" },
      el("b", null, `${total} slot${total === 1 ? "" : "s"} to cover`),
      el("span", { class: "chrx-sub-pill is-green" }, `★★★ ${strong}`),
      el("span", { class: "chrx-sub-pill is-blue"  }, `★★  ${ok}`),
      el("span", { class: "chrx-sub-pill is-yellow"}, `★   ${weak}`),
      el("span", { class: "chrx-sub-pill is-red"   }, `— ${uncovered}`),
    ));

    const table = el("table", { class: "chrx-sub-table" },
      el("thead", null, el("tr", null,
        el("th", null, "Class"),
        el("th", null, "Period"),
        el("th", null, "Subject"),
        el("th", null, "Original teacher"),
        el("th", null, "Substitute"),
        el("th", null, "Score"),
      )),
    );
    const tbody = el("tbody");
    state.assignments.forEach(a => {
      const tier = tierClass(a.chosen);
      const tr = el("tr", { class: `chrx-sub-tr ${tier}`,
        onclick: () => openChooser(a, state, onRefresh) });
      tr.appendChild(el("td", null, a.classSection || "—"));
      tr.appendChild(el("td", null, `P${a.period}`));
      tr.appendChild(el("td", null, a.subject || "—"));
      tr.appendChild(el("td", null, a.originalTeacher || "—"));
      tr.appendChild(el("td", { class: "chrx-sub-subcell" },
        a.chosen
          ? el("span", null,
              el("span", { class: "chrx-sub-stars" }, tierStars(a.chosen)),
              " ",
              el("b", null, a.chosen.teacher),
              a.chosen.reasons && a.chosen.reasons.length
                ? el("div", { class: "chrx-sub-reasons" }, a.chosen.reasons.join(" · "))
                : null,
            )
          : el("span", { class: "chrx-sub-uncov" }, "— No candidate available"),
      ));
      tr.appendChild(el("td", { class: "chrx-sub-score" },
        a.chosen ? String(a.chosen.score) : "—"));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    host.appendChild(el("div", { class: "chrx-sub-tablewrap" }, table));
  }

  function openChooser(assignment, state, onRefresh) {
    const all = assignment.allCandidates || assignment.candidates || [];
    if (!all.length) {
      alert("No candidates available for this slot.");
      return;
    }
    // Pop a sheet listing all candidates; click one to assign.
    const scrim = el("div", { class: "chrx-sub-sheet-scrim",
      onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
    const sheet = el("div", { class: "chrx-sub-sheet" });
    sheet.appendChild(el("header", { class: "chrx-sub-sheet__head" },
      el("h3", null, `${assignment.classSection} P${assignment.period} · ${assignment.subject}`),
      el("button", { class: "chrx-sub-sheet__x", onclick: () => scrim.remove() }, "×"),
    ));
    const list = el("div", { class: "chrx-sub-cand-list" });
    all.slice(0, 30).forEach(c => {
      const isChosen = assignment.chosen && c.teacherId === assignment.chosen.teacherId;
      list.appendChild(el("button", {
        class: `chrx-sub-cand ${tierClass(c)} ${isChosen ? "is-chosen" : ""}`,
        onclick: () => {
          window.SubstitutionRanker.reassign(state.assignments,
            assignment.slotKey, c.teacherId);
          scrim.remove();
          if (typeof onRefresh === "function") onRefresh();
        },
      },
        el("span", { class: "chrx-sub-cand__stars" }, tierStars(c)),
        el("span", { class: "chrx-sub-cand__nm" }, c.teacher),
        el("span", { class: "chrx-sub-cand__score" }, String(c.score)),
        c.reasons && c.reasons.length
          ? el("div", { class: "chrx-sub-cand__why" }, c.reasons.join(" · "))
          : null,
      ));
    });
    sheet.appendChild(list);
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
  }

  window.SubstitutionClasswise = { render, openChooser };
})();
