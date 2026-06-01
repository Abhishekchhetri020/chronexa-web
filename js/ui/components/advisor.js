/* Advisor — analyses the current timetable + surfaces improvement opportunities.
 *
 * Mirrors Classic's `runTTAdvisor` RPC (W15 finding #16 — present in
 * Timetable ribbon's group of Test/Generate/Improve/Advisor).
 *
 * Inputs: school + the constraint engine (RelationEnforcer +
 * SolverConstraints.checkPlacement + ImproveMode). Output: ranked list
 * of suggestions the user can click to apply or learn-more.
 *
 * Each suggestion has:
 *   - severity (high / med / low)
 *   - kind (conflict / soft / improvement)
 *   - text (plain English)
 *   - apply()? optional one-click fix
 *
 * Triggered by app:advisor event.
 */
(function () {
  "use strict";

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false)
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function collectSuggestions(school) {
    const out = [];
    const lessonById = (school._idx?.lessonById) ||
      Object.fromEntries((school.lessons || []).map(l => [l.id, l]));
    const subjectById = (school._idx?.subjectById) ||
      Object.fromEntries((school.subjects || []).map(s => [s.id, s]));

    // 1. Per-card violations
    for (const card of (school.cards || [])) {
      const lesson = lessonById[card.lessonId];
      if (!lesson) continue;
      if (window.SolverConstraints?.checkPlacement) {
        const r = window.SolverConstraints.checkPlacement(school, lesson.id, card.day, card.period, card.classroomId || null);
        for (const msg of (r.hard || [])) {
          out.push({ severity: "high", kind: "conflict",
            text: msg, card, lesson,
            apply: () => window.VerificationPro?.open?.() });
        }
      }
      if (window.RelationEnforcer?.check) {
        const r = window.RelationEnforcer.check(school, lesson.id, card.day, card.period);
        for (const msg of r.hard) out.push({ severity: "high", kind: "relation", text: msg, card, lesson });
        for (const msg of r.soft) out.push({ severity: "med", kind: "relation-soft", text: msg, card, lesson });
      }
    }

    // 2. Placement summary
    const totalNeeded = (school.lessons || []).reduce((s, l) => s + (l.periodsPerWeek || 0), 0);
    const placed = (school.cards || []).length;
    const pct = totalNeeded ? Math.round(100 * placed / totalNeeded) : 0;
    if (pct < 100 && pct >= 1) {
      out.push({ severity: pct < 80 ? "high" : "med", kind: "placement",
        text: `${placed} / ${totalNeeded} cards placed (${pct}%). Run Master Solve for the missing ${totalNeeded - placed}.`,
        apply: () => window.MasterSolverWizard?.open?.() });
    } else if (pct === 0) {
      out.push({ severity: "high", kind: "placement",
        text: "No cards placed yet. Open Timetable → Master Solve to generate.",
        apply: () => window.MasterSolverWizard?.open?.() });
    }

    // 3. Configuration gaps
    if (!(school.lessons || []).length) {
      out.push({ severity: "high", kind: "config",
        text: "No lessons defined. Open Specification → Lessons to add at least one lesson per (class, subject).",
        apply: () => window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind: "lessons" } })) });
    }
    if (!(school.teachers || []).length) {
      out.push({ severity: "high", kind: "config",
        text: "No teachers defined. Open Specification → Teachers.",
        apply: () => window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind: "teachers" } })) });
    }

    // 4. Improvement opportunities (offer Improve mode if there's something to improve)
    if (pct === 100 && (out.filter(s => s.severity === "high").length === 0)) {
      out.push({ severity: "low", kind: "improvement",
        text: "All cards placed and no hard conflicts. Run Improve mode to lower soft penalties further.",
        apply: () => window.ImproveMode?.run?.(school, { timeLimitSec: 30 }) });
    }

    // 5. Quality-of-life suggestions
    const subjectsWithoutColor = (school.subjects || []).filter(s => !s.color).length;
    if (subjectsWithoutColor > 0) {
      out.push({ severity: "low", kind: "polish",
        text: `${subjectsWithoutColor} subject(s) have no color. Run Color taxonomy to auto-assign.`,
        apply: () => window.ColorTaxonomy?.autoColor?.(school) });
    }
    const teachersWithoutQualification = (school.teachers || []).filter(t => !(t.qualifiedSubjectIds?.length)).length;
    if (teachersWithoutQualification > 0 && (school.subjects?.length || 0) > 0) {
      out.push({ severity: "low", kind: "polish",
        text: `${teachersWithoutQualification} teacher(s) have no qualifications set. Open Approbation matrix to fix.`,
        apply: () => window.ApprobationMatrix?.open?.() });
    }

    return out;
  }

  function open() {
    const school = window.APP?.school;
    if (!school) { (window._chrxNotify || console.log)("Open a timetable first.", "error"); return; }
    ensureStyles();
    const suggestions = collectSuggestions(school);

    const root = el("div", { class: "chrx-adv-root", onclick: e => { if (e.target === root) root.remove(); } });
    const panel = el("div", { class: "chrx-adv-panel" });

    panel.appendChild(el("header", null,
      el("h2", null, "💡 Advisor — improvements for your timetable"),
      el("button", { class: "chrx-adv-close", "aria-label": "Close", onclick: () => root.remove() }, "×"),
    ));
    const total = suggestions.length;
    const high = suggestions.filter(s => s.severity === "high").length;
    const med  = suggestions.filter(s => s.severity === "med").length;
    const low  = suggestions.filter(s => s.severity === "low").length;
    panel.appendChild(el("div", { class: "chrx-adv-summary" },
      `${total} suggestion${total === 1 ? "" : "s"} · `,
      el("span", { style: "color:#ef4444;font-weight:600" }, `${high} high`),
      " · ",
      el("span", { style: "color:#f59e0b;font-weight:600" }, `${med} medium`),
      " · ",
      el("span", { style: "color:#10b981;font-weight:600" }, `${low} low`)));

    const list = el("div", { class: "chrx-adv-list" });
    if (!suggestions.length) {
      list.appendChild(el("div", { class: "chrx-adv-empty" },
        "🎉 No suggestions — your timetable is healthy. Keep up the good work."));
    }
    suggestions.forEach((s, i) => {
      const row = el("div", { class: `chrx-adv-row chrx-adv-row--${s.severity}` });
      row.appendChild(el("span", { class: `chrx-adv-badge chrx-adv-badge--${s.severity}` },
        s.severity === "high" ? "Hard" : s.severity === "med" ? "Soft" : "Tip"));
      row.appendChild(el("span", { class: "chrx-adv-text" }, s.text));
      if (s.apply) {
        row.appendChild(el("button", { class: "chrx-adv-action",
          onclick: () => { try { s.apply(); root.remove(); } catch (e) { console.error(e); } } },
          s.kind === "improvement" ? "Run Improve" : s.kind === "placement" ? "Solve" : "Open"));
      }
      list.appendChild(row);
    });
    panel.appendChild(list);

    root.appendChild(panel);
    document.body.appendChild(root);
  }

  function ensureStyles() {
    if (document.getElementById("chrx-adv-styles")) return;
    const s = document.createElement("style");
    s.id = "chrx-adv-styles";
    s.textContent = `
.chrx-adv-root{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px;z-index:1100;overflow:auto}
.chrx-adv-panel{background:#fff;border-radius:14px;width:min(720px,95vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:-apple-system,sans-serif}
.chrx-adv-panel header{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #e2e8f0}
.chrx-adv-panel h2{margin:0;font-size:16px;color:#1e3a8a}
.chrx-adv-close{background:none;border:0;font-size:22px;cursor:pointer;color:#64748b}
.chrx-adv-summary{padding:10px 18px;background:#f8fafc;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0}
.chrx-adv-list{flex:1;overflow-y:auto;padding:10px 18px}
.chrx-adv-empty{padding:32px;text-align:center;color:#10b981;font-size:14px}
.chrx-adv-row{display:flex;align-items:center;gap:10px;padding:10px 6px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a}
.chrx-adv-row--high{border-left:3px solid #ef4444;padding-left:10px}
.chrx-adv-row--med{border-left:3px solid #f59e0b;padding-left:10px}
.chrx-adv-row--low{border-left:3px solid #10b981;padding-left:10px}
.chrx-adv-badge{font-size:10px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:4px;letter-spacing:.04em;color:#fff;flex-shrink:0}
.chrx-adv-badge--high{background:#ef4444}
.chrx-adv-badge--med{background:#f59e0b}
.chrx-adv-badge--low{background:#10b981}
.chrx-adv-text{flex:1;line-height:1.4}
.chrx-adv-action{background:#4f46e5;color:#fff;border:0;padding:5px 12px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;flex-shrink:0}
.chrx-adv-action:hover{background:#4338ca}
    `;
    document.head.appendChild(s);
  }

  window.addEventListener("app:advisor", () => open());
  window.Advisor = { open, collectSuggestions };
})();

// Chronexa Web
