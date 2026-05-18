/* EduPage "Basic data export" importer.
 * Accepts a JSON blob (file or pasted text) containing school identity,
 * teachers, classes, subjects, classrooms. Merges into APP.school
 * (best-effort — fills in what we can, leaves the rest untouched).
 *
 * EduPage's JSON varies by version. We accept either:
 *   { school:{name}, teachers:[...], classes:[...], subjects:[...], classrooms:[...] }
 * or the flat top-level arrays.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;

  function pickFile() {
    return new Promise(res => {
      const i = document.createElement("input");
      i.type = "file"; i.accept = ".json,application/json,text/plain";
      i.style.display = "none";
      i.onchange = () => res(i.files && i.files[0] || null);
      document.body.appendChild(i); i.click();
      setTimeout(() => i.remove(), 200);
    });
  }

  function parse(raw) {
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    // Tolerant: pull from common shapes
    const root = j.data || j;
    return {
      schoolName: root.school?.name || root.schoolName || j.name || "",
      teachers:   root.teachers   || j.teachers   || [],
      classes:    root.classes    || j.classes    || [],
      subjects:   root.subjects   || j.subjects   || [],
      classrooms: root.classrooms || root.rooms || j.classrooms || j.rooms || [],
    };
  }

  function normTeacher(t, i) {
    return {
      id: String(t.id || t.shortcut || ("T" + (i + 1))),
      name: t.name || t.firstname && (t.firstname + " " + (t.lastname || "")).trim() || ("Teacher " + (i + 1)),
      abbr: t.short || t.shortcut || t.abbr || "",
    };
  }
  function normClass(c, i) {
    return {
      id: String(c.id || c.shortcut || ("C" + (i + 1))),
      name: c.name || c.short || ("Class " + (i + 1)),
    };
  }
  function normSubject(s, i) {
    return {
      id: String(s.id || s.shortcut || ("S" + (i + 1))),
      name: s.name || ("Subject " + (i + 1)),
      abbr: s.short || s.shortcut || s.abbr || "",
    };
  }
  function normRoom(r, i) {
    return {
      id: String(r.id || r.shortcut || ("R" + (i + 1))),
      name: r.name || r.short || ("Room " + (i + 1)),
      capacity: r.capacity || undefined,
    };
  }

  function merge(parsed) {
    const s = APP.school || {
      schoolName: "", bell: { periods: [] },
      teachers: [], classes: [], subjects: [], classrooms: [], lessons: [], cards: [],
    };
    if (parsed.schoolName) s.schoolName = parsed.schoolName;
    if (parsed.teachers.length)   s.teachers   = parsed.teachers.map(normTeacher);
    if (parsed.classes.length)    s.classes    = parsed.classes.map(normClass);
    if (parsed.subjects.length)   s.subjects   = parsed.subjects.map(normSubject);
    if (parsed.classrooms.length) s.classrooms = parsed.classrooms.map(normRoom);
    s._meta = s._meta || {};
    s._meta.sourceFilename = "edupage-basic.json";
    APP.school = s;
    document.querySelectorAll(".needs-school").forEach(b => b.disabled = false);
    window.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { school: s } }));
  }

  async function run(input) {
    try {
      let text;
      if (!input) {
        const f = await pickFile();
        if (!f) return;
        text = await f.text();
      } else if (input instanceof File || input instanceof Blob) {
        text = await input.text();
      } else {
        text = String(input);
      }
      const parsed = parse(text);
      merge(parsed);
      notify(`EduPage Basic imported · ${parsed.teachers.length} teachers · ${parsed.classes.length} classes`);
    } catch (e) {
      notify("EduPage Basic import failed: " + e.message, "error");
      console.error(e);
    }
  }

  window.ImportEduPageBasic = { run, parse };
  window.addEventListener("app:import-edupage-basic", () => run());
})();
