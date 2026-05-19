/**
 * Single global listener for `app:open-entity` events fired by the ribbon menus.
 * Maps the menu `kind` to the matching EntityX.open() handler.
 *
 * Without this listener every Specification/Options/Files menu item is decorative.
 * One module unlocks them all.
 */
(function () {
  "use strict";

  // kind → handler factory (lazy so the EntityX globals exist by click time)
  const ROUTE = {
    // Specification menu
    "bells":     () => window.EntityBells     && window.EntityBells.open(),
    "days":      () => openStub("Days definition", "Pick how many days per week + which days are used. Coming in the next sprint — for now edit via aSc XML or in the bell-time editor."),
    "weeks":     () => window.EntityWeeks     && window.EntityWeeks.open(),
    "terms":     () => window.EntityTerms     && window.EntityTerms.open(),
    "buildings": () => openStub("Buildings", "Buildings dialog is not built yet. For now create buildings via XML; the solver honours building-transfer constraints."),
    "holidays":  () => openStub("Holidays", "Holidays dialog coming in P1. Today, mark `timeOff` cells in the bell schedule."),
    "school":    () => openStub("School settings", "School settings dialog coming in P1. Today, edit school name via the Step 2 'School Info' page."),

    // Edit menu (Subjects/Teachers/Classes/Classrooms/Lessons/Relations/Supervisions)
    "subjects":    () => window.EntitySubjects    && window.EntitySubjects.open(),
    "teachers":    () => window.EntityTeachers    && window.EntityTeachers.open(),
    "classes":     () => window.EntityClasses     && window.EntityClasses.open(),
    "classrooms":  () => window.EntityClassrooms  && window.EntityClassrooms.open(),
    "lessons":     () => window.EntityLessons     && window.EntityLessons.open(),
    "relations":   () => window.EntityRelations   && window.EntityRelations.open(),
    "supervisions": () => window.EntitySupervisions && window.EntitySupervisions.open(),
    "divisions":   () => window.EntityDivisions   && window.EntityDivisions.open(),
    "groups":      () => window.EntityGroups      && window.EntityGroups.open(),
    "coursegroups":() => window.EntityCourseGroups&& window.EntityCourseGroups.open(),
    "grades":      () => window.EntityGrades      && window.EntityGrades.open(),
    "breaks":      () => window.EntityBreaks      && window.EntityBreaks.open(),
    "ttreports":   () => window.EntityTTReports   && window.EntityTTReports.open(),
    "ttviews":     () => window.EntityTTViews     && window.EntityTTViews.open(),

    // Options menu (currently stubbed — these aren't entity-shaped)
    "settings":             () => openStub("Settings", "App settings live under the View menu (Theme, Density, Zoom)."),
    "constraints":          () => openStub("Constraints library", "Coming in P1 — full editor for the 15 decoded n_* constraint types lives in the Relations dialog (try Edit → Relations…)."),
    "preferences":          () => openStub("Account preferences", "No account needed — Chronexa is local-first."),
    "display-settings":     () => openStub("Display settings", "Open the View menu for Density/Theme/Zoom toggles."),
    "print-defaults":       () => openStub("Print defaults", "Use Files → Print preview… to set defaults per-report."),
    "supervision-criteria": () => window.EntitySupervisions && window.EntitySupervisions.open(),
  };

  function openStub(title, body) {
    // Reuse the entity-dialog shell for a quick informational sheet
    if (window.EntityDialog && window.EntityDialog.openSheet) {
      const div = document.createElement("div");
      div.style.cssText = "padding:12px;max-width:480px;font-size:13px;color:#334155;line-height:1.5";
      div.innerHTML = `<p>${escapeHtml(body)}</p>`;
      window.EntityDialog.openSheet(div, { title });
      return;
    }
    alert(`${title}\n\n${body}`);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  function handle(e) {
    const kind = e.detail && e.detail.kind;
    if (!kind) return;
    const fn = ROUTE[kind];
    if (typeof fn !== "function") {
      console.warn("[entity_router] no handler for kind:", kind);
      openStub("Coming soon", `Action “${kind}” is not wired yet. File an issue if you need it.`);
      return;
    }
    try { fn(); }
    catch (err) {
      console.error("[entity_router] handler threw for kind:", kind, err);
      openStub("Error", `Couldn't open ${kind}: ${err && err.message ? err.message : String(err)}`);
    }
  }

  function boot() {
    window.addEventListener("app:open-entity", handle);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.EntityRouter = { handle, ROUTE };
})();
