import { defineConfig } from "@playwright/test";

// E2E runs against the PRODUCTION build (vite preview serving dist/) — the
// same artifact GitHub Pages deploys, COOP/COEP headers included (the WASM
// CP-SAT path needs crossOriginIsolated).
// E2E_PORT lets parallel worktrees run e2e side by side without reusing each other's server.
const PORT = Number(process.env.E2E_PORT || 4173);

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // flows share one preview server; solver runs are CPU-heavy
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // First-visit SW install auto-reloads the page mid-test (pwa_install.js),
    // which is nondeterministic under automation. COOP/COEP still comes from
    // the vite preview headers, so the WASM solver path works without the SW.
    serviceWorkers: "block",
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
