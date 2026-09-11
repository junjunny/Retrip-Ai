import { describe, expect, it } from "vitest";

import { allowRequest } from "@/lib/rateLimit";

describe("allowRequest", () => {
  it("allows the first hit for a key, then blocks a second hit inside the cooldown", () => {
    const key = `test-${Math.random()}`;
    expect(allowRequest(key, 10_000)).toBe(true);
    expect(allowRequest(key, 10_000)).toBe(false);
  });

  it("allows a hit again once the cooldown has elapsed", async () => {
    const key = `test-${Math.random()}`;
    expect(allowRequest(key, 20)).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(allowRequest(key, 20)).toBe(true);
  });

  it("different keys never interfere with each other", () => {
    const a = `test-a-${Math.random()}`;
    const b = `test-b-${Math.random()}`;
    expect(allowRequest(a, 10_000)).toBe(true);
    expect(allowRequest(b, 10_000)).toBe(true);
  });
});
