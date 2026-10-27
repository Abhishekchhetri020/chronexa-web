/* Chronexa — "Check the file" dialog (specification check).
 *
 * aSc's Test solves every class, teacher and room on its own and stops at
 * the first one that cannot be completed, offering CHECK and FIX / Test
 * AGAIN / Test with RELAXATION / SKIP / END. This is that flow on top of
 * js/solver/spec_check_worker.js. Chronexa's "Test" (test_dialog.js) stays
 * the verification of the current placement.
 *
 * Public API: SolverUI.SpecCheck.open({ school? })
 */
(function (global) {
  "use strict";
  const PART_LABEL = { classes: "Classes", teachers: "Teachers", classrooms: "Rooms" };
  const PART_ONE = { classes: "class", teachers: "teacher", classrooms: "room" };
  const ICON = { passed: "✓", failed: "✕", skipped: "↷", relaxed: "≈", running: "…" };
  let host, refs, worker, state;

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

  function build() {
    host = el("div", { class: "csu-backdrop chrx-spec", role: "presentation", "aria-hidden": "true" });
    const dlg = el("section", { class: "csu-dialog chrx-spec__dlg", role: "dialog", "aria-modal": "true", "aria-labelledby": "chrx-spec-title" });
    const stages = el("div", { class: "chrx-spec__stages" });
    const bar = el("div", { class: "chrx-spec__bar" }, el("div", { class: "chrx-spec__fill" }));
    const now = el("div", { class: "chrx-spec__now" });
    const log = el("ul", { class: "chrx-spec__log", "aria-live": "polite" });
    const ask = el("div", { class: "chrx-spec__ask", hidden: "" });
    const close = el("button", { type: "button", class: "chrx-btn", onclick: end }, "Close");
    const gen = el("button", { type: "button", class: "chrx-btn chrx-btn--primary", hidden: "", onclick: () => {
      hide(); const g = document.getElementById("cta-generate"); if (g) g.click();
    } }, "Generate");
    dlg.append(
      el("h2", { class: "csu-dialog__title", id: "chrx-spec-title" }, "Check the file"),
      el("p", { class: "csu-dialog__sub" },
        "Each class, teacher and room is solved on its own. If one cannot be completed even alone, no full timetable exists — fix that one first. Your timetable is not changed."),
      stages, bar, now, ask, log,
      el("div", { class: "csu-dialog__actions" }, close, gen));
    host.appendChild(dlg);
    document.body.appendChild(host);
    host.addEventListener("keydown", (e) => { if (e.key === "Escape") end(); });
    refs = { stages, bar: bar.firstChild, now, log, ask, gen, close };
  }

  function nameOf(school, table, id) {
    const o = (school[table] || []).find((x) => x.id === id);
    return o ? (o.name || o.short || o.abbr || id) : id;
  }

  function renderStages() {
    refs.stages.innerHTML = "";
    for (const part of Object.keys(PART_LABEL)) {
      const s = state.parts[part];
      if (!s.total) continue;
      const status = s.failed ? "failed" : s.done === s.total ? "passed" : s.done ? "running" : "";
      refs.stages.appendChild(el("div", { class: "chrx-spec__stage" + (status ? " is-" + status : "") },
        el("span", { class: "chrx-spec__stageIc" }, ICON[status] || "○"),
        el("span", null, `${PART_LABEL[part]} ${s.done}/${s.total}`)));
    }
  }

  function addLog(r) {
    const lbl = r.status === "relaxed" ? "passes only without card relationships"
      : r.status === "failed" ? `${r.unplaced} of ${r.placed + r.unplaced} cards cannot be placed`
      : r.status === "skipped" ? "skipped" : "ok";
    refs.log.appendChild(el("li", { class: "is-" + r.status },
      el("span", { class: "chrx-spec__ic" }, ICON[r.status]),
      `${PART_LABEL[r.part].slice(0, -1).replace(/^Classe$/, "Class")} ${r.name} — ${lbl}`));
    refs.log.scrollTop = 1e6;
  }

  // Solver FAIL codes → words (same vocabulary as result_panel.js).
  const REASON_WORDS = {
    teacher_conflict: "teacher busy", teacher_unavailable: "teacher off",
    teacher_max_per_day: "teacher daily limit", class_conflict: "class busy",
    class_unavailable: "class off", class_max_per_day: "class daily limit",
    room_conflict: "room taken", room_unavailable: "room off",
    subject_daily_limit: "subject daily limit", subject_daily_min_violation: "daily-spread rule",
    class_bell_period_invalid: "outside class hours", fixed_slot_mismatch: "fixed-slot clash",
    required_room_type: "no room of the required type",
  };
  const humanize = (reason) => (reason || "").replace(/([a-z_]+): (\d+)\/(\d+)/g,
    (m, code, n, of) => `${REASON_WORDS[code] || code.replace(/_/g, " ")} in ${n} of ${of} periods`);

  function showAsk(r) {
    const school = state.school;
    refs.ask.innerHTML = "";
    const lessons = (r.diagnostics || []).map((d) => {
      const subj = nameOf(school, "subjects", d.subjectId);
      return el("li", null, `${subj}${d.reason ? " — " + humanize(d.reason) : ""}`);
    });
    const btn = (label, action, cls) => el("button", { type: "button", class: "chrx-btn" + (cls ? " " + cls : ""),
      "data-action": action, onclick: () => answer(action, r) }, label);
    refs.ask.append(
      el("div", { class: "chrx-spec__askHead" },
        `The ${PART_ONE[r.part]} ${r.name} cannot be generated even on its own: ${r.unplaced} of ${r.placed + r.unplaced} cards stay unplaced.`),
      lessons.length ? el("ul", { class: "chrx-spec__askList" }, ...lessons) : null,
      el("div", { class: "chrx-spec__askBtns" },
        btn("Show me this " + PART_ONE[r.part], "show", "chrx-btn--primary"),
        btn("Test again", "retry"),
        btn("Test with relaxation", "relax"),
        btn("Skip and continue", "skip"),
        btn("End test", "end")));
    refs.ask.hidden = false;
    const first = refs.ask.querySelector("button"); if (first) first.focus();
  }

  function answer(action, r) {
    refs.ask.hidden = true;
    if (action === "show") { worker.postMessage({ type: "answer", action: "end" }); focusObject(r); hide(); return; }
    refs.now.textContent = action === "relax" ? `Testing ${r.name} without card relationships…` : `Testing ${r.name} again…`;
    worker.postMessage({ type: "answer", action });
  }

  // Open the object in the Focus board so the user lands on the problem.
  function focusObject(r) {
    const perspective = { classes: "class", teachers: "teacher", classrooms: "classroom" }[r.part];
    const A = global.APP;
    if (!A || !global.Editor) return;
    A.editor = A.editor || {};
    A.editor.perspective = perspective;
    A.editor.viewMode = "focus";
    A.editor.focusRowByPerspective = A.editor.focusRowByPerspective || {};
    A.editor.focusRowByPerspective[perspective] = r.id;
    const root = document.getElementById("editor-root");
    if (root) global.Editor.render(root);
  }

  function onMessage(ev) {
    const m = ev.data || {};
    if (m.type === "item" || m.type === "ask") {
      const r = m.result;
      if (m.type === "item") { state.parts[r.part].done++; addLog(r); }
      else state.parts[r.part].failed = true;
      if (m.type === "item" && r.status !== "failed") state.parts[r.part].failed = state.parts[r.part].failed && r.status === "skipped";
      refs.bar.style.width = Math.round(100 * (m.index + (m.type === "item" ? 1 : 0)) / m.total) + "%";
      refs.now.textContent = m.type === "ask" ? "" : `Checked ${m.index + 1} of ${m.total}`;
      renderStages();
      if (m.type === "ask") showAsk(r);
    } else if (m.type === "done") {
      stop();
      const bad = m.results.filter((r) => r.status !== "passed");
      refs.bar.style.width = "100%";
      refs.now.textContent = m.ended ? "Test ended."
        : bad.length ? `Done — ${bad.length} object(s) need attention (skipped or only pass relaxed).`
        : "Every class, teacher and room can be generated on its own. Generate the timetable.";
      refs.gen.hidden = !!(m.ended || bad.length);
      renderStages();
    } else if (m.type === "error") {
      stop();
      refs.now.textContent = "The check failed: " + m.message;
    }
  }

  function stop() { if (worker) { worker.terminate(); worker = null; } }
  function hide() { stop(); if (host) { host.classList.remove("is-open"); host.setAttribute("aria-hidden", "true"); } }
  function end() { hide(); }

  function open(opts) {
    const school = (opts && opts.school) || (global.APP && global.APP.school);
    if (!school) { if (global.SolverUI && global.SolverUI._toast) global.SolverUI._toast("Upload a timetable XML first."); return; }
    if (!host) build();
    stop();
    const count = (part, pick) => (school[part] || []).filter((o) => (school.lessons || []).some((l) => pick(l, o.id))).length;
    state = {
      school,
      parts: {
        classes:    { total: count("classes", (l, id) => (l.classIds || []).includes(id)), done: 0, failed: false },
        teachers:   { total: count("teachers", (l, id) => (l.teacherIds || []).includes(id)), done: 0, failed: false },
        classrooms: { total: count("classrooms", (l, id) => { const r = l._lessonRoomIds || l.roomIds || []; return r.length === 1 && r[0] === id; }), done: 0, failed: false },
      },
    };
    refs.log.innerHTML = ""; refs.ask.hidden = true; refs.gen.hidden = true;
    refs.bar.style.width = "0%"; refs.now.textContent = "Starting…";
    renderStages();
    host.classList.add("is-open"); host.setAttribute("aria-hidden", "false");
    refs.close.focus();
    // Must stay INLINE `new Worker(new URL(...))` so Vite bundles the worker.
    worker = new Worker(new URL("../../solver/spec_check_worker.js", import.meta.url), { type: "module" });
    worker.onmessage = onMessage;
    worker.postMessage({ type: "start", school });
  }

  global.SolverUI = global.SolverUI || {};
  global.SolverUI.SpecCheck = { open };
  global.addEventListener("app:spec-check", () => open());
})(typeof window !== "undefined" ? window : globalThis);

export const SpecCheck = window.SolverUI.SpecCheck;
