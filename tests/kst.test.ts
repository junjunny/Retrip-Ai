import { describe, expect, it } from "vitest";

import { addDays, minutesToTime, nowKst, timeToMinutes } from "@/lib/kst";

describe("nowKst", () => {
  it("formats a known UTC instant as its Asia/Seoul (UTC+9) wall clock", () => {
    // 2026-09-11T07:09:16.000Z -> 2026-09-11 16:09 KST
    expect(nowKst(new Date("2026-09-11T07:09:16.000Z"))).toEqual({ date: "2026-09-11", time: "16:09" });
  });

  it("crosses midnight correctly (KST is ahead of UTC)", () => {
    // 2026-09-11T16:00:00.000Z -> 2026-09-12 01:00 KST
    expect(nowKst(new Date("2026-09-11T16:00:00.000Z"))).toEqual({ date: "2026-09-12", time: "01:00" });
  });
});

describe("addDays", () => {
  it("adds and subtracts whole days across a month boundary", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
  it("0 is a no-op", () => {
    expect(addDays("2026-09-11", 0)).toBe("2026-09-11");
  });
});

describe("timeToMinutes / minutesToTime", () => {
  it("round-trip for ordinary times", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(1439);
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(1439)).toBe("23:59");
  });
  it("minutesToTime wraps values >= 1440 or negative into one day", () => {
    expect(minutesToTime(1440)).toBe("00:00");
    expect(minutesToTime(1450)).toBe("00:10");
    expect(minutesToTime(-10)).toBe("23:50");
  });
});
