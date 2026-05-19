/* Specification — entity CRUD entry points (Subjects, Teachers, Classes, etc.)
 * Followed by school-level definitions (Bells, Days, Weeks, Terms, Buildings, Holidays).
 *
 * Click handlers fire `app:open-entity` which is handled by js/ui/entity_router.js.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const fire = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d || {} }));
  const has  = () => !!APP.school;

  APP.ribbon.registerMenu({
    key: "spec", label: "Specification",
    build() {
      return [
        { section: "Core entities" },
        { icon: "📚", label: "Subjects…",       disabled: !has(),
          run: () => fire("app:open-entity", { kind: "subjects" }) },
        { icon: "👨‍🏫", label: "Teachers…",      disabled: !has(),
          run: () => fire("app:open-entity", { kind: "teachers" }) },
        { icon: "👥", label: "Classes…",         disabled: !has(),
          run: () => fire("app:open-entity", { kind: "classes" }) },
        { icon: "🚪", label: "Classrooms…",      disabled: !has(),
          run: () => fire("app:open-entity", { kind: "classrooms" }) },
        { icon: "📝", label: "Lessons…",         disabled: !has(),
          run: () => fire("app:open-entity", { kind: "lessons" }) },
        { icon: "🔗", label: "Relations…",       disabled: !has(),
          run: () => fire("app:open-entity", { kind: "relations" }) },
        { sep: true },
        { section: "Groups & roles" },
        { icon: "✂️", label: "Divisions…",       disabled: !has(),
          run: () => fire("app:open-entity", { kind: "divisions" }) },
        { icon: "👁", label: "Supervisions…",    disabled: !has(),
          run: () => fire("app:open-entity", { kind: "supervisions" }) },
        { icon: "🎓", label: "Grades…",          disabled: !has(),
          run: () => fire("app:open-entity", { kind: "grades" }) },
        { sep: true },
        { section: "School definitions" },
        { icon: "🔔", label: "Bell times / Periods…", disabled: !has(),
          run: () => fire("app:open-entity", { kind: "bells" }) },
        { icon: "📅", label: "Days…",                  disabled: !has(),
          run: () => fire("app:open-entity", { kind: "days" }) },
        { icon: "🗓",  label: "Weeks…",                 disabled: !has(),
          run: () => fire("app:open-entity", { kind: "weeks" }) },
        { icon: "🍂", label: "Terms…",                 disabled: !has(),
          run: () => fire("app:open-entity", { kind: "terms" }) },
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
