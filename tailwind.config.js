/**
 * Tailwind (v3, PostCSS plugin) — replaces the cdn.tailwindcss.com play CDN.
 *
 * Content globs must cover every place utility classes appear as string
 * literals: index.html and the UI modules that build HTML in template
 * strings. js/solver/wasm/dist (Emscripten output) and generated files
 * are deliberately excluded — scanning 9 MB of runtime would be slow and
 * yields no classes.
 */
export default {
  content: [
    "./index.html",
    "./js/ui/**/*.js",
    "./js/xml/**/*.js",
    "./js/entry/**/*.js",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
