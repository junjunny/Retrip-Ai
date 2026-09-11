/**
 * Live Firestore + real TourAPI/Kakao Local/Kakao Mobility integration test
 * for STEP 9. Minimized to ONE trip / ONE flexible slot to keep quota use low
 * (mirrors tests/candidate.firestore.test.ts).
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/scoring.firestore.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { NEUTRAL_COMPONENT_SCORE } from "@/features/scoring";
import { scoreTripCandidates } from "@/features/scoring/scoringService";
import { TripNotFoundError } from "@/features/trip/tripAdminService";
import { getAdminDb } from "@/lib/firebase/admin";

const configured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
const d = describe.skipIf(!configured);
const tripId = `P9ITEST${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

beforeAll(async () => {
  if (!configured) return;
  await getAdminDb()!.doc(`trips/${tripId}`).set({
    tripId,
    title: "P9 통합테스트",
    destination: "부산",
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    itinerary: [
      { order: 1, date: "2026-10-01", time: "11:00", placeId: null, placeName: "임시 일정", address: null, latitude: null, longitude: null, scheduleType: "flexible", status: "planned", placeConfirmed: false },
      { order: 2, date: "2026-10-01", time: "18:00", placeId: null, placeName: "고정 일정", address: null, latitude: null, longitude: null, scheduleType: "fixed", status: "planned", placeConfirmed: false },
    ],
    status: "active",
  });
});

afterAll(async () => {
  if (!configured) return;
  await getAdminDb()!.recursiveDelete(getAdminDb()!.doc(`trips/${tripId}`));
});

d("scoreTripCandidates (live)", () => {
  it("ranks the real STEP 8 candidates plus 'keep current' for the flexible slot only, without touching the itinerary", async () => {
    const now = new Date("2026-10-01T01:00:00.000Z"); // 10:00 KST
    const result = await scoreTripCandidates(tripId, { now });

    expect(result).toHaveLength(1);
    expect(result[0].itineraryOrder).toBe(1); // never the fixed item (order 2)

    const kinds = result[0].ranked.map((r) => r.kind);
    expect(kinds).toContain("keepCurrent");
    expect(result[0].ranked.length).toBeGreaterThanOrEqual(1); // at least keepCurrent

    // deterministic, sorted descending by finalScore
    const scores = result[0].ranked.map((r) => r.breakdown.finalScore);
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);

    // no currentLocation supplied -> no route data -> travelBurden null, timeFitness neutral for everyone
    for (const r of result[0].ranked) {
      expect(r.breakdown.travelBurden).toBeNull();
      expect(r.breakdown.timeFitness).toBe(NEUTRAL_COMPONENT_SCORE);
    }

    // itinerary in Firestore is untouched
    const after = await getAdminDb()!.doc(`trips/${tripId}`).get();
    const items = after.get("itinerary") as { order: number; placeName: string }[];
    expect(items.find((i) => i.order === 1)?.placeName).toBe("임시 일정");
    expect(items.find((i) => i.order === 2)?.placeName).toBe("고정 일정");
  });

  it("throws TripNotFoundError for a non-existent trip", async () => {
    await expect(scoreTripCandidates("NOSUCHTRIP9")).rejects.toBeInstanceOf(TripNotFoundError);
  });
});
