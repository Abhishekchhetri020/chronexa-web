/* Chronexa Solver — Test dialog.
 *
 * Mirrors Classic's `Test the timetable`: validate constraints without moving
 * any card. We use a short solver run (verbose: true) and route its
 * violations array straight into the verification panel.
 *
 * Public API:
 *   SolverUI.Test.open({ school?, onClose? })
 *
 * Flow:
 *   1. Destructive-action confirm (matches Classic's confirm dialog).
 *   2. Progress modal — same modal as Generate, just with the test title.
 *   3. On done:
 *      - 0 violations → toast "Test passed" + close.
 *      - >0 violations → verification panel opens with the issues.
 *
 * Implementation note: the solver doesn't have a dedicated "validate only"
 * mode; we approximate by running a tiny solve (timeLimitSec: 5) that
 * exercises every hard constraint and returns its `violations` array. No
 * card placement is committed because the result panel's Apply button is
 * hidden in test mode (see result_panel.js).
 */
(function (global) {
  "use strict";

  let confirmHost, confirmDlg, confirmState;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function buildConfirm() {
    confirmHost = el("div", { class: "csu-backdrop", role: "presentation", "aria-hidden": "true" });
    confirmDlg = el("section", {
      class: "csu-dialog csu-confirm",
      role: "alertdialog",
      "aria-modal": "true",
      "aria-labelledby": "csu-test-confirm-title",
    });
    confirmDlg.append(
      el("h2", { class: "csu-dialog__title", id: "csu-test-confirm-title" }, "Test the timetable"),
      el("p", { class: "csu-dialog__sub" },
        "We'll run the solver in validate-only mode. Unlocked cards stay where they are; nothing is overwritten."),
      el("p", { class: "csu-dialog__sub" }, "Hard conflicts and soft penalties will be listed in the verification panel."),
      el("div", { class: "csu-dialog__actions" },
        el("button", { type: "button", class: "chrx-btn", onclick: cancel }, "Cancel"),
        el("button", { type: "button", class: "chrx-btn chrx-btn--primary", id: "csu-test-go", onclick: go }, "Run test"),
      ),
    );
    confirmHost.appendChild(confirmDlg);
    document.body.appendChild(confirmHost);

    confirmHost.addEventListener("click", (e) => { if (e.target === confirmHost) cancel(); });
    confirmHost.addEventListener("keydown", (e) => { if (e.key === "Escape") cancel(); });
  }

  function cancel() {
    closeConfirm();
    if (confirmState && confirmState.onClose) try { confirmState.onClose(); } catch {}
    confirmState = null;
  }
  function closeConfirm() {
    if (!confirmHost) return;
    confirmHost.classList.remove("is-open");
    confirmHost.setAttribute("aria-hidden", "true");
  }

  function go() {
    const school = (confirmState && confirmState.school) || (global.APP && global.APP.school);
    closeConfirm();
    if (!school) {
      showToast("Upload a timetable XML first.");
      return;
    }
    runTest(school, confirmState && confirmState.onClose);
    confirmState = null;
  }

  function runTest(school, onClose) {
    const source = global.SolverUI.run({
      school,
      options: { timeLimitSec: 5, verbose: true },
      algorithm: "browser",          // test always runs locally — quick + private
    });
    global.SolverUI.Progress.open({
      source,
      mode: "test",
      timeLimitSec: 5,
      totalLessons: (school.lessons || []).length,
      onDone: (result) => {
        if (!result) { if (onClose) onClose(); return; }
        const v = result.violations || [];
        if (!v.length) {
          showToast("Test passed — no hard conflicts.");
          if (onClose) onClose();
          return;
        }
        // Show the lightweight result panel briefly so the user sees the stats,
        // then auto-open the verification list.
        global.SolverUI.Result.open({
          result,
          school,
          mode: "test",
          onClose: () => { if (onClose) onClose(); },
          onViewViolations: (violations) => global.SolverUI.Verification.show(violations, school),
        });
        // Pre-emptively show the drawer with the same list.
        global.SolverUI.Verification.show(v, school);
      },
      onCancel: () => { if (onClose) onClose(); },
    });
  }

  function showToast(msg) {
    let t = document.querySelector(".csu-toast");
    if (!t) {
      t = el("div", { class: "csu-toast", role: "status", "aria-live": "polite" });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("is-on");
    setTimeout(() => t.classList.remove("is-on"), 2400);
  }

  function open(opts) {
    confirmState = opts || {};
    if (!confirmHost) buildConfirm();
    confirmHost.classList.add("is-open");
    confirmHost.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      const f = confirmHost.querySelector("#csu-test-go");
      if (f) f.focus();
    });
  }

  global.SolverUI = global.SolverUI || {};
  global.SolverUI.Test = { open };
  // Exposed so a generic Run button can also call it directly:
  global.SolverUI._runTest = runTest;
  global.SolverUI._toast = showToast;
})(typeof window !== "undefined" ? window : globalThis);
