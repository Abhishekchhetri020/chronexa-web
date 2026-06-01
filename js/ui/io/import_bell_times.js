/* Classic "Bell times export" importer.
 * Accepts JSON with period rows: [{ name, short, starttime, endtime, period }]
 * (or { periods:[...] } shape). Writes to APP.school.bell.periods using the
 * shape declared in docs/DATA_SHAPES.md:
 *   { index, label, startMin, endMin, isTeaching }
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

  function toMin(s) {
    if (typeof s === "number") return s;
    if (!s) return 0;
    const m = String(s).match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  }

  function parse(raw) {
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    const rows = j.periods || j.bell || j.data || (Array.isArray(j) ? j : []);
    return rows.map((p, i) => {
      const start = toMin(p.starttime || p.start || p.from);
      const end   = toMin(p.endtime   || p.end   || p.to);
      const lbl   = p.short || p.name || p.label || ("P" + (i + 1));
      const isBreak = /break|recess|lunch|interval/i.test(p.name || "") || p.is_break === 1;
      return {
        index: Number(p.period || p.index || (i + 1)),
        label: lbl,
        startMin: start,
        endMin: end,
        isTeaching: !isBreak,
      };
    });
  }

  function apply(periods) {
    const s = APP.school || {
      schoolName: "", bell: { periods: [] },
      teachers: [], classes: [], subjects: [], classrooms: [], lessons: [], cards: [],
    };
    s.bell = s.bell || { periods: [] };
    s.bell.periods = periods;
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
      const periods = parse(text);
      if (!periods.length) throw new Error("No periods found in file");
      apply(periods);
      notify(`Classic Bell times imported · ${periods.length} periods`);
    } catch (e) {
      notify("Classic Bell import failed: " + e.message, "error");
      console.error(e);
    }
  }

  window.ImportBellTimes = { run, parse };
  window.addEventListener("app:import-classic-bell-times", () => run());
})();

// Chronexa Web
