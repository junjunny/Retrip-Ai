/**
 * Live Firestore (+ real KMA weather) integration test for STEP 7 —
 * getTripTravelState reads a real trip and computes a snapshot without
 * crashing when optional data (participants, current location) is absent.
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/travelState.firestore.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getTripTravelState } from "@/features/travel-state/travelStateService";
import { TripNotFoundError } from "@/features/trip/tripAdminService";
import { getAdminDb } from "@/lib/firebase/admin";

const configured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
const d = describe.skipIf(!configured);
const tripId = `P7ITEST${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

beforeAll(async () => {
  if (!configured) return;
  await getAdminDb()!.doc(`trips/${tripId}`).set({
    tripId,
    title: "P7 통합테스트",
    destination: "부산",
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    itinerary: [
      {
        order: 1,
        date: "2026-10-01",
        time: "11:00",
        placeId: "kakao:test",
        placeName: "해운대해수욕장",
        address: "부산 해운대구 우동",
        latitude: 35.1587,
        longitude: 129.1604,
        scheduleType: "flexible",
        status: "planned",
        placeConfirmed: true,
      },
    ],
    status: "active",
  });
});

afterAll(async () => {
  if (!configured) return;
  await getAdminDb()!.recursiveDelete(getAdminDb()!.doc(`trips/${tripId}`));
});

d("getTripTravelState (live)", () => {
  it("computes a snapshot for a real trip without crashing", async () => {
    const now = new Date("2026-10-01T02:00:00.000Z"); // 11:00 KST, same date as the itinerary
    const state = await getTripTravelState(tripId, { now });
    expect(state.tripId).toBe(tripId);
    expect(state.now).toEqual({ date: "2026-10-01", time: "11:00" });
    expect(["low", "medium", "high", "unknown"]).toContain(state.weatherRisk);
    // no currentLocation was passed -> no GPS is ever inferred -> traffic stays unknown
    expect(state.trafficBurden).toBe("unknown");
    // 0 participants submitted preferences -> no disagreement is defined
    expect(state.preferenceDisagreement).toBeNull();
    // no Experience Profile and no visit-category tracking -> never estimated
    expect(state.experienceDeviation).toBeNull();
    expect(["NORMAL", "WATCH", "INTERVENTION"]).toContain(state.status);
  });

  it("is deterministic for the same injected now", async () => {
    const now = new Date("2026-10-01T02:00:00.000Z");
    const a = await getTripTravelState(tripId, { now });
    const b = await getTripTravelState(tripId, { now });
    expect(a).toEqual(b);
  });

  it("throws TripNotFoundError for a non-existent trip", async () => {
    await expect(getTripTravelState("NOSUCHTRIP7")).rejects.toBeInstanceOf(TripNotFoundError);
  });
});
