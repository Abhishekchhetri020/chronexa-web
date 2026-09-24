/**
 * Dedicated Vite entry for the OFFLINE viewer bundle (contract C2, W2-3).
 *
 * Emitted at a stable path, dist/viewer.js (see `viewer` in vite.config.js).
 * The Publish dialog fetches this file and inlines it into the single-file
 * .html it downloads, so the published timetable opens from file:// with no
 * server, no CDN and no module scripts.
 *
 * Review 1 rule: ONE renderer. This bundle = W2-2's reader + stylesheet +
 * W2-3's loader (js/viewer/offline_viewer.js). There is no second renderer.
 *
 * W2-2's files (js/viewer/render.js, css/viewer.css) are referenced through the
 * `virtual:chronexa-viewer-reader` module (see vite.config.js) — never copied,
 * never edited — so this entry builds both before and after W2-2 merges:
 *   - reader absent  → the virtual module is empty and the loader reports
 *                      "viewer missing" when the published file is opened;
 *   - reader present → the real render.js registers window.ChronexaViewer here
 *                      and its stylesheet is carried as a string (a published
 *                      file is ONE file, so the loader injects the CSS rather
 *                      than shipping a .css asset / <link>).
 *
 * No exports: the emitted chunk must contain ZERO ESM syntax so it can be
 * inlined in a classic <script> (file:// blocks module CORS).
 */
import "./offline_viewer.js";                                    // the loader (mounts deferred)
import { viewerCss } from "virtual:chronexa-viewer-reader";       // W2-2's reader + stylesheet

if (typeof window !== "undefined") {
  const api = window.ChronexaPublishedFile;
  if (api) {
    // Namespaced hand-off: the loader injects `api.css` when the reader did not
    // publish its own string, so the file is styled whichever way W2-2 ships it.
    if (viewerCss) api.css = viewerCss;
    api.bundle = {
      reader: typeof window.ChronexaViewer === "object" && window.ChronexaViewer !== null
        && typeof window.ChronexaViewer.render === "function",
      css: viewerCss ? viewerCss.length : 0,
    };
    if (window.ChronexaViewer && viewerCss) window.ChronexaViewer.css = viewerCss;
  }
}
