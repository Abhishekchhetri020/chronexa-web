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
        { icon: "🧪", label: "Test",                     disabled: !has(), run: () => fire("app:test") },
        { icon: "⚡", label: "Generate",                  disabled: !has(), run: () => fire("app:generate") },
        { icon: "☁︎", label: "Generate in cloud",         disabled: !has(), run: () => fire("app:generate-cloud") },
        { icon: "⏹", label: "Stop generation",            disabled: !has(), run: () => fire("app:generate-stop") },
        { icon: "✓",  label: "Verification",              disabled: !has(), run: () => fire("app:verify") },
        { icon: "📜", label: "List constraints",          disabled: !has(), run: () => fire("app:list-constraints") },
        { sep: true },
        { icon: "📈", label: "Statistics…",               disabled: !has(), run: () => fire("app:statistics") },
        { icon: "🔁", label: "Substitutions…",            disabled: !has(), run: () => fire("app:substitutions") },
        { icon: "📑", label: "Reports…",                  disabled: !has(), run: () => fire("app:print-preview") },
        { sep: true },
        { icon: "📆", label: "Export to calendar (ICS)",  disabled: !has(), run: () => fire("app:export-ics"), soon: true },
      ];
    },
  });
})();
