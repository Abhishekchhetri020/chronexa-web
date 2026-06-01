/* Import wrapper around the existing js/xml/parse_timetable_xml.js.
 * Adds: source-text retention (so export can round-trip), demo loader,
 * and wires the "Open / Import / Demo" UI to APP.school.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;

  async function loadFromFile(file) {
    if (!file) return null;
    const t0 = performance.now();
    const text = await file.text();
    const school = window.parseTimetableXml.parseText(text, file.name || "sample.xml");
    school._meta = school._meta || {};
    school._meta.sourceText = text;             // preserve for round-trip
    school._meta.sourceFilename = file.name;
    school._meta.parseMs = Math.round(performance.now() - t0);
    return school;
  }

  async function loadFromText(text, fname) {
    const school = window.parseTimetableXml.parseText(text, fname || "sample.xml");
    school._meta = school._meta || {};
    school._meta.sourceText = text;
    school._meta.sourceFilename = fname || "sample.xml";
    return school;
  }

  async function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = accept || ".xml,application/xml,text/xml";
      inp.style.display = "none";
      inp.onchange = () => resolve(inp.files && inp.files[0] || null);
      document.body.appendChild(inp); inp.click();
      setTimeout(() => inp.remove(), 200);
    });
  }

  async function applySchool(school) {
    APP.school = school;
    document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
    window.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { school } }));
    const c = school._meta?.counts || {};
    notify(`Loaded · ${c.classes || 0} classes · ${c.teachers || 0} teachers · ${c.lessons || 0} lessons`);
  }

  async function importTimetableXml() {
    const f = await pickFile();
    if (!f) return;
    try {
      const s = await loadFromFile(f);
      await applySchool(s);
    } catch (e) { notify("Import failed: " + e.message, "error"); console.error(e); }
  }

  async function openDemoFile() {
    try {
      const r = await fetch("docs/demo_sample-school.xml?v=" + (window.APP_VER || "dev"));
      if (!r.ok) throw new Error("HTTP " + r.status);
      const text = await r.text();
      const s = await loadFromText(text, "demo_sample-school.xml");
      await applySchool(s);
    } catch (e) { notify("Demo file failed: " + e.message, "error"); console.error(e); }
  }

  // Event wiring
  window.addEventListener("app:import-timetable-xml", importTimetableXml);
  window.addEventListener("app:open-file",      importTimetableXml);
  window.addEventListener("app:open-demo",      openDemoFile);
  window.addEventListener("app:new",            () => {
    if (APP.school && !confirm("Discard current timetable and start fresh?")) return;
    APP.school = null;
    window.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { school: null } }));
    notify("Cleared");
  });

  APP.io = APP.io || {};
  APP.io.importTimetableXml = importTimetableXml;
  APP.io.loadFromFile = loadFromFile;
  APP.io.loadFromText = loadFromText;
  APP.io.openDemoFile = openDemoFile;
  APP.io.applySchool  = applySchool;
})();

// Chronexa Web
