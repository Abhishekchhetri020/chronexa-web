/* Chronexa Command Palette (cmd-K)
 *
 * Public API:
 *   Palette.mount(rootEl?)            -- one-time DOM setup. Default body.
 *   Palette.register(commands)        -- supply a list of items.
 *   Palette.open()                    -- show, autofocus the input.
 *   Palette.close()                   -- hide.
 *   Palette.onSelect(handler)         -- subscribe.
 *
 * Command shape:
 *   { id, label, crumb?, group, hue?, recent?, action? }
 *
 * Built-in groups (insertion order preserved, defaults shown below):
 *   "Recent" → "Lessons" → "Teachers" → "Classes" → "Actions"
 *
 * Keyboard:
 *   ⌘K / Ctrl+K      open
 *   Esc              close
 *   ↑/↓              navigate
 *   Enter            select
 *   Type to filter
 *
 * a11y:
 *   - role="combobox" / listbox + aria-activedescendant
 *   - announce result count on filter change
 *   - return focus to opener on close
 */
(function (global) {
  "use strict";

  const GROUP_ORDER = ["Recent", "Lessons", "Teachers", "Classes", "Actions"];
  let root, scrim, panel, input, results, hint, idCounter = 0;
  let allCommands = [];
  let filtered = [];
  let activeIdx = 0;
  let listeners = [];
  let opener = null;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function mount(host) {
    if (panel) return panel;
    root = host || document.body;

    scrim = el("div", {
      class: "chrx-command-palette__scrim",
      "aria-hidden": "true",
      onclick: close_,
    });

    panel = el("div", {
      class: "chrx-command-palette",
      role: "combobox",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      "aria-owns": "chrx-palette-listbox",
    });

    const searchRow = el("div", { class: "chrx-command-palette__search" });
    const icon = el("span", { class: "chrx-command-palette__search-icon", "aria-hidden": "true" }, "⌕");
    input = el("input", {
      class: "chrx-command-palette__input",
      type: "search",
      placeholder: "Jump to lesson, teacher, class, room, or action…",
      "aria-label": "Search commands",
      "aria-controls": "chrx-palette-listbox",
      "aria-autocomplete": "list",
      autocomplete: "off",
      spellcheck: "false",
      oninput: onInput,
      onkeydown: onInputKey,
    });
    const kbd = el("span", { class: "chrx-kbd" }, "⌘K");
    searchRow.append(icon, input, kbd);

    results = el("div", {
      class: "chrx-command-palette__results",
      role: "listbox",
      id: "chrx-palette-listbox",
    });

    hint = el("div", { class: "chrx-command-palette__hint" },
      el("span", null, el("span", { class: "chrx-kbd" }, "↑↓"), "Navigate"),
      el("span", null, el("span", { class: "chrx-kbd" }, "↵"), "Select"),
      el("span", null, el("span", { class: "chrx-kbd" }, "esc"), "Close"),
    );

    panel.append(searchRow, results, hint);
    root.append(scrim, panel);

    // Live region
    const live = el("div", {
      class: "chrx-sr-only", "aria-live": "polite", id: "chrx-palette-live",
    });
    root.append(live);
    panel._live = live;

    document.addEventListener("keydown", onGlobalKey);
    return panel;
  }

  function register(cmds) {
    allCommands = Array.isArray(cmds) ? cmds.slice() : [];
    filtered = allCommands.slice();
    if (panel?.classList.contains("is-open")) renderResults();
  }

  function open_() {
    if (!panel) mount();
    opener = document.activeElement;
    filtered = allCommands.slice();
    activeIdx = 0;
    input.value = "";
    panel.classList.add("is-open");
    scrim.classList.add("is-open");
    panel.setAttribute("aria-expanded", "true");
    renderResults();
    // setTimeout to avoid focus race when triggered via key inside a button
    setTimeout(() => input.focus(), 0);
  }

  function close_() {
    if (!panel) return;
    panel.classList.remove("is-open");
    scrim.classList.remove("is-open");
    panel.setAttribute("aria-expanded", "false");
    if (opener && document.body.contains(opener)) opener.focus();
  }

  function onInput() {
    const q = (input.value || "").trim().toLowerCase();
    if (!q) filtered = allCommands.slice();
    else {
      filtered = allCommands.filter((c) => {
        const s = (c.label + " " + (c.crumb || "")).toLowerCase();
        return s.includes(q);
      });
    }
    activeIdx = 0;
    renderResults();
    panel._live.textContent = `${filtered.length} result${filtered.length === 1 ? "" : "s"}.`;
  }

  function onInputKey(e) {
    if (e.key === "ArrowDown")    { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter")   { e.preventDefault(); selectActive(); }
    else if (e.key === "Escape")  { e.preventDefault(); close_(); }
  }

  function onGlobalKey(e) {
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (panel?.classList.contains("is-open")) close_();
      else open_();
    }
  }

  function move(delta) {
    if (!filtered.length) return;
    activeIdx = (activeIdx + delta + filtered.length) % filtered.length;
    updateActiveDescendant();
  }

  function updateActiveDescendant() {
    Array.from(results.querySelectorAll(".chrx-command-palette__row")).forEach((row, i) => {
      row.classList.toggle("is-active", i === activeIdx);
      row.setAttribute("aria-selected", i === activeIdx ? "true" : "false");
      if (i === activeIdx) {
        input.setAttribute("aria-activedescendant", row.id);
        row.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function selectActive() {
    const cmd = filtered[activeIdx];
    if (!cmd) return;
    emit(cmd);
    if (cmd.action && typeof cmd.action === "function") {
      try { cmd.action(cmd); } catch {}
    }
    close_();
  }

  function renderResults() {
    results.innerHTML = "";
    if (!filtered.length) {
      results.append(el("div", { class: "chrx-command-palette__group-head" }, "No results"));
      return;
    }
    // Bucket by group
    const buckets = new Map();
    for (const c of filtered) {
      const g = c.group || "Other";
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g).push(c);
    }
    // Stable ordering
    const groups = [];
    for (const g of GROUP_ORDER) if (buckets.has(g)) groups.push(g);
    for (const g of buckets.keys()) if (!GROUP_ORDER.includes(g)) groups.push(g);

    let globalIdx = 0;
    for (const g of groups) {
      results.append(el("div", { class: "chrx-command-palette__group-head" }, g));
      for (const c of buckets.get(g)) {
        const rowId = `chrx-cmd-row-${++idCounter}`;
        const row = el("div", {
          class: "chrx-command-palette__row" + (globalIdx === activeIdx ? " is-active" : ""),
          role: "option",
          id: rowId,
          "aria-selected": globalIdx === activeIdx ? "true" : "false",
          onclick: ((i) => () => { activeIdx = i; selectActive(); })(globalIdx),
          onmouseenter: ((i) => () => { activeIdx = i; updateActiveDescendant(); })(globalIdx),
        });
        const iconAttrs = { class: "chrx-command-palette__row-icon" };
        if (c.hue != null) {
          iconAttrs["data-hue"] = "1";
          iconAttrs.style = `--chrx-row-hue: ${c.hue}`;
        }
        row.append(el("span", iconAttrs, c.iconText || (c.label || "?").slice(0,1).toUpperCase()));
        row.append(el("div", { class: "chrx-command-palette__row-text" },
          el("div", { class: "chrx-command-palette__row-label" }, c.label || ""),
          c.crumb ? el("div", { class: "chrx-command-palette__row-crumb" }, c.crumb) : null,
        ));
        if (globalIdx === activeIdx) input.setAttribute("aria-activedescendant", rowId);
        results.append(row);
        globalIdx++;
      }
    }
  }

  function onSelect(handler) {
    listeners.push(handler);
    return () => { listeners = listeners.filter((l) => l !== handler); };
  }
  function emit(cmd) { listeners.forEach((h) => { try { h(cmd); } catch {} }); }

  global.Palette = { mount, register, open: open_, close: close_, onSelect };
})(typeof window !== "undefined" ? window : globalThis);
