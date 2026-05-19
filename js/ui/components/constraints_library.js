/* Constraints Library — friendly UI for the ScoreExpr DSL.
 *
 * The ScoreExpr DSL (js/solver/score_expr.js) lets schools define their own
 * scoring rules. The full DSL has 15 primitives; most school admins won't
 * write JSON expressions by hand. This library gives them:
 *
 *   1. A catalog of pre-built rule templates ("Mr X likes morning periods",
 *      "PE should not be last", "No teacher gaps for senior teachers", etc.)
 *   2. A form-based editor that swaps the DSL for sentence-like inputs
 *      ("Subject [X] should be [first / last / morning / afternoon]")
 *   3. A list of all currently-active rules with toggle + delete
 *
 * Triggered by app:constraints-library event (Options menu wires entry).
 */
(function (global) {
  "use strict";

  /* ── Rule templates: a much larger set than ScoreExpr.PRESETS ───────── */
  const TEMPLATES = Object.freeze([
    // Position-of-day rules
    { id: "pos-morning",  label: "Subject [SUBJECT] should be in morning periods", weight: 20,
      build: (sid) => ({ node: "if",
        test: { node: "and", exprs: [
          { node: "eq", lhs: { node: "subjectId" }, rhs: sid },
          { node: "lt", lhs: { node: "period" }, rhs: 3 } ]},
        then: 1, else: 0 }) },

    { id: "pos-not-last", label: "Subject [SUBJECT] should not be the last period", weight: -40,
      build: (sid, periodCount = 8) => ({ node: "and", exprs: [
        { node: "eq", lhs: { node: "subjectId" }, rhs: sid },
        { node: "eq", lhs: { node: "period" }, rhs: periodCount - 1 } ]}) },

    { id: "pos-first-or-last", label: "Subject [SUBJECT] should be first OR last", weight: 15,
      build: (sid, periodCount = 8) => ({ node: "or", exprs: [
        { node: "eq", lhs: { node: "subjectId" }, rhs: sid },  // gated below
        { node: "eq", lhs: { node: "period" }, rhs: 0 },
        { node: "eq", lhs: { node: "period" }, rhs: periodCount - 1 } ]}) },

    { id: "pos-after-break", label: "Subject [SUBJECT] should be right after lunch break", weight: 10,
      build: (sid, lunchPeriod = 4) => ({ node: "if",
        test: { node: "and", exprs: [
          { node: "eq", lhs: { node: "subjectId" }, rhs: sid },
          { node: "eq", lhs: { node: "period" }, rhs: lunchPeriod } ]},
        then: 1, else: 0 }) },

    // Teacher preferences
    { id: "tch-morning",  label: "Teacher [TEACHER] prefers morning periods", weight: 15,
      build: (tid) => ({ node: "if",
        test: { node: "and", exprs: [
          { node: "in", value: tid, list: { node: "teacherIds" } },
          { node: "lt", lhs: { node: "period" }, rhs: 3 } ]},
        then: 1, else: 0 }) },

    { id: "tch-no-friday", label: "Teacher [TEACHER] off on Fridays", weight: -100,
      build: (tid, friday = 4) => ({ node: "and", exprs: [
        { node: "in", value: tid, list: { node: "teacherIds" } },
        { node: "eq", lhs: { node: "day" }, rhs: friday } ]}) },

    { id: "tch-no-lateday-after-firstday", label: "Teacher [TEACHER] no period 6+ on Monday", weight: -20,
      build: (tid, day = 0, after = 5) => ({ node: "and", exprs: [
        { node: "in", value: tid, list: { node: "teacherIds" } },
        { node: "eq", lhs: { node: "day" }, rhs: day },
        { node: "gte", lhs: { node: "period" }, rhs: after } ]}) },

    // Day-of-week preferences
    { id: "subj-on-day",  label: "Subject [SUBJECT] only on day [DAY]", weight: -100,
      build: (sid, day = 0) => ({ node: "and", exprs: [
        { node: "eq", lhs: { node: "subjectId" }, rhs: sid },
        { node: "neq", lhs: { node: "day" }, rhs: day } ]}) },

    { id: "subj-spread", label: "Subject [SUBJECT] spread across multiple days (not Friday)", weight: 5,
      build: (sid, friday = 4) => ({ node: "if",
        test: { node: "and", exprs: [
          { node: "eq", lhs: { node: "subjectId" }, rhs: sid },
          { node: "neq", lhs: { node: "day" }, rhs: friday } ]},
        then: 1, else: 0 }) },

    // Lab subjects
    { id: "lab-first-half", label: "Lab subjects should be in first half of day", weight: 10,
      build: (_, periodMid = 4) => ({ node: "if",
        test: { node: "and", exprs: [
          { node: "contains", list: { node: "field", entity: "subject", field: "name" }, value: "Lab" },
          { node: "lt", lhs: { node: "period" }, rhs: periodMid } ]},
        then: 1, else: 0 }) },

    // Class teacher preferences
    { id: "class-teacher-first-period", label: "Class teacher should teach period 1", weight: 25,
      build: () => ({ node: "and", exprs: [
        { node: "eq", lhs: { node: "period" }, rhs: 0 },
        { node: "in",
          value: { node: "field", entity: "teacher", field: "id" },
          list: { node: "field", entity: "class", field: "teacherIds" } } ]}) },

    // Custom
    { id: "custom", label: "Custom rule (raw DSL)…", weight: 1, custom: true },
  ]);

  /* ── UI helpers ────────────────────────────────────────────────────── */
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

  function open() {
    const school = window.APP?.school;
    if (!school) { (window._chrxNotify || console.log)("Open a timetable first.", "error"); return; }
    school.scoreRules = school.scoreRules || [];
    ensureStyles();

    const root = el("div", { class: "chrx-clib-root",
      onclick: e => { if (e.target === root) root.remove(); } });
    const panel = el("div", { class: "chrx-clib-panel" });

    panel.appendChild(el("header", null,
      el("h2", null, "📜 Constraints library — scoring rules for your school"),
      el("button", { class: "chrx-clib-close", "aria-label": "Close", onclick: () => root.remove() }, "×"),
    ));
    panel.appendChild(el("p", { class: "chrx-clib-sub" },
      "Add scoring rules that nudge the solver toward your preferences. Each rule has a weight — higher = stronger pull. Negative weight = penalty."));

    // ─── Active rules section
    const activeWrap = el("section", { class: "chrx-clib-active" },
      el("h3", null, `Active rules (${school.scoreRules.length})`));
    if (!school.scoreRules.length) {
      activeWrap.appendChild(el("div", { class: "chrx-clib-empty" }, "No rules yet. Pick a template below to add one."));
    }
    school.scoreRules.forEach((r, i) => {
      const row = el("div", { class: "chrx-clib-rule" });
      row.appendChild(el("span", { class: "chrx-clib-weight",
        style: `background:${r.weight > 0 ? "#10b981" : "#ef4444"}` }, String(r.weight)));
      row.appendChild(el("span", { class: "chrx-clib-name" }, r.name));
      const toggle = el("input", { type: "checkbox",
        checked: r.disabled ? null : "checked",
        onchange: e => { r.disabled = !e.target.checked;
          window.APP.audit?.append?.({ entity: "scoreRules", op: "toggle", index: i, disabled: r.disabled }); }
      });
      row.appendChild(toggle);
      row.appendChild(el("button", { class: "chrx-clib-del",
        onclick: () => {
          school.scoreRules.splice(i, 1);
          window.APP.audit?.append?.({ entity: "scoreRules", op: "remove", index: i });
          root.remove(); open();
        } }, "Delete"));
      activeWrap.appendChild(row);
    });
    panel.appendChild(activeWrap);

    // ─── Template picker
    const tplWrap = el("section", { class: "chrx-clib-templates" },
      el("h3", null, "Templates — pick one to add"));
    TEMPLATES.forEach(tpl => {
      const card = el("button", { class: "chrx-clib-tpl",
        onclick: () => addRuleFromTemplate(tpl, school, root) }, tpl.label);
      tplWrap.appendChild(card);
    });
    panel.appendChild(tplWrap);

    root.appendChild(panel);
    document.body.appendChild(root);
  }

  function addRuleFromTemplate(tpl, school, parentRoot) {
    if (tpl.custom) {
      const txt = prompt("Paste a custom ScoreExpr JSON expression:");
      if (!txt) return;
      try {
        const expr = JSON.parse(txt);
        school.scoreRules.push({ name: "Custom rule", weight: 1, expr });
        window.APP.audit?.append?.({ entity: "scoreRules", op: "add", custom: true });
        parentRoot.remove(); open();
      } catch (e) { alert("Invalid JSON: " + e.message); }
      return;
    }
    // Ask for the subject / teacher / day argument if the template needs one
    const needsSubject = /SUBJECT/.test(tpl.label);
    const needsTeacher = /TEACHER/.test(tpl.label);
    const needsDay = /DAY/.test(tpl.label);
    let arg = null, label = tpl.label;
    if (needsSubject) {
      const subjects = school.subjects || [];
      if (!subjects.length) { alert("Add some subjects first."); return; }
      const choice = prompt("Pick a subject:\n" + subjects.map((s, i) => `${i + 1}. ${s.name}`).join("\n") + "\nEnter number:");
      const ix = parseInt(choice, 10) - 1;
      if (isNaN(ix) || ix < 0 || ix >= subjects.length) return;
      arg = subjects[ix].id;
      label = tpl.label.replace(/\[SUBJECT\]/g, subjects[ix].name);
    } else if (needsTeacher) {
      const teachers = school.teachers || [];
      if (!teachers.length) { alert("Add some teachers first."); return; }
      const choice = prompt("Pick a teacher:\n" + teachers.map((t, i) => `${i + 1}. ${t.name}`).join("\n") + "\nEnter number:");
      const ix = parseInt(choice, 10) - 1;
      if (isNaN(ix) || ix < 0 || ix >= teachers.length) return;
      arg = teachers[ix].id;
      label = tpl.label.replace(/\[TEACHER\]/g, teachers[ix].name);
    } else if (needsDay) {
      arg = parseInt(prompt("Which day (0=Mon, 5=Sat)?:") || "0", 10);
      label = tpl.label.replace(/\[DAY\]/g, ["Mon","Tue","Wed","Thu","Fri","Sat"][arg] || "?");
    }
    const expr = tpl.build(arg);
    school.scoreRules.push({ name: label, weight: tpl.weight, expr });
    window.APP.audit?.append?.({ entity: "scoreRules", op: "add", tplId: tpl.id });
    parentRoot.remove(); open();
  }

  function ensureStyles() {
    if (document.getElementById("chrx-clib-styles")) return;
    const s = document.createElement("style");
    s.id = "chrx-clib-styles";
    s.textContent = `
.chrx-clib-root{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px;z-index:1000;overflow:auto}
.chrx-clib-panel{background:#fff;border-radius:12px;width:min(720px,95vw);padding:20px 24px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0f172a}
.chrx-clib-panel header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:8px}
.chrx-clib-panel h2{margin:0;font-size:17px;color:#1e3a8a}
.chrx-clib-close{background:none;border:0;font-size:22px;cursor:pointer;color:#64748b}
.chrx-clib-sub{margin:6px 0 14px;color:#64748b;font-size:13px}
.chrx-clib-panel h3{margin:14px 0 6px;color:#475569;text-transform:uppercase;letter-spacing:.04em;font-size:11px}
.chrx-clib-active{margin-bottom:18px}
.chrx-clib-empty{padding:18px;text-align:center;color:#94a3b8;font-size:13px;background:#f8fafc;border-radius:8px}
.chrx-clib-rule{display:flex;align-items:center;gap:10px;padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:13px}
.chrx-clib-weight{display:inline-block;min-width:36px;text-align:center;color:#fff;font-weight:600;border-radius:5px;padding:2px 6px;font-size:12px;font-variant-numeric:tabular-nums}
.chrx-clib-name{flex:1}
.chrx-clib-del{background:#fff;border:1px solid #fecaca;color:#b91c1c;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px}
.chrx-clib-templates{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.chrx-clib-tpl{background:#f1f5f9;color:#0f172a;border:1px solid transparent;padding:10px 12px;border-radius:8px;text-align:left;cursor:pointer;font-size:12px;transition:background .15s ease,border .15s ease}
.chrx-clib-tpl:hover{background:#fff;border-color:#4f46e5}
    `;
    document.head.appendChild(s);
  }

  window.addEventListener("app:constraints-library", () => open());
  // Hook into Options menu's existing "constraints" route
  global.ConstraintsLibrary = { open, TEMPLATES };
})(window);
