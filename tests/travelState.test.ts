/**
 * STEP 7 — Travel State pure calculators (hermetic). No Firestore, no network,
 * no Date.now(): every `now` is injected as a plain "YYYY-MM-DD"/"HH:mm" pair.
 */
import { describe, expect, it } from "vitest";

import {
  TRAVEL_STATE_THRESHOLDS,
  buildTravelState,
  computeExperienceDeviation,
  computePreferenceDisagreement,
  computeRemainingScheduleMinutes,
  computeScheduleDelayMinutes,
  computeTrafficBurden,
  computeTravelStateStatus,
  computeWeatherRisk,
  pickNextPendingItem,
  type TravelStateInput,
} from "@/features/travel-state";
import { defaultPreferenceVector } from "@/features/participant/participant";
import type {
  ExperienceProfile,
  ItineraryItem,
  PreferenceVector,
  RouteData,
  WeatherData,
} from "@/types";

const item = (over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  order: 1,
  date: "2026-10-01",
  time: "10:00",
  placeId: null,
  placeName: "장소",
  address: null,
  latitude: null,
  longitude: null,
  scheduleType: "flexible",
  status: "planned",
  placeConfirmed: false,
  ...over,
});

const weather = (over: Partial<WeatherData> = {}): WeatherData => ({
  forecastDate: "20261001",
  forecastTime: "1000",
  nx: 60,
  ny: 127,
  temperature: 20,
  precipitationProbability: 10,
  precipitationAmount: "강수없음",
  skyCondition: 1,
  precipitationType: 0,
  humidity: 50,
  windSpeed: 2,
  source: "kma-vilagefcst",
  ...over,
});

const route = (over: Partial<RouteData> = {}): RouteData => ({
  distanceMeters: 5000,
  durationSeconds: 900,
  taxiFare: null,
  tollFare: null,
  priority: "RECOMMEND",
  trafficSegments: [],
  fetchedAt: "2026-10-01T01:00:00.000Z",
  provider: "kakao-mobility",
  ...over,
});

const vec = (over: Partial<PreferenceVector> = {}): PreferenceVector => ({
  ...defaultPreferenceVector(),
  ...over,
});

describe("computeScheduleDelayMinutes", () => {
  it("TEST 1 — the next item is in the future -> delay 0 (never negative)", () => {
    expect(
      computeScheduleDelayMinutes([item({ date: "2026-10-01", time: "12:00" })], "2026-10-01", "10:00"),
    ).toBe(0);
  });

  it("TEST 2 — items on other dates don't affect today's delay", () => {
    const itinerary = [
      item({ order: 1, date: "2026-10-02", time: "09:00" }), // tomorrow, earlier clock time — must be ignored
      item({ order: 2, date: "2026-10-01", time: "10:00" }),
    ];
    expect(computeScheduleDelayMinutes(itinerary, "2026-10-01", "10:30")).toBe(30);
  });

  it("TEST 3 — completed items are excluded from the delay calculation", () => {
    const itinerary = [
      item({ order: 1, date: "2026-10-01", time: "09:00", status: "completed" }),
      item({ order: 2, date: "2026-10-01", time: "11:00", status: "planned" }),
    ];
    // the completed 09:00 item must not be picked as "next" -> delay vs 11:00, not 09:00
    expect(computeScheduleDelayMinutes(itinerary, "2026-10-01", "09:30")).toBe(0);
  });

  it("TEST 4 — no pending item today -> null (not a fabricated 0)", () => {
    const itinerary = [item({ date: "2026-10-01", time: "09:00", status: "completed" })];
    expect(computeScheduleDelayMinutes(itinerary, "2026-10-01", "10:00")).toBeNull();
    expect(computeScheduleDelayMinutes([], "2026-10-01", "10:00")).toBeNull();
  });

  it("TEST 5 — multi-day itinerary: only the current date is considered", () => {
    const itinerary = [
      item({ order: 1, date: "2026-10-01", time: "09:00" }),
      item({ order: 2, date: "2026-10-02", time: "09:00" }),
      item({ order: 3, date: "2026-10-03", time: "09:00" }),
    ];
    expect(computeScheduleDelayMinutes(itinerary, "2026-10-02", "09:20")).toBe(20);
    expect(pickNextPendingItem(itinerary, "2026-10-02")?.order).toBe(2);
  });
});

describe("computeWeatherRisk", () => {
  it("TEST 6 — a normal forecast (clear, no rain) is low risk", () => {
    expect(computeWeatherRisk(weather(), "outdoor").level).toBe("low");
  });

  it("TEST 7 — no weather data -> unknown, never a guess", () => {
    expect(computeWeatherRisk(null, "outdoor")).toEqual({ level: "unknown", reason: "예보 데이터 없음" });
  });

  it("TEST 8 — outdoor vs. indoor context changes the result for the same forecast", () => {
    const rainy = weather({ precipitationType: 1, precipitationProbability: 90 });
    expect(computeWeatherRisk(rainy, "outdoor").level).toBe("high");
    expect(computeWeatherRisk(rainy, "indoor").level).toBe("medium"); // sheltered, downgraded one step
    expect(computeWeatherRisk(rainy, "unknown").level).toBe("high"); // no context -> can't discount
  });
});

describe("computeTrafficBurden", () => {
  it("TEST 9 — real Kakao Mobility traffic_state codes are used", () => {
    expect(computeTrafficBurden(route({ trafficSegments: [{ name: "a", distanceMeters: 1000, durationSeconds: 60, speedKmh: 20, trafficState: 3 }] })).level).toBe("high");
    expect(computeTrafficBurden(route({ trafficSegments: [{ name: "a", distanceMeters: 1000, durationSeconds: 60, speedKmh: 60, trafficState: 1 }] })).level).toBe("low");
  });

  it("TEST 10 — no route data -> unknown, never a fabricated burden", () => {
    expect(computeTrafficBurden(null)).toEqual({ level: "unknown", reason: "경로 데이터 없음" });
  });

  it("TEST 11 — no baseline/free-flow field exists on RouteData; only real traffic_state codes drive the result (0 = no data is excluded, not treated as 'free-flowing')", () => {
    expect("baselineDurationSeconds" in route()).toBe(false);
    expect(
      computeTrafficBurden(route({ trafficSegments: [{ name: "a", distanceMeters: 1000, durationSeconds: 60, speedKmh: null, trafficState: 0 }] })),
    ).toEqual({ level: "unknown", reason: "구간별 혼잡도 정보 없음" });
  });
});

describe("computeExperienceDeviation", () => {
  it("TEST 12 — a profile + completed-category counts produce a bounded deviation", () => {
    const profile: ExperienceProfile = { ...defaultPreferenceVector(), nature: 10, food: 10 };
    const deviation = computeExperienceDeviation(profile, { nature: 5, food: 5 });
    expect(deviation).not.toBeNull();
    expect(deviation!).toBeGreaterThanOrEqual(0);
    expect(deviation!).toBeLessThanOrEqual(1);
  });

  it("TEST 13 — no Experience Profile -> null", () => {
    expect(computeExperienceDeviation(null, { nature: 5 })).toBeNull();
  });

  it("TEST 14 — no completed-visit category data -> null (never estimated from GPS/assumption)", () => {
    const profile: ExperienceProfile = defaultPreferenceVector();
    expect(computeExperienceDeviation(profile, null)).toBeNull();
    expect(computeExperienceDeviation(profile, {})).toBeNull();
  });
});

describe("computeRemainingScheduleMinutes", () => {
  it("TEST 15 — remaining window to the last item today", () => {
    const itinerary = [
      item({ order: 1, date: "2026-10-01", time: "10:00" }),
      item({ order: 2, date: "2026-10-01", time: "18:00" }),
    ];
    expect(computeRemainingScheduleMinutes(itinerary, "2026-10-01", "16:00")).toBe(120);
  });

  it("TEST 16 — now past the last item today -> 0, not negative; no items today -> null", () => {
    const itinerary = [item({ date: "2026-10-01", time: "09:00" })];
    expect(computeRemainingScheduleMinutes(itinerary, "2026-10-01", "20:00")).toBe(0);
    expect(computeRemainingScheduleMinutes(itinerary, "2026-10-05", "10:00")).toBeNull();
  });
});

describe("computePreferenceDisagreement", () => {
  it("TEST 17 — spreads out across two very different vectors", () => {
    const d = computePreferenceDisagreement([vec({ nature: 1 }), vec({ nature: 10 })]);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0);
  });

  it("TEST 18 — 0 or 1 participant -> null (no disagreement is defined)", () => {
    expect(computePreferenceDisagreement([])).toBeNull();
    expect(computePreferenceDisagreement([vec()])).toBeNull();
  });

  it("identical vectors -> 0 disagreement", () => {
    expect(computePreferenceDisagreement([vec(), vec(), vec()])).toBe(0);
  });
});

describe("computeTravelStateStatus", () => {
  const calm = {
    scheduleDelayMinutes: 0,
    weatherRisk: "low" as const,
    trafficBurden: "low" as const,
    experienceDeviation: null,
    preferenceDisagreement: null,
  };

  it("TEST 19 — NORMAL when nothing is off", () => {
    expect(computeTravelStateStatus(calm)).toBe("NORMAL");
  });

  it("TEST 20 — WATCH on a moderate schedule delay", () => {
    expect(
      computeTravelStateStatus({ ...calm, scheduleDelayMinutes: TRAVEL_STATE_THRESHOLDS.scheduleDelayWatchMinutes }),
    ).toBe("WATCH");
  });

  it("TEST 21 — INTERVENTION on a severe schedule delay", () => {
    expect(
      computeTravelStateStatus({ ...calm, scheduleDelayMinutes: TRAVEL_STATE_THRESHOLDS.scheduleDelayInterventionMinutes }),
    ).toBe("INTERVENTION");
  });

  it("TEST 21b — INTERVENTION when weather AND traffic are both high", () => {
    expect(computeTravelStateStatus({ ...calm, weatherRisk: "high", trafficBurden: "high" })).toBe("INTERVENTION");
  });

  it("TEST 24 — threshold boundaries: one minute under WATCH stays NORMAL", () => {
    expect(
      computeTravelStateStatus({
        ...calm,
        scheduleDelayMinutes: TRAVEL_STATE_THRESHOLDS.scheduleDelayWatchMinutes - 1,
      }),
    ).toBe("NORMAL");
    expect(
      computeTravelStateStatus({
        ...calm,
        scheduleDelayMinutes: TRAVEL_STATE_THRESHOLDS.scheduleDelayInterventionMinutes - 1,
      }),
    ).toBe("WATCH");
  });
});

describe("buildTravelState — orchestration, determinism, and non-interference", () => {
  const baseInput = (): TravelStateInput => ({
    tripId: "T1",
    now: { date: "2026-10-01", time: "10:00" },
    itinerary: [item({ date: "2026-10-01", time: "11:00" })],
    weather: null,
    weatherContext: { indoorOutdoor: "unknown" },
    route: null,
    experienceProfile: null,
    completedCategoryCounts: null,
    preferenceVectors: [],
  });

  it("TEST 22 — never mutates its inputs (a status is not an automatic itinerary edit)", () => {
    const input = baseInput();
    const itinerarySnapshot = JSON.stringify(input.itinerary);
    buildTravelState({
      ...input,
      itinerary: input.itinerary,
      weather: weather({ precipitationType: 1, precipitationProbability: 100 }),
      route: route({ trafficSegments: [{ name: "a", distanceMeters: 1, durationSeconds: 1, speedKmh: null, trafficState: 4 }] }),
    });
    expect(JSON.stringify(input.itinerary)).toBe(itinerarySnapshot);
  });

  it("TEST 23 — identical input + identical now -> identical TravelState", () => {
    const input = baseInput();
    expect(buildTravelState(input)).toEqual(buildTravelState(input));
  });

  it("TEST 25 — missing optional external data never crashes and degrades to unknown/null", () => {
    const state = buildTravelState(baseInput());
    expect(state.weatherRisk).toBe("unknown");
    expect(state.trafficBurden).toBe("unknown");
    expect(state.experienceDeviation).toBeNull();
    expect(state.preferenceDisagreement).toBeNull();
    expect(state.status).toBe("NORMAL");
    expect(state.now).toEqual({ date: "2026-10-01", time: "10:00" });
    expect(state.tripId).toBe("T1");
  });

  it("a fully-populated input flows through every metric consistently", () => {
    const state = buildTravelState({
      tripId: "T2",
      now: { date: "2026-10-01", time: "10:00" },
      itinerary: [
        item({ order: 1, date: "2026-10-01", time: "09:00", status: "completed" }),
        item({ order: 2, date: "2026-10-01", time: "09:30" }), // overdue -> delay
        item({ order: 3, date: "2026-10-01", time: "18:00" }),
      ],
      weather: weather({ precipitationType: 1, precipitationProbability: 90 }),
      weatherContext: { indoorOutdoor: "outdoor" },
      route: route({ trafficSegments: [{ name: "a", distanceMeters: 1000, durationSeconds: 60, speedKmh: 10, trafficState: 4 }] }),
      experienceProfile: { ...defaultPreferenceVector(), nature: 10 },
      completedCategoryCounts: { food: 3 },
      preferenceVectors: [vec({ nature: 1 }), vec({ nature: 10 })],
    });
    expect(state.scheduleDelayMinutes).toBe(30);
    expect(state.remainingScheduleMinutes).toBe(480);
    expect(state.weatherRisk).toBe("high");
    expect(state.trafficBurden).toBe("high");
    expect(state.experienceDeviation).not.toBeNull();
    expect(state.preferenceDisagreement).not.toBeNull();
    expect(state.status).toBe("INTERVENTION");
  });
});
