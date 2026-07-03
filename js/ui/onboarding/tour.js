/* First-run guided tour — dotted-line highlights of the core features.
 *
 * Persists "tour seen" in localStorage (`chronexa.tour.seen.v1`) so it
 * doesn't reappear after first dismissal. User can re-launch via Help
 * menu → Take the tour.
 */
(function (global) {
  "use strict";
  const SEEN_KEY = "chronexa.tour.seen.v1";

  const STEPS = [
    {
      selector: "#cta-build-new, [data-step='1']",
      title: "Welcome to Chronexa 👋",
      body:  "Build your school's timetable in your browser, on your computer. No upload, no tracking. Click <strong>Create new timetable</strong> or load an existing Timetable XML to start.",
    },
    {
      selector: "[data-step='6'], #step-6 [data-kind='subjects']",
      title: "The empty-state hero",
      body:  "Six color-coded tiles guide your first day: Subjects → Teachers → Classes → Rooms → Lessons → Generate. Tap any one to open the matching dialog.",
    },
    {
      selector: ".chrx-menubar, button.chrx-menubar__item",
      title: "Ribbon menus",
      body:  "Eight top menus mirror Classic/Classic. Specification has every entity. Timetable has the solver. Options has Constraints library. Help has searchable docs.",
    },
    {
      selector: "#cta-generate, [data-act-fire='app:master-solve']",
      title: "🚀 Master Solve = one-click build",
      body:  "Open Timetable → Master Solve. The solver runs entirely on your CPU using Min-Conflicts repair. ~92% placement on real schools.",
    },
    {
      selector: "[data-kind='lessons'], #cta-test, #cta-generate",
      title: "Hover a card for plain-English explanations",
      body:  "Any red card in the editor shows exactly WHY it's flagged (e.g. 'Mr. Sharma already teaches IX-A in this period'). Classic just says 'conflict'.",
    },
  ];

  let activeOverlay = null;

  function end() {
    document.querySelectorAll(".chrx-tour-spotlight").forEach(t => t.classList.remove("chrx-tour-spotlight"));
    document.querySelectorAll(".chrx-tour-overlay").forEach(o => o.remove());
    activeOverlay = null;
    try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
  }

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false)
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function findTarget(selector) {
    const sels = selector.split(",").map(s => s.trim());
    for (const s of sels) {
      const t = document.querySelector(s);
      if (t && t.offsetParent !== null) return t;
    }
    return null;
  }

  function start() {
    ensureStyles();
    let i = 0;
    activeOverlay = el("div", { class: "chrx-tour-overlay" });
    document.body.appendChild(activeOverlay);
    const overlay = activeOverlay;

    function showStep(ix) {
      overlay.innerHTML = "";
      if (ix >= STEPS.length) { end(); return; }
      const s = STEPS[ix];
      const target = findTarget(s.selector);
      const card = el("div", { class: "chrx-tour-card" });
      card.innerHTML = `
        <header>
          <span class="chrx-tour-count">${ix + 1} / ${STEPS.length}</span>
          <h3>${s.title}</h3>
        </header>
        <p>${s.body}</p>
        <footer>
          <button class="chrx-tour-skip">Skip tour</button>
          <button class="chrx-tour-prev"${ix === 0 ? " disabled" : ""}>Back</button>
          <button class="chrx-tour-next">${ix === STEPS.length - 1 ? "Got it" : "Next →"}</button>
        </footer>`;
      // Position
      if (target) {
        const r = target.getBoundingClientRect();
        card.style.position = "fixed";
        card.style.zIndex = "10000";
        card.style.maxWidth = "360px";
        card.style.left = Math.min(window.innerWidth - 380, Math.max(12, r.left)) + "px";
        card.style.top = (r.bottom + 12 < window.innerHeight - 200 ? r.bottom + 12 : Math.max(20, r.top - 200)) + "px";
        target.classList.add("chrx-tour-spotlight");
      } else {
        card.style.position = "fixed";
        card.style.zIndex = "10000";
        card.style.left = "50%";
        card.style.top = "50%";
        card.style.transform = "translate(-50%, -50%)";
        card.style.maxWidth = "420px";
      }
      overlay.appendChild(card);
      card.querySelector(".chrx-tour-skip").onclick = end;
      card.querySelector(".chrx-tour-prev").onclick = () => { if (target) target.classList.remove("chrx-tour-spotlight"); showStep(ix - 1); };
      card.querySelector(".chrx-tour-next").onclick = () => { if (target) target.classList.remove("chrx-tour-spotlight"); showStep(ix + 1); };
    }
    showStep(0);
  }

  function maybeStart() {
    try { if (localStorage.getItem(SEEN_KEY)) return; } catch {}
    setTimeout(start, 1500);
  }

  function ensureStyles() {
    if (document.getElementById("chrx-tour-styles")) return;
    const s = document.createElement("style");
    s.id = "chrx-tour-styles";
    s.textContent = `
.chrx-tour-overlay{position:fixed;inset:0;background:var(--chrx-scrim);pointer-events:none;z-index:9999}
.chrx-tour-spotlight{position:relative;z-index:9998;outline:3px solid var(--chrx-accent);outline-offset:4px;border-radius:8px;box-shadow:0 0 0 6px var(--chrx-accent-bg-strong),0 0 0 9999px var(--chrx-scrim);transition:outline .2s ease}
.chrx-tour-card{background:var(--chrx-bg-elev);border-radius:12px;padding:14px 18px;box-shadow:var(--chrx-shadow-lg);font-family:-apple-system,sans-serif;color:var(--chrx-fg);pointer-events:none}
.chrx-tour-card button,.chrx-tour-skip{pointer-events:auto}
.chrx-tour-card header{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.chrx-tour-count{background:var(--chrx-accent-bg);color:var(--chrx-accent);font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px}
.chrx-tour-card h3{margin:0;color:var(--chrx-fg);font-size:15px}
.chrx-tour-card p{font-size:13px;color:var(--chrx-fg-secondary);line-height:1.5;margin:6px 0 12px}
.chrx-tour-card footer{display:flex;justify-content:flex-end;gap:6px}
.chrx-tour-card footer button{background:var(--chrx-bg-input);border:1px solid var(--chrx-line);color:var(--chrx-fg);padding:5px 12px;border-radius:5px;cursor:pointer;font-size:12px}
.chrx-tour-card footer button:last-child{background:var(--chrx-accent);color:var(--chrx-accent-on);border-color:transparent;font-weight:600}
.chrx-tour-skip{margin-right:auto;color:var(--chrx-fg-secondary);border:0}
    `;
    document.head.appendChild(s);
  }

  window.addEventListener("app:take-tour", start);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeStart);
  } else maybeStart();

  global.Tour = { start, end, maybeStart, reset: () => { try { localStorage.removeItem(SEEN_KEY); } catch {} } };
})(window);

// [vite-esm] exports auto-generated by the 2026-07 Vite migration.
export const Tour = window.Tour;
