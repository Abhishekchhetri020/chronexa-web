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
          { icon: "📄", label: "Classic Timetable XML",  run: () => fire("app:import-timetable-xml") },
          { icon: "🌐", label: "Classic — Basic school data",  soon: true },
          { icon: "🔔", label: "Classic — Bell times",          soon: true },
          { icon: "📋", label: "Import from Clipboard",         soon: true },
          { icon: "🗓",  label: "Classic — Timetable",           soon: true },
          { icon: "🪐", label: "Jupiter (Stirlingschools)",     soon: true },
        ]},
        { icon: "⬆",  label: "Export", disabled: !has(), sub: [
          { icon: "📦", label: "Classic Timetable (*.roz)",        soon: true },
          { icon: "📄", label: "Classic Timetable XML",            run: () => fire("app:export-timetable-xml") },
          { sep: true },
          { icon: "📊", label: "Excel — Contracts",             run: () => fire("app:export-excel", { kind: "contracts" }) },
          { icon: "📊", label: "Excel — Available teachers",    run: () => fire("app:export-excel", { kind: "available" }) },
          { icon: "📊", label: "Excel — Room supervision",      run: () => fire("app:export-excel", { kind: "supervision" }) },
          { icon: "📊", label: "Excel — Timetable",             run: () => fire("app:export-excel", { kind: "timetable" }) },
          { sep: true },
          { icon: "📤", label: "GP-Untis DIF",   soon: true },
          { icon: "📤", label: "Atlantis",       soon: true },
          { icon: "📤", label: "PowerSchool",    soon: true },
          { icon: "📤", label: "NYC Excel",      soon: true },
          { icon: "📤", label: "Jupiter",        soon: true },
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
