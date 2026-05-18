/* GP-Untis DIF (Data Interchange Format) importer.
 * Each record line:   #<type>;<field1>;<field2>;...
 * Types per spec:
 *   1 = teachers     (id; short; name; ...)
 *   2 = classes      (id; short; name; ...)
 *   3 = subjects     (id; short; name; ...)
 *   4 = rooms        (id; short; name; capacity; ...)
 *   5 = lessons      (id; class; subject; teacher; periodsPerWeek; ...)
 *
 * Tolerant: skips comments (// or *), ignores trailing semicolons,
 * accepts CR/LF or LF.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;

  function pickFile() {
    return new Promise(res => {
      const i = document.createElement("input");
      i.type = "file"; i.accept = ".txt,.csv,.dif,text/plain";
      i.style.display = "none";
      i.onchange = () => res(i.files && i.files[0] || null);
      document.body.appendChild(i); i.click();
      setTimeout(() => i.remove(), 200);
    });
  }

  function parse(text) {
    const teachers = [], classes = [], subjects = [], classrooms = [], lessons = [];
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      const ln = raw.trim();
      if (!ln || ln.startsWith("//") || ln.startsWith("*")) continue;
      const m = ln.match(/^#\s*(\d+)\s*;(.*)$/);
      if (!m) continue;
      const type = Number(m[1]);
      const cells = m[2].split(";").map(c => c.trim().replace(/^"|"$/g, ""));
      if (type === 1) {
        teachers.push({ id: cells[0] || ("T" + (teachers.length + 1)), name: cells[2] || cells[1] || "", abbr: cells[1] || "" });
      } else if (type === 2) {
        classes.push({ id: cells[0] || ("C" + (classes.length + 1)), name: cells[2] || cells[1] || "" });
      } else if (type === 3) {
        subjects.push({ id: cells[0] || ("S" + (subjects.length + 1)), name: cells[2] || cells[1] || "", abbr: cells[1] || "" });
      } else if (type === 4) {
        classrooms.push({ id: cells[0] || ("R" + (classrooms.length + 1)), name: cells[2] || cells[1] || "", capacity: Number(cells[3]) || undefined });
      } else if (type === 5) {
        lessons.push({
          id: cells[0] || ("L" + (lessons.length + 1)),
          classIds: cells[1] ? cells[1].split(",").map(x => x.trim()).filter(Boolean) : [],
          subjectId: cells[2] || "",
          teacherIds: cells[3] ? cells[3].split(",").map(x => x.trim()).filter(Boolean) : [],
          periodsPerWeek: Number(cells[4]) || 0,
        });
      }
    }
    return { teachers, classes, subjects, classrooms, lessons };
  }

  function apply(parsed) {
    const s = APP.school || {
      schoolName: "", bell: { periods: [] },
      teachers: [], classes: [], subjects: [], classrooms: [], lessons: [], cards: [],
    };
    if (parsed.teachers.length)   s.teachers   = parsed.teachers;
    if (parsed.classes.length)    s.classes    = parsed.classes;
    if (parsed.subjects.length)   s.subjects   = parsed.subjects;
    if (parsed.classrooms.length) s.classrooms = parsed.classrooms;
    if (parsed.lessons.length)    s.lessons    = parsed.lessons;
    s._meta = s._meta || {};
    s._meta.sourceFilename = "gp-untis.dif";
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
      const total = parsed.teachers.length + parsed.classes.length + parsed.subjects.length + parsed.classrooms.length + parsed.lessons.length;
      if (!total) throw new Error("No GP-Untis records (#1..#5) found");
      apply(parsed);
      notify(`GP-Untis DIF imported · ${parsed.teachers.length} T · ${parsed.classes.length} C · ${parsed.subjects.length} S · ${parsed.classrooms.length} R · ${parsed.lessons.length} L`);
    } catch (e) {
      notify("GP-Untis import failed: " + e.message, "error");
      console.error(e);
    }
  }

  window.ImportGpUntis = { run, parse };
  window.addEventListener("app:import-gp-untis", () => run());
})();
