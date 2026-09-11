/**
 * Live smoke test for the Kakao adapters (Local + Mobility).
 *
 * Kakao is reachable from CI; data.go.kr is not (see PHASE 3-A report), so only
 * Kakao has a live smoke test. Run:
 *
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/api.kakao.smoke.test.ts
 */
import { describe, expect, it } from "vitest";

import { fetchDrivingRoute } from "@/lib/api/kakao/route";
import { coordToAddress, searchAddress, searchPlacesByKeyword } from "@/lib/api/kakao/place";

const d = describe.skipIf(!process.env.KAKAO_API_KEY);

d("Kakao Local", () => {
  it("keyword search returns coordinate-bearing candidates", async () => {
    const places = await searchPlacesByKeyword("해운대해수욕장", { size: 3 });
    expect(places.length).toBeGreaterThan(0);
    expect(places[0]).toMatchObject({ provider: "kakao" });
    expect(typeof places[0].latitude).toBe("number");
    expect(typeof places[0].longitude).toBe("number");
  });

  it("empty query returns [] without a call", async () => {
    expect(await searchPlacesByKeyword("   ")).toEqual([]);
  });

  it("address search resolves to coordinates", async () => {
    const r = await searchAddress("부산 해운대구 우동");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].latitude).toBeGreaterThan(34);
    expect(r[0].latitude).toBeLessThan(39);
  });

  it("coordToAddress returns an address or null", async () => {
    const a = await coordToAddress(129.1603, 35.1587);
    expect(a === null || typeof a.address === "string" || a.address === null).toBe(true);
  });
});

d("Kakao Mobility", () => {
  it("driving route returns traffic-aware duration + segments", async () => {
    const route = await fetchDrivingRoute({
      origin: { longitude: 129.1598, latitude: 35.1585 },
      destination: { longitude: 129.0361, latitude: 35.1372 }, // 자갈치
    });
    expect(route.provider).toBe("kakao-mobility");
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.durationSeconds).toBeGreaterThan(0);
    expect(Array.isArray(route.trafficSegments)).toBe(true);
    expect(route.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // STEP 13 — real route geometry for the map polyline, never synthesized
    expect(Array.isArray(route.polyline)).toBe(true);
    expect(route.polyline.length).toBeGreaterThan(0);
    for (const pt of route.polyline) {
      expect(pt.latitude).toBeGreaterThan(30);
      expect(pt.latitude).toBeLessThan(40);
      expect(pt.longitude).toBeGreaterThan(120);
      expect(pt.longitude).toBeLessThan(135);
    }
  });
});
