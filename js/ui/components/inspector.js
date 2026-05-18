/* Chronexa Inspector Panel
 * Side sheet (>=md) / bottom sheet (<md) that opens on a grid cell click.
 *
 * Public API:
 *   Inspector.mount(rootEl?)       -- create the DOM once. Defaults to <body>.
 *   Inspector.open(card, opts?)    -- show the panel populated by `card`.
 *   Inspector.close()              -- hide.
 *   Inspector.onAction(handler)    -- subscribe to footer button clicks.
 *
 * `card` shape (mirrors docs/DATA_SHAPES.md cards entry + view helpers):
 *   {
 *     lessonId: string,
 *     subject: { name: string, slug: string },   // slug -> data-subject hue
 *     class:   { name: string, count?: number },
 *     teacher: { name: string, abbr?: string },
 *     room:    { name: string, floor?: string },
 *     day: number,                                // 0-5
 *     period: number,                             // 1-based
 *     time: { start: string, end: string },       // "8:30"
 *     locked?: boolean,
 *     conflicts?: Array<{ kind, level, msg }>,
 *     checks?: Array<{ ok: boolean, label: string, value?: string }>,
 *     notes?: string,
 *   }
 *
 * Accessibility:
 *   - role="dialog", aria-modal, aria-labelledby on the panel
 *   - focus trapped inside while open
 *   - Esc closes (registered globally)
 *   - announce on open via the live region attached to the body
 */
(function (global) {
  "use strict";

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let root, panel, els, listeners = [], lastFocus = null;
  let activeCard = null;

  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function") {
          node.addEventListener(k.slice(2), attrs[k]);
        } else node.setAttribute(k, attrs[k]);
      }
    }
    for (const kid of kids) {
      if (kid == null) continue;
      node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return node;
  }

  function mount(host) {
    if (panel) return panel;
    root = host || document.body;

    panel = el("aside", {
      class: "chrx-inspector-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "chrx-inspector-title",
      "aria-hidden": "true",
      tabindex: "-1",
    });

    const head = el("div", { class: "chrx-inspector-panel__head" });
    const flag = el("div", { class: "chrx-inspector-panel__flag" });
    const txt  = el("div", { class: "chrx-inspector-panel__text" });
    const eye  = el("div", { class: "chrx-inspector-panel__eye" }, "Lesson card");
    const title = el("h2", { class: "chrx-inspector-panel__title", id: "chrx-inspector-title" }, "");
    const sub   = el("div", { class: "chrx-inspector-panel__sub" }, "");
    const close = el("button", {
      class: "chrx-inspector-panel__close",
      type: "button",
      "aria-label": "Close inspector",
      onclick: close_,
    }, "×");
    txt.append(eye, title, sub);
    head.append(flag, txt, close);

    const tabsEl = el("div", { class: "chrx-inspector-panel__tabs", role: "tablist" });
    const tabBtns = ["Details", "Conflicts", "History"].map((name, i) => {
      const b = el("button", {
        class: "chrx-inspector-panel__tab" + (i === 0 ? " is-on" : ""),
        type: "button",
        role: "tab",
        "aria-selected": i === 0 ? "true" : "false",
        "data-tab": name.toLowerCase(),
        onclick: () => switchTab(name.toLowerCase()),
      }, name);
      tabsEl.append(b);
      return b;
    });

    const body = el("div", { class: "chrx-inspector-panel__body", role: "tabpanel" });
    const foot = el("div", { class: "chrx-inspector-panel__foot" });
    const lockBtn = el("button", {
      class: "chrx-btn",
      type: "button",
      onclick: () => emit("toggle-lock", activeCard),
    }, "Lock");
    const dupBtn = el("button", {
      class: "chrx-btn",
      type: "button",
      onclick: () => emit("duplicate", activeCard),
    }, "Duplicate");
    const editBtn = el("button", {
      class: "chrx-btn chrx-btn--primary",
      type: "button",
      onclick: () => emit("edit", activeCard),
    }, "Edit lesson");
    foot.append(lockBtn, dupBtn, editBtn);

    panel.append(head, tabsEl, body, foot);
    root.append(panel);

    // Live region for VO announcements
    const live = el("div", {
      class: "chrx-sr-only", "aria-live": "polite", id: "chrx-inspector-live",
    });
    root.append(live);

    els = { flag, title, sub, body, lockBtn, dupBtn, editBtn, tabBtns, live };

    document.addEventListener("keydown", onKey);
    return panel;
  }

  function open_(card) {
    if (!panel) mount();
    activeCard = card;
    lastFocus = document.activeElement;

    // Hue: subject slug drives the flag color via CSS custom prop
    const hue = card.subject && card.subject.slug
      ? `var(--chrx-hue-${card.subject.slug})` : "220";
    panel.style.setProperty("--chrx-cell-hue", hue);

    els.title.textContent = `${card.subject?.name || "Lesson"} · ${card.class?.name || ""}`;
    const day = DAYS[card.day] || "—";
    const time = card.time ? ` · ${card.time.start} – ${card.time.end}` : "";
    els.sub.textContent = `${day} · Period ${card.period}${time}`;
    els.lockBtn.textContent = card.locked ? "Unlock" : "Lock";
    els.lockBtn.setAttribute("aria-pressed", card.locked ? "true" : "false");

    renderTab("details", card);

    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    els.live.textContent = `Inspecting ${card.subject?.name || "lesson"} for ${card.class?.name || ""} on ${day} period ${card.period}.`;
    // Focus the close button (predictable tab order)
    panel.querySelector(".chrx-inspector-panel__close").focus();
  }

  function close_() {
    if (!panel) return;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    els.live.textContent = "Inspector closed.";
    activeCard = null;
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  }

  function switchTab(name) {
    els.tabBtns.forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (activeCard) renderTab(name, activeCard);
  }

  function renderTab(name, card) {
    const body = els.body;
    body.innerHTML = "";
    if (name === "details") body.append(renderDetails(card));
    else if (name === "conflicts") body.append(renderConflicts(card));
    else if (name === "history") body.append(renderHistory(card));
  }

  function renderDetails(card) {
    const wrap = document.createDocumentFragment();
    const sec = el("div", { class: "chrx-inspector-panel__section" }, el("h3", null, "Properties"));
    const kvs = [
      ["Subject", card.subject?.name || "—"],
      ["Class",   card.class?.name + (card.class?.count != null ? ` · ${card.class.count} students` : "")],
      ["Teacher", card.teacher?.name + (card.teacher?.abbr ? ` (${card.teacher.abbr})` : "")],
      ["Room",    card.room?.name + (card.room?.floor ? ` · ${card.room.floor}` : "")],
      ["Duration", card.duration || "1 period"],
      ["Lock", card.locked ? "Locked" : "Unlocked"],
    ];
    for (const [k, v] of kvs) {
      sec.append(el("div", { class: "chrx-inspector-panel__kv" },
        el("span", { class: "k" }, k),
        el("span", { class: "v" }, v || "—"),
      ));
    }
    wrap.append(sec);

    if (card.checks && card.checks.length) {
      const checks = el("div", { class: "chrx-inspector-panel__section" }, el("h3", null, "Constraint checks"));
      const list = el("div", { class: "checks" });
      for (const c of card.checks) {
        const row = el("div", { class: "chrx-inspector-panel__kv" },
          el("span", { class: "k" }, c.ok ? "✓" : "!"),
          el("span", { class: "v" }, `${c.label}${c.value ? " — " + c.value : ""}`),
        );
        list.append(row);
      }
      checks.append(list);
      wrap.append(checks);
    }

    if (card.notes != null) {
      const ns = el("div", { class: "chrx-inspector-panel__section" }, el("h3", null, "Notes"));
      const ta = el("textarea", {
        class: "chrx-inspector-panel__notes",
        "aria-label": "Notes for this card",
        placeholder: "Add a note for this card…",
        rows: 3,
      });
      ta.value = card.notes;
      ta.addEventListener("change", () => emit("note", { card, value: ta.value }));
      ns.append(ta);
      wrap.append(ns);
    }
    return wrap;
  }

  function renderConflicts(card) {
    const sec = el("div", { class: "chrx-inspector-panel__section" }, el("h3", null, "Conflicts"));
    const list = card.conflicts || [];
    if (!list.length) {
      sec.append(el("div", { class: "chrx-inspector-panel__kv" },
        el("span", { class: "k" }, "Status"),
        el("span", { class: "v" }, "No conflicts."),
      ));
    } else {
      for (const c of list) {
        const cls = "chrx-violation chrx-violation--" + (c.level || "soft");
        const row = el("div", { class: cls, role: "button", tabindex: "0" },
          el("div", { class: "chrx-violation__icon" }, c.level === "hard" ? "■" : "▲"),
          el("div", null,
            el("div", { class: "chrx-violation__title" }, c.kind || "Conflict"),
            el("div", { class: "chrx-violation__body" }, c.msg || ""),
          ),
        );
        sec.append(row);
      }
    }
    return sec;
  }

  function renderHistory(card) {
    const sec = el("div", { class: "chrx-inspector-panel__section" }, el("h3", null, "Recent activity"));
    const items = card.history || [];
    if (!items.length) {
      sec.append(el("div", { class: "chrx-inspector-panel__kv" },
        el("span", { class: "k" }, "—"),
        el("span", { class: "v" }, "No history yet."),
      ));
    } else {
      for (const it of items) {
        sec.append(el("div", { class: "chrx-inspector-panel__kv" },
          el("span", { class: "k" }, it.when || ""),
          el("span", { class: "v" }, `${it.text || ""}${it.author ? " — " + it.author : ""}`),
        ));
      }
    }
    return sec;
  }

  function onKey(e) {
    if (!panel?.classList.contains("is-open")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close_();
    } else if (e.key === "Tab") {
      // Trap focus
      const f = panel.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  }

  function onAction(handler) {
    listeners.push(handler);
    return () => { listeners = listeners.filter((l) => l !== handler); };
  }
  function emit(action, payload) { listeners.forEach((h) => { try { h(action, payload); } catch {} }); }

  global.Inspector = { mount, open: open_, close: close_, onAction };
})(typeof window !== "undefined" ? window : globalThis);
