// Block M(3): In-app Help — "How to build your first timetable"
// Reachable from sidebar "Help & guide", ribbon Help menu, or `?` shortcut.
(function () {
  "use strict";

  const STEPS = [
    {
      num: "1",
      title: "Start from a template, blank school, or existing file",
      body: "On the home screen, choose Build a new timetable to pick a school template (Primary, Secondary, or Blank), or click Open file to import an existing aSc XML timetable.",
    },
    {
      num: "2",
      title: "Add your subjects, teachers, classes, and rooms",
      body: "Use the sidebar under School to enter your bell schedule, days, subjects, teachers, classes, and classrooms. Mark any teacher or class time off directly in each editor.",
    },
    {
      num: "3",
      title: "Define your weekly lessons",
      body: "Open Lessons in the sidebar (or click the Lessons Grid matrix in the top bar) to set how many periods per week each class takes with each teacher.",
    },
    {
      num: "4",
      title: "Click Generate to build the timetable",
      body: "Press Generate in the top bar. Chronexa runs right on your device (no upload required) and previews the result before changing your grid. You can undo with Ctrl+Z / Cmd+Z at any time.",
    },
    {
      num: "5",
      title: "Fine-tune directly on the grid",
      body: "Drag or click-to-place cards to move or swap lessons. Valid slots highlight in green; conflicts highlight in red with a plain-English explanation. Right-click any card to lock, remove, or edit it.",
    },
    {
      num: "6",
      title: "Print, export, publish, or handle daily substitutions",
      body: "Open Reports to print clean class or teacher timetables, Export for Excel/CSV/ICS/HTML/PNG/XML, Publish to share a read-only viewer, or Substitutions to cover absent teachers for any date.",
    },
  ];

  function openHelpGuide() {
    const existing = document.getElementById("chrx-help-guide-scrim");
    if (existing) existing.remove();

    const scrim = document.createElement("div");
    scrim.id = "chrx-help-guide-scrim";
    scrim.className = "chrx-dlg-scrim is-open";

    const dlg = document.createElement("div");
    dlg.className = "chrx-dlg chrx-help-guide";
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-labelledby", "chrx-help-guide-title");
    dlg.style.cssText = "max-width:620px;width:calc(100vw - 32px);max-height:calc(100vh - 48px);overflow:auto;";

    const stepsHtml = STEPS.map((s) => `
      <li style="display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:10px;border:1px solid var(--chrx-line,rgba(148,163,184,.28));background:var(--chrx-bg-soft,rgba(13,79,84,.04));">
        <span style="flex:0 0 26px;height:26px;border-radius:999px;background:#0d4f54;color:#fff;font-weight:700;font-size:13px;display:inline-flex;align-items:center;justify-content:center;">${s.num}</span>
        <div style="min-width:0;">
          <div style="font-weight:600;font-size:14px;margin-bottom:2px;color:var(--chrx-fg,inherit);">${s.title}</div>
          <div style="font-size:13px;line-height:1.45;color:var(--chrx-fg-secondary,#475569);">${s.body}</div>
        </div>
      </li>`).join("");

    dlg.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;">
        <h2 id="chrx-help-guide-title" style="margin:0;font-size:19px;font-weight:700;letter-spacing:-0.01em;">How to build your first timetable</h2>
        <button type="button" class="chrx-tb-btn" id="chrx-help-guide-x" aria-label="Close" style="min-width:32px;padding:4px 8px;">×</button>
      </div>
      <p style="margin:0 0 14px;font-size:13.5px;color:var(--chrx-fg-secondary,#475569);">
        Everything runs privately in your browser and saves automatically on this device. Follow these six steps to go from scratch to a ready-to-print timetable:
      </p>
      <ol style="list-style:none;margin:0 0 16px;padding:0;display:grid;gap:8px;">
        ${stepsHtml}
      </ol>
      <div class="chrx-dlg__actions" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;">
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <button type="button" class="chrx-tb-btn" id="chrx-help-guide-shortcuts">Keyboard shortcuts</button>
          <button type="button" class="chrx-tb-btn" id="chrx-help-guide-demo">Try sample school</button>
        </div>
        <button type="button" class="chrx-tb-btn chrx-tb-btn--primary" id="chrx-help-guide-close" style="background:#0d4f54;border-color:#0d4f54;color:#fff;">Got it</button>
      </div>
    `;

    scrim.appendChild(dlg);
    document.body.appendChild(scrim);

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const close = () => {
      document.removeEventListener("keydown", onKey, true);
      scrim.remove();
    };
    document.addEventListener("keydown", onKey, true);
    scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
    dlg.querySelector("#chrx-help-guide-x").onclick = close;
    dlg.querySelector("#chrx-help-guide-close").onclick = close;
    dlg.querySelector("#chrx-help-guide-shortcuts").onclick = () => {
      close();
      window.dispatchEvent(new CustomEvent("app:open-shortcuts"));
    };
    dlg.querySelector("#chrx-help-guide-demo").onclick = () => {
      close();
      window.dispatchEvent(new CustomEvent("app:open-demo"));
    };
    dlg.querySelector("#chrx-help-guide-close").focus();
  }

  window.addEventListener("app:open-help-guide", openHelpGuide);
  window.addEventListener("keydown", (e) => {
    if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    e.preventDefault();
    openHelpGuide();
  });

  if (window.APP) window.APP.openHelpGuide = openHelpGuide;
  window.ChrxHelpGuide = { open: openHelpGuide };
})();
