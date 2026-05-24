/**
 * Chronexa Service Worker.
 *
 * Strategy:
 *   - Pre-cache the app shell (HTML, theme CSS, core JS) on install
 *   - Cache-first for all chronexa-web static assets (HTML/CSS/JS/icons)
 *   - Network-first for the optional backend /solve endpoint (so cloud-solver
 *     calls bypass cache; the in-browser solver is the default anyway)
 *   - Bypass cache for CDN scripts (Tailwind, SheetJS, pako) — let the
 *     browser handle their freshness
 *
 * Result: once a user has visited the site once, the app works fully OFFLINE.
 * The solver runs on their CPU via Web Workers; no server is needed.
 */

const CACHE_PREFIX = "chronexa-";
const APP_VER = "20260524-p111-dynamic-periods";
const CACHE_NAME = CACHE_PREFIX + APP_VER;

// Minimal app shell. Critical JS (bundle + solver worker + dynamic-
// import targets) MUST be precached — otherwise the SW registers AFTER
// first load but offline fails when those URLs come back with
// query-string variants the cache hasn't seen yet.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./css/chronexa-theme.css",
  "./css/components.css?v=20260520-p33-allrelations",
  "./css/editor.css",
  "./css/drag_ux.css",
  "./css/teacher_colors.css",
  "./css/classic-skin.css",
  "./css/entities.css",
  "./css/ribbon.css",
  "./css/solver_ui.css",
  // Core JS — must be present offline.
  "./js/bundle.js?v=" + APP_VER,
  "./js/solver/worker.js?v=" + APP_VER,
  "./js/solver/csp_solver.js?v=" + APP_VER,
  "./js/solver/constraints.js?v=" + APP_VER,
  "./js/xml/parse_timetable_xml.js?v=" + APP_VER,
];

self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => null)) // best-effort
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evt) => {
  const url = new URL(evt.request.url);

  // Don't touch the optional backend (cloud solver) or CDN scripts
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith("/solve") ||
    /tailwindcss\.com|jsdelivr\.net|sheetjs\.com|cdnjs\.cloudflare\.com/.test(url.hostname)
  ) {
    return; // browser handles it normally
  }

  // Only handle GETs
  if (evt.request.method !== "GET") return;

  evt.respondWith(
    caches.match(evt.request).then((cached) => {
      if (cached) return cached;
      return fetch(evt.request).then((resp) => {
        // Cache successful 200s from same origin
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(evt.request, clone));
        }
        return resp;
      }).catch(() => {
        // Total offline fallback: serve the index.html for SPA-like resilience
        if (evt.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    })
  );
});

// Allow the page to trigger an update via postMessage
self.addEventListener("message", (evt) => {
  if (evt.data === "SKIP_WAITING") self.skipWaiting();
});
