/* ScoreExpr DSL — simplified evaluator for user-defined scoring rules.
 *
 * Ports a tractable subset of Swift's ASCScoreExpr.swift (79 expression
 * node types) — covers the 15 most-used primitives the majority of school
 * scoring rules need. Users can write rules like:
 *
 *   { "node": "if",
 *     "test":   { "node": "eq", "lhs": { "node": "field", "entity": "teacher", "field": "id" }, "rhs": "T_AMIR" },
 *     "then":   { "node": "if",
 *                 "test": { "node": "lt", "lhs": { "node": "period" }, "rhs": 3 },
 *                 "then": 100,   // reward Mr. Amir for morning periods
 *                 "else": -50 }, // penalty for after period 3
 *     "else":   0 }
 *
 * Stored on school.scoreRules[] = [{name, weight, expr}].
 * Solver calls ScoreExpr.evalRule(rule, ctx) where ctx = {school, card, lesson, day, period, classroomId}.
 *
 * Why a custom DSL: hard-coded constraints can't capture every school's
 * preferences. Classic's 84 a_* codes try; we go further with a tiny eval.
 *
 * Safety: this is NOT eval()-based JS — pure data interpretation. No
 * arbitrary code execution.
 */
(function (global) {
  "use strict";

  // ----- Built-in functions -----------------------------------------------
  const FNS = {
    "min": (...a) => Math.min.apply(null, a),
    "max": (...a) => Math.max.apply(null, a),
    "abs": (x) => Math.abs(x),
    "floor": (x) => Math.floor(x),
    "ceil": (x) => Math.ceil(x),
    "sum": (...a) => a.reduce((s, v) => s + (Number(v) || 0), 0),
    "count": (...a) => a.length,
  };

  // ----- Evaluator --------------------------------------------------------
  function evalNode(node, ctx) {
    if (node == null) return null;
    if (typeof node === "number" || typeof node === "boolean") return node;
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(n => evalNode(n, ctx));
    if (typeof node !== "object") return null;

    switch (node.node) {
      // Literals
      case "const": return node.value;

      // Context accessors
      case "day": return ctx.day;
      case "period": return ctx.period;
      case "classroomId": return ctx.classroomId;
      case "lessonId": return ctx.card?.lessonId;
      case "subjectId": return ctx.lesson?.subjectId;
      case "teacherIds": return ctx.lesson?.teacherIds || [];
      case "classIds": return ctx.lesson?.classIds || [];

      // Field accessor: { node:"field", entity:"teacher|class|room|subject|lesson", field:"name|color|..." }
      case "field": {
        const ent = node.entity;
        if (ent === "lesson") return ctx.lesson?.[node.field];
        if (ent === "card") return ctx.card?.[node.field];
        if (!ctx.school || !ctx.school._idx) return null;
        const idx = ctx.school._idx;
        const map = { teacher: idx.teacherById, class: idx.classById,
                      room: idx.classroomById, subject: idx.subjectById,
                      lesson: idx.lessonById };
        const m = map[ent];
        if (!m) return null;
        // Default: look up by first ID of that type on the card's lesson
        let id;
        if (node.id) id = evalNode(node.id, ctx);
        else if (ent === "teacher") id = (ctx.lesson?.teacherIds || [])[0];
        else if (ent === "class")   id = (ctx.lesson?.classIds || [])[0];
        else if (ent === "room")    id = ctx.card?.classroomId;
        else if (ent === "subject") id = ctx.lesson?.subjectId;
        if (!id) return null;
        return (m[id] || {})[node.field];
      }

      // Arithmetic
      case "add": return Number(evalNode(node.lhs, ctx) || 0) + Number(evalNode(node.rhs, ctx) || 0);
      case "sub": return Number(evalNode(node.lhs, ctx) || 0) - Number(evalNode(node.rhs, ctx) || 0);
      case "mul": return Number(evalNode(node.lhs, ctx) || 0) * Number(evalNode(node.rhs, ctx) || 0);
      case "div": {
        const r = Number(evalNode(node.rhs, ctx) || 0);
        return r === 0 ? 0 : Number(evalNode(node.lhs, ctx) || 0) / r;
      }
      case "neg": return -Number(evalNode(node.expr, ctx) || 0);

      // Comparison
      case "eq":  return evalNode(node.lhs, ctx) === evalNode(node.rhs, ctx);
      case "neq": return evalNode(node.lhs, ctx) !== evalNode(node.rhs, ctx);
      case "lt":  return Number(evalNode(node.lhs, ctx)) <  Number(evalNode(node.rhs, ctx));
      case "lte": return Number(evalNode(node.lhs, ctx)) <= Number(evalNode(node.rhs, ctx));
      case "gt":  return Number(evalNode(node.lhs, ctx)) >  Number(evalNode(node.rhs, ctx));
      case "gte": return Number(evalNode(node.lhs, ctx)) >= Number(evalNode(node.rhs, ctx));

      // Logical
      case "and": return (node.exprs || []).every(e => !!evalNode(e, ctx));
      case "or":  return (node.exprs || []).some(e => !!evalNode(e, ctx));
      case "not": return !evalNode(node.expr, ctx);

      // Container ops
      case "in": {
        const list = evalNode(node.list, ctx);
        if (!Array.isArray(list)) return false;
        return list.includes(evalNode(node.value, ctx));
      }
      case "contains": {
        const haystack = evalNode(node.list, ctx);
        const needle = evalNode(node.value, ctx);
        if (Array.isArray(haystack)) return haystack.includes(needle);
        if (typeof haystack === "string") return haystack.indexOf(String(needle)) !== -1;
        return false;
      }

      // Conditional
      case "if": return evalNode(node.test, ctx) ? evalNode(node.then, ctx) : evalNode(node.else, ctx);

      // Function call (built-ins only — no user-defined functions for safety)
      case "call": {
        const fn = FNS[node.name];
        if (!fn) return null;
        const args = (node.args || []).map(a => evalNode(a, ctx));
        return fn.apply(null, args);
      }

      default:
        // Unknown node: warn once + return 0
        console.warn("[ScoreExpr] unknown node type:", node.node);
        return 0;
    }
  }

  function evalRule(rule, ctx) {
    if (!rule || !rule.expr) return 0;
    const v = evalNode(rule.expr, ctx);
    if (typeof v === "boolean") return v ? (rule.weight || 1) : 0;
    if (typeof v === "number") return v * (rule.weight != null ? rule.weight : 1);
    return 0;
  }

  function scoreSchool(school) {
    if (!school || !school.scoreRules) return 0;
    const lessonById = (school._idx && school._idx.lessonById) ||
      Object.fromEntries((school.lessons || []).map(l => [l.id, l]));
    let total = 0;
    for (const card of (school.cards || [])) {
      const lesson = lessonById[card.lessonId];
      const ctx = { school, card, lesson, day: card.day, period: card.period, classroomId: card.classroomId };
      for (const rule of school.scoreRules) {
        if (rule.disabled) continue;
        total += evalRule(rule, ctx);
      }
    }
    return total;
  }

  // Example presets the user can clone via the Score Rules dialog (future UI):
  const PRESETS = Object.freeze([
    {
      name: "Mr. Amir likes morning periods",
      weight: 20,
      expr: { node: "if",
              test: { node: "and", exprs: [
                       { node: "eq", lhs: { node: "field", entity: "teacher", field: "name" }, rhs: "Mr. Amir" },
                       { node: "lt", lhs: { node: "period" }, rhs: 3 },
                     ]},
              then: 1, else: 0 },
    },
    {
      name: "PE should not be the last period",
      weight: -50,
      expr: { node: "and", exprs: [
               { node: "eq", lhs: { node: "field", entity: "subject", field: "name" }, rhs: "PE" },
               { node: "gte", lhs: { node: "period" }, rhs: 6 },
             ]},
    },
    {
      name: "Lab subjects on first day of week",
      weight: 15,
      expr: { node: "if",
              test: { node: "contains", list: { node: "field", entity: "subject", field: "name" }, value: "Lab" },
              then: { node: "if", test: { node: "eq", lhs: { node: "day" }, rhs: 0 }, then: 1, else: 0 },
              else: 0 },
    },
  ]);

  global.ScoreExpr = { evalNode, evalRule, scoreSchool, PRESETS };
})(window);

// Chronexa Web
