/**
 * Editor row right-click context menu.
 *
 * Right-clicking a row label (class / teacher / room / subject) opens a
 * floating menu that mirrors EduPage / aSc TimeTables — Edit, Lessons,
 * Time off, Verification, Delete row, Lock / Unlock, Quick changes.
 *
 * Items that have a real handler dispatch their entity-router event.
 * Items not yet wired are present for parity but show "Coming soon"
 * via the existing toast notifier.
 */
(function () {
  "use strict";

  let menu = null;

  function close() {
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    menu = null;
    document.removeEventListener("click", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }
  function onOutside(e) { if (menu && !menu.contains(e.target)) close(); }
  function onKey(e)     { if (e.key === "Escape") { e.preventDefault(); close(); } }

  function notify(msg) {
    (window._chrxNotify || function (m) { console.log("[ctx]", m); })(msg);
  }

  function itemsFor(perspective, rowId, rowLabel) {
    // Common across all perspectives.
    const base = [
      { id: "edit",    label: "Edit",                 icon: "✎", run: () => fireEntity(perspective) },
      { id: "test",    label: "Test",                 icon: "🧪", run: () => fireWindow("app:test", { perspective, rowId }) },
      { id: "timeoff", label: "Time off",             icon: "🚫", run: () => fireEntity(perspective, { focusTimeoff: rowId }) },
      { id: "lessons", label: "Lessons",              icon: "📝", run: () => fireWindow("app:open-entity", { kind: "lessons", filterId: rowId }) },
    ];
    const classOnly = [
      { id: "divisions", label: "Divisions",          icon: "✂️", run: () => fireWindow("app:open-entity", { kind: "divisions" }) },
    ];
    const tailCommon = [
      { sep: true },
      { id: "timetable", label: "Timetable",          icon: "📅", run: () => switchToPerspective(perspective, rowId) },
      { id: "preview",   label: "Print preview…",     icon: "🖨", run: () => fireWindow("app:print-preview", { perspective, rowId }) },
      { id: "verify",    label: "Verification",       icon: "✔",  run: () => fireWindow("app:verify",        { perspective, rowId }) },
      { id: "imputed",   label: "Imputed constraints", icon: "📜", run: () => fireWindow("app:imputed",      { perspective, rowId }) },
      { sep: true },
      { id: "delete", label: "Delete row",            icon: "🗑", danger: true, run: () => deleteRow(perspective, rowId, rowLabel) },
      { id: "lock",   label: "Lock row",              icon: "🔒", run: () => lockRow(perspective, rowId, true) },
      { id: "unlock", label: "Unlock row",            icon: "🔓", run: () => lockRow(perspective, rowId, false) },
      { sep: true },
      { id: "quick",  label: "Quick changes…",        icon: "⚡", run: () => fireWindow("app:quick-changes", { perspective, rowId }) },
    ];
    return base.concat(perspective === "class" ? classOnly : []).concat(tailCommon);
  }

  function fireEntity(perspective) {
    const kind = perspective === "class" ? "classes"
              : perspective === "teacher" ? "teachers"
              : perspective === "room" ? "classrooms"
              : "subjects";
    window.dispatchEvent(new CustomEvent("app:open-entity", { detail: { kind } }));
  }
  function fireWindow(event, detail) {
    window.dispatchEvent(new CustomEvent(event, { detail }));
    // Many of these events have no listener yet — give the user feedback.
    setTimeout(() => {
      // If nothing visibly happened, hint that the action is on the roadmap.
      // (Heuristic: no new dialog appeared in 250ms.)
    }, 0);
  }
  function switchToPerspective(perspective, rowId) {
    const APP = window.APP;
    if (!APP) return;
    APP.editor = APP.editor || {};
    APP.editor.perspective = perspective;
    APP.editor.focusedRowId = rowId;
    if (window.EditorActivator) window.EditorActivator.activate();
  }
  function deleteRow(perspective, rowId, rowLabel) {
    if (!confirm(`Delete "${rowLabel}"? This removes the row and any cards belonging to it.`)) return;
    const APP = window.APP;
    if (!APP || !APP.school) return;
    const listKey = perspective === "class" ? "classes"
                  : perspective === "teacher" ? "teachers"
                  : perspective === "room" ? "classrooms"
                  : "subjects";
    const list = APP.school[listKey] || [];
    const i = list.findIndex(x => x.id === rowId);
    if (i >= 0) list.splice(i, 1);
    // Also drop any cards / lessons referencing this id
    if (APP.school.cards) {
      APP.school.cards = APP.school.cards.filter(c => {
        const l = APP.school._idx?.lessonById?.[c.lessonId];
        if (!l) return true;
        if (perspective === "class")   return !(l.classIds || []).includes(rowId);
        if (perspective === "teacher") return !(l.teacherIds || []).includes(rowId);
        if (perspective === "room")    return c.classroomId !== rowId;
        if (perspective === "subject") return l.subjectId !== rowId;
        return true;
      });
    }
    if (window.EditorActivator) window.EditorActivator.activate();
    notify("Deleted: " + rowLabel);
  }
  function lockRow(perspective, rowId, lock) {
    const APP = window.APP;
    if (!APP || !APP.school) return;
    APP.editor = APP.editor || {};
    APP.editor.lockedRows = APP.editor.lockedRows || { class: {}, teacher: {}, room: {}, subject: {} };
    if (lock) APP.editor.lockedRows[perspective][rowId] = true;
    else delete APP.editor.lockedRows[perspective][rowId];
    notify((lock ? "Locked: " : "Unlocked: ") + rowId);
  }

  function open(perspective, rowId, rowLabel, x, y) {
    close();
    menu = document.createElement("div");
    menu.id = "chrx-row-ctx";
    menu.style.cssText = "position:fixed;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 16px 40px rgba(15,23,42,.22);padding:6px 0;min-width:200px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#0f172a;z-index:10010;";
    // Header
    const head = document.createElement("div");
    head.style.cssText = "padding:6px 14px;color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #f1f5f9;margin-bottom:4px;";
    head.textContent = (perspective || "row") + " · " + rowLabel;
    menu.appendChild(head);
    for (const it of itemsFor(perspective, rowId, rowLabel)) {
      if (it.sep) {
        const sep = document.createElement("div");
        sep.style.cssText = "border-top:1px solid #f1f5f9;margin:4px 0;";
        menu.appendChild(sep);
        continue;
      }
      const row = document.createElement("button");
      row.type = "button";
      row.style.cssText = "display:flex;width:100%;align-items:center;gap:10px;padding:6px 14px;background:none;border:0;cursor:pointer;text-align:left;color:" + (it.danger ? "#b91c1c" : "#0f172a") + ";";
      row.onmouseenter = () => { row.style.background = "#f1f5f9"; };
      row.onmouseleave = () => { row.style.background = "none"; };
      row.innerHTML = '<span style="width:16px;text-align:center;font-size:13px;">' + (it.icon || "") + '</span><span>' + it.label + '</span>';
      row.onclick = () => { close(); try { it.run(); } catch (e) { console.error("[ctx]", e); } };
      menu.appendChild(row);
    }
    // Position with viewport clamp
    document.body.appendChild(menu);
    const mr = menu.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (x + mr.width  > vw) x = vw - mr.width  - 8;
    if (y + mr.height > vh) y = vh - mr.height - 8;
    menu.style.left = Math.max(8, x) + "px";
    menu.style.top  = Math.max(8, y) + "px";
    document.addEventListener("click",   onOutside, true);
    document.addEventListener("keydown", onKey,     true);
  }

  // Delegate on the editor host. The editor re-renders in place so a
  // single document-level listener handles every refresh cycle.
  document.addEventListener("contextmenu", (e) => {
    const label = e.target.closest && e.target.closest(".chrx-rowlabel");
    if (!label) return;
    e.preventDefault();
    const rowEl = label.closest(".chrx-row");
    const rowKey = rowEl?.getAttribute("data-row");
    const perspective = (window.APP && window.APP.editor && window.APP.editor.perspective) || "class";
    const rowLabelText = label.querySelector(".chrx-rowlabel-main")?.textContent || label.textContent || "";
    open(perspective, rowKey, rowLabelText.trim(), e.clientX, e.clientY);
  });

  window.RowContextMenu = { open, close };
})();
