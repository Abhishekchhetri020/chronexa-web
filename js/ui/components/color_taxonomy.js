/* Color taxonomy — auto-assign + harmonize colors across entities.
 *
 * Ports the decision tree documented in EDUPAGE_E3_COLOR_TAXONOMY_2026-05-03.md:
 *
 *   Card color source priority:
 *     1. Subject.color (if set)
 *     2. Teacher.color
 *     3. Class.color
 *     4. Hue rotation around subject ID hash
 *
 * Exposes:
 *   ColorTaxonomy.autoColor(school, opts) — assigns colors to all missing
 *   ColorTaxonomy.harmonize(school)       — adjusts to avoid adjacent hues
 *   ColorTaxonomy.resolveCardColor(school, card) — what color the card shows
 *
 * Triggered by app:auto-color-school event.
 */
(function (global) {
  "use strict";

  /* HSL → hex (using existing palette pattern from create_new.js) */
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
    return Math.abs(h);
  }

  /* Stable-but-distinct color for an ID + entity-type. Different lightness
   * per entity-type so a teacher and a subject with the same ID hash still
   * differ visually. */
  function colorForId(id, type) {
    const baseHue = hash(id + ":" + type) % 360;
    const l = (type === "subject") ? 55 : (type === "teacher") ? 60 : (type === "class") ? 50 : 65;
    const s = (type === "subject") ? 70 : (type === "teacher") ? 60 : (type === "class") ? 65 : 50;
    return hslToHex(baseHue, s, l);
  }

  function autoColor(school, opts) {
    school = school || (window.APP && window.APP.school);
    if (!school) return { error: "no school" };
    opts = opts || {};
    const overwrite = !!opts.overwrite;
    let touched = 0;
    function maybeSet(arr, type) {
      for (const item of (arr || [])) {
        if (!item.color || overwrite || item.color === "#000000") {
          item.color = colorForId(item.id || item.name || "", type);
          touched++;
        }
      }
    }
    maybeSet(school.subjects, "subject");
    maybeSet(school.teachers, "teacher");
    maybeSet(school.classes,  "class");
    maybeSet(school.classrooms, "room");
    maybeSet(school.buildings, "building");
    if (window.APP?.audit?.append) {
      window.APP.audit.append({ entity: "school", op: "auto-color", touched, overwrite });
    }
    return { ok: true, touched };
  }

  /* Cycle through entities of the same type and reassign hues evenly so
   * adjacent items in the user's list look distinct. */
  function harmonize(school) {
    school = school || (window.APP && window.APP.school);
    if (!school) return { error: "no school" };
    let touched = 0;
    function rebalance(arr, baseLightness, baseSaturation) {
      const n = arr.length;
      if (!n) return;
      arr.forEach((item, i) => {
        const hue = Math.round((i / n) * 360);
        item.color = hslToHex(hue, baseSaturation, baseLightness);
        touched++;
      });
    }
    rebalance(school.subjects || [], 55, 70);
    rebalance(school.teachers || [], 60, 60);
    rebalance(school.classes  || [], 50, 65);
    if (window.APP?.audit?.append) {
      window.APP.audit.append({ entity: "school", op: "harmonize-colors", touched });
    }
    return { ok: true, touched };
  }

  function resolveCardColor(school, card) {
    if (!school || !card) return "#94a3b8";
    const _idx = school._idx || {};
    const lesson = (_idx.lessonById || {})[card.lessonId];
    if (!lesson) return "#94a3b8";
    const subj = (_idx.subjectById || {})[lesson.subjectId];
    if (subj?.color) return subj.color;
    const teacherId = (lesson.teacherIds || [])[0];
    const teacher = teacherId ? (_idx.teacherById || {})[teacherId] : null;
    if (teacher?.color) return teacher.color;
    const classId = (lesson.classIds || [])[0];
    const klass = classId ? (_idx.classById || {})[classId] : null;
    if (klass?.color) return klass.color;
    return colorForId(lesson.subjectId || "x", "subject");
  }

  /* UI: trigger via menu — "View → Auto-color school" */
  function openDialog() {
    const root = document.createElement("div");
    root.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center";
    root.onclick = e => { if (e.target === root) root.remove(); };
    const panel = document.createElement("div");
    panel.style.cssText = "background:#fff;border-radius:12px;padding:20px;width:min(420px,95vw);box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:-apple-system,sans-serif";
    panel.innerHTML = `
      <h3 style="margin:0 0 10px;color:#1e3a8a">🎨 Color taxonomy</h3>
      <p style="margin:0 0 12px;font-size:13px;color:#475569">Auto-color subjects, teachers, classes and rooms using a stable hue-rotation palette. Existing colors stay unless you tick <em>Overwrite</em>.</p>
      <label style="display:block;font-size:13px;margin-bottom:14px"><input type="checkbox" id="chrx-color-overwrite"> Overwrite existing colors</label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="chrx-color-cancel" style="background:#fff;border:1px solid #cbd5e1;padding:6px 14px;border-radius:6px;cursor:pointer">Cancel</button>
        <button id="chrx-color-harmonize" style="background:#fff;border:1px solid #cbd5e1;padding:6px 14px;border-radius:6px;cursor:pointer">Harmonize</button>
        <button id="chrx-color-auto" style="background:#10b981;color:#fff;border:0;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer">Auto-color</button>
      </div>`;
    root.appendChild(panel);
    document.body.appendChild(root);
    document.getElementById("chrx-color-cancel").onclick = () => root.remove();
    document.getElementById("chrx-color-auto").onclick = () => {
      const r = autoColor(null, { overwrite: document.getElementById("chrx-color-overwrite").checked });
      (window._chrxNotify || console.log)(`🎨 Auto-colored ${r.touched} entities.`);
      window.dispatchEvent(new CustomEvent("entity:changed", { detail: { entity: "school" } }));
      root.remove();
    };
    document.getElementById("chrx-color-harmonize").onclick = () => {
      const r = harmonize();
      (window._chrxNotify || console.log)(`🌈 Harmonized ${r.touched} entities.`);
      window.dispatchEvent(new CustomEvent("entity:changed", { detail: { entity: "school" } }));
      root.remove();
    };
  }

  window.addEventListener("app:auto-color-school", openDialog);

  global.ColorTaxonomy = { autoColor, harmonize, resolveCardColor, colorForId, hslToHex, openDialog };
})(window);
