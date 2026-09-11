/**
 * Live Firestore + real TourAPI/Kakao Local integration test for STEP 10.
 * Minimized to ONE trip / ONE flexible slot to keep quota use low (mirrors
 * tests/candidate.firestore.test.ts and tests/scoring.firestore.test.ts).
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/replan.firestore.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyReplanPreview, generateReplanPreview, ReplanStaleError } from "@/features/replan/replanService";
import { TripNotFoundError } from "@/features/trip/tripAdminService";
import { getAdminDb } from "@/lib/firebase/admin";

const configured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
const d = describe.skipIf(!configured);
const tripId = `P10ITEST${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const seedItinerary = [
  { order: 1, date: "2026-10-01", time: "11:00", placeId: null, placeName: "임시 일정", address: null, latitude: null, longitude: null, scheduleType: "flexible", status: "planned", placeConfirmed: false },
  { order: 2, date: "2026-10-01", time: "18:00", placeId: null, placeName: "고정 일정", address: null, latitude: null, longitude: null, scheduleType: "fixed", status: "planned", placeConfirmed: false },
];

async function resetTrip() {
  await getAdminDb()!.doc(`trips/${tripId}`).set({
    tripId,
    title: "P10 통합테스트",
    destination: "부산",
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    itinerary: seedItinerary,
    status: "active",
  });
}

beforeAll(async () => {
  if (!configured) return;
  await resetTrip();
});

afterAll(async () => {
  if (!configured) return;
  await getAdminDb()!.recursiveDelete(getAdminDb()!.doc(`trips/${tripId}`));
});

d("Re:Plan (live)", () => {
  const now = new Date("2026-10-01T01:00:00.000Z"); // 10:00 KST

  it("A. generates a preview without touching the itinerary; FIXED slot is never proposed", async () => {
    const preview = await generateReplanPreview(tripId, { now });
    expect(preview.tripId).toBe(tripId);
    expect(preview.slots.every((s) => s.itineraryOrder !== 2)).toBe(true); // the fixed item never appears

    const after = await getAdminDb()!.doc(`trips/${tripId}`).get();
    const items = after.get("itinerary") as { order: number; placeName: string }[];
    expect(items.find((i) => i.order === 1)?.placeName).toBe("임시 일정");
    expect(items.find((i) => i.order === 2)?.placeName).toBe("고정 일정");
  });

  it("I. is deterministic for the same itinerary + now: same fingerprint, same slot actions", async () => {
    const a = await generateReplanPreview(tripId, { now });
    const b = await generateReplanPreview(tripId, { now });
    expect(a.baseItineraryFingerprint).toBe(b.baseItineraryFingerprint);
    expect(a.slots.map((s) => ({ order: s.itineraryOrder, action: s.action }))).toEqual(
      b.slots.map((s) => ({ order: s.itineraryOrder, action: s.action })),
    );
  });

  it("C/D. Apply with a valid fingerprint succeeds; FIXED item is never touched; date/time/order preserved", async () => {
    const preview = await generateReplanPreview(tripId, { now });
    const result = await applyReplanPreview(tripId, {
      baseItineraryFingerprint: preview.baseItineraryFingerprint,
      generatedAt: preview.generatedAt,
    });
    const fixed = result.itinerary.find((i) => i.order === 2)!;
    expect(fixed.placeName).toBe("고정 일정");
    expect(fixed.scheduleType).toBe("fixed");
    for (const it of result.itinerary) {
      const seed = seedItinerary.find((s) => s.order === it.order)!;
      expect(it.date).toBe(seed.date);
      expect(it.time).toBe(seed.time);
      expect(it.order).toBe(seed.order);
    }
    // whatever happened, it's reflected in Firestore
    const after = await getAdminDb()!.doc(`trips/${tripId}`).get();
    expect(after.get("itinerary")).toEqual(result.itinerary);
  });

  it("E/F. stale fingerprint is rejected and never applied; the user's edit in between is preserved", async () => {
    await resetTrip();
    const preview = await generateReplanPreview(tripId, { now });

    // simulate the user editing the itinerary between preview and apply
    const db = getAdminDb()!;
    const editedTime = "13:30";
    await db.doc(`trips/${tripId}`).update({
      itinerary: seedItinerary.map((it) => (it.order === 1 ? { ...it, time: editedTime } : it)),
    });

    await expect(
      applyReplanPreview(tripId, {
        baseItineraryFingerprint: preview.baseItineraryFingerprint, // stale — from before the edit
        generatedAt: preview.generatedAt,
      }),
    ).rejects.toBeInstanceOf(ReplanStaleError);

    // the user's edit must still be there — nothing was overwritten
    const after = await db.doc(`trips/${tripId}`).get();
    const items = after.get("itinerary") as { order: number; time: string }[];
    expect(items.find((i) => i.order === 1)?.time).toBe(editedTime);

    await resetTrip();
  });

  it("F. non-existent trip is rejected for both preview and apply", async () => {
    await expect(generateReplanPreview("NOSUCHTRIP10")).rejects.toBeInstanceOf(TripNotFoundError);
    await expect(
      applyReplanPreview("NOSUCHTRIP10", { baseItineraryFingerprint: "x", generatedAt: new Date().toISOString() }),
    ).rejects.toBeInstanceOf(TripNotFoundError);
  });

  it("F. an obviously wrong fingerprint is rejected even against an untouched trip", async () => {
    await expect(
      applyReplanPreview(tripId, { baseItineraryFingerprint: "00000000", generatedAt: new Date().toISOString() }),
    ).rejects.toBeInstanceOf(ReplanStaleError);
  });
});
