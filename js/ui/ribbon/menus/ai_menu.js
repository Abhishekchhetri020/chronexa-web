/* AI — assist toggle (stub for now) */
(function () {
  "use strict";
  const APP = window.APP;
  const fire = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d || {} }));
  function aiOn() { return localStorage.getItem("chronexa.ai") === "1"; }
  function toggleAi() {
    const next = !aiOn();
    try { localStorage.setItem("chronexa.ai", next ? "1" : "0"); } catch {}
    fire("app:ai-toggle", { on: next });
    window._chrxNotify && window._chrxNotify("AI assist: " + (next ? "on" : "off"));
  }

  APP.ribbon.registerMenu({
    key: "ai", label: "AI",
    build() {
      const on = aiOn();
      return [
        { icon: on ? "✓" : " ", label: "AI assist", run: toggleAi },
        { sep: true },
        { icon: "🧠", label: "Auto-fill empty cells",      soon: true },
        { icon: "🧹", label: "Cleanup last card move",     soon: true },
        { icon: "🔒", label: "Lock all placed cells",      soon: true },
        { sep: true },
        { icon: "✨", label: "Suggest placements (beta)",  soon: true },
      ];
    },
  });
})();
