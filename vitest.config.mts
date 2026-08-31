import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

/**
 * PHASE 0: test runner wiring only. Business-logic tests (Travel State Engine,
 * Re:Plan Engine) go under `tests/` in later phases.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.{test,spec}.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "."),
    },
  },
});
