/**
 * Live Firestore + real TourAPI/Kakao Local integration test for STEP 10.
 * Minimized to ONE trip / ONE flexible slot to keep quota use low (mirrors
 * tests/candidate.firestore.test.ts and tests/scoring.firestore.test.ts).
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/replan.firestore.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyReplanPreview,
  generateReplanPreview,
  generateReplanPreviewWithExplanation,
  ReplanStaleError,
} from "@/features/replan/replanService";
import { submitParticipant } from "@/features/participant/participantService";
import { defaultPreferenceVector } from "@/features/participant/participant";
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
      baseLocationFingerprint: preview.baseLocationFingerprint,
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
        baseLocationFingerprint: preview.baseLocationFingerprint,
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
      applyReplanPreview("NOSUCHTRIP10", {
        baseItineraryFingerprint: "x",
        baseLocationFingerprint: "none",
        generatedAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(TripNotFoundError);
  });

  it("F. an obviously wrong fingerprint is rejected even against an untouched trip", async () => {
    await expect(
      applyReplanPreview(tripId, {
        baseItineraryFingerprint: "00000000",
        baseLocationFingerprint: "none",
        generatedAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(ReplanStaleError);
  });

  it("STEP 12 — a real REPLACE carries a real image/address, and the explanation's placeDescriptions is grounded in a real TourAPI overview", async () => {
    await resetTrip();
    await submitParticipant(tripId, {
      nickname: "자연러버",
      preferences: { ...defaultPreferenceVector(), nature: 10, photo: 10, relax: 10, culture: 1, food: 1, cafe: 1, shopping: 1, activity: 1 },
      pace: "normal",
      indoorOutdoor: "outdoor",
    });

    const { preview, explanation } = await generateReplanPreviewWithExplanation(tripId, { now });
    const replaced = preview.slots.find((s) => s.action === "REPLACE");
    expect(replaced).toBeDefined(); // the strongly-biased participant should tip a real candidate past the improvement threshold
    expect(replaced!.proposed!.placeName.length).toBeGreaterThan(0);
    // real TourAPI data only — never fabricated (imageUrl may legitimately be null if this particular place has none)
    expect(
      replaced!.proposed!.imageUrl === null || replaced!.proposed!.imageUrl!.startsWith("http"),
    ).toBe(true);

    // whatever the explanation says, it must still pass the same grounding gate used elsewhere
    for (const pd of explanation.placeDescriptions) {
      expect(preview.slots.some((s) => s.itineraryOrder === pd.itineraryOrder && s.action === "REPLACE")).toBe(true);
    }

    await resetTrip();
  });

  it("STEP 13 — a real REPLACE with a currentLocation carries real driving mobility data, and honestly-unavailable walk/transit", async () => {
    await resetTrip();
    await submitParticipant(tripId, {
      nickname: "자연러버2",
      preferences: { ...defaultPreferenceVector(), nature: 10, photo: 10, relax: 10, culture: 1, food: 1, cafe: 1, shopping: 1, activity: 1 },
      pace: "normal",
      indoorOutdoor: "outdoor",
    });

    const currentLocation = { latitude: 35.1585, longitude: 129.1599 }; // 해운대
    const preview = await generateReplanPreview(tripId, { now, currentLocation });
    expect(preview.baseLocationFingerprint).toBe("35.1585,129.1599");

    const replaced = preview.slots.find((s) => s.action === "REPLACE");
    expect(replaced).toBeDefined();
    const mobility = replaced!.score.mobility!;
    expect(mobility.map((m) => m.mode)).toEqual(["WALK", "DRIVING", "TRANSIT"]);

    const walk = mobility.find((m) => m.mode === "WALK")!;
    const transit = mobility.find((m) => m.mode === "TRANSIT")!;
    expect(walk.available).toBe(false);
    expect(walk.failureReason).toBeTruthy();
    expect(transit.available).toBe(false);
    expect(transit.failureReason).toBeTruthy();

    const driving = mobility.find((m) => m.mode === "DRIVING")!;
    if (driving.available) {
      // real candidate had confirmable coordinates -> a real Kakao Mobility route
      expect(driving.durationMinutes).toBeGreaterThan(0);
      expect(driving.distanceMeters).toBeGreaterThan(0);
      expect(driving.source).toBe("kakao-mobility");
      expect(Array.isArray(driving.polyline)).toBe(true);
    } else {
      // still honest, never a guessed number, if this particular candidate had no usable coordinates
      expect(driving.durationMinutes).toBeNull();
      expect(driving.failureReason).toBeTruthy();
    }

    await resetTrip();
  });
});
