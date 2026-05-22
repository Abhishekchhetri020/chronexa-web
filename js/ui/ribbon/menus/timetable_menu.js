/* Timetable — Test / Generate / Verify / Statistics / Substitutions / Reports / Calendar export */
(function () {
  "use strict";
  const APP = window.APP;
  const fire = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d || {} }));
  const has  = () => !!APP.school;

  APP.ribbon.registerMenu({
    key: "timetable", label: "Timetable",
    build() {
      return [
        { icon: "🚀", label: "Master Solve (one-click)…",disabled: !has(), run: () => fire("app:master-solve") },
        { icon: "🧪", label: "Test",                     disabled: !has(), run: () => fire("app:test") },
        { icon: "⚡", label: "Generate",                  disabled: !has(), run: () => fire("app:generate") },
        { icon: "✨", label: "Improve current schedule",  disabled: !has(), run: () => fire("app:improve") },
        { icon: "☁︎", label: "Generate in cloud",         disabled: !has(), run: () => fire("app:generate-cloud") },
        { icon: "⏹", label: "Stop generation",            disabled: !has(), run: () => fire("app:generate-stop") },
        { icon: "✓",  label: "Verification",              disabled: !has(), run: () => fire("app:verify") },
        { icon: "🔧", label: "Verification Pro (auto-fix)…", disabled: !has(), run: () => fire("app:verification-pro") },
        { icon: "💡", label: "Advisor — suggest improvements…", disabled: !has(), run: () => fire("app:advisor") },
        { icon: "🎚", label: "Solver parameters…",         disabled: !has(), run: () => fire("app:solver-params") },
        { icon: "📊", label: "Statistics (with Exhaustion)…", disabled: !has(), run: () => fire("app:statistics") },
        { icon: "📜", label: "List constraints",          disabled: !has(), run: () => fire("app:list-constraints") },
        { sep: true },
        { icon: "📈", label: "Statistics…",               disabled: !has(), run: () => fire("app:statistics") },
        { icon: "🔁", label: "Substitutions…",            disabled: !has(), run: () => fire("app:substitutions") },
        { icon: "📑", label: "Reports…",                  disabled: !has(), run: () => fire("app:print-preview") },
        { sep: true },
        { icon: "📆", label: "Export to calendar (ICS)",  disabled: !has(), run: () => fire("app:export-ics") },
      ];
    },
  });
})();
