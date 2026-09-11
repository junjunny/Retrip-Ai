/**
 * Live Firestore + real TourAPI/Kakao Local integration test for STEP 8.
 * Minimized to ONE trip / ONE flexible slot to keep quota use low.
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/candidate.firestore.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateCandidatesForTrip } from "@/features/candidate/candidateService";
import { TripNotFoundError } from "@/features/trip/tripAdminService";
import { getAdminDb } from "@/lib/firebase/admin";

const configured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
const d = describe.skipIf(!configured);
const tripId = `P8ITEST${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

beforeAll(async () => {
  if (!configured) return;
  await getAdminDb()!.doc(`trips/${tripId}`).set({
    tripId,
    title: "P8 통합테스트",
    destination: "부산",
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    itinerary: [
      // FLEXIBLE, unconfirmed -> exercises the destination-geocode fallback path
      { order: 1, date: "2026-10-01", time: "11:00", placeId: null, placeName: "임시 일정", address: null, latitude: null, longitude: null, scheduleType: "flexible", status: "planned", placeConfirmed: false },
      // FIXED — must never appear as a candidate slot
      { order: 2, date: "2026-10-01", time: "18:00", placeId: null, placeName: "고정 일정", address: null, latitude: null, longitude: null, scheduleType: "fixed", status: "planned", placeConfirmed: false },
    ],
    status: "active",
  });
});

afterAll(async () => {
  if (!configured) return;
  await getAdminDb()!.recursiveDelete(getAdminDb()!.doc(`trips/${tripId}`));
});

d("generateCandidatesForTrip (live)", () => {
  it("generates real candidates for the flexible slot only, without touching the itinerary", async () => {
    const now = new Date("2026-10-01T01:00:00.000Z"); // 10:00 KST
    const result = await generateCandidatesForTrip(tripId, { now });

    expect(result).toHaveLength(1);
    expect(result[0].itineraryOrder).toBe(1); // never the fixed item (order 2)
    expect(result[0].keepCurrent).toBe(true);
    expect(Array.isArray(result[0].candidates)).toBe(true);
    expect(result[0].candidates.length).toBeLessThanOrEqual(5);

    for (const c of result[0].candidates) {
      expect(c.placeName.length).toBeGreaterThan(0);
      expect(["tour-korservice", "kakao"]).toContain(c.source);
      expect(["verified", "candidate", "unresolved"]).toContain(c.verificationStatus);
    }

    // itinerary in Firestore is untouched
    const after = await getAdminDb()!.doc(`trips/${tripId}`).get();
    const items = after.get("itinerary") as { order: number; placeName: string }[];
    expect(items.find((i) => i.order === 1)?.placeName).toBe("임시 일정");
    expect(items.find((i) => i.order === 2)?.placeName).toBe("고정 일정");
  });

  it("throws TripNotFoundError for a non-existent trip", async () => {
    await expect(generateCandidatesForTrip("NOSUCHTRIP8")).rejects.toBeInstanceOf(TripNotFoundError);
  });
});
