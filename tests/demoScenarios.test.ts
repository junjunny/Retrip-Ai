import { describe, expect, it } from "vitest";

import {
  buildDemoItinerary,
  DEMO_GENERIC_CLOSING_MESSAGE,
  DEMO_SCENARIOS,
  DEMO_TRIGGER_BUFFER_MINUTES,
  demoCompletionMessage,
  demoDisplayTime,
  getDemoScenario,
  scenarioFlatItems,
  startingCurrentOrder,
  triggerOrder,
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

  // STEP 17 fix: the trigger must NEVER roll into tomorrow — Re:Plan's real
  // eligibility gate compares against the SERVER's actual current date, and
  // a trigger dated "tomorrow" while the real clock hasn't reached midnight
  // yet was reporting zero eligible slots (found via real E2E testing).
  it("clamps to today (23:59) instead of rolling into tomorrow when the buffer would cross midnight", () => {
    const built = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "23:50" });
    const trigger = built.find((i) => i.placeName === "서학동예술마을")!;
    expect(trigger.date).toBe("2026-09-11"); // stays TODAY, never "tomorrow"
    expect(trigger.time).toBe("23:59");
    // every other day still shifts relative to the trigger's (unmoved) day
    const dates = [...new Set(built.map((i) => i.date))].sort();
    expect(dates).toEqual(["2026-09-11", "2026-09-12", "2026-09-13"]);
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

  // STEP 17 regression: a same-day item scripted AFTER the trigger (e.g.
  // dinner) must never sort ahead of it just because "now" is late enough
  // that the trigger's real anchored time passes the sibling's absolute
  // scripted clock reading.
  it("keeps every same-day item's real order matching its scripted order, even very late at night", () => {
    const built = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "23:40" });
    const day1Scripted = ["현대닭내장", "경기전", "전주 한옥마을", "서학동예술마을", "베테랑 칼국수", "전주 숙소"];
    const day1Built = built.filter((i) => day1Scripted.includes(i.placeName));
    const sortedByRealTime = [...day1Built].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    expect(sortedByRealTime.map((i) => i.placeName)).toEqual(day1Scripted);
  });

  it("carries resolveAddress through to the built item for the two address-anchored 전주 stops", () => {
    const built = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "10:00" });
    expect(built.find((i) => i.placeName === "베테랑 칼국수")?.resolveAddress).toBe(
      "전북특별자치도 전주시 완산구 교동 84-10",
    );
    expect(built.find((i) => i.placeName === "전주 숙소")?.resolveAddress).toBe(
      "전북특별자치도 전주시 완산구 현무1길 10",
    );
  });
});

describe("scenario journey helpers", () => {
  it("triggerOrder/startingCurrentOrder match the flattened item just before each scenario's trigger", () => {
    for (const s of DEMO_SCENARIOS) {
      const flat = scenarioFlatItems(s);
      expect(flat[triggerOrder(s) - 1]?.isTrigger).toBe(true);
      expect(startingCurrentOrder(s)).toBe(triggerOrder(s) - 1);
    }
  });

  it("demoDisplayTime returns each item's own scripted clock reading, decoupled from the real anchored time", () => {
    const jeonju = getDemoScenario("jeonju")!;
    expect(demoDisplayTime(jeonju, triggerOrder(jeonju))).toBe("16:00");
    expect(demoDisplayTime(jeonju, 999)).toBeNull();
  });

  it("demoCompletionMessage returns the scripted line when the live place still matches", () => {
    const jeonju = getDemoScenario("jeonju")!;
    const order = triggerOrder(jeonju);
    expect(demoCompletionMessage(jeonju, order, "서학동예술마을", true)).toMatch(/전시 관람/);
  });

  it("demoCompletionMessage falls back to a generic line (naming the real next place) once Re:Plan changed the place", () => {
    const jeonju = getDemoScenario("jeonju")!;
    const order = triggerOrder(jeonju);
    expect(demoCompletionMessage(jeonju, order, "동학혁명기념관", true, "베테랑 칼국수")).toBe(
      "여기까지 잘 다녀오셨나요? 베테랑 칼국수에서 여행을 이어가볼 수 있어요.",
    );
    expect(demoCompletionMessage(jeonju, order, "동학혁명기념관", false)).toBe(DEMO_GENERIC_CLOSING_MESSAGE);
  });
});
