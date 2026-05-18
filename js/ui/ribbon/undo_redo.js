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

  audit.commit = function (cmd) {
    if (!cmd || typeof cmd.do !== "function" || typeof cmd.undo !== "function") return;
    try { cmd.do(); } catch (e) { console.error("[audit] do() failed:", e); return; }
    audit.undoStack.push(cmd);
    if (audit.undoStack.length > MAX) audit.undoStack.shift();
    audit.redoStack.length = 0;
    notify(cmd.label ? "Done: " + cmd.label : "Done", "info");
  };
  audit.undo = function () {
    const cmd = audit.undoStack.pop();
    if (!cmd) { notify("Nothing to undo"); return; }
    try { cmd.undo(); audit.redoStack.push(cmd); notify("Undo · " + (cmd.label || "")); }
    catch (e) { console.error(e); notify("Undo failed: " + e.message, "error"); }
  };
  audit.redo = function () {
    const cmd = audit.redoStack.pop();
    if (!cmd) { notify("Nothing to redo"); return; }
    try { cmd.do(); audit.undoStack.push(cmd); notify("Redo · " + (cmd.label || "")); }
    catch (e) { console.error(e); notify("Redo failed: " + e.message, "error"); }
  };
  audit.clear = function () { audit.undoStack.length = 0; audit.redoStack.length = 0; };

  window.addEventListener("app:undo",          audit.undo);
  window.addEventListener("app:redo",          audit.redo);
  window.addEventListener("app:editor-commit", (e) => audit.commit(e.detail));
  window.addEventListener("app:school-loaded", () => audit.clear());
})();
