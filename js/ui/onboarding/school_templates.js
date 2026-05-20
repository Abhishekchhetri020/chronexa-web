/* School templates — seed a working school from a school-type choice.
 *
 * Consumes window.OnboardingData (shipped in data_library.js).
 * Exposes window.SchoolTemplates.{ choices, applyChoice(id, opts) }.
 *
 * Triggered from the wizard's "Create new" flow. Each choice loads
 * subjects + 1 sample teacher + 1 sample class + a bell schedule.
 */
(function (global) {
  "use strict";

  function ensure(condition, message) {
    if (!condition) console.warn("[school-templates]", message);
  }

  const CHOICES = [
    { id: "cbse",              label: "CBSE school (India)",          subj: "cbse",
      classes: "Indian primary",  bell: "Indian 6-day 8-period",       names: "indian" },
    { id: "ib_myp",            label: "IB MYP school",                subj: "ib_myp",
      classes: "Indian primary",  bell: "Western 5-day 7-period",      names: "western" },
    { id: "igcse",             label: "IGCSE school",                 subj: "igcse",
      classes: "Indian secondary", bell: "Western 5-day 7-period",     names: "western" },
    { id: "us_k12",            label: "US public school K-12",        subj: "us_k12",
      classes: "Western K-5",     bell: "Western 5-day 7-period",      names: "western" },
    { id: "montessori_primary", label: "Montessori primary",          subj: "montessori_primary",
      classes: "Montessori",      bell: "Montessori 5-day 4-cycle",    names: "western" },
    { id: "india_govt",        label: "Govt school (India)",          subj: "india_govt",
      classes: "Indian primary",  bell: "Indian 6-day 8-period",       names: "indian" },
    { id: "blank",             label: "Blank — I'll set up everything", subj: null, classes: null, bell: null, names: null },
  ];

  function applyChoice(id, opts) {
    opts = opts || {};
    const choice = CHOICES.find(c => c.id === id);
    if (!choice) return { error: "no such template: " + id };
    const APP = global.APP || (global.APP = {});
    if (!global.CreateNew?.createBlank) return { error: "CreateNew not loaded" };
    global.CreateNew.createBlank({ schoolName: opts.schoolName || choice.label });
    const school = APP.school;
    if (choice.id === "blank") {
      return { ok: true, choice: "blank" };
    }
    const data = global.OnboardingData;
    if (!data) {
      ensure(false, "OnboardingData missing — seeding skeleton only");
      return { ok: true, choice: "blank-fallback" };
    }
    // Seed subjects
    if (choice.subj && data.SUBJECTS[choice.subj]) {
      school.subjects = data.SUBJECTS[choice.subj].map((s, i) => ({
        id: "s_" + i + "_" + Math.random().toString(36).slice(2, 6),
        name: s.name, abbr: s.short, color: s.color,
        contractWeight: s.weight,
      }));
    }
    // Seed bell schedule
    if (choice.bell && data.BELLS[choice.bell]) {
      const bell = data.BELLS[choice.bell];
      school.bell = { periods: bell.periods.map((p, i) => ({
        index: i + 1, label: p.label, startMin: p.startMin, endMin: p.endMin, isTeaching: true,
      })) };
      // Seed breaks
      if (bell.breaks?.length) {
        school.breaks = bell.breaks.map((b, i) => ({
          id: "b_" + i, name: b.name, startMin: b.startMin, endMin: b.endMin,
          afterPeriod: b.afterPeriod,
        }));
      }
      school.daysPerWeek = bell.daysPerWeek;
    }
    // Seed sample classes
    if (choice.classes && data.CLASS_PATTERNS[choice.classes]) {
      school.classes = data.CLASS_PATTERNS[choice.classes].slice(0, 3).map((name, i) => ({
        id: "c_" + i + "_" + Math.random().toString(36).slice(2, 6),
        name, short: name, color: "#3b82f6",
      }));
    }
    // Seed one sample teacher
    if (choice.names && data.TEACHER_NAMES[choice.names]?.length) {
      const t = data.TEACHER_NAMES[choice.names][0];
      school.teachers = [{
        id: "t_seed", name: t + " — replace with real teachers", color: "#10b981",
      }];
    }
    // Seed two sample rooms
    const roomPattern = data.ROOM_PATTERNS["Numbered"];
    if (roomPattern) {
      school.classrooms = roomPattern.slice(0, 2).map((name, i) => ({
        id: "r_" + i, name, short: name,
      }));
    }
    if (global.CreateNew?.refreshIndex) global.CreateNew.refreshIndex();
    if (global.APP?.audit?.append) {
      global.APP.audit.append({ entity: "school", op: "template-applied", template: id });
    }
    return { ok: true, choice: id, counts: {
      subjects: school.subjects?.length || 0,
      classes:  school.classes?.length  || 0,
      teachers: school.teachers?.length || 0,
      rooms:    school.classrooms?.length || 0,
    }};
  }

  /* ── UI: template picker modal (only shown if user clicks "Create new") ── */
  function pickerHtml() {
    const tiles = CHOICES.map(c =>
      `<button data-id="${c.id}" class="chrx-tpl-card chrx-lift chrx-press">
         <strong>${c.label}</strong>
         <small>${c.subj ? "8+ subjects · " : ""}${c.bell ? c.bell + " · " : ""}${c.names || "blank"}</small>
       </button>`
    ).join("");
    return `
      <h3 style="margin:0 0 6px;color:#1e3a8a">Pick a starting point</h3>
      <p style="margin:0 0 16px;color:#64748b;font-size:13px">We'll seed subjects, bell schedule, and 3 sample classes. You can change everything later.</p>
      <div class="chrx-tpl-grid">${tiles}</div>`;
  }

  function ensureStyles() {
    if (document.getElementById("chrx-tpl-styles")) return;
    const s = document.createElement("style");
    s.id = "chrx-tpl-styles";
    s.textContent = `
.chrx-tpl-modal{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;z-index:1100}
.chrx-tpl-modal__panel{background:#fff;border-radius:14px;width:min(680px,95vw);padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:-apple-system,sans-serif}
.chrx-tpl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.chrx-tpl-card{background:#f1f5f9;border:1px solid transparent;color:#0f172a;text-align:left;padding:14px 16px;border-radius:10px;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .15s ease;display:flex;flex-direction:column;gap:4px}
.chrx-tpl-card:hover{background:#fff;border-color:#4f46e5;transform:translateY(-1px)}
.chrx-tpl-card small{color:#64748b;font-size:11px}
    `;
    document.head.appendChild(s);
  }

  function showPicker(onPick) {
    // Bug #2: don't stack duplicate pickers if the user clicks "+ New" twice.
    const existing = document.querySelector(".chrx-tpl-modal");
    if (existing) existing.remove();
    ensureStyles();
    const root = document.createElement("div");
    root.className = "chrx-tpl-modal";
    root.onclick = e => { if (e.target === root) root.remove(); };
    const panel = document.createElement("div");
    panel.className = "chrx-tpl-modal__panel";
    panel.innerHTML = pickerHtml();
    root.appendChild(panel);
    document.body.appendChild(root);
    panel.querySelectorAll("[data-id]").forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const r = applyChoice(id);
        root.remove();
        if (onPick) onPick(id, r);
      };
    });
  }

  global.SchoolTemplates = { CHOICES, applyChoice, showPicker };
})(window);
