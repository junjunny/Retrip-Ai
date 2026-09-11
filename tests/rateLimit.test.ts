import { describe, expect, it } from "vitest";

import { allowRequest, singleFlight } from "@/lib/rateLimit";

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

describe("singleFlight", () => {
  it("two concurrent calls for the same key share one underlying run (STEP 14 — fixes the React Strict Mode double-effect race)", async () => {
    const key = `sf-${Math.random()}`;
    let calls = 0;
    const run = () =>
      new Promise<number>((resolve) => {
        calls++;
        setTimeout(() => resolve(calls), 20);
      });
    const [a, b] = await Promise.all([singleFlight(key, run), singleFlight(key, run)]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });

  it("a call after the first has settled runs again (not permanently cached)", async () => {
    const key = `sf-${Math.random()}`;
    let calls = 0;
    const run = async () => {
      calls++;
      return calls;
    };
    const first = await singleFlight(key, run);
    const second = await singleFlight(key, run);
    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it("a rejection is shared by every concurrent caller and doesn't wedge the key", async () => {
    const key = `sf-${Math.random()}`;
    const failing = () => Promise.reject(new Error("boom"));
    await expect(Promise.all([singleFlight(key, failing), singleFlight(key, failing)])).rejects.toThrow(
      "boom",
    );
    // the key is free again afterward
    await expect(singleFlight(key, async () => "ok")).resolves.toBe("ok");
  });
});
