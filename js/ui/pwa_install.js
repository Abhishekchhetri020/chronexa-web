/**
 * PWA install affordance + service worker registration.
 *
 * - Registers /sw.js so the app works offline after first visit
 * - Captures the beforeinstallprompt event on Chrome/Edge so we can show
 *   an "Install Chronexa as an app" CTA in the page
 * - When the user clicks Install, we trigger the native browser prompt
 * - Surfaces a quiet "Running on your computer · no server" banner so
 *   it's clear that the solver / data / everything is local
 */
(function (global) {
  "use strict";

  let deferredPrompt = null;

  function installable() {
    return !!deferredPrompt;
  }

  function showBanner() {
    if (document.getElementById("chrx-pwa-banner")) return;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) return; // already installed

    const banner = document.createElement("div");
    banner.id = "chrx-pwa-banner";
    banner.style.cssText = [
      "position:fixed", "bottom:12px", "right:12px",
      "background:#0f172a", "color:#f1f5f9",
      "padding:10px 14px", "border-radius:8px",
      "box-shadow:0 4px 14px rgba(0,0,0,0.25)",
      "font-size:13px", "line-height:1.4",
      "z-index:9999", "max-width:340px",
      "display:flex", "flex-direction:column", "gap:8px"
    ].join(";");

    banner.innerHTML = `
      <div style="display:flex;align-items:start;gap:8px">
        <span style="font-size:20px;line-height:1">⚡</span>
        <div style="flex:1">
          <div style="font-weight:600;color:#fde68a">Runs entirely on your computer</div>
          <div style="opacity:.8;font-size:12px;margin-top:2px">
            Solver, data, everything stays in your browser. ${installable() ? "Install as an app for offline use." : "Already cached for offline use."}
          </div>
        </div>
        <button id="chrx-pwa-close" style="background:none;border:0;color:#94a3b8;cursor:pointer;font-size:18px;line-height:1;padding:0 4px">×</button>
      </div>
      ${installable() ? `<button id="chrx-pwa-install" style="background:#10b981;color:white;border:0;padding:6px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px">📲 Install Chronexa</button>` : ""}
    `;

    document.body.appendChild(banner);

    document.getElementById("chrx-pwa-close").onclick = () => {
      banner.remove();
      try { localStorage.setItem("chrx-pwa-banner-dismissed", "1"); } catch (_) {}
    };

    const installBtn = document.getElementById("chrx-pwa-install");
    if (installBtn) {
      installBtn.onclick = async () => {
        if (!deferredPrompt) return;
        installBtn.disabled = true;
        installBtn.textContent = "Installing…";
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (outcome === "accepted") banner.remove();
        else installBtn.textContent = "📲 Install Chronexa";
      };
    }
  }

  function showBannerOnceReady() {
    // Don't pester users who dismissed it
    try {
      if (localStorage.getItem("chrx-pwa-banner-dismissed") === "1") return;
    } catch (_) {}
    // Wait 3s so the user can see the app first
    setTimeout(showBanner, 3000);
  }

  // ─── Service worker registration ──────────────────────────────
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    // file:// (downloaded zip use case) can't register a SW — skip silently
    if (location.protocol === "file:") return;

    // A deploy while the app is open installs a new SW in the background;
    // sw.js skipWaiting()+clients.claim() then seizes the page and fires
    // controllerchange. Reloading here is only safe when the user has no
    // work open — an unconditional reload threw away a freshly generated
    // timetable and dumped the user back on the start screen (reported on
    // the demo school, 2026-06-11). With a school loaded we skip the
    // reload entirely: the SW is network-first and every module URL is
    // version-pinned (?v=), so the running page keeps working; the new
    // version applies on the next visit.
    function hasOpenWork() {
      try {
        return !!(window.APP && window.APP.school);
      } catch (_) { return false; }
    }
    let refreshing = false;
    // Show a non-destructive "New version — Reload" banner instead of silently
    // deferring. Before this, a deploy while a school was open left the user
    // on the cached old build with no signal — so shipped fixes looked like
    // they "didn't deploy" until a manual hard-refresh. The banner lets the
    // user pick the moment to reload into the new version (their work is
    // autosaved, and the solve result is snapshotted on apply).
    let updateBannerShown = false;
    function showUpdateBanner(waitingWorker) {
      if (updateBannerShown || document.getElementById("chrx-update-banner")) return;
      updateBannerShown = true;
      const bar = document.createElement("div");
      bar.id = "chrx-update-banner";
      bar.style.cssText = [
        "position:fixed", "left:50%", "bottom:18px", "transform:translateX(-50%)",
        "z-index:10050", "display:flex", "align-items:center", "gap:12px",
        "background:#0d4f54", "color:#f6f1e6", "padding:9px 12px 9px 16px",
        "border-radius:999px", "box-shadow:0 8px 28px rgba(15,23,42,.35)",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        "font-size:13px", "font-weight:500",
      ].join(";");
      bar.innerHTML =
        '<span>🔄 A new version of Chronexa is ready.</span>' +
        '<button type="button" data-reload style="background:#f6f1e6;color:#0d4f54;border:0;border-radius:999px;padding:5px 14px;font-weight:700;font-size:12.5px;cursor:pointer;">Reload</button>' +
        '<button type="button" data-later style="background:transparent;color:rgba(246,241,230,.7);border:0;font-size:12.5px;cursor:pointer;">Later</button>';
      bar.querySelector("[data-reload]").onclick = () => {
        refreshing = true;
        // Activate the waiting worker, then reload when it takes control.
        try { if (waitingWorker) waitingWorker.postMessage("SKIP_WAITING"); } catch (_) {}
        setTimeout(() => window.location.reload(), 120);
      };
      bar.querySelector("[data-later]").onclick = () => bar.remove();
      document.body.appendChild(bar);
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      if (hasOpenWork()) {
        // A background SW took control while work is open — don't yank the
        // page; the banner (shown on updatefound) lets the user reload when
        // ready.
        console.info("[chronexa] new SW active — reload deferred (work open); banner offered");
        return;
      }
      refreshing = true;
      console.info("[chronexa] new SW active — reloading in 300ms…");
      setTimeout(() => window.location.reload(), 300);
    });

    // Cross-origin isolation: the COI service worker injects COOP/COEP, but the
    // document only becomes crossOriginIsolated on a load it actually controls.
    // If it controls us yet we're not isolated, do ONE guarded reload so the
    // in-browser WASM CP-SAT solver gets WASM threads + SharedArrayBuffer.
    try {
      if (navigator.serviceWorker.controller && !self.crossOriginIsolated && !hasOpenWork()) {
        var _coiKey = "chrx-coi-reload-" + (window.APP_VER || "");
        if (!sessionStorage.getItem(_coiKey)) {
          sessionStorage.setItem(_coiKey, "1");
          setTimeout(() => window.location.reload(), 50);
        }
      }
    } catch (_) {}

    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        // A new version may ALREADY be waiting from a prior session (the
        // common "stale tab" case) — surface the banner straight away so the
        // user isn't silently stuck on old code.
        if (reg.waiting && navigator.serviceWorker.controller) {
          if (hasOpenWork()) showUpdateBanner(reg.waiting);
          else { reg.waiting.postMessage("SKIP_WAITING"); }
        }
        // Poll for a newer SW every 60s so a deploy is noticed without a
        // manual refresh.
        setInterval(() => { try { reg.update(); } catch (_) {} }, 60000);
        // Auto-update on subsequent visits
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              if (hasOpenWork()) {
                // Don't hot-swap under the user's feet — offer a Reload banner
                // so they pick the moment (their work is preserved).
                console.info("[chronexa] new version cached — offering Reload banner (work open)");
                showUpdateBanner(nw);
                return;
              }
              // No work open — take over immediately.
              console.info("[chronexa] new version cached — triggering SKIP_WAITING");
              nw.postMessage("SKIP_WAITING");
            }
          });
        });
      })
      .catch((e) => console.warn("[chronexa] SW registration failed:", e));
  }

  // Capture install prompt before the browser shows its native one
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Banner already showing? Re-render to add the install button.
    const existing = document.getElementById("chrx-pwa-banner");
    if (existing) { existing.remove(); showBanner(); }
  });

  // When the user installs, hide the banner
  window.addEventListener("appinstalled", () => {
    const b = document.getElementById("chrx-pwa-banner");
    if (b) b.remove();
    deferredPrompt = null;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      registerServiceWorker();
      showBannerOnceReady();
    });
  } else {
    registerServiceWorker();
    showBannerOnceReady();
  }

  global.PWA = { installable, showBanner };
})(window);
