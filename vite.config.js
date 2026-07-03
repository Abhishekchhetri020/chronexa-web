/**
 * Chronexa Vite build — replaces build_bundle.sh (168-file concat).
 *
 * Layout notes:
 *  - index.html at repo root is the single page entry; js/entry/main.js pulls
 *    in every module in the canonical load order.
 *  - Code-split chunks: "solver" (js/solver/*), "editor" (js/ui/editor/*),
 *    "print-preview" (js/ui/print_preview/*). The solver Web Worker is a
 *    separate worker graph bundled automatically via new URL(import.meta.url).
 *  - js/solver/wasm/{dist,cp_sat_worker.js,cp_sat_solver.mjs} are copied
 *    VERBATIM (not bundled): the Emscripten pthread runtime spawns its own
 *    nested workers from raw paths and must not be rewritten.
 *  - sw.js is generated per build from sw.template.js with the precache list
 *    of hashed output files. It preserves the COOP/COEP header injection that
 *    cross-origin-isolates the page (required for WASM threads).
 */
import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Paths copied untouched into dist/ at the SAME relative path.
const VERBATIM = [
  "js/solver/wasm/cp_sat_worker.js",
  "js/solver/wasm/cp_sat_solver.mjs",
  "js/solver/wasm/dist",
  // cp_sat_solver.mjs imports ../csp_solver.js (buildModel reuse) at runtime
  // from its un-bundled location, so the JS solver graph must also exist
  // verbatim next to it (it is ALSO bundled into the worker chunk — the
  // duplication is intentional).
  "js/solver/csp_solver.js",
  "js/solver/constraints.js",
  "js/solver/bitmask.js",
  "js/solver/solver_learning.js",
  "js/solver/relation_enforcer.js",
  "assets",
  "manifest.json",
  "sample-school.xml",
  "docs/demo_sample-school.xml",
];

function readAppVer(root) {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const m = html.match(/window\.APP_VER\s*=\s*"([^"]+)"/);
  return (m && m[1]) || "dev";
}

/** Emit sw.js with the hashed precache manifest + copy verbatim assets. */
function chronexaSwAndCopy() {
  let outDir, root, precache;
  return {
    name: "chronexa-sw-and-copy",
    configResolved(cfg) {
      outDir = cfg.build.outDir;
      root = cfg.root;
    },
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) =>
        /\.(js|mjs|css|html|wasm|png|svg|woff2?)$/.test(f)
      );
      precache = ["./", "./index.html", "./manifest.json", ...files.map((f) => "./" + f)];
      const appVer = readAppVer(root);
      const listHash = crypto.createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 8);
      const tpl = fs.readFileSync(path.join(root, "sw.template.js"), "utf8");
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: tpl
          .replaceAll("__APP_VER__", appVer)
          .replaceAll("__BUILD_HASH__", listHash)
          .replaceAll("__PRECACHE__", JSON.stringify(precache, null, 2)),
      });
    },
    closeBundle() {
      for (const src of VERBATIM) {
        const from = path.join(root, src);
        if (!fs.existsSync(from)) { console.warn(`[copy] missing ${src}`); continue; }
        fs.cpSync(from, path.join(root, outDir, src), { recursive: true });
      }
      console.log("[copy] verbatim assets → " + outDir);
    },
  };
}

// COOP/COEP for dev/preview so the WASM CP-SAT path (SharedArrayBuffer) works
// without the service worker. In production the generated sw.js injects the
// same headers.
const COI_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig({
  base: "./",
  plugins: [chronexaSwAndCopy()],
  server: { headers: COI_HEADERS },
  preview: { headers: COI_HEADERS },
  worker: {
    format: "es",
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "baseline-widely-available",
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "solver", test: /\/js\/solver\// },
            { name: "editor", test: /\/js\/ui\/editor\// },
            { name: "print-preview", test: /\/js\/ui\/print_preview\// },
          ],
        },
      },
    },
  },
});
