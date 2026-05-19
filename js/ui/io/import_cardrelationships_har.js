/* CardRelationships HAR Importer.
 *
 * Classic stores constraint rows (`cardrelationships` table) on the server.
 * To migrate to Chronexa Web, a school admin can export a HAR via Chrome
 * DevTools → Network → "Export HAR…" while their Classic timetable is
 * loaded. This module finds the `ttuidocDBIAccessor` response inside the
 * HAR that carries the `cardrelationships` rows and imports them.
 *
 * Triggered by `app:import-classic-har`. The Files → Import menu wires
 * an entry. The importer:
 *   1. Reads the .har file as text (JSON)
 *   2. Walks `log.entries[]` for any POST to /timetable/app/server/ttdoc.js
 *      whose response body has `cardrelationships` rows
 *   3. Maps each row to Chronexa's `school.relations` shape
 *   4. Surfaces a summary + imports the rows on confirm
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;

  function parseHAR(text) {
    let har;
    try { har = JSON.parse(text); }
    catch (e) { return { error: "Not valid JSON: " + e.message }; }
    if (!har.log || !Array.isArray(har.log.entries))
      return { error: "Not a HAR file (missing log.entries)" };
    return { har };
  }

  function findCardRelationships(har) {
    const rows = [];
    const entitiesFound = new Set();
    for (const entry of har.log.entries) {
      const req = entry.request, res = entry.response;
      if (!req || !res || !res.content) continue;
      const url = req.url || "";
      if (!/ttdoc\.js|dbiaccessor/i.test(url)) continue;
      const body = res.content.text || "";
      if (!body) continue;
      // Look for `cardrelationships` rows
      if (!/cardrelationships/i.test(body)) continue;
      try {
        // Classic encodes responses as `{"r":{...}}`
        const decoded = body.startsWith("{") ? JSON.parse(body) : null;
        const tables = decoded?.r?.tables || decoded?.r?.data?.tables || [];
        for (const table of (Array.isArray(tables) ? tables : [tables])) {
          if (!table || !table.id) continue;
          entitiesFound.add(table.id);
          if (table.id === "cardrelationships" && Array.isArray(table.data_rows)) {
            for (const row of table.data_rows) {
              rows.push(row);
            }
          }
        }
      } catch (e) { /* skip malformed entry */ }
    }
    return { rows, entitiesFound: Array.from(entitiesFound) };
  }

  function mapRowToRelation(row) {
    // Classic row → Chronexa relation
    return {
      id: row.id || ("har_" + Math.random().toString(36).slice(2, 8)),
      typ: row.typ || "",
      importance: row.importance || "normal",
      note: row.note || "",
      disabled: !!row.disabled,
      subjectids: row.subjectids || [],
      subject2ids: row.subject2ids || [],
      classids: row.classids || [],
      teacherids: row.teacherids || [],
      classroomids: row.classroomids || [],
      positions: row.positions != null ? row.positions : undefined,
      positions2: row.positions2 != null ? row.positions2 : undefined,
      param1: row.param1,
      param2: row.param2,
      filter: row.filter || "",
      filter2: row.filter2 || "",
    };
  }

  async function importHAR(file) {
    if (!APP || !APP.school) {
      notify("Open or create a timetable first.", "error"); return;
    }
    const text = await file.text();
    const { har, error } = parseHAR(text);
    if (error) { notify("HAR parse error: " + error, "error"); return; }
    const { rows, entitiesFound } = findCardRelationships(har);

    if (!rows.length) {
      notify(
        `No cardrelationships found in HAR. Detected entities: ${entitiesFound.join(", ") || "(none)"}. ` +
        `Make sure you exported the HAR while Classic's timetable customize view was open.`,
        "warn"
      );
      return;
    }

    // Confirm with the user before merging
    const existing = (APP.school.relations || []).length;
    if (!confirm(
      `Found ${rows.length} cardrelationships in HAR. Import will merge with existing ${existing} relations. Continue?`
    )) return;

    APP.school.relations = APP.school.relations || [];
    const mapped = rows.map(mapRowToRelation);
    // Skip rows with duplicate IDs (already present)
    const ids = new Set(APP.school.relations.map(r => r.id));
    let added = 0;
    for (const r of mapped) {
      if (ids.has(r.id)) continue;
      APP.school.relations.push(r);
      ids.add(r.id); added++;
    }
    if (window.APP.audit?.append) {
      APP.audit.append({ entity: "relations", op: "har-import", added, total: APP.school.relations.length });
    }
    notify(`✓ Imported ${added} relations (${rows.length - added} duplicates skipped). Total: ${APP.school.relations.length}.`, "info");
  }

  function trigger() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".har,.json";
    input.style.display = "none";
    input.onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) await importHAR(f);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  }

  window.addEventListener("app:import-cardrelationships-har", trigger);
  APP.io = APP.io || {};
  APP.io.importCardRelationshipsHAR = trigger;
})();
