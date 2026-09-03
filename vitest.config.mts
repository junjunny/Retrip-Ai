import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Test runner wiring.
 *
 * `server-only` is stubbed: it throws on import outside the React Server
 * environment (which vitest is not), so server modules like `lib/firebase/admin`
 * and `features/participant/participantService` could not be integration-tested
 * otherwise. The real guard still protects the production client bundle.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.{test,spec}.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "."),
      "server-only": resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
});
