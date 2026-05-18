/* Help — About, Documentation, Keyboard shortcuts */
(function () {
  "use strict";
  const APP = window.APP;
  const fire = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d || {} }));

  function showShortcuts() {
    const wrap = document.createElement("div");
    wrap.className = "chrx-dlg-scrim is-open";
    const dlg = document.createElement("div");
    dlg.className = "chrx-dlg";
    dlg.innerHTML = `
      <h2>Keyboard shortcuts</h2>
      <p>The basics — works in any view.</p>
      <table>
        <tr><td><span class="chrx-kbd">⌘O</span></td><td>Open file</td></tr>
        <tr><td><span class="chrx-kbd">⌘S</span></td><td>Save</td></tr>
        <tr><td><span class="chrx-kbd">⇧⌘S</span></td><td>Save as…</td></tr>
        <tr><td><span class="chrx-kbd">⌘Z</span></td><td>Undo</td></tr>
        <tr><td><span class="chrx-kbd">⇧⌘Z</span> / <span class="chrx-kbd">⌘Y</span></td><td>Redo</td></tr>
        <tr><td><span class="chrx-kbd">⌘P</span></td><td>Print preview</td></tr>
        <tr><td><span class="chrx-kbd">⌘F</span></td><td>Focus search</td></tr>
        <tr><td><span class="chrx-kbd">Esc</span></td><td>Close menu / dialog</td></tr>
      </table>
      <div class="chrx-dlg__actions">
        <button class="chrx-tb-btn chrx-tb-btn--primary" id="chrx-help-close">Close</button>
      </div>`;
    wrap.appendChild(dlg); document.body.appendChild(wrap);
    const close = () => wrap.remove();
    dlg.querySelector("#chrx-help-close").onclick = close;
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  }

  function showAbout() {
    const wrap = document.createElement("div");
    wrap.className = "chrx-dlg-scrim is-open";
    const dlg = document.createElement("div");
    dlg.className = "chrx-dlg";
    const ver = window.APP_VER || "dev";
    dlg.innerHTML = `
      <h2>Chronexa</h2>
      <p>Open timetable. Yours to keep.</p>
      <table>
        <tr><th>Version</th><td>${ver}</td></tr>
        <tr><th>Mode</th><td>browser-only (no upload)</td></tr>
        <tr><th>Solver</th><td>browser CSP or OR-Tools backend</td></tr>
        <tr><th>License</th><td>MIT</td></tr>
      </table>
      <div class="chrx-dlg__actions">
        <button class="chrx-tb-btn chrx-tb-btn--primary" id="chrx-about-close">Close</button>
      </div>`;
    wrap.appendChild(dlg); document.body.appendChild(wrap);
    const close = () => wrap.remove();
    dlg.querySelector("#chrx-about-close").onclick = close;
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  }

  APP.ribbon.registerMenu({
    key: "help", label: "Help",
    build() {
      return [
        { icon: "ℹ︎", label: "About Chronexa…", run: showAbout },
        { icon: "📖", label: "Documentation",  run: () => window.open("https://github.com/Abhishekchhetri020/chronexa-web", "_blank") },
        { icon: "⌨︎", label: "Keyboard shortcuts…", run: showShortcuts },
        { sep: true },
        { icon: "💬", label: "Questions / Comments", run: () => fire("app:feedback"), soon: true },
        { icon: "🎬", label: "Show demo file",       run: () => fire("app:open-demo") },
      ];
    },
  });
})();
