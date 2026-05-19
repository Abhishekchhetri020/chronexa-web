/* Smart defaults — hooks that decorate existing dialogs from outside.
 *
 * Listens for entity dialogs opening and pre-fills sensible defaults:
 *  - Color via ColorTaxonomy when none set
 *  - Name suggestions based on existing siblings
 *
 * Does NOT modify entity dialog files (they're frozen). Instead this
 * module reacts to entity:changed events and patches new rows.
 */
(function (global) {
  "use strict";

  /* When a new entity is added, ensure it has a sensible color */
  function decorateNewEntity(detail) {
    if (!detail || !detail.entity || !global.APP?.school) return;
    const school = global.APP.school;
    const kind = detail.entity;
    const list = school[kind];
    if (!Array.isArray(list)) return;
    list.forEach((item, i) => {
      if (!item.color && global.ColorTaxonomy?.colorForId) {
        item.color = global.ColorTaxonomy.colorForId(item.id || item.name || String(i), kind.slice(0, -1));
      }
    });
  }

  window.addEventListener("entity:changed", e => decorateNewEntity(e.detail));
  document.addEventListener("entity:changed", e => decorateNewEntity(e.detail));

  /* Helpers exposed for entity dialogs (or bulk-add) that want suggestions */
  function suggestClassName(existingClasses) {
    if (!existingClasses?.length) return "I A";
    // Find highest grade roman numeral
    const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
    const lastByGrade = new Map();
    for (const c of existingClasses) {
      const m = (c.name || "").match(/^([IVX]+)\s+([A-Z])$/);
      if (m) lastByGrade.set(m[1], m[2]);
    }
    // Suggest next section in lowest gap, or next grade if all rows full
    for (const r of ROMAN) {
      const last = lastByGrade.get(r);
      if (!last) return r + " A";
      if (last < "Z") return r + " " + String.fromCharCode(last.charCodeAt(0) + 1);
    }
    return "I A";
  }
  function suggestRoomName(existingRooms) {
    if (!existingRooms?.length) return "Room 101";
    const m = (existingRooms[existingRooms.length - 1].name || "").match(/^Room (\d+)$/);
    if (m) return "Room " + (parseInt(m[1], 10) + 1);
    return "Room " + (101 + existingRooms.length);
  }

  global.SmartDefaults = { suggestClassName, suggestRoomName, decorateNewEntity };
})(window);
