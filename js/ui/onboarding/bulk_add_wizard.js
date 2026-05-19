/* Bulk-add wizard — paste a list / spreadsheet to create N entities at once.
 *
 * Friendly UX for fresh-start schools: the school admin types or pastes
 * teacher names / class names / subjects, one per line OR comma-separated,
 * and the wizard creates N entities at once with sensible defaults
 * (auto colors, sequential numbering, etc.).
 *
 * window.BulkAddWizard.open(kind, school?)  // kind: 'teachers' | 'classes' | 'subjects' | 'classrooms'
 */
(function (global) {
  "use strict";

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false)
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  // Detect if the pasted text is a TSV/CSV with a header row. If so, look
  // for a "name"-like column and emit values from that. Otherwise fall back
  // to the original newline-then-comma split. Returns up to 200 items.
  function parse(text) {
    if (!text) return [];
    const lines = text.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return [];

    // TSV/CSV detection: first line has multiple cells AND looks header-y
    // (contains "name" / "teacher" / "subject" / "class" / "room").
    const firstLine = lines[0];
    const hasTab = firstLine.includes("\t");
    const hasSemi = firstLine.includes(";");
    const cellsInFirst = (hasTab ? firstLine.split("\t") :
                          hasSemi ? firstLine.split(";") :
                          firstLine.split(","));
    const headerLooksReal = cellsInFirst.length >= 2 &&
      /name|teacher|subject|class|room|abbr|short/i.test(firstLine);

    if (lines.length > 1 && headerLooksReal) {
      const sep = hasTab ? "\t" : (hasSemi ? ";" : ",");
      const headers = cellsInFirst.map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
      // Pick name column. Priority: "name", "teacher", "subject", "class",
      // "room", "title". Else column 0.
      const priorities = ["name", "fullname", "teacher", "subject", "class",
                          "room", "classroom", "title"];
      let nameCol = -1;
      for (const p of priorities) {
        const i = headers.indexOf(p);
        if (i >= 0) { nameCol = i; break; }
      }
      if (nameCol < 0) nameCol = 0;
      return lines.slice(1).map(l => {
        const cells = l.split(sep).map(c => c.replace(/^"|"$/g, "").trim());
        return (cells[nameCol] || "").trim();
      }).filter(Boolean).slice(0, 200);
    }

    // No header → original behaviour: newline-split, fall back to commas.
    let parts = lines;
    if (parts.length === 1 && parts[0].includes(",")) {
      parts = parts[0].split(/,\s*/).map(s => s.trim()).filter(Boolean);
    }
    return parts.slice(0, 200);
  }

  function open(kind, school) {
    school = school || global.APP?.school;
    if (!school) { (global._chrxNotify || console.log)("Open a timetable first.", "error"); return; }
    ensureStyles();

    const labels = {
      teachers:   { plural: "teachers",  defaultColor: () => "#10b981", store: "teachers"   },
      subjects:   { plural: "subjects",  defaultColor: () => "#3b82f6", store: "subjects"   },
      classes:    { plural: "classes",   defaultColor: () => "#a855f7", store: "classes"    },
      classrooms: { plural: "classrooms",defaultColor: () => "#f59e0b", store: "classrooms" },
    };
    const info = labels[kind];
    if (!info) return;

    const root = el("div", { class: "chrx-bulk-root", onclick: e => { if (e.target === root) root.remove(); } });
    const panel = el("div", { class: "chrx-bulk-panel" });

    panel.appendChild(el("header", null,
      el("h2", null, `📋 Bulk add ${info.plural}`),
      el("button", { class: "chrx-bulk-close", "aria-label": "Close", onclick: () => root.remove() }, "×")
    ));
    panel.appendChild(el("p", { class: "chrx-bulk-sub" },
      `Paste a list of ${info.plural} — one per line, comma-separated, OR a full TSV/CSV with a header row (we'll auto-pick the "name" column). We'll auto-create them with default colors.`));

    const exampleByKind = {
      teachers: "Mr. Sharma\nMrs. Verma\nMs. Kapoor",
      subjects: "Maths\nScience\nEnglish\nHindi",
      classes:  "I A, I B, II A, II B",
      classrooms: "Room 101\nRoom 102\nLab 1\nLibrary",
    };
    const ta = el("textarea", { class: "chrx-bulk-text", rows: "10",
      placeholder: exampleByKind[kind] || "" });
    panel.appendChild(ta);

    const previewEl = el("div", { class: "chrx-bulk-preview" });
    panel.appendChild(previewEl);

    let parsedItems = [];
    ta.addEventListener("input", () => {
      parsedItems = parse(ta.value);
      previewEl.textContent = parsedItems.length
        ? `${parsedItems.length} ${info.plural} will be created.`
        : "Type names above to preview.";
    });

    const useColorTaxonomy = window.ColorTaxonomy && window.ColorTaxonomy.colorForId;

    panel.appendChild(el("footer", null,
      el("button", { class: "chrx-bulk-cancel", onclick: () => root.remove() }, "Cancel"),
      el("button", { class: "chrx-bulk-go", onclick: () => {
        if (!parsedItems.length) return;
        const arr = (school[info.store] = school[info.store] || []);
        let added = 0;
        parsedItems.forEach((name, i) => {
          const id = info.store[0] + "_b_" + Date.now() + "_" + i;
          const color = useColorTaxonomy ? window.ColorTaxonomy.colorForId(id, kind.slice(0, -1)) : info.defaultColor();
          arr.push({ id, name, short: name.slice(0, 6), color });
          added++;
        });
        if (global.CreateNew?.refreshIndex) global.CreateNew.refreshIndex();
        if (global.APP?.audit?.append) {
          global.APP.audit.append({ entity: kind, op: "bulk-add", added });
        }
        window.dispatchEvent(new CustomEvent("entity:changed", { detail: { entity: kind, count: added } }));
        (global._chrxNotify || console.log)(`✓ Added ${added} ${info.plural}`);
        root.remove();
      } }, "Add all")
    ));

    root.appendChild(panel);
    document.body.appendChild(root);
    ta.focus();
  }

  function ensureStyles() {
    if (document.getElementById("chrx-bulk-styles")) return;
    const s = document.createElement("style");
    s.id = "chrx-bulk-styles";
    s.textContent = `
.chrx-bulk-root{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;z-index:1100}
.chrx-bulk-panel{background:#fff;border-radius:14px;width:min(520px,95vw);padding:20px 24px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:-apple-system,sans-serif}
.chrx-bulk-panel header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:10px}
.chrx-bulk-panel h2{margin:0;font-size:16px;color:#1e3a8a}
.chrx-bulk-close{background:none;border:0;font-size:22px;cursor:pointer;color:#64748b}
.chrx-bulk-sub{margin:0 0 12px;color:#64748b;font-size:13px;line-height:1.5}
.chrx-bulk-text{width:100%;border:2px solid #cbd5e1;border-radius:8px;padding:10px;font-size:13px;font-family:Menlo,Monaco,monospace;outline:none;transition:border .15s ease;box-sizing:border-box}
.chrx-bulk-text:focus{border-color:#4f46e5}
.chrx-bulk-preview{margin-top:8px;font-size:12px;color:#10b981;min-height:18px}
.chrx-bulk-panel footer{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.chrx-bulk-cancel{background:#fff;border:1px solid #cbd5e1;color:#0f172a;padding:6px 14px;border-radius:6px;cursor:pointer}
.chrx-bulk-go{background:#10b981;color:#fff;border:0;padding:6px 16px;border-radius:6px;font-weight:600;cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  global.BulkAddWizard = { open, parse };
})(window);
