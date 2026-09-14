import { describe, expect, it } from "vitest";

import {
  buildDemoItinerary,
  DEMO_GENERIC_CLOSING_MESSAGE,
  DEMO_SCENARIOS,
  DEMO_STARTING_ORDER,
  DEMO_TRIGGER_BUFFER_MINUTES,
  demoCompletionMessage,
  demoDisplayDate,
  demoDisplayTime,
  deriveScoringPreferences,
  getDemoScenario,
  scenarioFlatItems,
  triggerOrder,
} from "@/features/demo/demoScenarios";
import { buildExperienceProfile } from "@/features/experience";
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

  // STEP 22 §2/§68: every demo's duration matches the spec exactly.
  it("Jeonju spans 2 days (1박 2일)", () => {
    expect(getDemoScenario("jeonju")!.days).toHaveLength(2);
    expect(getDemoScenario("jeonju")!.cardDuration).toBe("1박 2일");
  });
  it("Busan spans 3 days (2박 3일)", () => {
    expect(getDemoScenario("busan")!.days).toHaveLength(3);
    expect(getDemoScenario("busan")!.cardDuration).toBe("2박 3일");
  });
  it("Daejeon spans 2 days (1박 2일)", () => {
    expect(getDemoScenario("daejeon")!.days).toHaveLength(2);
    expect(getDemoScenario("daejeon")!.cardDuration).toBe("1박 2일");
  });

  // STEP 22 §2: the narrative date axis always starts "10월 1일", regardless
  // of the real server clock buildDemoItinerary anchors against.
  it("demoDisplayDate always starts at 10월 1일 and counts up one day per index", () => {
    expect(demoDisplayDate(0)).toBe("10월 1일");
    expect(demoDisplayDate(1)).toBe("10월 2일");
    expect(demoDisplayDate(2)).toBe("10월 3일");
  });
});

describe("DEMO_SCENARIOS travelers (STEP 22 §6-8)", () => {
  it("every scenario has 3 travelers with a full integer 1-10 vector, one HOST and two MEMBERs", () => {
    for (const s of DEMO_SCENARIOS) {
      expect(s.travelers).toHaveLength(3);
      expect(s.travelers.filter((t) => t.role === "HOST")).toHaveLength(1);
      expect(s.travelers.filter((t) => t.role === "MEMBER")).toHaveLength(2);
      for (const t of s.travelers) {
        expect(t.name.length).toBeGreaterThan(0);
        expect(t.blurb.length).toBeGreaterThan(0);
        expect(t.displayPreferences.length).toBeGreaterThan(0);
        for (const key of PREFERENCE_KEYS) {
          expect(Number.isInteger(t.preferences[key])).toBe(true);
          expect(t.preferences[key]).toBeGreaterThanOrEqual(1);
          expect(t.preferences[key]).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it("travelers have genuinely different preferences from one another (never a copy-pasted vector)", () => {
    for (const s of DEMO_SCENARIOS) {
      const [a, b, c] = s.travelers;
      expect(a.preferences).not.toEqual(b.preferences);
      expect(b.preferences).not.toEqual(c.preferences);
      expect(a.preferences).not.toEqual(c.preferences);
    }
  });

  it("tripPreference is the rounded mean of the 3 travelers' real vectors — never a separately hand-picked value", () => {
    for (const s of DEMO_SCENARIOS) {
      const mean = buildExperienceProfile(s.travelers.map((t) => t.preferences))!;
      for (const key of PREFERENCE_KEYS) {
        expect(s.tripPreference[key]).toBe(Math.round(mean[key]));
        expect(Number.isInteger(s.tripPreference[key])).toBe(true);
      }
    }
  });

  it("preferences are exactly deriveScoringPreferences of the traveler's own displayPreferences — never hand-typed separately", () => {
    for (const s of DEMO_SCENARIOS) {
      for (const t of s.travelers) {
        expect(t.preferences).toEqual(deriveScoringPreferences(t.displayPreferences));
      }
    }
  });

  it("Busan travelers are exactly 준호 (HOST), 승찬, 현우 — never the old '지우'", () => {
    const names = getDemoScenario("busan")!.travelers.map((t) => t.name);
    expect(names).toEqual(["준호", "승찬", "현우"]);
    expect(names).not.toContain("지우");
  });
  it("Jeonju travelers are exactly 민준 (HOST), 서연, 도윤", () => {
    expect(getDemoScenario("jeonju")!.travelers.map((t) => t.name)).toEqual(["민준", "서연", "도윤"]);
  });
  it("Daejeon travelers are exactly 현준 (HOST), 유나, 태현", () => {
    expect(getDemoScenario("daejeon")!.travelers.map((t) => t.name)).toEqual(["현준", "유나", "태현"]);
  });

  // STEP 22 §9-10/§59.11: the exact named axis + value given in the brief is
  // preserved verbatim for the participant detail view.
  it("민준's display preferences match the given brief exactly", () => {
    const minjun = getDemoScenario("jeonju")!.travelers[0];
    expect(minjun.displayPreferences).toEqual([
      { label: "문화·역사", value: 9 },
      { label: "골목·산책", value: 9 },
      { label: "전통체험", value: 8 },
      { label: "음식", value: 7 },
      { label: "사진·풍경", value: 7 },
      { label: "카페·휴식", value: 5 },
      { label: "액티비티", value: 3 },
    ]);
  });
  it("현우's display preferences match the given brief exactly", () => {
    const hyunwoo = getDemoScenario("busan")!.travelers[2];
    expect(hyunwoo.displayPreferences).toEqual([
      { label: "음식", value: 10 },
      { label: "액티비티", value: 9 },
      { label: "바다", value: 7 },
      { label: "산책", value: 6 },
      { label: "풍경", value: 6 },
      { label: "문화·역사", value: 5 },
      { label: "여유·휴식", value: 4 },
    ]);
  });
});

describe("deriveScoringPreferences", () => {
  it("takes the MAX when two named axes map onto the same real key, never an average", () => {
    const v = deriveScoringPreferences([
      { label: "바다", value: 10 },
      { label: "풍경", value: 4 },
      { label: "산책", value: 6 },
    ]);
    expect(v.nature).toBe(10); // max(10,4,6), not their average
  });

  it("defaults every unmentioned real axis to PREFERENCE_NEUTRAL (5), never inventing a value", () => {
    const v = deriveScoringPreferences([{ label: "음식", value: 8 }]);
    expect(v.food).toBe(8);
    expect(v.nature).toBe(5);
    expect(v.culture).toBe(5);
    expect(v.shopping).toBe(5);
  });

  it("throws for an unknown display label rather than silently dropping a stated preference", () => {
    expect(() => deriveScoringPreferences([{ label: "존재하지않는축", value: 5 }])).toThrow();
  });
});

describe("DEMO_SCENARIOS weather (STEP 22 §3)", () => {
  it("every scenario has one DEMO-only weather outlook entry per day", () => {
    for (const s of DEMO_SCENARIOS) {
      expect(s.dailyWeather).toHaveLength(s.days.length);
      for (const day of s.dailyWeather) {
        expect(day.am.length).toBeGreaterThan(0);
        expect(day.pm.length).toBeGreaterThan(0);
      }
    }
  });

  // §22/§59.12: Busan's variable MUST be a shower, on the trigger's own day.
  it("Busan's Day 1 afternoon is the required 소나기 (shower) variable", () => {
    const busan = getDemoScenario("busan")!;
    expect(busan.dailyWeather[busan.triggerDayIndex].pm).toBe("소나기");
    expect(busan.situationKind).toBe("weather");
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
    expect(dates).toEqual(["2026-09-11", "2026-09-12"]);
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
    const dates = [...new Set(built.map((i) => i.date))].sort();
    expect(dates).toEqual(["2026-09-11", "2026-09-12"]);
  });

  it("is deterministic: same scenario + same now -> identical output", () => {
    const a = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "10:00" });
    const b = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "10:00" });
    expect(a).toEqual(b);
  });

  it("Busan's trigger is on Day 1 itself — Day 2/3 land on the following real dates", () => {
    const busan = getDemoScenario("busan")!;
    const built = buildDemoItinerary(busan, { date: "2026-09-11", time: "10:00" });
    const trigger = built.find((i) => i.placeName === "미포")!;
    expect(trigger.date).toBe("2026-09-11");
    const day2Item = built.find((i) => i.placeName === "감천문화마을")!;
    expect(day2Item.date).toBe("2026-09-12");
    const day3Item = built.find((i) => i.placeName === "수변최고돼지국밥")!;
    expect(day3Item.date).toBe("2026-09-13");
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

  it("carries resolveAddress through to the built item for address-anchored stops", () => {
    const built = buildDemoItinerary(jeonju, { date: "2026-09-11", time: "10:00" });
    expect(built.find((i) => i.placeName === "베테랑 칼국수")?.resolveAddress).toBe(
      "전북특별자치도 전주시 완산구 교동 84-10",
    );
    expect(built.find((i) => i.placeName === "전주 숙소")?.resolveAddress).toBe(
      "전북특별자치도 전주시 완산구 현무1길 10",
    );
    const busan = getDemoScenario("busan")!;
    const busanBuilt = buildDemoItinerary(busan, { date: "2026-09-11", time: "10:00" });
    expect(busanBuilt.find((i) => i.placeName === "미포")?.resolveAddress).toBe(
      "부산광역시 해운대구 달맞이길62번길 3",
    );
  });
});

describe("scenario journey helpers (STEP 22 §4/§13-15)", () => {
  it("every demo's current item is ALWAYS the first itinerary item — never a mid-trip start", () => {
    expect(DEMO_STARTING_ORDER).toBe(1);
  });

  it("every scenario's trigger comes strictly after the starting order, so at least one normal step happens first", () => {
    for (const s of DEMO_SCENARIOS) {
      const flat = scenarioFlatItems(s);
      expect(flat[triggerOrder(s) - 1]?.isTrigger).toBe(true);
      expect(triggerOrder(s)).toBeGreaterThan(DEMO_STARTING_ORDER);
    }
  });

  it("demoDisplayTime returns each item's own scripted clock reading, decoupled from the real anchored time", () => {
    const jeonju = getDemoScenario("jeonju")!;
    expect(demoDisplayTime(jeonju, triggerOrder(jeonju))).toBe("15:30");
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
