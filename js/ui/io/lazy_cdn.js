// On-demand loader for heavy optional CDN libraries (SheetJS 861 kB, Pako 46 kB)
// so they are never fetched or parsed on initial page load (Block G).
import "../state.js";

(function (global) {
  "use strict";
  const APP = (global.APP = global.APP || {});
  const inflight = Object.create(null);

  function loadScriptOnce(key, url, checkFn) {
    if (checkFn()) return Promise.resolve(true);
    if (inflight[key]) return inflight[key];
    inflight[key] = new Promise((resolve, reject) => {
      if (typeof document === "undefined") {
        delete inflight[key];
        return resolve(false);
      }
      const s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = () => resolve(checkFn());
      s.onerror = () => {
        delete inflight[key];
        reject(new Error("Failed to load " + key));
      };
      document.head.appendChild(s);
    });
    return inflight[key];
  }

  function ensureXlsx() {
    return loadScriptOnce(
      "xlsx",
      "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
      () => typeof global.XLSX !== "undefined"
    );
  }

  function ensurePako() {
    return loadScriptOnce(
      "pako",
      "https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js",
      () => typeof global.pako !== "undefined"
    );
  }

  APP.ensureXlsx = ensureXlsx;
  APP.ensurePako = ensurePako;
})(typeof window !== "undefined" ? window : globalThis);
