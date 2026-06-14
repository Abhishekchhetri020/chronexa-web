/* Client-side undo / redo command stack.
 *
 * Consumers (Agent E grid, Agent F entity dialogs) call:
 *   APP.audit.commit({ label, do() {...}, undo() {...} })
 * The first call invokes do() and pushes onto undoStack.
 *
 * Keyboard: ⌘Z = undo, ⇧⌘Z / ⌘Y = redo (dispatched by topbar.js).
 * Menus check APP.audit.undoStack.length / redoStack.length to gate buttons.
 *
 * Listens for legacy 'app:editor-commit' events as a courtesy hook so existing
 * code can opt in without modification:
 *   window.dispatchEvent(new CustomEvent("app:editor-commit", { detail: cmd }))
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;

  const MAX = 100;
  const audit = APP.audit = APP.audit || {};
  audit.undoStack = [];
  audit.redoStack = [];
  audit._log = audit._log || [];

  /* append(record) — used by entity dialogs to log changes.
   * Also dispatches `entity:changed` so the editor/UI can re-render.
   * Without this, subjects.js / teachers.js / classes.js / etc. all
   * crashed on save because `audit.append` was undefined. */
  audit.append = function (record) {
    if (!record) return;
    record.ts = record.ts || Date.now();
    audit._log.push(record);
    if (audit._log.length > 500) audit._log.shift();
    try {
      window.dispatchEvent(new CustomEvent("entity:changed", { detail: record }));
      document.dispatchEvent(new CustomEvent("entity:changed", { detail: record }));
    } catch (e) { /* old browsers */ }
    // Also refresh the index so cards/lessons stay in sync
    if (window.CreateNew && typeof window.CreateNew.refreshIndex === "function") {
      try { window.CreateNew.refreshIndex(); } catch (_) {}
    }
  };

  audit.commit = function (cmd) {
    if (!cmd || typeof cmd.do !== "function" || typeof cmd.undo !== "function") return;
    try { cmd.do(); } catch (e) { console.error("[audit] do() failed:", e); return; }
    audit.undoStack.push(cmd);
    if (audit.undoStack.length > MAX) audit.undoStack.shift();
    audit.redoStack.length = 0;
    notify(cmd.label ? "Done: " + cmd.label : "Done", "info");
  };
  // Plan D: brief grid flash so the user sees an undo/redo took effect. Runs
  // after the command's re-render (.chrx-grid-scroll is freshly rebuilt).
  function flashGrid() {
    const g = document.querySelector(".chrx-grid-scroll");
    if (!g) return;
    g.classList.remove("chrx-grid-flash"); void g.offsetWidth;  // restart anim
    g.classList.add("chrx-grid-flash");
    setTimeout(() => g.classList.remove("chrx-grid-flash"), 480);
  }
  audit.undo = function () {
    const cmd = audit.undoStack.pop();
    if (!cmd) { notify("Nothing to undo"); return; }
    try { cmd.undo(); audit.redoStack.push(cmd); flashGrid(); notify("Undo · " + (cmd.label || "")); }
    catch (e) { console.error(e); notify("Undo failed: " + e.message, "error"); }
  };
  audit.redo = function () {
    const cmd = audit.redoStack.pop();
    if (!cmd) { notify("Nothing to redo"); return; }
    try { cmd.do(); audit.undoStack.push(cmd); flashGrid(); notify("Redo · " + (cmd.label || "")); }
    catch (e) { console.error(e); notify("Redo failed: " + e.message, "error"); }
  };
  audit.clear = function () { audit.undoStack.length = 0; audit.redoStack.length = 0; };

  window.addEventListener("app:undo",          audit.undo);
  window.addEventListener("app:redo",          audit.redo);
  window.addEventListener("app:editor-commit", (e) => audit.commit(e.detail));
  window.addEventListener("app:school-loaded", () => audit.clear());
})();
