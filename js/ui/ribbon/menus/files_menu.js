/* Files menu — Back / New / Open / Close / Save / Save-as / Demo / Import 6 / Export 12 / Compare / Print */
(function () {
  "use strict";
  const APP = window.APP;
  const fire = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d || {} }));
  const has  = () => !!APP.school;

  APP.ribbon.registerMenu({
    key: "files", label: "Files",
    build() {
      return [
        { icon: "←",  label: "Back",            run: () => fire("app:back") },
        { icon: "🆕", label: "New",             run: () => fire("app:new") },
        { icon: "📂", label: "Open…",  hint: "⌘O", run: () => fire("app:open-file") },
        { icon: "✕",  label: "Close",  disabled: !has(), run: () => fire("app:close") },
        { sep: true },
        { icon: "💾", label: "Save",        hint: "⌘S",  disabled: !has(), run: () => fire("app:save") },
        { icon: "📋", label: "Save as…",    hint: "⇧⌘S", disabled: !has(), run: () => fire("app:save-as") },
        { icon: "🎬", label: "Show demo file",            run: () => fire("app:open-demo") },
        { sep: true },
        { icon: "⬇",  label: "Import", sub: [
          { icon: "📄", label: "Classic Timetable XML",         run: () => fire("app:import-timetable-xml") },
          { icon: "🌐", label: "Classic — Basic school data",   run: () => fire("app:import-classic-basic") },
          { icon: "🔔", label: "Classic — Bell times",          run: () => fire("app:import-classic-bell-times") },
          { icon: "📋", label: "Import from Clipboard",         run: () => fire("app:import-clipboard") },
          { icon: "🪐", label: "GP-Untis / Jupiter",            run: () => fire("app:import-gp-untis") },
        ]},
        { icon: "⬆",  label: "Export", disabled: !has(), sub: [
          { icon: "📦", label: "Classic Timetable (*.roz)",        run: () => fire("app:export-legacy-roz") },
          { icon: "📄", label: "Classic Timetable XML",            run: () => fire("app:export-timetable-xml") },
          { icon: "🌐", label: "Standalone HTML",                  run: () => fire("app:export-html") },
          { sep: true },
          { icon: "📊", label: "Excel — Contracts",             run: () => fire("app:export-excel", { kind: "contracts" }) },
          { icon: "📊", label: "Excel — Available teachers",    run: () => fire("app:export-excel", { kind: "available" }) },
          { icon: "📊", label: "Excel — Room supervision",      run: () => fire("app:export-excel", { kind: "supervision" }) },
          { icon: "📊", label: "Excel — Timetable",             run: () => fire("app:export-excel", { kind: "timetable" }) },
          { icon: "📊", label: "Excel — Class register",        run: () => fire("app:export-class-register") },
          { sep: true },
          { icon: "📤", label: "GP-Untis DIF",   run: () => fire("app:export-gp-untis-dif") },
          { icon: "📤", label: "Atlantis",       run: () => fire("app:export-atlantis") },
          { icon: "📤", label: "PowerSchool",    run: () => fire("app:export-powerschool") },
          { icon: "📤", label: "NYC Excel",      soon: true },
          { icon: "📤", label: "Mashov",         soon: true },
          { icon: "📤", label: "iSAMS",          soon: true },
        ]},
        { icon: "⇄",  label: "Compare", disabled: !has(), sub: [
          { icon: "🕘", label: "Compare with last saved",    run: () => fire("app:compare-last") },
          { icon: "📂", label: "Compare with another file…", run: () => fire("app:compare-file") },
        ]},
        { sep: true },
        { icon: "🖨", label: "Print preview…", disabled: !has(), run: () => fire("app:print-preview") },
      ];
    },
  });
})();
