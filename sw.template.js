/**
 * Chronexa Service Worker — TEMPLATE.
 *
 * dist/sw.js is generated from this file at build time by the
 * "chronexa-sw-and-copy" plugin in vite.config.js, which fills in:
 *   __APP_VER__     — window.APP_VER from index.html
 *   __BUILD_HASH__  — short hash of the precache list (auto cache-busting)
 *   __PRECACHE__    — every hashed JS/CSS/HTML/WASM asset Vite emitted
 *
 * Strategy (unchanged from the hand-written v2 sw.js):
 *   - Pre-cache the app shell on install for offline support
 *   - NETWORK-FIRST for HTML/JS/CSS: always try the network, fall back to cache
 *     only when offline — code updates take effect immediately.
 *   - CACHE-FIRST for fingerprinted images/fonts/wasm.
 *   - Bypass CDN scripts and the backend /solve endpoint.
 *   - Inject COOP/COEP on every same-origin response so the page is
 *     cross-origin isolated (required for WASM CP-SAT threads +
 *     SharedArrayBuffer). Do NOT remove addCoiHeaders.
 */

const CACHE_PREFIX = "chronexa-";
const APP_VER = "__APP_VER__";
const CACHE_NAME = CACHE_PREFIX + APP_VER + "-__BUILD_HASH__";

function addCoiHeaders(resp) {
  if (!resp || resp.status === 0 || resp.type === "opaque" || resp.type === "opaqueredirect") return resp;
  try {
    const h = new Headers(resp.headers);
    h.set("Cross-Origin-Embedder-Policy", "credentialless");
    h.set("Cross-Origin-Opener-Policy", "same-origin");
    h.set("Cross-Origin-Resource-Policy", "cross-origin");
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
  } catch { return resp; }
}

// Hashed Vite output + shell. Generated — do not edit by hand.
const APP_SHELL = __PRECACHE__;

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
        // Never replace a healthy worker with a partially populated cache.
        // This can happen while GitHub Pages is switching deployment artifacts.
        console.warn("[SW] pre-cache failed; keeping the previous worker:", err);
        return caches.delete(CACHE_NAME).then(() => { throw err; });
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

// Returns true for shell resources that must self-heal after a deployment.
function isNetworkFirst(request, url) {
  const path = url.pathname;
  return request.destination === "style" ||
         path.endsWith(".css") ||
         path.endsWith(".html") ||
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
    /jsdelivr\.net|sheetjs\.com|cdnjs\.cloudflare\.com/.test(url.hostname)
  ) {
    return; // browser handles it normally
  }

  // Only handle GETs
  if (evt.request.method !== "GET") return;

  let p;
  if (isNetworkFirst(evt.request, url)) {
    // NETWORK-FIRST for shell files: always try fresh, cache for offline.
    p = fetch(evt.request)
      .then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(evt.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(evt.request).then((cached) => {
        if (cached) return cached;
        if (evt.request.mode === "navigate") return caches.match("./index.html");
      }));
  } else {
    // CACHE-FIRST for CSS, images, fonts, wasm, etc.
    p = caches.match(evt.request).then((cached) => {
      if (cached) return cached;
      return fetch(evt.request).then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(evt.request, clone));
        }
        return resp;
      }).catch(() => {
        if (evt.request.mode === "navigate") return caches.match("./index.html");
      });
    });
  }
  // Inject COOP/COEP on every same-origin response so the page is cross-origin
  // isolated (needed for the WASM CP-SAT threads).
  evt.respondWith(p.then(addCoiHeaders));
});

// Allow the page to trigger an update via postMessage
self.addEventListener("message", (evt) => {
  if (evt.data === "SKIP_WAITING") self.skipWaiting();
});
