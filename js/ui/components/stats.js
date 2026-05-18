/* Chronexa Stats Panel
 *
 * Public API:
 *   Stats.render(host, data)        -> { update(data), destroy() }
 *
 * data = {
 *   title?:     string,
 *   kpis:       Array<{
 *     label:    string,
 *     value:    string | number,
 *     meta?:    string,
 *     tone?:    "default" | "green" | "red" | "orange" | "purple",
 *     icon?:    string,
 *   }>,
 *   sections?:  Array<{
 *     title:    string,
 *     meta?:    string,
 *     bars:     Array<{
 *       name:   string,
 *       value:  number,           // 0..max
 *       max?:   number,           // default = max of values in this section
 *       count?: string | number,  // display string (right column)
 *       tone?:  "default" | "green" | "orange" | "red",
 *     }>,
 *   }>,
 * }
 *
 * a11y: each bar is role="meter" with aria-valuenow / aria-valuemax.
 */
(function (global) {
  "use strict";

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function render(host, data) {
    const wrap = el("section", { class: "chrx-stats-panel", "aria-label": data?.title || "Statistics" });

    if (data?.title) {
      const head = el("div", { class: "chrx-stats-panel__head" });
      head.append(el("h2", { class: "chrx-stats-panel__title" }, data.title));
      wrap.append(head);
    }

    const metrics = el("div", { class: "chrx-stats-panel__metrics" });
    wrap.append(metrics);

    function paint(d) {
      // KPIs
      metrics.innerHTML = "";
      const kpis = d?.kpis || [];
      for (const k of kpis) {
        const tile = el("div", {
          class: "chrx-stats-tile" + (k.tone && k.tone !== "default" ? ` chrx-stats-tile--${k.tone}` : ""),
        });
        const hd = el("div", { class: "chrx-stats-tile__head" });
        hd.append(el("div", { class: "chrx-stats-tile__icon", "aria-hidden": "true" }, k.icon || (k.label || "?").slice(0,1)));
        hd.append(el("div", { class: "chrx-stats-tile__label" }, k.label || ""));
        tile.append(hd);
        tile.append(el("div", { class: "chrx-stats-tile__value", "aria-label": `${k.label}: ${k.value}` }, String(k.value)));
        if (k.meta) tile.append(el("div", { class: "chrx-stats-tile__meta" }, k.meta));
        metrics.append(tile);
      }

      // Existing sections (clear all but metrics)
      while (wrap.lastElementChild && wrap.lastElementChild !== metrics &&
             wrap.lastElementChild.classList?.contains("chrx-stats-panel__section")) {
        wrap.lastElementChild.remove();
      }
      // We need to remove every prior section regardless of position
      Array.from(wrap.querySelectorAll(".chrx-stats-panel__section")).forEach((s) => s.remove());

      // Bar sections
      const sections = d?.sections || [];
      for (const sec of sections) {
        const secEl = el("div", { class: "chrx-stats-panel__section" });
        const shd = el("div", { class: "chrx-stats-panel__section-head" });
        shd.append(el("div", { class: "chrx-stats-panel__section-title" }, sec.title || ""));
        if (sec.meta) shd.append(el("div", { class: "chrx-stats-panel__section-meta" }, sec.meta));
        secEl.append(shd);

        const bars = el("div", { class: "chrx-bars", role: "list" });
        const max = sec.bars.reduce((m, b) => Math.max(m, b.max ?? b.value ?? 0), 0) || 1;
        for (const b of sec.bars) {
          const row = el("div", { class: "chrx-bar-row", role: "listitem" });
          row.append(el("div", { class: "chrx-bar-row__name" }, b.name || ""));
          const track = el("div", { class: "chrx-bar-row__track" });
          const fillCls = "chrx-bar-row__fill" + (b.tone && b.tone !== "default" ? ` chrx-bar-row__fill--${b.tone}` : "");
          const fill = el("div", {
            class: fillCls,
            role: "meter",
            "aria-label": `${b.name}: ${b.value} of ${b.max ?? max}`,
            "aria-valuenow": String(b.value),
            "aria-valuemin": "0",
            "aria-valuemax": String(b.max ?? max),
          });
          fill.style.width = Math.max(0, Math.min(100, (b.value / (b.max ?? max)) * 100)) + "%";
          track.append(fill);
          row.append(track);
          row.append(el("div", { class: "chrx-bar-row__count" }, String(b.count ?? b.value)));
          bars.append(row);
        }
        secEl.append(bars);
        wrap.append(secEl);
      }
    }

    paint(data || {});
    host.append(wrap);

    return {
      update(next) { paint(next || {}); },
      destroy() { wrap.remove(); },
      el: wrap,
    };
  }

  global.Stats = { render };
})(typeof window !== "undefined" ? window : globalThis);
