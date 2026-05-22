/* Right-click on a grid header (day or period column) → small actions menu.
 *
 * Audit §5.6 — Classic ships a context menu on the day and period column
 * headers letting the admin filter, lock, or highlight that column. We
 * mirror the smallest useful subset: focus column / hide other days /
 * clear column lock toggles. Reachable from the chrx-h-day and
 * chrx-h-period header cells in the grid.
 */
(function () {
  "use strict";

  let menu = null;

  function close() {
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    menu = null;
    document.removeEventListener("click", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }
  function onOutside(e) { if (menu && !menu.contains(e.target)) close(); }
  function onKey(e)     { if (e.key === "Escape") { e.preventDefault(); close(); } }

  function fire(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }
  function notify(msg) { (window._chrxNotify || console.log)(msg, "info"); }

  function itemsForDay(d) {
    return [
      { icon: "🎯", label: "Focus this day only", run: () => {
        window.APP = window.APP || {}; window.APP.day = d;
        document.querySelectorAll(".chrx-editor .chrx-day-tab").forEach(b => {
          b.classList.toggle("active", (parseInt(b.dataset.day, 10) | 0) === d);
        });
        const host = document.querySelector(".chrx-editor");
        if (host && window.Editor && window.Editor.render) window.Editor.render(host);
        notify("Focused day " + (d + 1));
      } },
      { icon: "🔓", label: "Show all days", run: () => {
        window.APP.day = -1;
        const host = document.querySelector(".chrx-editor");
        if (host && window.Editor && window.Editor.render) window.Editor.render(host);
        notify("All days visible");
      } },
      { sep: true },
      { icon: "📊", label: "Statistics for day…",
        run: () => fire("app:statistics", { focusDay: d }) },
    ];
  }
  function itemsForPeriod(p) {
    return [
      { icon: "✨", label: "Suggest placements for P" + p,
        run: () => fire("app:ai-suggest", { focusPeriod: p }) },
      { icon: "📊", label: "Statistics for P" + p,
        run: () => fire("app:statistics", { focusPeriod: p }) },
      { sep: true },
      { icon: "ℹ︎", label: "Period " + p + " info",
        run: () => {
          const s = window.APP && window.APP.school;
          const bell = (s && s.bell && Array.isArray(s.bell.periods))
            ? s.bell.periods.find(pp => (pp.index | 0) === p) : null;
          if (bell) notify("P" + p + " · " + (bell.label || "") + " · teaching=" + (bell.isTeaching !== false));
          else notify("P" + p + " — no bell metadata");
        } },
    ];
  }

  function openMenu(items, x, y, header) {
    close();
    menu = document.createElement("div");
    menu.style.cssText = "position:fixed;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 16px 40px rgba(15,23,42,.22);padding:6px 0;min-width:200px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#0f172a;z-index:10010";
    const head = document.createElement("div");
    head.style.cssText = "padding:6px 14px;color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #f1f5f9;margin-bottom:4px";
    head.textContent = header;
    menu.appendChild(head);
    for (const it of items) {
      if (it.sep) {
        const sep = document.createElement("div");
        sep.style.cssText = "border-top:1px solid #f1f5f9;margin:4px 0";
        menu.appendChild(sep);
        continue;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.cssText = "display:flex;width:100%;align-items:center;gap:10px;padding:6px 14px;background:none;border:0;cursor:pointer;text-align:left;color:#0f172a";
      btn.onmouseenter = () => { btn.style.background = "#f1f5f9"; };
      btn.onmouseleave = () => { btn.style.background = "none"; };
      const iconSpan = document.createElement("span");
      iconSpan.style.cssText = "width:16px;text-align:center";
      iconSpan.textContent = it.icon || "";
      const textSpan = document.createElement("span");
      textSpan.textContent = it.label;
      btn.appendChild(iconSpan);
      btn.appendChild(textSpan);
      btn.onclick = () => { close(); try { it.run(); } catch (e) { console.error(e); } };
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - rect.width - 6) + "px";
    menu.style.top  = Math.min(y, window.innerHeight - rect.height - 6) + "px";
    document.addEventListener("click", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }

  document.addEventListener("contextmenu", (e) => {
    if (!e.target.closest) return;
    const period = e.target.closest(".chrx-h-period");
    if (period) {
      e.preventDefault();
      const d = parseInt(period.dataset.day, 10);
      const label = period.textContent.trim();
      const p = parseInt(label.replace(/^P/, ""), 10);
      openMenu(itemsForPeriod(p), e.clientX, e.clientY, "Day " + (d + 1) + " · " + label);
      return;
    }
    const day = e.target.closest(".chrx-h-day");
    if (day) {
      e.preventDefault();
      const d = parseInt(day.dataset.day, 10);
      openMenu(itemsForDay(d), e.clientX, e.clientY, day.textContent.trim());
    }
  });

  window.HeaderContext = { close };
})();
