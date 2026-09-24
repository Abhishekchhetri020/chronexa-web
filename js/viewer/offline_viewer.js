/* Chronexa OFFLINE published-file LOADER — the only W2-3 code inside a published .html.
 *
 * Review 1 (orchestrator): ONE renderer. The published viewer
 * (`index.html?view=published`) and the offline file draw with the SAME code:
 * W2-2's `window.ChronexaViewer.render(rootEl, snapshot)` from js/viewer/render.js.
 * This file therefore contains NO renderer at all. It:
 *   1. reads the inlined C2 snapshot
 *      (<script type="application/json" id="chronexa-snapshot">),
 *   2. injects the reader's stylesheet if the bundle carries it as a string
 *      (window.ChronexaViewer.css — a published file is ONE file, so no <link>),
 *   3. calls ChronexaViewer.render(rootEl, snapshot).
 * Anything else — reader missing, snapshot missing or unreadable, the reader
 * throwing or painting nothing — shows a clear error card. Never a second
 * renderer, never a blank page.
 *
 * ZERO imports and ZERO exports on purpose: publish.js inlines this module (and
 * W2-2's reader, via js/viewer/viewer_entry.js) as one classic <script>, which
 * is what makes the file open from file:// on a phone.
 */
(function (global) {
  "use strict";

  const VERSION = 1;
  const ROOT_ID = "chronexa-viewer-root";
  const SNAPSHOT_ID = "chronexa-snapshot";
  const SHARED_STYLE_ID = "chronexa-shared-viewer-style";

  function el(tag, attrs, text) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    if (text != null) n.textContent = String(text);
    return n;
  }

  function resolveRoot(rootEl) {
    if (typeof rootEl === "string") return document.getElementById(rootEl);
    return rootEl || document.getElementById(ROOT_ID);
  }

  /** Parsed snapshot from the inlined JSON block, or null. */
  function readInlineSnapshot(doc) {
    const node = (doc || document).getElementById(SNAPSHOT_ID);
    if (!node) return null;
    try { return JSON.parse(node.textContent || node.innerHTML || "null"); }
    catch (e) { return null; }
  }

  /** W2-2 ships css/viewer.css; the bundle entry inlines it as a string so the
   *  published file stays self-contained. js/viewer/viewer_entry.js hands it to
   *  the loader (and to the reader when it takes it). */
  function injectSharedStyle(doc) {
    const fromReader = global.ChronexaViewer && global.ChronexaViewer.css;
    const fromBundle = api && api.css;
    const css = (typeof fromReader === "string" && fromReader) ? fromReader
      : (typeof fromBundle === "string" && fromBundle) ? fromBundle : "";
    if (!css || doc.getElementById(SHARED_STYLE_ID)) return;
    doc.head.appendChild(el("style", { id: SHARED_STYLE_ID }, css));
  }

  /** The one and only thing this loader draws: a readable failure. */
  function fail(root, message, detail) {
    root.textContent = "";
    const card = el("div", { class: "chrx-pub-error", role: "alert" },
      "This published timetable cannot be shown.");
    card.style.cssText = "max-width:34rem;margin:12vh auto;padding:18px 20px;border:1px solid #f0c2c2;" +
      "border-left:6px solid #c0392b;border-radius:12px;background:#fff7f7;color:#3f1d1d;" +
      "font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
    card.appendChild(el("p", { style: "margin:0 0 8px;font-weight:700" }, message));
    if (detail) card.appendChild(el("p", { style: "margin:0;color:#6b3b3b;font-size:13px" }, detail));
    card.appendChild(el("p", { style: "margin:10px 0 0;color:#6b3b3b;font-size:13px" },
      "Ask the school to re-publish the file from Chronexa (Files → Export → Publish timetable…)."));
    root.appendChild(card);
    return null;
  }

  /**
   * render(rootEl, snapshot) — same argument order as W2-2's reader.
   * Delegates; draws nothing itself. The body class mirrors boot.js so the
   * reader's own stylesheet applies in the published file too.
   */
  function render(rootEl, snapshot) {
    const root = resolveRoot(rootEl);
    if (!root) return null;
    const doc = root.ownerDocument || document;
    if (doc.body) doc.body.classList.add("chrx-viewer-active");
    const shared = global.ChronexaViewer;
    if (!shared || typeof shared.render !== "function") {
      return fail(root,
        "This file is missing its timetable viewer.",
        "The viewer bundle was not inlined into this file.");
    }
    if (!snapshot || typeof snapshot !== "object") {
      return fail(root,
        "This file has no timetable data.",
        'Expected a <script type="application/json" id="chronexa-snapshot"> block.');
    }
    try {
      injectSharedStyle(doc);
      const out = shared.render(root, snapshot);
      if (!root.childNodes.length) {
        return fail(root, "The timetable viewer did not render anything.",
          "The file may have been damaged in transit.");
      }
      return out;
    } catch (e) {
      return fail(root, "The timetable viewer failed to start.",
        (e && e.message) ? String(e.message) : "");
    }
  }

  function mount(rootEl) {
    const root = resolveRoot(rootEl);
    if (!root) return null;
    const doc = root.ownerDocument || document;
    const node = doc.getElementById(SNAPSHOT_ID);
    if (!node) return fail(root, "This file has no timetable data.",
      'Expected a <script type="application/json" id="chronexa-snapshot"> block.');
    let snapshot = null;
    try { snapshot = JSON.parse(node.textContent || node.innerHTML || "null"); }
    catch (e) {
      return fail(root, "The timetable data in this file is unreadable.",
        "The inlined snapshot is not valid JSON.");
    }
    return render(root, snapshot);
  }

  function autoMount() {
    const root = document.getElementById(ROOT_ID);
    if (root && !root.childNodes.length) mount(root);
  }

  const api = { render, mount, autoMount, readInlineSnapshot, VERSION };
  global.ChronexaPublishedFile = api;
  if (typeof document !== "undefined") {
    // The reader is registered by the module imported AFTER this one in the
    // bundle, so never mount synchronously — defer past its evaluation.
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoMount);
    else setTimeout(autoMount, 0);
  }
})(typeof window !== "undefined" ? window : globalThis);
