/* Specification — Bells / Days / Weeks / Terms / Buildings / Holidays */
(function () {
  "use strict";
  const APP = window.APP;
  const fire = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d || {} }));
  const has  = () => !!APP.school;

  APP.ribbon.registerMenu({
    key: "spec", label: "Specification",
    build() {
      return [
        { icon: "🔔", label: "Bell times / Periods…", disabled: !has(),
          run: () => fire("app:open-entity", { kind: "bells" }) },
        { icon: "📅", label: "Days…",                  disabled: !has(),
          run: () => fire("app:open-entity", { kind: "days" }) },
        { icon: "🗓",  label: "Weeks…",                 disabled: !has(),
          run: () => fire("app:open-entity", { kind: "weeks" }) },
        { icon: "🍂", label: "Terms…",                 disabled: !has(),
          run: () => fire("app:open-entity", { kind: "terms" }) },
        { sep: true },
        { icon: "🏛", label: "Buildings…",             disabled: !has(),
          run: () => fire("app:open-entity", { kind: "buildings" }) },
        { icon: "🏖", label: "Holidays…",              disabled: !has(),
          run: () => fire("app:open-entity", { kind: "holidays" }) },
        { sep: true },
        { icon: "⚙︎", label: "School settings…",       disabled: !has(),
          run: () => fire("app:open-entity", { kind: "school" }) },
      ];
    },
  });
})();
