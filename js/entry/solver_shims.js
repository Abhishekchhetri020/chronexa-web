/**
 * Expose solver-side checkPlacement + relation enforcer to the main thread
 * for the constraint tooltip explainer. Moved verbatim from the inline
 * <script type="module"> in index.html during the Vite migration; the
 * dynamic imports keep js/solver/* out of the main chunk.
 */
(async () => {
  try {
    const mod = await import("../solver/constraints.js");
    window.SolverConstraints = Object.assign(window.SolverConstraints || {}, {
      checkPlacement: mod.checkPlacement,
      FAIL_NAME: mod.FAIL_NAME,
      HARD_CONSTRAINTS: mod.HARD_CONSTRAINTS,
      SOFT_CONSTRAINTS: mod.SOFT_CONSTRAINTS,
      validateSupervisionCriteria: mod.validateSupervisionCriteria,
      studentScheduleConflicts:    mod.studentScheduleConflicts,
    });
  } catch (e) {
    console.warn("[constraint-explainer] SolverConstraints shim failed; falling back to Placement.classify", e);
  }
  try {
    const mod = await import("../solver/relation_enforcer.js");
    window.RelationEnforcer = {
      check: mod.check,
      explain: mod.explain,
      TYPS: mod.TYPS
    };
  } catch (e) {
    console.warn("[relation-enforcer] relation_enforcer.js module import failed", e);
  }
})();
