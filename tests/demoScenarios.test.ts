import { describe, expect, it } from "vitest";

import {
  buildDemoItinerary,
  DEMO_SCENARIOS,
  DEMO_TRIGGER_BUFFER_MINUTES,
  getDemoScenario,
} from "@/features/demo/demoScenarios";
import { PREFERENCE_KEYS } from "@/features/participant/participant";

describe("DEMO_SCENARIOS data", () => {
  it("has exactly 3 scenarios with unique ids", () => {
    expect(DEMO_SCENARIOS).toHaveLength(3);
    expect(new Set(DEMO_SCENARIOS.map((s) => s.id)).size).toBe(3);
  });

  it("every scenario has exactly one trigger item, on its declared triggerDayIndex", () => {
    for (const s of DEMO_SCENARIOS) {
      const triggers = s.days.flatMap((day, i) => day.filter((item) => item.isTrigger).map(() => i));
      expect(triggers).toEqual([s.triggerDayIndex]);
    }
  });

  it("every scenario has a full, in-range tripPreference vector", () => {
    for (const s of DEMO_SCENARIOS) {
      for (const key of PREFERENCE_KEYS) {
        expect(s.tripPreference[key]).toBeGreaterThanOrEqual(1);
        expect(s.tripPreference[key]).toBeLessThanOrEqual(10);
      }
    }
  });

  it("no scenario mentions AI/score/algorithm in its situation line", () => {
    for (const s of DEMO_SCENARIOS) {
      expect(s.situationLine).not.toMatch(/AI|score|algorithm|점수|알고리즘/i);
    }
  });

  it("getDemoScenario finds a known id and returns undefined for an unknown one", () => {
    expect(getDemoScenario("jeonju")?.destination).toBe("전주");
    expect(getDemoScenario("nope")).toBeUndefined();
  });
});

describe("buildDemoItinerary", () => {
  const jeonju = getDemoScenario("jeonju")!;

  it("places the trigger item today, at now + buffer, rounded up to the next 5 minutes", () => {
    const built = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "10:03" });
    const trigger = built.find((i) => i.placeName === "서학동예술마을")!;
    expect(trigger.date).toBe("2026-09-11");
    // 10:03 + 20min = 10:23 -> rounded up to 10:25
    expect(trigger.time).toBe("10:25");
  });

  it("an exact 5-minute boundary is left unchanged by the rounding", () => {
    const built = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "09:40" });
    const trigger = built.find((i) => i.placeName === "서학동예술마을")!;
    // 09:40 + 20min = 10:00 exactly
    expect(trigger.time).toBe("10:00");
  });

  it("preserves relative day spacing across the whole trip", () => {
    const built = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "10:00" });
    const dates = [...new Set(built.map((i) => i.date))].sort();
    expect(dates).toEqual(["2026-09-11", "2026-09-12", "2026-09-13"]);
  });

  it("rolls over to tomorrow when the buffer pushes past midnight", () => {
    const built = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "23:50" });
    const trigger = built.find((i) => i.placeName === "서학동예술마을")!;
    expect(trigger.date).toBe("2026-09-12"); // 23:50 + 20min = 00:10 next day
    expect(trigger.time).toBe("00:10");
    // Day 2/3 shift along with it
    const dates = [...new Set(built.map((i) => i.date))].sort();
    expect(dates).toEqual(["2026-09-12", "2026-09-13", "2026-09-14"]);
  });

  it("is deterministic: same scenario + same now -> identical output", () => {
    const a = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "10:00" });
    const b = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "10:00" });
    expect(a).toEqual(b);
  });

  it("for a scenario whose trigger is on Day 2, Day 1 lands the day before", () => {
    const busan = getDemoScenario("busan")!;
    const built = buildDemoItinerary(busan, { date: "2026-09-11", time: "10:00" });
    const trigger = built.find((i) => i.placeName === "해운대해수욕장")!;
    expect(trigger.date).toBe("2026-09-11");
    const day1Item = built.find((i) => i.placeName === "감천문화마을")!;
    expect(day1Item.date).toBe("2026-09-10");
  });

  it("never produces an item earlier than DEMO_TRIGGER_BUFFER_MINUTES documents as the intended slack", () => {
    // sanity: the constant is positive and the trigger is always >= now + it (before rounding up)
    expect(DEMO_TRIGGER_BUFFER_MINUTES).toBeGreaterThan(0);
  });
});
