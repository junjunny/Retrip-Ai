import { describe, expect, it } from "vitest";

import {
  buildDemoItinerary,
  DEMO_GENERIC_CLOSING_MESSAGE,
  DEMO_SCENARIOS,
  demoCompletionMessage,
  deriveScoringPreferences,
  getDemoScenario,
  scenarioFlatItems,
} from "@/features/demo/demoScenarios";
import { buildExperienceProfile } from "@/features/experience";
import { PREFERENCE_KEYS } from "@/features/participant/participant";

const jeonju = () => getDemoScenario("jeonju")!;
const busan = () => getDemoScenario("busan")!;
const daejeon = () => getDemoScenario("daejeon")!;

describe("DEMO_SCENARIOS data (STEP 23 hard lock)", () => {
  it("has exactly 3 scenarios with unique ids", () => {
    expect(DEMO_SCENARIOS).toHaveLength(3);
    expect(new Set(DEMO_SCENARIOS.map((s) => s.id)).size).toBe(3);
  });

  it("every scenario has a full, in-range tripPreference vector", () => {
    for (const s of DEMO_SCENARIOS) {
      for (const key of PREFERENCE_KEYS) {
        expect(s.tripPreference[key]).toBeGreaterThanOrEqual(1);
        expect(s.tripPreference[key]).toBeLessThanOrEqual(10);
      }
    }
  });

  it("getDemoScenario finds a known id and returns undefined for an unknown one", () => {
    expect(getDemoScenario("jeonju")?.destination).toBe("전주");
    expect(getDemoScenario("nope")).toBeUndefined();
  });

  // §2/§30: exact date range + duration per city.
  it("전주 spans 2026-10-01 ~ 2026-10-03 (2박 3일)", () => {
    const flat = scenarioFlatItems(jeonju());
    expect(flat[0].date).toBe("2026-10-01");
    expect(flat[flat.length - 1].date).toBe("2026-10-03");
    expect(jeonju().cardDuration).toBe("2박 3일");
    expect(jeonju().days).toHaveLength(3);
  });
  it("부산 spans 2026-10-01 ~ 2026-10-02 (1박 2일)", () => {
    const flat = scenarioFlatItems(busan());
    expect(flat[0].date).toBe("2026-10-01");
    expect(flat[flat.length - 1].date).toBe("2026-10-02");
    expect(busan().cardDuration).toBe("1박 2일");
    expect(busan().days).toHaveLength(2);
  });
  it("대전 spans 2026-10-01 ~ 2026-10-02 (1박 2일)", () => {
    const flat = scenarioFlatItems(daejeon());
    expect(flat[0].date).toBe("2026-10-01");
    expect(flat[flat.length - 1].date).toBe("2026-10-02");
    expect(daejeon().cardDuration).toBe("1박 2일");
    expect(daejeon().days).toHaveLength(2);
  });

  // §23: no scenario ever uses randomness to build its schedule.
  it("buildDemoItinerary is deterministic across repeated calls (no clock, no randomness)", () => {
    for (const s of DEMO_SCENARIOS) {
      const a = buildDemoItinerary(s);
      const b = buildDemoItinerary(s);
      expect(a).toEqual(b);
    }
  });
});

describe("전주 itinerary hard lock (§4/§27)", () => {
  it("Day 1 matches the spec exactly, in order", () => {
    const day1 = jeonju().days[0].map((it) => it.placeName);
    expect(day1).toEqual([
      "현대닭내장",
      "경기전",
      "전주 한옥마을",
      "서학동 예술마을",
      "베테랑",
      "신라스테이 전주",
    ]);
  });
  it("Day 2 matches the spec exactly, in order", () => {
    const day2 = jeonju().days[1].map((it) => it.placeName);
    expect(day2).toEqual(["메르밀 진미집", "덕진공원", "다리미 삼겹살", "전주 호텔원"]);
  });
  it("Day 3 matches the spec exactly, in order", () => {
    const day3 = jeonju().days[2].map((it) => it.placeName);
    expect(day3).toEqual(["또또국수", "전주월드컵경기장"]);
  });
  it("서학동 예술마을 has no resolveAddress — the given address doesn't resolve via the real geocoder, so it resolves by name instead (live-verified, see the module doc comment)", () => {
    const item = scenarioFlatItems(jeonju()).find((i) => i.placeName === "서학동 예술마을")!;
    expect(item.resolveAddress).toBeUndefined();
  });
});

describe("부산 itinerary hard lock (§5/§27 — absolute check)", () => {
  it("Day 1 matches the spec exactly, in order", () => {
    const day1 = busan().days[0].map((it) => it.placeName);
    expect(day1).toEqual([
      "감천문화마을",
      "자갈치 시장",
      "흰여울문화마을",
      "마린횟집 해운대본점",
      "한화리조트 해운대",
    ]);
  });
  it("Day 2 is exactly 수변최고돼지국밥 -> 해운대 해수욕장", () => {
    const day2 = busan().days[1].map((it) => it.placeName);
    expect(day2).toEqual(["수변최고돼지국밥", "해운대 해수욕장"]);
  });
  it("승찬 replaces 지우 everywhere in the 부산 scenario", () => {
    const names = busan().travelers.map((t) => t.name);
    expect(names).toContain("승찬");
    expect(names).not.toContain("지우");
  });
});

describe("대전 itinerary hard lock (§6/§27)", () => {
  it("Day 1 matches the spec exactly, in order", () => {
    const day1 = daejeon().days[0].map((it) => it.placeName);
    expect(day1).toEqual(["광천식당", "성심당 본점", "대동하늘공원", "유성호텔"]);
  });
  it("Day 2 matches the spec exactly, in order", () => {
    const day2 = daejeon().days[1].map((it) => it.placeName);
    expect(day2).toEqual(["한밭수목원", "오씨칼국수", "국립중앙과학관", "엑스포과학공원 한빛탑"]);
  });
});

describe("Re:Plan replacement mapping hard lock (§13/§27/§28)", () => {
  it("전주: 서학동 예술마을 -> 국립무형유산원, 덕진공원 -> 한국도로공사 전주수목원", () => {
    const flat = scenarioFlatItems(jeonju());
    expect(flat.find((i) => i.placeName === "서학동 예술마을")?.disruption?.replacement.placeName).toBe(
      "국립무형유산원",
    );
    expect(flat.find((i) => i.placeName === "덕진공원")?.disruption?.replacement.placeName).toBe(
      "한국도로공사 전주수목원",
    );
  });

  it("부산: 자갈치 시장 -> 부평깡통시장, 해운대 해수욕장 -> 씨라이프 부산 아쿠아리움", () => {
    const flat = scenarioFlatItems(busan());
    expect(flat.find((i) => i.placeName === "자갈치 시장")?.disruption?.replacement.placeName).toBe(
      "부평깡통시장",
    );
    expect(flat.find((i) => i.placeName === "해운대 해수욕장")?.disruption?.replacement.placeName).toBe(
      "씨라이프 부산 아쿠아리움",
    );
  });

  it("대전: 성심당 본점 -> 정동문화사, 엑스포과학공원 한빛탑 -> 대청호 명상정원 (never 유성 관광특구)", () => {
    const flat = scenarioFlatItems(daejeon());
    expect(flat.find((i) => i.placeName === "성심당 본점")?.disruption?.replacement.placeName).toBe(
      "정동문화사",
    );
    const hanbit = flat.find((i) => i.placeName === "엑스포과학공원 한빛탑");
    expect(hanbit?.disruption?.replacement.placeName).toBe("대청호 명상정원");
    expect(hanbit?.disruption?.replacement.placeName).not.toBe("유성 관광특구");
    // never in ANY scenario, anywhere.
    for (const s of DEMO_SCENARIOS) {
      for (const item of scenarioFlatItems(s)) {
        expect(item.disruption?.replacement.placeName).not.toBe("유성 관광특구");
      }
    }
  });

  it("exactly two disruptions per scenario, each with a non-empty situation/impact line", () => {
    for (const s of DEMO_SCENARIOS) {
      const disruptions = scenarioFlatItems(s).filter((i) => i.disruption);
      expect(disruptions).toHaveLength(2);
      for (const item of disruptions) {
        expect(item.disruption!.situationLine.length).toBeGreaterThan(0);
        expect(item.disruption!.impactLine.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("DEMO_SCENARIOS travelers (STEP 22/23 §7-9)", () => {
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

  it("names match the hard lock exactly: 전주=민준/서연/도윤, 부산=준호/승찬/현우, 대전=현준/유나/태현", () => {
    expect(jeonju().travelers.map((t) => t.name)).toEqual(["민준", "서연", "도윤"]);
    expect(busan().travelers.map((t) => t.name)).toEqual(["준호", "승찬", "현우"]);
    expect(daejeon().travelers.map((t) => t.name)).toEqual(["현준", "유나", "태현"]);
  });

  // §8/§59.11: the exact named axis + value given in the brief is preserved verbatim.
  it("현우's display preferences match the STEP 23 brief exactly (카페·휴식, not 여유·휴식)", () => {
    const hyunwoo = busan().travelers[2];
    expect(hyunwoo.displayPreferences).toEqual([
      { label: "음식", value: 10 },
      { label: "액티비티", value: 9 },
      { label: "바다", value: 7 },
      { label: "산책", value: 6 },
      { label: "풍경", value: 6 },
      { label: "문화·역사", value: 5 },
      { label: "카페·휴식", value: 4 },
    ]);
  });
  it("민준's display preferences match the brief exactly", () => {
    expect(jeonju().travelers[0].displayPreferences).toEqual([
      { label: "문화·역사", value: 9 },
      { label: "골목·산책", value: 9 },
      { label: "전통체험", value: 8 },
      { label: "음식", value: 7 },
      { label: "사진·풍경", value: 7 },
      { label: "카페·휴식", value: 5 },
      { label: "액티비티", value: 3 },
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
    expect(v.nature).toBe(10);
  });

  it("defaults every unmentioned real axis to PREFERENCE_NEUTRAL (5), never inventing a value", () => {
    const v = deriveScoringPreferences([{ label: "음식", value: 8 }]);
    expect(v.food).toBe(8);
    expect(v.nature).toBe(5);
    expect(v.shopping).toBe(5);
  });

  it("throws for an unknown display label rather than silently dropping a stated preference", () => {
    expect(() => deriveScoringPreferences([{ label: "존재하지않는축", value: 5 }])).toThrow();
  });
});

describe("DEMO_SCENARIOS weather (STEP 22/23 §3)", () => {
  it("every scenario has one DEMO-only weather outlook entry per day", () => {
    for (const s of DEMO_SCENARIOS) {
      expect(s.dailyWeather).toHaveLength(s.days.length);
      for (const day of s.dailyWeather) {
        expect(day.am.length).toBeGreaterThan(0);
        expect(day.pm.length).toBeGreaterThan(0);
      }
    }
  });

  it("부산's disruption days are both scripted as 소나기 (shower)", () => {
    for (const outlook of busan().dailyWeather) {
      expect(outlook.pm).toBe("소나기");
    }
  });
});

describe("demoCompletionMessage", () => {
  it("returns the scripted line when the live place still matches", () => {
    expect(demoCompletionMessage(jeonju(), 4, "서학동 예술마을", true)).toMatch(/전시 관람/);
  });

  it("falls back to a generic line (naming the real next place) once Re:Plan changed the place", () => {
    expect(demoCompletionMessage(jeonju(), 4, "국립무형유산원", true, "베테랑")).toBe(
      "여기까지 잘 다녀오셨나요? 베테랑에서 여행을 이어가볼 수 있어요.",
    );
    expect(demoCompletionMessage(jeonju(), 4, "국립무형유산원", false)).toBe(DEMO_GENERIC_CLOSING_MESSAGE);
  });
});
