/* Chronexa — "Conditions for this run" dialog (aSc Draft generation).
 *
 * One switch per constraint family. Off families are stripped from the
 * solver's copy by SolverUI.run (run_conditions.js); the file keeps them,
 * and the Relaxed conditions report still lists what they break.
 *
 * Public API: SolverUI.RunConditions.open({ onClose? }), .offCount(school)
 */
import { listFamilies, offSet } from "../../solver/run_conditions.js";
import { TYPS } from "../../solver/relation_enforcer.js";

(function (global) {
  "use strict";
  let host, list, onCloseCb;

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

  const labels = () => Object.fromEntries(Object.entries(TYPS).map(([k, v]) => [k, v.label]));

  function save(off) {
    const A = global.APP;
    const write = (s) => { s.globals = s.globals || {}; s.globals.runConditions = { off: [...off] }; };
    if (A && typeof A.mutate === "function") A.mutate("Conditions for this run", () => write(A.school));
    else write(A.school);
  }

  function build() {
    host = el("div", { class: "csu-backdrop chrx-runcond", role: "presentation", "aria-hidden": "true" });
    const dlg = el("section", { class: "csu-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "chrx-runcond-title" });
    list = el("div", { class: "chrx-runcond__list" });
    const allOn = el("button", { type: "button", class: "chrx-btn", onclick: () => {
      list.querySelectorAll("input[type=checkbox]").forEach((b) => { b.checked = true; });
    } }, "All on");
    const done = el("button", { type: "button", class: "chrx-btn chrx-btn--primary", onclick: () => {
      const off = [...list.querySelectorAll("input[type=checkbox]")].filter((b) => !b.checked).map((b) => b.dataset.family);
      save(off); hide();
    } }, "Save");
    dlg.append(
      el("h2", { class: "csu-dialog__title", id: "chrx-runcond-title" }, "Conditions for this run"),
      el("p", { class: "csu-dialog__sub" },
        "Switch a family off to get a quick draft without it, then switch it back on for the real run. Your file keeps every condition; only the solver skips the ones that are off."),
      list, el("div", { class: "csu-dialog__actions" }, allOn, done));
    host.appendChild(dlg);
    document.body.appendChild(host);
    host.addEventListener("click", (e) => { if (e.target === host) hide(); });
    host.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  }

  function hide() {
    if (!host) return;
    host.classList.remove("is-open"); host.setAttribute("aria-hidden", "true");
    if (onCloseCb) { const cb = onCloseCb; onCloseCb = null; try { cb(); } catch (e) { console.error(e); } }
  }

  function open(opts) {
    const school = global.APP && global.APP.school;
    if (!school) return;
    if (!host) build();
    onCloseCb = opts && opts.onClose;
    const off = offSet(school);
    const fams = listFamilies(school, labels());
    list.innerHTML = "";
    if (!fams.length) list.appendChild(el("p", null, "This file has no card relationships or limits to switch."));
    let group = null;
    for (const f of fams) {
      if (f.group !== group) { group = f.group; list.appendChild(el("h3", { class: "chrx-runcond__h" }, group)); }
      const box = el("input", { type: "checkbox", "data-family": f.id });
      box.checked = !off.has(f.id);
      list.appendChild(el("label", { class: "chrx-runcond__row" }, box,
        el("span", { class: "chrx-runcond__label" }, f.label), el("span", { class: "chrx-runcond__count" }, String(f.count))));
    }
    host.classList.add("is-open"); host.setAttribute("aria-hidden", "false");
    host.querySelector(".chrx-btn--primary").focus();
  }

  function offCount(school) { return school ? offSet(school).size : 0; }

  global.SolverUI = global.SolverUI || {};
  global.SolverUI.RunConditions = { open, offCount };
  global.addEventListener("app:run-conditions", () => open());
})(typeof window !== "undefined" ? window : globalThis);
