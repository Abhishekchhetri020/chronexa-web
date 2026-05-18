/* Chronexa Time-Off Matrix
 *
 * Render a days × periods tri-state matrix.
 * Click cycle:  available → preferred → unavailable → available
 *
 * Public API:
 *   TimeOff.render(host, opts)        -> { getState(), setState(state), destroy() }
 *
 * opts = {
 *   title?:       string,             // e.g. "Ms. Sharma · time-off"
 *   subtitle?:    string,
 *   days?:        string[],            // default Mon..Sat
 *   periods?:     number,             // default 8
 *   state?:       Record<string, "available"|"preferred"|"unavailable">,
 *                                      // key = `${dayIdx}_${periodIdx}` (period is 1-based)
 *   onChange?:    (newState, change) => void,
 * }
 *
 * Default behavior: missing keys are treated as "available".
 *
 * a11y: every cell is a button with aria-label describing day/period/state.
 */
(function (global) {
  "use strict";

  const NEXT = { available: "preferred", preferred: "unavailable", unavailable: "available" };
  const GLYPH = { available: "✓", preferred: "?", unavailable: "✗" };
  const LABEL = { available: "Available", preferred: "Conditional", unavailable: "Unavailable" };
  const DAYS_DEFAULT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

  function key(d, p) { return `${d}_${p}`; }

  function render(host, opts) {
    opts = opts || {};
    const days = opts.days || DAYS_DEFAULT;
    const periods = opts.periods || 8;
    let state = Object.assign({}, opts.state || {});

    const wrap = el("section", {
      class: "chrx-time-off-matrix",
      role: "group",
      "aria-label": opts.title || "Time-off matrix",
    });
    wrap.style.setProperty("--chrx-periods", String(periods));

    if (opts.title || opts.subtitle) {
      const head = el("div", { class: "chrx-time-off-matrix__head" });
      const txt = el("div");
      if (opts.title)    txt.append(el("h3", { class: "chrx-time-off-matrix__title" }, opts.title));
      if (opts.subtitle) txt.append(el("div", { class: "chrx-time-off-matrix__sub" }, opts.subtitle));
      head.append(txt);
      wrap.append(head);
    }

    const table = el("div", { class: "chrx-time-off-matrix__table" });

    // Header row
    table.append(el("div", { class: "chrx-time-off-matrix__th is-day" }, "Day"));
    for (let p = 1; p <= periods; p++) {
      table.append(el("div", { class: "chrx-time-off-matrix__th" }, `P${p}`));
    }
    // Body rows
    for (let d = 0; d < days.length; d++) {
      table.append(el("div", { class: "chrx-time-off-matrix__row-label" }, days[d]));
      for (let p = 1; p <= periods; p++) {
        const k = key(d, p);
        const s = state[k] || "available";
        const cell = el("button", {
          class: "chrx-time-off-matrix__cell",
          type: "button",
          "data-state": s,
          "data-day": String(d),
          "data-period": String(p),
          "aria-label": `${days[d]} period ${p}: ${LABEL[s]}. Press to change.`,
          onclick: onClick,
          onkeydown: onKey,
        });
        cell.textContent = GLYPH[s];
        table.append(cell);
      }
    }
    wrap.append(table);

    // Legend
    const legend = el("div", { class: "chrx-time-off-matrix__legend" });
    for (const s of ["available", "preferred", "unavailable"]) {
      legend.append(el("span", { class: "chrx-time-off-matrix__legend-chip" },
        el("span", {
          class: "chrx-time-off-matrix__cell", "data-state": s,
          style: "width:18px;height:18px;font-size:10px;cursor:default;pointer-events:none;",
        }, GLYPH[s]),
        LABEL[s],
      ));
    }
    wrap.append(legend);

    // Live region
    const live = el("div", { class: "chrx-sr-only", "aria-live": "polite" });
    wrap.append(live);

    host.append(wrap);

    function onClick(e) {
      e.preventDefault();
      cycle(e.currentTarget);
    }
    function onKey(e) {
      const t = e.currentTarget;
      const d = +t.dataset.day, p = +t.dataset.period;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycle(t); }
      else if (e.key === "ArrowRight") move(d, p + 1);
      else if (e.key === "ArrowLeft")  move(d, p - 1);
      else if (e.key === "ArrowDown")  move(d + 1, p);
      else if (e.key === "ArrowUp")    move(d - 1, p);
    }
    function move(d, p) {
      if (d < 0 || d >= days.length || p < 1 || p > periods) return;
      const next = table.querySelector(
        `.chrx-time-off-matrix__cell[data-day="${d}"][data-period="${p}"]`,
      );
      if (next) next.focus();
    }
    function cycle(cell) {
      const d = +cell.dataset.day, p = +cell.dataset.period;
      const cur = cell.dataset.state || "available";
      const nxt = NEXT[cur];
      cell.dataset.state = nxt;
      cell.textContent = GLYPH[nxt];
      cell.setAttribute("aria-label", `${days[d]} period ${p}: ${LABEL[nxt]}. Press to change.`);
      const k = key(d, p);
      state[k] = nxt;
      live.textContent = `${days[d]} P${p}: ${LABEL[nxt]}.`;
      if (typeof opts.onChange === "function") {
        try { opts.onChange(Object.assign({}, state), { day: d, period: p, state: nxt }); }
        catch {}
      }
    }

    return {
      getState() { return Object.assign({}, state); },
      setState(next) {
        state = Object.assign({}, next || {});
        for (let d = 0; d < days.length; d++) for (let p = 1; p <= periods; p++) {
          const k = key(d, p);
          const s = state[k] || "available";
          const cell = table.querySelector(
            `.chrx-time-off-matrix__cell[data-day="${d}"][data-period="${p}"]`,
          );
          if (cell) { cell.dataset.state = s; cell.textContent = GLYPH[s]; }
        }
      },
      destroy() { wrap.remove(); },
      el: wrap,
    };
  }

  global.TimeOff = { render };
})(typeof window !== "undefined" ? window : globalThis);
