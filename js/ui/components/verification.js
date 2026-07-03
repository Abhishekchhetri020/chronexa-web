/* Chronexa Verification Panel (bottom drawer)
 *
 * Public API:
 *   Verification.mount(rootEl?)         -- one-time DOM init
 *   Verification.update(violations)     -- replace the list
 *   Verification.open(), .close(), .toggle()
 *   Verification.onSelect(handler)      -- click on a violation row
 *
 * violations: Array<{
 *   id?:        string,
 *   kind:       "Teacher" | "Class" | "Room" | string,   // groups by this
 *   level:      "hard" | "soft",
 *   title:      string,
 *   body?:      string,
 *   cardId?:    string,
 * }>
 *
 * The drawer renders three default sections in this order:
 *   Teachers → Classes → Rooms
 * Any other `kind` falls through into an "Other" bucket.
 *
 * a11y: the handle bar is a button (aria-expanded). Each violation row
 * is role=button with tabindex. Section toggle uses aria-expanded too.
 */
(function (global) {
  "use strict";

  const KIND_GROUP = {
    teacher: "Teachers", teachers: "Teachers",
    class:   "Classes",  classes:  "Classes",
    room:    "Rooms",    rooms:    "Rooms",
  };
  const GROUP_ORDER = ["Teachers", "Classes", "Rooms"];

  let panel, handle, body, chip, title, live;
  let listeners = [];
  let root;
  let current = [];

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

  function mount(host) {
    if (panel) return panel;
    root = host || document.body;

    panel = el("section", {
      class: "chrx-verification-panel",
      "aria-label": "Verification results",
    });

    handle = el("button", {
      class: "chrx-verification-panel__handle",
      type: "button",
      "aria-expanded": "false",
      "aria-controls": "chrx-verify-body",
      onclick: toggle,
    });
    title = el("span", { class: "chrx-verification-panel__title" }, "Verification");
    chip  = el("span", { class: "chrx-verification-panel__chip chrx-verification-panel__chip--ok" }, "0 issues");
    const spacer = el("span", { class: "chrx-verification-panel__spacer", style: "flex:1" });
    handle.append(title, chip, spacer);
    panel.append(handle);

    body = el("div", { class: "chrx-verification-panel__body", id: "chrx-verify-body" });
    panel.append(body);

    live = el("div", { class: "chrx-sr-only", "aria-live": "polite" });
    panel.append(live);

    root.append(panel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.classList.contains("is-open")) close_();
    });
    return panel;
  }

  function open_() {
    if (!panel) mount();
    panel.classList.add("is-open");
    handle.setAttribute("aria-expanded", "true");
    live.textContent = `Verification drawer open. ${current.length} violation${current.length === 1 ? "" : "s"}.`;
  }
  function close_() {
    if (!panel) return;
    panel.classList.remove("is-open");
    handle.setAttribute("aria-expanded", "false");
  }
  function toggle() {
    if (!panel) return;
    if (panel.classList.contains("is-open")) close_(); else open_();
  }

  function update(violations) {
    if (!panel) mount();
    current = Array.isArray(violations) ? violations.slice() : [];
    paint();
  }

  function paint() {
    body.innerHTML = "";
    const total = current.length;
    chip.textContent = total === 0 ? "All green" : `${total} issue${total === 1 ? "" : "s"}`;
    chip.classList.toggle("chrx-verification-panel__chip--ok", total === 0);

    if (!total) {
      body.append(el("div", { class: "chrx-verification-section" },
        el("div", { class: "chrx-verification-section__head" },
          el("span", { class: "chrx-verification-section__chev" }, "›"),
          el("span", { class: "chrx-verification-section__name" }, "No conflicts detected"),
        ),
      ));
      return;
    }

    const buckets = new Map();
    for (const v of current) {
      const g = KIND_GROUP[(v.kind || "").toLowerCase()] || (v.kind ? capitalize(v.kind) + "s" : "Other");
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g).push(v);
    }
    const order = [...GROUP_ORDER, ...[...buckets.keys()].filter((g) => !GROUP_ORDER.includes(g))];

    for (const g of order) {
      const items = buckets.get(g);
      if (!items?.length) continue;
      const sec = el("div", { class: "chrx-verification-section is-open" });
      const errors = items.filter((i) => i.level === "hard").length;
      const head = el("button", {
        class: "chrx-verification-section__head",
        type: "button",
        "aria-expanded": "true",
        "aria-controls": `chrx-verify-grp-${g.toLowerCase().replace(/\s+/g, '-')}`,
        onclick: () => {
          const open = sec.classList.toggle("is-collapsed");
          head.setAttribute("aria-expanded", String(!open));
          sec.classList.toggle("is-open", !open);
        },
      });
      head.append(
        el("span", { class: "chrx-verification-section__chev", "aria-hidden": "true" }, "›"),
        el("span", { class: "chrx-verification-section__name" }, g),
        el("span", {
          class: "chrx-verification-section__count" + (errors ? " chrx-verification-section__count--error" : ""),
        }, String(items.length)),
      );
      sec.append(head);

      const rows = el("div", {
        class: "chrx-verification-section__rows",
        id: `chrx-verify-grp-${g.toLowerCase().replace(/\s+/g, '-')}`,
      });
      for (const v of items) {
        const row = el("div", {
          class: "chrx-violation chrx-violation--" + (v.level || "soft"),
          role: "button",
          tabindex: "0",
          "aria-label": `${v.level === "hard" ? "Hard" : "Soft"} violation: ${v.title}${v.body ? ". " + v.body : ""}`,
          onclick: () => emit(v),
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); emit(v); } },
        },
          el("div", { class: "chrx-violation__icon", "aria-hidden": "true" }, v.level === "hard" ? "■" : "▲"),
          el("div", { class: "chrx-violation__text" },
            el("div", { class: "chrx-violation__title" }, v.title || "Violation"),
            v.body ? el("div", { class: "chrx-violation__body" }, v.body) : null,
          ),
        );
        rows.append(row);
      }
      sec.append(rows);
      body.append(sec);
    }
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function onSelect(h) { listeners.push(h); return () => listeners = listeners.filter((l) => l !== h); }
  function emit(v) { listeners.forEach((h) => { try { h(v); } catch {} }); }

  global.Verification = { mount, update, open: open_, close: close_, toggle, onSelect };
})(typeof window !== "undefined" ? window : globalThis);

// [vite-esm] exports auto-generated by the 2026-07 Vite migration.
export const Verification = window.Verification;
