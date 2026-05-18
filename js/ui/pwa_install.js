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
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        // Auto-update on subsequent visits
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              // A new version is available; you could surface a "Reload to update" toast here
              console.info("[chronexa] new version cached — reload to apply");
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
