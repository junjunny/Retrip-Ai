import { describe, expect, it } from "vitest";

import { appConfig } from "@/config/app";

/**
 * PHASE 0 smoke test — confirms the test runner and the `@/*` path alias work.
 * Replace / extend with real engine tests in later phases.
 */
describe("phase 0 setup", () => {
  it("exposes app config", () => {
    expect(appConfig.name).toBe("Re:Trip AI");
    expect(appConfig.phase).toBe(1);
  });
});
