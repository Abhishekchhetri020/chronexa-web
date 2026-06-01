/* Help Center — searchable in-app docs.
 *
 * The user said the UI must be friendly. A searchable help center surfaces
 * every feature with plain-language explanations. Topics map directly to
 * the menu structure so users can find anything by name OR by what they
 * want to do.
 *
 * Triggered by app:help-center event (Help menu wires entry).
 */
(function (global) {
  "use strict";

  const TOPICS = [
    {
      id: "first-timetable",
      title: "Make my first timetable in 10 minutes",
      keywords: ["start", "new", "begin", "first", "blank", "fresh"],
      content: `
        <h3>10-minute fresh start</h3>
        <ol>
          <li><strong>Click ✨ Create new timetable</strong> on the start screen.</li>
          <li>The 5-step wizard walks you through: <em>Subjects → Teachers → Classes → Classrooms → Lessons</em>. Skip any step you'll fill in later.</li>
          <li>When done, click <strong>⚡ Generate</strong> (top-right) or open <em>Timetable → 🚀 Master Solve</em> for the one-click pipeline.</li>
          <li>Drag any card to a different slot to fine-tune.</li>
          <li>Export with <em>Files → Export → Timetable XML</em> or print via <em>Files → Print preview</em>.</li>
        </ol>`,
    },
    {
      id: "school-settings",
      title: "Configure school basics (name, days, periods, bell)",
      keywords: ["school", "name", "year", "days", "periods", "bell"],
      content: `
        <h3>School configuration</h3>
        <p>Open <em>Step 2 — School Info</em> in the wizard OR <em>Specification → School settings…</em></p>
        <p>17 settings cover school identity, calendar (days/week, periods/day), and solver hints. For separate bell schedules per class, open <em>Specification → Bell times / Periods…</em></p>`,
    },
    {
      id: "solver",
      title: "Run the auto-scheduler (solver)",
      keywords: ["solver", "generate", "auto", "schedule", "computer", "cpu"],
      content: `
        <h3>The solver</h3>
        <p>Chronexa's solver runs <strong>entirely on your computer</strong> — no server, no upload, no internet required after first load.</p>
        <p>Three modes:</p>
        <ul>
          <li><strong>🧪 Test</strong> — checks constraints without moving cards.</li>
          <li><strong>⚡ Generate</strong> — clears placement and runs from scratch.</li>
          <li><strong>🚀 Master Solve (one-click)</strong> — runs Generate → Improve → Auto-fix → Verify in one click. Use this for a guaranteed result.</li>
          <li><strong>✨ Improve</strong> — takes your current placement and tries to lower soft penalties without unplacing.</li>
        </ul>
        <p>The solver uses Min-Conflicts + iterative repair + displacement chains. Target placement rate: 80%+ on real schools (verified at 92% on a 951-card school).</p>`,
    },
    {
      id: "constraints",
      title: "Set up scheduling rules (constraints)",
      keywords: ["constraint", "rule", "n_", "relation", "preference"],
      content: `
        <h3>Constraints, two layers</h3>
        <p><strong>Hard relations</strong> (Specification → Relations…) — 15 Classic-standard rules: "two subjects can't follow", "same period each day", "first or last", etc. Each rule has 3-step wizard.</p>
        <p><strong>Soft scoring rules</strong> (Options → Constraints library…) — 12 friendly templates like "Teacher X prefers morning periods" or "Subject Y should be first or last". Each rule has a weight; higher = stronger preference.</p>
        <p><strong>Per-entity constraints</strong> — open any teacher / class / classroom / subject dialog and click <em>Time off</em> or <em>Constraints</em>. 14 fields per class, 11 per teacher.</p>`,
    },
    {
      id: "wildcard",
      title: "Wildcard lessons (let solver pick teacher or room)",
      keywords: ["wildcard", "any", "auto-assign", "?", "unassigned"],
      content: `
        <h3>Wildcard lessons</h3>
        <p>Open any lesson dialog. Tick "Wildcard teacher (?)" or "Wildcard room (?)". The solver will fill those for you using qualification and capacity constraints.</p>`,
    },
    {
      id: "divisions",
      title: "Split a class into groups (labs, language tracks)",
      keywords: ["division", "split", "group", "lab", "boys", "girls"],
      content: `
        <h3>Class divisions</h3>
        <p>Open <em>Specification → Classes…</em>, select a class, click <em>Divisions</em>. Build a tree: division → groups. Quick-add takes a comma-separated list ("Boys, Girls" → 2 groups).</p>
        <p>Assign lessons to specific groups via the Lesson dialog's group picker.</p>`,
    },
    {
      id: "substitution",
      title: "Mark a teacher absent and find substitutes",
      keywords: ["substitute", "absent", "cover", "relief"],
      content: `
        <h3>Substitution planner</h3>
        <p>Open <em>Timetable → Substitutions…</em> Pick a date, mark absent teachers, see ranked free substitutes (+100 for same subject, +30 for already teaches the class, -5 for already covered today). Drag to assign.</p>`,
    },
    {
      id: "import-export",
      title: "Import / export Timetable XML, Excel, ICS, PowerSchool",
      keywords: ["export", "import", "xml", "classic", "excel", "ics", "powerschool", "untis"],
      content: `
        <h3>File formats</h3>
        <p><strong>Open / Import</strong>: <em>Files → Import</em> — Timetable XML, Classic Basic, GP Untis, clipboard TSV.</p>
        <p><strong>Export</strong>: <em>Files → Export</em> — Timetable XML, Excel (5 sheets), HTML standalone, PowerSchool, GP Untis DIF, Atlantis ROZ, ICS calendar.</p>
        <p><strong>Migrate from Classic</strong>: export a HAR from Chrome DevTools while your Classic timetable is open, then <em>Files → Import → CardRelationships HAR</em> to bring your constraints over.</p>`,
    },
    {
      id: "shortcuts",
      title: "Keyboard shortcuts",
      keywords: ["shortcut", "keyboard", "hotkey", "cmd", "ctrl"],
      content: `
        <h3>Keyboard shortcuts</h3>
        <table style="font-size:13px">
          <tr><td><kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd></td><td>Open command palette</td></tr>
          <tr><td><kbd>⌘Z</kbd> / <kbd>Ctrl+Z</kbd></td><td>Undo</td></tr>
          <tr><td><kbd>⇧⌘Z</kbd></td><td>Redo</td></tr>
          <tr><td><kbd>⌘S</kbd></td><td>Save</td></tr>
          <tr><td><kbd>⌘N</kbd></td><td>New entity (in any entity dialog)</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>Close any open dialog</td></tr>
        </table>`,
    },
    {
      id: "offline",
      title: "Work offline / install as app / download ZIP",
      keywords: ["offline", "install", "pwa", "zip", "download"],
      content: `
        <h3>Three install modes</h3>
        <p><strong>1. Just use the URL</strong> — bookmark it, no install. Works offline after first visit (service worker caches everything).</p>
        <p><strong>2. Install as app</strong> — click "Install Chronexa" in your browser address bar (Chrome / Edge). Behaves like a real app. Works fully offline.</p>
        <p><strong>3. Download ZIP</strong> — grab the GitHub release ZIP and unzip. Double-click index.html to run with zero internet.</p>
        <p>All three modes run the solver on YOUR device's CPU. No server, no cloud.</p>`,
    },
    {
      id: "hover-tooltip",
      title: "Why is a card red? (Constraint explainer)",
      keywords: ["red", "conflict", "violation", "explain", "tooltip", "why"],
      content: `
        <h3>Hover a flagged card</h3>
        <p>Any red or yellow card in the editor — hover it for ~150ms. A tooltip appears with the exact conflict in plain English, e.g. "Mr. Sharma already teaches IX-A in this period."</p>
        <p>Hold <kbd>Shift</kbd> while hovering to see explanations even for clean cards.</p>
        <p>The tooltip also has a 🛠 Fix button (alpha) that suggests an alternative slot.</p>`,
    },
    {
      id: "auto-fix",
      title: "Auto-fix conflicts (one click)",
      keywords: ["auto-fix", "fix", "repair", "automatic"],
      content: `
        <h3>Auto-fix</h3>
        <p>Open <em>Timetable → 🔧 Verification Pro</em>. Each violation has a 🔧 Suggest fix button → preview → apply. Or use 🪄 Auto-fix all hard violations to bulk-apply every clean suggestion.</p>`,
    },
  ];

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false)
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function score(t, q) {
    if (!q) return 0;
    const qLow = q.toLowerCase();
    let s = 0;
    if (t.title.toLowerCase().includes(qLow)) s += 10;
    for (const k of t.keywords) {
      if (k.toLowerCase().includes(qLow)) s += 3;
    }
    if (t.content.toLowerCase().includes(qLow)) s += 1;
    return s;
  }

  function open() {
    ensureStyles();
    const root = el("div", { class: "chrx-help-root",
      onclick: e => { if (e.target === root) root.remove(); } });
    const panel = el("div", { class: "chrx-help-panel" });

    panel.appendChild(el("header", null,
      el("h2", null, "📖 Help — search anything you need to do"),
      el("button", { class: "chrx-help-close", "aria-label": "Close", onclick: () => root.remove() }, "×"),
    ));

    const searchEl = el("input", { type: "search", class: "chrx-help-search",
      placeholder: "Type what you want to do… e.g. 'mark teacher absent'", autofocus: "autofocus",
      oninput: e => render(e.target.value) });
    panel.appendChild(searchEl);

    const listEl = el("div", { class: "chrx-help-list" });
    const detailEl = el("div", { class: "chrx-help-detail" });
    panel.appendChild(el("div", { class: "chrx-help-body" }, listEl, detailEl));

    function render(q) {
      listEl.innerHTML = "";
      const scored = TOPICS.map(t => ({ t, s: score(t, q) })).filter(x => !q || x.s > 0);
      scored.sort((a, b) => b.s - a.s);
      (q ? scored : TOPICS.map(t => ({ t, s: 0 }))).forEach(({ t }) => {
        const item = el("button", { class: "chrx-help-item", onclick: () => showDetail(t) }, t.title);
        listEl.appendChild(item);
      });
      if (q && !scored.length) {
        listEl.appendChild(el("div", { class: "chrx-help-empty" }, "No matches. Try a different word."));
      }
    }
    function showDetail(t) {
      detailEl.innerHTML = "";
      detailEl.appendChild(el("h3", null, t.title));
      const body = document.createElement("div");
      body.innerHTML = t.content;
      detailEl.appendChild(body);
    }

    render("");
    showDetail(TOPICS[0]);

    root.appendChild(panel);
    document.body.appendChild(root);
    setTimeout(() => searchEl.focus(), 60);
  }

  function ensureStyles() {
    if (document.getElementById("chrx-help-styles")) return;
    const s = document.createElement("style");
    s.id = "chrx-help-styles";
    s.textContent = `
.chrx-help-root{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px;z-index:1000;overflow:auto}
.chrx-help-panel{background:#fff;border-radius:14px;width:min(960px,98vw);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#0f172a;overflow:hidden}
.chrx-help-panel header{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #e2e8f0}
.chrx-help-panel h2{margin:0;font-size:16px;color:#1e3a8a}
.chrx-help-close{background:none;border:0;font-size:22px;cursor:pointer;color:#64748b}
.chrx-help-search{margin:14px 18px;padding:10px 14px;border:2px solid #cbd5e1;border-radius:10px;font-size:14px;outline:none;transition:border .15s ease}
.chrx-help-search:focus{border-color:#4f46e5}
.chrx-help-body{flex:1;display:grid;grid-template-columns:300px 1fr;overflow:hidden;border-top:1px solid #f1f5f9}
.chrx-help-list{padding:6px 8px 12px;overflow-y:auto;background:#f8fafc;border-right:1px solid #e2e8f0}
.chrx-help-item{display:block;width:100%;text-align:left;background:none;border:0;padding:8px 12px;font-size:13px;color:#0f172a;border-radius:6px;cursor:pointer;transition:background .15s ease;margin-bottom:2px}
.chrx-help-item:hover{background:#e0e7ff}
.chrx-help-empty{padding:18px;text-align:center;color:#94a3b8;font-size:13px}
.chrx-help-detail{padding:18px 24px;overflow-y:auto}
.chrx-help-detail h3{margin:0 0 12px;color:#1e3a8a;font-size:16px}
.chrx-help-detail p,.chrx-help-detail li{font-size:13px;color:#334155;line-height:1.6}
.chrx-help-detail ul,.chrx-help-detail ol{padding-left:22px}
.chrx-help-detail kbd{background:#f1f5f9;border:1px solid #cbd5e1;padding:1px 5px;border-radius:4px;font-size:11px;font-family:Menlo,Monaco,monospace}
.chrx-help-detail table{border-collapse:collapse;margin:8px 0}
.chrx-help-detail table td{padding:4px 12px 4px 0;font-size:13px;color:#334155}
    `;
    document.head.appendChild(s);
  }

  window.addEventListener("app:help-center", () => open());
  window.addEventListener("app:documentation", () => open());

  global.HelpCenter = { open, TOPICS };
})(window);

// Chronexa Web
