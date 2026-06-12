/* Chronexa Solver — Verification panel wrapper.
 *
 * Thin orchestrator on top of Agent D's `window.Verification` drawer.
 *
 *   SolverUI.Verification.show(violations, school?)
 *
 * Inputs are the raw violations array off a SolveResponse:
 *   [{ ruleId, description }]
 *
 * We normalise them into Agent D's row shape and add a tab-strip above the
 * drawer body so users can filter by kind (Teachers / Classes / Rooms /
 * Subjects / Constraints). The "Constraints" tab is unfiltered.
 *
 * Click → dispatches `editor:focusCard` with the inferred cardId. The grid
 * views (class_grid / teacher_grid / room_grid) can listen and scroll the
 * relevant cell into view.
 */
(function (global) {
  "use strict";

  const TABS = [
    { key: "all",        label: "All",         match: () => true },
    { key: "Teachers",   label: "Teachers",    match: (v) => v.kind === "Teacher" },
    { key: "Classes",    label: "Classes",     match: (v) => v.kind === "Class" },
    { key: "Rooms",      label: "Rooms",       match: (v) => v.kind === "Room" },
    { key: "Subjects",   label: "Subjects",    match: (v) => v.kind === "Subject" },
    { key: "Constraints",label: "Constraints", match: (v) => v.kind === "Constraint" || v.kind === "Other" },
  ];

  let tabsHost, lastAll = [], lastSchool = null, currentTab = "all";

  // Heuristic mapping ruleId → kind.
  function inferKind(ruleId) {
    const id = String(ruleId || "").toLowerCase();
    if (id.indexOf("teacher") !== -1) return "Teacher";
    if (id.indexOf("class")   !== -1) return "Class";
    if (id.indexOf("room")    !== -1) return "Room";
    if (id.indexOf("subject") !== -1) return "Subject";
    if (id.indexOf("fixed")   !== -1) return "Constraint";
    if (id.indexOf("lab")     !== -1) return "Room";
    if (id.indexOf("unplaced") !== -1) return "Constraint";
    return "Other";
  }
  function inferLevel(ruleId) {
    const id = String(ruleId || "");
    if (id.startsWith("HARD_") || id.indexOf("hard") !== -1 || id.indexOf("required") !== -1 || id.indexOf("unplaced") !== -1) return "hard";
    return "soft";
  }

  // Parse "Lesson L42 (..." out of the description so we can deep-link.
  function inferCardId(desc) {
    if (!desc) return null;
    const m = /Lesson\s+([A-Za-z0-9_\-:*]+)/.exec(desc);
    return m ? m[1] : null;
  }

  function normalise(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const v of raw) {
      // Human descriptions are "Label — detail". Title = label, body = the
      // detail — so the row no longer repeats the same line twice (and raw
      // lesson-id descriptions from older results still degrade gracefully).
      const desc = v.description || v.ruleId || "Violation";
      const sep = desc.indexOf(" — ");
      const title = sep > 0 ? desc.slice(0, sep) : desc.split(":")[0];
      let body = sep > 0 ? desc.slice(sep + 3) : (desc === title ? "" : desc);
      if (body === title) body = "";
      out.push({
        id: v.ruleId || (title + "/" + (out.length + 1)),
        ruleId: v.ruleId,
        kind: inferKind(v.ruleId),
        level: inferLevel(v.ruleId),
        title,
        body,
        cardId: v.lessonId || inferCardId(v.description || ""),
      });
    }
    return out;
  }

  function ensureTabs() {
    if (tabsHost && tabsHost.isConnected) return;
    const panel = document.querySelector(".chrx-verification-panel");
    if (!panel) return;     // Agent D's drawer not mounted yet — caller will retry
    tabsHost = document.createElement("div");
    tabsHost.className = "csu-verify-tabs";
    tabsHost.setAttribute("role", "tablist");
    for (const t of TABS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "csu-verify-tab";
      b.setAttribute("role", "tab");
      b.dataset.key = t.key;
      b.textContent = t.label;
      b.addEventListener("click", () => selectTab(t.key));
      tabsHost.appendChild(b);
    }
    // Insert above the body.
    const body = panel.querySelector(".chrx-verification-panel__body");
    if (body) panel.insertBefore(tabsHost, body); else panel.appendChild(tabsHost);
  }

  function selectTab(key) {
    currentTab = key;
    if (tabsHost) {
      tabsHost.querySelectorAll(".csu-verify-tab").forEach(b => {
        b.classList.toggle("is-active", b.dataset.key === key);
        b.setAttribute("aria-selected", b.dataset.key === key ? "true" : "false");
      });
    }
    const def = TABS.find(t => t.key === key) || TABS[0];
    if (global.Verification) global.Verification.update(lastAll.filter(def.match));
  }

  function show(rawViolations, school) {
    lastAll = normalise(rawViolations);
    lastSchool = school || (global.APP && global.APP.school) || null;

    if (!global.Verification) {
      console.warn("SolverUI.Verification: window.Verification (Agent D) not loaded.");
      return;
    }
    global.Verification.mount();
    ensureTabs();
    selectTab(currentTab);
    global.Verification.open();

    // Wire row clicks (only attach once).
    if (!show._wired) {
      show._wired = true;
      global.Verification.onSelect((v) => {
        if (v && v.cardId) {
          const ev = new CustomEvent("editor:focusCard", { detail: { cardId: v.cardId, kind: v.kind } });
          document.dispatchEvent(ev);
        }
      });
    }
  }

  function close()  { if (global.Verification) global.Verification.close(); }
  function toggle() { if (global.Verification) global.Verification.toggle(); }

  global.SolverUI = global.SolverUI || {};
  global.SolverUI.Verification = { show, close, toggle, _normalise: normalise };
})(typeof window !== "undefined" ? window : globalThis);
