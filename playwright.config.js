import { defineConfig } from "@playwright/test";

// E2E runs against the PRODUCTION build (vite preview serving dist/) — the
// same artifact GitHub Pages deploys, COOP/COEP headers included (the WASM
// CP-SAT path needs crossOriginIsolated).
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // flows share one preview server; solver runs are CPU-heavy
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    // First-visit SW install auto-reloads the page mid-test (pwa_install.js),
    // which is nondeterministic under automation. COOP/COEP still comes from
    // the vite preview headers, so the WASM solver path works without the SW.
    serviceWorkers: "block",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
