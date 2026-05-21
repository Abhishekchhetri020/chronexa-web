/* View — perspectives / zoom / density / theme toggle */
(function () {
  "use strict";
  const APP = window.APP;
  const fire = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d || {} }));
  const tick = (cond) => cond ? "✓" : " ";
  const curTheme = () => document.documentElement.getAttribute("data-theme")
    || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("chronexa.theme", t); } catch {}
    window._chrxNotify && window._chrxNotify("Theme: " + t);
  }
  function setDensity(d) {
    document.documentElement.setAttribute("data-density", d);
    try { localStorage.setItem("chronexa.density", d); } catch {}
    fire("app:density", { density: d });
  }
  // restore density
  try { const d = localStorage.getItem("chronexa.density"); if (d) document.documentElement.setAttribute("data-density", d); } catch {}

  // Color-by axis — which entity field drives the card hue on the grid.
  // Persists across sessions; live re-renders the editor on change so the
  // user sees the new colouring immediately. APP.editor.colorBy is read by
  // grid_canvas.cardHue() and card_in_hand's pickup ghost.
  APP.editor = APP.editor || {};
  try { const cb = localStorage.getItem("chronexa.colorBy"); if (cb) APP.editor.colorBy = cb; } catch {}
  if (!APP.editor.colorBy) APP.editor.colorBy = "subject";
  function setColorBy(axis) {
    APP.editor.colorBy = axis;
    try { localStorage.setItem("chronexa.colorBy", axis); } catch {}
    fire("app:color-by", { axis });
    const editorRoot = document.querySelector(".chrx-editor");
    if (editorRoot && window.Editor && typeof window.Editor.render === "function") {
      try { window.Editor.render(editorRoot); } catch {}
    }
    (window._chrxNotify || function () {})("Color by: " + axis, "info");
  }

  APP.ribbon.registerMenu({
    key: "view", label: "View",
    build() {
      const p = APP.ribbon.getPerspective();
      const z = APP.ribbon.getZoom();
      const dn = document.documentElement.getAttribute("data-density") || "comfortable";
      const th = curTheme();
      return [
        { section: "Perspective" },
        { icon: tick(p==="class"),   label: "Classes",   run: () => APP.ribbon.setPerspective("class") },
        { icon: tick(p==="teacher"), label: "Teachers",  run: () => APP.ribbon.setPerspective("teacher") },
        { icon: tick(p==="room"),    label: "Rooms",     run: () => APP.ribbon.setPerspective("room") },
        { icon: tick(p==="lesson"),  label: "Lesson grid", run: () => APP.ribbon.setPerspective("lesson") },
        { sep: true },
        { section: "Zoom" },
        ...[50,75,100,125,150].map(v => ({
          icon: tick(v===z), label: v + "%", run: () => APP.ribbon.setZoom(v),
        })),
        { sep: true },
        { section: "Density" },
        { icon: tick(dn==="compact"),     label: "Compact",     run: () => setDensity("compact") },
        { icon: tick(dn==="comfortable"), label: "Comfortable", run: () => setDensity("comfortable") },
        { icon: tick(dn==="spacious"),    label: "Spacious",    run: () => setDensity("spacious") },
        { sep: true },
        { section: "Color by" },
        { icon: tick(APP.editor.colorBy==="subject"), label: "Subject",  run: () => setColorBy("subject") },
        { icon: tick(APP.editor.colorBy==="teacher"), label: "Teacher",  run: () => setColorBy("teacher") },
        { icon: tick(APP.editor.colorBy==="class"),   label: "Class",    run: () => setColorBy("class") },
        { icon: tick(APP.editor.colorBy==="room"),    label: "Room",     run: () => setColorBy("room") },
        { sep: true },
        { section: "Theme" },
        { icon: tick(th==="light"), label: "Light", run: () => setTheme("light") },
        { icon: tick(th==="dark"),  label: "Dark",  run: () => setTheme("dark")  },
        { sep: true },
        { section: "Spotlight" },
        { icon: "🔦", label: "Focus mode…",
          run: () => { if (window.FocusMode) window.FocusMode.openPicker(); } },
        { icon: "⚡", label: "Quick add lesson…",
          run: () => fire("app:quick-add-lesson") },
        { icon: "🔍", label: "Open command palette  (⌘K)",
          run: () => { if (window.CommandPalette) window.CommandPalette.open(); } },
      ];
    },
  });
})();
