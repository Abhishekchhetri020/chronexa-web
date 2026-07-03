import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["js/solver/__tests__/**/*.test.js"],
    exclude: [
      "**/node_modules/**",
      "e2e/**",
      // Pre-Vite CJS test files (require()) — broken since the ESM migration;
      // port to vitest before re-including.
      "js/solver/__tests__/audit_regression.test.js",
      "js/solver/__tests__/fixes_2026-06-11.test.js",
      "js/solver/__tests__/mpp.test.js",
    ],
    // The parser fixture needs DOMParser; solver code itself is env-agnostic.
    environment: "jsdom",
    testTimeout: 30000,
  },
});
