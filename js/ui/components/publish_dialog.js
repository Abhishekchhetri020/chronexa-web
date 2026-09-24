// [vite-esm] imports
import "../state.js";
import "../entities/dialog_shell.js";
import {
  EDITIONS, EDITION_RULES, buildSnapshot, snapshotCounts,
  publish, safeFilenameBase,
} from "../io/publish.js";

/* Publish dialog — window.PublishDialog.open().
 *
 * Menu: Files → Export → "Publish timetable…" (fires app:publish-timetable).
 *
 * The dialog is the only place the edition is chosen; all content rules live
 * in js/ui/io/publish.js (C2 writer). Buttons:
 *   "Download viewer file (.html)"  — single self-contained offline viewer
 *   "Download snapshot (.json)"     — the C2 snapshot on its own (for
 *                                     index.html?view=published)
 * Draft-only by nature: nothing leaves the machine unless the user saves it.
 */
(function (global) {
  "use strict";
  const D = global.EntityDialog;
  if (!D) return;
  const { el } = D;

  const EDITION_HELP = {
    staff:    "Everything: classes, teachers, rooms and dated changes. For internal use.",
    students: "Class timetables for students and parents.",
    public:   "Class timetables only — no teacher names anywhere in the file.",
  };

  let state = null;
  let body = null;

  function notify(msg, level) { (global._chrxNotify || console.log)(msg, level); }

  function currentSnapshot() {
    const school = global.APP && global.APP.school;
    return buildSnapshot(school, state.edition, { teacherNames: state.teacherNames });
  }

  function countsLine(snap) {
    const c = snapshotCounts(snap);
    const teacherPart = snap.teachers ? `${c.teachers} teachers` : "no teacher names";
    return `${c.classes} classes · ${teacherPart} · ${c.lessons} lessons · ${c.days} days × ${c.periods} periods`;
  }

  function editionRow(key) {
    const rules = EDITION_RULES[key];
    const input = el("input", {
      type: "radio", name: "chrx-pub-edition", value: key,
      "data-testid": `chrx-pub-edition-${key}`,
      checked: state.edition === key ? "checked" : null,
      onchange: () => {
        state.edition = key;
        state.teacherNames = rules.teacherNames;
        render();
      },
    });
    return el("label", {
      class: "chrx-pub-edition",
      style: "display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid "
        + (state.edition === key ? "#1e3a8a" : "#e2e8f0")
        + ";border-radius:10px;margin-bottom:8px;cursor:pointer;background:"
        + (state.edition === key ? "#f4f7ff" : "#fff"),
    },
      input,
      el("span", null,
        el("span", { style: "display:block;font-weight:600" }, rules.label),
        el("span", { style: "display:block;color:#64748b;font-size:12px;margin-top:2px" }, EDITION_HELP[key])));
  }

  function render() {
    if (!body) return;
    body.textContent = "";
    const snap = currentSnapshot();
    const rules = EDITION_RULES[state.edition];

    body.appendChild(el("p", { style: "margin:0 0 12px;color:#475569;font-size:13px" },
      "Create a read-only copy of this timetable to share by WhatsApp, email or the school website. "
      + "Only what the chosen edition allows is written into the file."));

    for (const key of EDITIONS) body.appendChild(editionRow(key));

    body.appendChild(el("label", {
      style: "display:flex;gap:8px;align-items:center;margin:2px 0 12px;font-size:13px;"
        + (rules.canHideTeachers ? "" : "opacity:.55;"),
    },
      el("input", {
        type: "checkbox", "data-testid": "chrx-pub-teacher-names",
        checked: state.teacherNames ? "checked" : null,
        disabled: rules.canHideTeachers ? null : "disabled",
        onchange: (e) => { state.teacherNames = !!e.target.checked; render(); },
      }),
      el("span", null, "Include teacher names",
        el("span", { style: "color:#64748b" },
          rules.canHideTeachers ? " (students & parents)" : (state.edition === "staff" ? " — always in the staff edition" : " — never in the public edition")))));

    body.appendChild(el("div", {
      class: "chrx-pub-counts", "data-testid": "chrx-pub-counts",
      style: "padding:10px 12px;border-radius:10px;background:#f1f5f9;font-size:13px;color:#334155",
    },
      el("div", { style: "font-weight:600;margin-bottom:2px" }, "This file will contain"),
      el("div", null, countsLine(snap))));

    const btn = (label, testid, primary, onclick) => el("button", {
      class: "chrx-btn" + (primary ? " chrx-btn--primary" : ""),
      "data-testid": testid, type: "button",
      disabled: state.busy ? "disabled" : null,
      onclick,
    }, label);

    body.appendChild(el("div", {
      style: "display:flex;justify-content:flex-end;gap:8px;margin-top:14px;border-top:1px solid #e2e8f0;padding-top:12px",
    },
      btn("Close", "chrx-pub-close", false, () => D.closeSheet()),
      btn("Download snapshot (.json)", "chrx-pub-download-json", false, async () => {
        try {
          const school = global.APP.school;
          await publish(school, state.edition, { teacherNames: state.teacherNames, as: "json" });
          notify("Published " + safeFilenameBase(school) + "-" + state.edition + ".json");
        } catch (e) { notify("Publish failed: " + e.message, "error"); console.error(e); }
      }),
      btn(state.busy ? "Building…" : "Download viewer file (.html)", "chrx-pub-download-html", true, async () => {
        if (state.busy) return;
        state.busy = true;
        render();
        try {
          const school = global.APP.school;
          const name = safeFilenameBase(school) + "-" + state.edition + "-timetable.html";
          await publish(school, state.edition, { teacherNames: state.teacherNames });
          notify("Published " + name);
        } catch (e) { notify("Publish failed: " + e.message, "error"); console.error(e); }
        state.busy = false;
        render();
      })));
  }

  function open() {
    const school = global.APP && global.APP.school;
    if (!school) { notify("Open a timetable first.", "error"); return; }
    state = { edition: "staff", teacherNames: true, busy: false };
    body = el("div", { class: "chrx-pub", "data-testid": "chrx-pub-dialog" });
    D.openSheet(body, { title: "Publish timetable" });
    render();
  }

  global.PublishDialog = { open, close: () => D.closeSheet(), _state: () => state };
})(window);

// [vite-esm] exports
export const PublishDialog = window.PublishDialog;
