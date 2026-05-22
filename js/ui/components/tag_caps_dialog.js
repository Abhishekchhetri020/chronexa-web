/* Tag daily caps dialog — Tier-A FET port.
 *
 * Edits school.settings.tagDailyCaps[] which the solver reads via
 * model.tagDailyCaps → lessonTagDailyCapPenalty(). Each row:
 *   { tag: "PE", scope: "teacher"|"class", max: 2 }
 *
 * Reached via Specification → "Tag daily caps…" (app:tag-caps).
 */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;
  const APP = window.APP = window.APP || {};

  function load() {
    APP.school = APP.school || {};
    APP.school.settings = APP.school.settings || {};
    if (!Array.isArray(APP.school.settings.tagDailyCaps)) {
      APP.school.settings.tagDailyCaps = [];
    }
    return APP.school.settings.tagDailyCaps;
  }

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function open() {
    if (!APP.school) {
      (window._chrxNotify || console.log)("Open a timetable first.", "error"); return;
    }
    const caps = load();
    const body = el("div");

    const intro = el("p", { style: "font-size:11px;color:#64748b;margin:0 0 10px" },
      "Each cap penalises any teacher or class whose daily count for that tag exceeds max. Tag lessons via the Lesson dialog's Activity tags field.");
    body.appendChild(intro);

    const table = el("table", { style: "width:100%;border-collapse:collapse;font-size:12px" });
    const thead = el("thead", null, el("tr", null,
      el("th", { style: "text-align:left;padding:4px 6px;border-bottom:1px solid #e2e8f0" }, "Tag"),
      el("th", { style: "text-align:left;padding:4px 6px;border-bottom:1px solid #e2e8f0" }, "Scope"),
      el("th", { style: "text-align:right;padding:4px 6px;border-bottom:1px solid #e2e8f0" }, "Max"),
      el("th", { style: "border-bottom:1px solid #e2e8f0" }, "")));
    table.appendChild(thead);
    const tbody = el("tbody");
    table.appendChild(tbody);

    function renderRow(c, idx) {
      const tr = el("tr");
      const tagIn = el("input", { type: "text", value: c.tag || "",
        style: "width:100%;padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px",
        oninput: e => c.tag = e.target.value });
      const scopeIn = el("select",
        { style: "padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px",
          onchange: e => c.scope = e.target.value });
      ["teacher", "class"].forEach(s => {
        const o = el("option", { value: s }, s);
        if (s === c.scope) o.selected = true;
        scopeIn.appendChild(o);
      });
      const maxIn = el("input", { type: "number", min: "1", max: "10", value: c.max || 1,
        style: "width:60px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;text-align:right",
        oninput: e => c.max = parseInt(e.target.value, 10) || 1 });
      const del = el("button", { type: "button",
        style: "background:none;border:0;cursor:pointer;color:#dc2626;font-size:14px",
        onclick: () => { caps.splice(idx, 1); rerender(); } }, "×");
      tr.appendChild(el("td", { style: "padding:3px 6px" }, tagIn));
      tr.appendChild(el("td", { style: "padding:3px 6px" }, scopeIn));
      tr.appendChild(el("td", { style: "padding:3px 6px;text-align:right" }, maxIn));
      tr.appendChild(el("td", { style: "padding:3px 6px;text-align:right" }, del));
      tbody.appendChild(tr);
    }
    function rerender() {
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
      caps.forEach((c, i) => renderRow(c, i));
    }
    rerender();
    body.appendChild(table);

    const add = el("button", { type: "button", class: "chrx-btn",
      style: "margin-top:8px;font-size:12px",
      onclick: () => { caps.push({ tag: "", scope: "teacher", max: 2 }); rerender(); } },
      "+ Add cap");
    body.appendChild(add);

    const close = el("button", { type: "button", class: "chrx-btn",
      onclick: () => D.closeSheet() }, "Close");
    const saveBtn = el("button", { type: "button", class: "chrx-btn chrx-btn--primary",
      onclick: () => {
        APP.school.settings.tagDailyCaps = caps.filter(c => c.tag && c.tag.trim());
        if (APP.audit && APP.audit.append) {
          APP.audit.append({ entity: "settings", op: "tagDailyCaps",
            after: APP.school.settings.tagDailyCaps.slice() });
        }
        D.closeSheet();
        (window._chrxNotify || function () {})("Tag caps saved", "info");
      } }, "Save");
    body.appendChild(el("div", { style: "display:flex;justify-content:flex-end;gap:8px;margin-top:14px;border-top:1px solid #e2e8f0;padding-top:10px" },
      close, saveBtn));

    D.openSheet(body, { title: "Tag daily caps" });
  }

  window.addEventListener("app:tag-caps", open);
  global.TagCapsDialog = { open, load };
})(window);
