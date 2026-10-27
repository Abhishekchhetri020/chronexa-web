/* Chronexa — Relaxed conditions dialog (aSc "Show me the relaxed conditions").
 *
 * Lists every card relationship and teacher limit the given timetable breaks,
 * grouped by importance. Opened from the solver result panel (for the
 * candidate timetable) and from Timetable ▸ Relaxed conditions (for the
 * current one).
 *
 * Public API: SolverUI.Relaxed.open({ school?, cards? }), SolverUI.Relaxed.report(school, cards?)
 */
import { relaxedReport, IMPORTANCE_ORDER } from "../../solver/relaxed_report.js";

(function (global) {
  "use strict";
  const IMP_LABEL = { strict: "Strict", high: "High importance", normal: "Normal importance", low: "Low importance" };
  const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let host, body;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function report(school, cards) {
    return relaxedReport(cards ? { ...school, cards } : school);
  }

  function describe(school, it) {
    if (it.kind === "relation") {
      const names = (ids, list) => (ids || []).map((id) => (list || []).find((x) => x.id === id)).filter(Boolean).map((x) => x.name || x.short);
      const rel = (school.relations || []).find((r) => r.id === it.id) || {};
      const subj = names(rel.subjectids, school.subjects).concat(names(rel.subject2ids, school.subjects));
      const cls = names(rel.classids, school.classes);
      const scope = [subj.join(", "), cls.length ? "in " + cls.join(", ") : ""].filter(Boolean).join(" ");
      return `“${it.label}”${scope ? " — " + scope : ""}: broken by ${it.count} card${it.count === 1 ? "" : "s"}`;
    }
    const where = it.where == null ? "over the week" : "on " + (DAY[it.where] || "day " + (it.where + 1));
    return `${it.name}: ${it.rule} ${it.limit}, has ${it.actual} ${where}`;
  }

  function build() {
    host = el("div", { class: "csu-backdrop chrx-relaxed", role: "presentation", "aria-hidden": "true" });
    const dlg = el("section", { class: "csu-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "chrx-relaxed-title" });
    body = el("div", { class: "chrx-relaxed__body" });
    const close = el("button", { type: "button", class: "chrx-btn chrx-btn--primary", onclick: hide }, "Close");
    dlg.append(
      el("h2", { class: "csu-dialog__title", id: "chrx-relaxed-title" }, "Relaxed conditions"),
      el("p", { class: "csu-dialog__sub" }, "Card relationships and teacher limits this timetable does not meet, most important first."),
      body, el("div", { class: "csu-dialog__actions" }, close));
    host.appendChild(dlg);
    document.body.appendChild(host);
    host.addEventListener("click", (e) => { if (e.target === host) hide(); });
    host.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  }

  function hide() { if (host) { host.classList.remove("is-open"); host.setAttribute("aria-hidden", "true"); } }

  function open(opts) {
    const school = (opts && opts.school) || (global.APP && global.APP.school);
    if (!school) return;
    if (!host) build();
    const rep = report(school, opts && opts.cards);
    body.innerHTML = "";
    if (!rep.total) body.appendChild(el("p", { class: "chrx-relaxed__ok" }, "✓ Every card relationship and teacher limit is met."));
    for (const imp of IMPORTANCE_ORDER) {
      const items = rep.byImportance[imp];
      if (!items.length) continue;
      body.appendChild(el("h3", { class: "chrx-relaxed__h is-" + imp }, `${IMP_LABEL[imp]} (${items.length})`));
      body.appendChild(el("ul", { class: "chrx-relaxed__list" }, ...items.map((it) => el("li", null, describe(school, it)))));
    }
    host.classList.add("is-open"); host.setAttribute("aria-hidden", "false");
    host.querySelector(".chrx-btn--primary").focus();
  }

  global.SolverUI = global.SolverUI || {};
  global.SolverUI.Relaxed = { open, report };
  global.addEventListener("app:relaxed-conditions", () => open());
})(typeof window !== "undefined" ? window : globalThis);
