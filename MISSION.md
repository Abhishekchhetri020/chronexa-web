# Mission: Modernise the Chronexa build with Vite

Chronexa is a browser-based timetable app with 168 hand-written JS files, 17 CSS files, and a shell script that concatenates them into a bundle. No minification. No source maps. No dev server.

Goal: understand what Vite is and why it replaces `build_bundle.sh`, so we can give Fable 5 the right prompt to modernise the toolchain.

## North star

- `npm run dev` → instant hot-reload dev server
- `npm run build` → minified, tree-shaken, code-split production output
- No CDN dependency for Tailwind
- Source maps for debugging
