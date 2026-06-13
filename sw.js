/**
 * Chronexa Service Worker.
 *
 * Strategy (v2 — network-first for code):
 *   - Pre-cache the app shell on install for offline support
 *   - NETWORK-FIRST for HTML/JS files: always try the network, fall back
 *     to cache only when offline. This ensures code updates take effect
 *     immediately without requiring manual cache clearing.
 *   - CACHE-FIRST for CSS/images/fonts: these change rarely and are safe
 *     to serve from cache (versioned via query string).
 *   - Bypass cache for CDN scripts and backend /solve endpoint.
 *
 * Result: code changes deploy instantly on reload. App still works fully
 * offline after one visit. The solver runs on the CPU via Web Workers.
 */

const CACHE_PREFIX = "chronexa-";
const APP_VER = "20260612-p139-grid-fixes";
const CACHE_NAME = CACHE_PREFIX + APP_VER;

// Minimal app shell for offline support.
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
      .then((cache) =>
        cache.addAll(APP_SHELL).then(() => {
          console.info("[SW] pre-cache OK — activating");
          return self.skipWaiting();
        })
      )
      .catch((err) => {
        console.warn("[SW] pre-cache failed, activating anyway:", err);
        return self.skipWaiting();
      })
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

// Returns true if the URL is for code (HTML/JS) that should use network-first.
function isCodeFile(url) {
  const path = url.pathname;
  return path.endsWith(".html") ||
         path.endsWith(".js") ||
         path.endsWith(".mjs") ||
         path === "/" ||
         path === "";
}

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

  if (isCodeFile(url)) {
    // NETWORK-FIRST for code files: always try fresh, cache for offline.
    evt.respondWith(
      fetch(evt.request)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(evt.request, clone));
          }
          return resp;
        })
        .catch(() => {
          return caches.match(evt.request).then((cached) => {
            if (cached) return cached;
            if (evt.request.mode === "navigate") {
              return caches.match("./index.html");
            }
          });
        })
    );
  } else {
    // CACHE-FIRST for CSS, images, fonts, etc.
    evt.respondWith(
      caches.match(evt.request).then((cached) => {
        if (cached) return cached;
        return fetch(evt.request).then((resp) => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(evt.request, clone));
          }
          return resp;
        }).catch(() => {
          if (evt.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
      })
    );
  }
});

// Allow the page to trigger an update via postMessage
self.addEventListener("message", (evt) => {
  if (evt.data === "SKIP_WAITING") self.skipWaiting();
});
