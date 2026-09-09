/**
 * Live smoke test for the data.go.kr adapters (한국관광공사 3종 + 기상청).
 * Verified reachable from Vercel icn1 (STEP 1). Run:
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/api.datago.smoke.test.ts
 */
import { describe, expect, it } from "vitest";

import { fetchAccessibility } from "@/lib/api/tour/accessibility";
import { fetchDistrictVisitors, fetchMetroVisitors } from "@/lib/api/tour/visitors";
import { fetchTourismByArea, searchTourismByKeyword } from "@/lib/api/tour/tourism";
import { fetchShortTermForecast } from "@/lib/api/weather/kma";

const d = describe.skipIf(!process.env.TOUR_API_KEY_MAIN);

d("TourAPI 관광정보", () => {
  it("areaBasedList2 returns TourismPlace rows with coordinates", async () => {
    const places = await fetchTourismByArea({ areaCode: 6, contentTypeId: 12, numOfRows: 3 });
    expect(places.length).toBeGreaterThan(0);
    expect(places[0]).toMatchObject({ source: "tour-korservice" });
    expect(typeof places[0].name).toBe("string");
    expect(typeof places[0].latitude === "number" || places[0].latitude === null).toBe(true);
  });
  it("searchKeyword2 returns rows", async () => {
    const r = await searchTourismByKeyword("해운대", { numOfRows: 3 });
    expect(r.length).toBeGreaterThan(0);
  });
});

d("TourAPI 방문자수 (일자별, 지역 부담 보조지표)", () => {
  // known-published window (data lags ~1 month)
  const range = { startYmd: "20260801", endYmd: "20260807" };
  it("metco returns daily rows filterable by region (부산 26)", async () => {
    const v = await fetchMetroVisitors({ ...range, regionCode: "26", numOfRows: 400 });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatchObject({ granularity: "daily", source: "tour-datalab-visitor", regionCode: "26" });
    expect(typeof v[0].visitorCount).toBe("number");
    expect(["현지인(a)", "외지인(b)"]).toContain(v[0].visitorType);
  });
  it("locgo returns 시군구 rows (해운대구 26350)", async () => {
    const v = await fetchDistrictVisitors({ ...range, regionCode: "26350", numOfRows: 2000 });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].regionCode).toBe("26350");
  });
});

d("TourAPI 무장애 (KorWithService2)", () => {
  it("detailWithTour2 returns facility free-text keyed by field", async () => {
    const a = await fetchAccessibility(849929);
    expect(a).not.toBeNull();
    expect(a!.source).toBe("tour-barrier-free");
    expect(Array.isArray(a!.availableFeatures)).toBe(true);
    // every listed feature has non-empty text
    for (const k of a!.availableFeatures) expect(a!.features[k]?.length).toBeGreaterThan(0);
  });
});

d("기상청 단기예보", () => {
  it("getVilageFcst pivots to per-slot WeatherData", async () => {
    const w = await fetchShortTermForecast({ latitude: 35.1587, longitude: 129.1603 });
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]).toMatchObject({ source: "kma-vilagefcst" });
    expect(w[0].forecastDate).toMatch(/^\d{8}$/);
    expect(w[0].forecastTime).toMatch(/^\d{4}$/);
    // PCP stays a string ("강수없음" / "1.0mm" / …)
    expect(w[0].precipitationAmount === null || typeof w[0].precipitationAmount === "string").toBe(true);
  });
});
