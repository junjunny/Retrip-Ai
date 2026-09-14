import { describe, expect, it } from "vitest";

import { buildDailyOutlook, summarizeForecastSlot } from "@/features/travel-state/weatherOutlook";
import type { WeatherData } from "@/types";

function slot(overrides: Partial<WeatherData>): WeatherData {
  return {
    forecastDate: "20260912",
    forecastTime: "0900",
    nx: 60,
    ny: 127,
    temperature: 22,
    precipitationProbability: 10,
    precipitationAmount: "강수없음",
    skyCondition: 1,
    precipitationType: 0,
    humidity: 50,
    windSpeed: 2,
    source: "kma-vilagefcst",
    ...overrides,
  };
}

describe("summarizeForecastSlot", () => {
  it("labels a clear slot", () => {
    expect(summarizeForecastSlot(slot({}))).toEqual({ kind: "clear", label: "맑음" });
  });
  it("labels PTY 4 as a shower, never averaged into 'clear'", () => {
    expect(summarizeForecastSlot(slot({ precipitationType: 4 }))).toEqual({ kind: "rain", label: "소나기" });
  });
  it("labels PTY 1 as rain", () => {
    expect(summarizeForecastSlot(slot({ precipitationType: 1 }))).toEqual({ kind: "rain", label: "비" });
  });
  it("labels PTY 3 as snow", () => {
    expect(summarizeForecastSlot(slot({ precipitationType: 3 }))).toEqual({ kind: "snow", label: "눈" });
  });
  it("falls back to a high precipitation probability when PTY is 0 (없음)", () => {
    expect(summarizeForecastSlot(slot({ precipitationType: 0, precipitationProbability: 70 }))).toEqual({
      kind: "rain",
      label: "비 가능",
    });
  });
  it("labels overcast sky (SKY 4) as 흐림 when there's no real precipitation signal", () => {
    expect(summarizeForecastSlot(slot({ skyCondition: 4 }))).toEqual({ kind: "cloudy", label: "흐림" });
  });
});

describe("buildDailyOutlook", () => {
  it("never fabricates a slot for a date with no real forecast data", () => {
    const out = buildDailyOutlook([], ["2026-09-12"]);
    expect(out).toEqual([{ date: "2026-09-12", am: null, pm: null }]);
  });

  it("picks the most severe outlook within each half-day, never averaging a shower away", () => {
    const slots: WeatherData[] = [
      slot({ forecastTime: "0900", skyCondition: 1, precipitationType: 0 }), // clear AM
      slot({ forecastTime: "1500", skyCondition: 1, precipitationType: 4 }), // shower PM
      slot({ forecastTime: "1800", skyCondition: 1, precipitationType: 0 }), // clear PM
    ];
    const [day] = buildDailyOutlook(slots, ["2026-09-12"]);
    expect(day.am).toEqual({ kind: "clear", label: "맑음" });
    expect(day.pm).toEqual({ kind: "rain", label: "소나기" });
  });

  it("keeps am/pm null when a date has forecast slots only for the other half", () => {
    const slots: WeatherData[] = [slot({ forecastTime: "0900" })];
    const [day] = buildDailyOutlook(slots, ["2026-09-12"]);
    expect(day.am).not.toBeNull();
    expect(day.pm).toBeNull();
  });
});
