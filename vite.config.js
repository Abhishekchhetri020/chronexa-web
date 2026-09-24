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
import { build as viteBuild, defineConfig } from "vite";
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
      precache = ["./", "./index.html", "./manifest.json", "./viewer.js", ...files.map((f) => "./" + f)];
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

/**
 * The offline viewer bundle needs W2-2's reader (js/viewer/render.js + css/viewer.css).
 * Those files live in lane W2-2 and may not exist yet, so they are pulled in
 * through this virtual module instead of a hard import path:
 *   - reader present → static imports of the real files (bundled normally);
 *   - reader absent  → an empty module, and the loader in the published file
 *     says the viewer is missing instead of failing the build.
 * Deliberately a STATIC import and not `import.meta.glob`: a glob makes rolldown
 * emit a shared runtime chunk, and the viewer chunk would then start with
 * `import … from "./assets/rolldown-runtime-*.js"` — a hard syntax error once
 * inlined in a classic <script> (file:// blocks module CORS anyway).
 */
function chronexaViewerReader() {
  const VID = "virtual:chronexa-viewer-reader";
  const RESOLVED = "\0" + VID;
  let root = process.cwd();
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  return {
    name: "chronexa-viewer-reader",
    configResolved(cfg) { root = cfg.root; },
    resolveId(id) { return id === VID ? RESOLVED : null; },
    load(id) {
      if (id !== RESOLVED) return null;
      return [
        exists("js/viewer/render.js") ? 'import "/js/viewer/render.js";' : "",
        exists("css/viewer.css")
          ? 'import viewerCss from "/css/viewer.css?inline";'
          : 'const viewerCss = "";',
        "export { viewerCss };",
      ].join("\n");
    },
  };
}

/**
 * Emit the OFFLINE viewer bundle as dist/viewer.js — ONE self-contained classic
 * script (contract C2, lane W2-3).
 *
 * Why a nested build instead of a second `input` of the app build: the reader
 * (js/viewer/render.js) is also part of the APP's module graph (js/ui/main.js →
 * viewer/boot.js → render.js), so as an app entry the viewer chunk is left with
 * `import "./assets/render-<hash>.js";` — chunk imports that are a SyntaxError
 * the moment the text is inlined in a classic <script> (file:// blocks module
 * CORS), which shipped as a blank published page. A separate lib build with
 * format "iife" inlines every import (render.js + validate.js) into the file.
 *
 * Runs from the app build's closeBundle, AFTER the app has written dist/, so
 * dist/viewer.js lands next to the shell and ./viewer.js stays precached by the
 * generated sw.js. configFile:false + a minimal plugin list keeps the nested
 * build from re-entering this config.
 */
function chronexaViewerBundle() {
  let outDir = "dist";
  let root = process.cwd();
  let done = false;
  return {
    name: "chronexa-viewer-bundle",
    apply: "build",
    configResolved(cfg) { outDir = cfg.build.outDir; root = cfg.root; },
    async closeBundle() {
      if (done) return;                     // never recurse
      done = true;
      await viteBuild({
        configFile: false,
        root,
        base: "./",
        logLevel: "warn",
        build: {
          outDir,
          emptyOutDir: false,               // keep the app build in dist/
          sourcemap: false,
          target: "baseline-widely-available",
          lib: {
            entry: path.join(root, "js/viewer/viewer_entry.js"),
            name: "ChronexaPublishedViewer",
            formats: ["iife"],
            fileName: () => "viewer.js",
            cssFileName: "viewer-bundle",
          },
          rollupOptions: { output: { inlineDynamicImports: true } },
        },
        plugins: [chronexaViewerReader()],
      });
      const file = path.join(root, outDir, "viewer.js");
      const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (/^\s*(import|export)[ {]/m.test(text)) {
        throw new Error("dist/viewer.js contains ESM syntax — it cannot be inlined as a classic script.");
      }
      // render.js also imports css/viewer.css plainly, which a lib build must
      // extract; the published file carries that CSS as an inlined string
      // instead (virtual:chronexa-viewer-reader → ?inline), so the extracted
      // by-product is referenced by nothing and would just be shipped dead.
      const strayCss = path.join(root, outDir, "viewer-bundle.css");
      if (fs.existsSync(strayCss)) fs.rmSync(strayCss);
      const strayMap = path.join(root, outDir, "viewer.js.map");
      if (fs.existsSync(strayMap)) fs.rmSync(strayMap);
      console.log(`[viewer] offline bundle → ${outDir}/viewer.js (${text.length} B, self-contained)`);
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
  plugins: [chronexaSwAndCopy(), chronexaViewerReader(), chronexaViewerBundle()],
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
