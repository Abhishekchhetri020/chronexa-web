/* Options — Settings, Constraints library, Preferences */
(function () {
  "use strict";
  const APP = window.APP;
  const fire = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d || {} }));
  const has  = () => !!APP.school;

  APP.ribbon.registerMenu({
    key: "options", label: "Options",
    build() {
      return [
        { icon: "⚙︎", label: "Settings…",            disabled: !has(),
          run: () => fire("app:open-entity", { kind: "settings" }) },
        { icon: "📜", label: "Constraints library…", disabled: !has(),
          run: () => fire("app:open-entity", { kind: "constraints" }) },
        { sep: true },
        { icon: "👤", label: "Preferences (account)…",
          run: () => fire("app:open-entity", { kind: "preferences" }) },
        { sep: true },
        { icon: "🎨", label: "Display settings…",    disabled: !has(),
          run: () => fire("app:open-entity", { kind: "display-settings" }) },
        { icon: "🖨", label: "Print defaults…",      disabled: !has(),
          run: () => fire("app:open-entity", { kind: "print-defaults" }) },
        { icon: "👮", label: "Supervision criteria…", disabled: !has(),
          run: () => fire("app:open-entity", { kind: "supervision-criteria" }) },
      ];
    },
  });
})();
