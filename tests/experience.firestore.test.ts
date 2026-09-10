/**
 * Live Firestore integration test for STEP 6 — a trip's stored preferences
 * aggregate into a group Experience Profile. Run:
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/experience.firestore.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getTripExperienceProfile } from "@/features/experience/experienceService";
import {
  PREFERENCE_KEYS,
  PREFERENCE_NEUTRAL,
  defaultPreferenceVector,
} from "@/features/participant/participant";
import { submitParticipant } from "@/features/participant/participantService";
import { getAdminDb } from "@/lib/firebase/admin";

const configured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
const d = describe.skipIf(!configured);
const tripId = `P6ITEST${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

const input = (nickname: string, over: Record<string, unknown> = {}) => ({
  nickname,
  preferences: defaultPreferenceVector(),
  pace: "normal" as const,
  indoorOutdoor: "balanced" as const,
  ...over,
});

beforeAll(async () => {
  if (!configured) return;
  await getAdminDb()!.doc(`trips/${tripId}`).set({
    tripId,
    title: "P6 통합테스트",
    destination: "부산",
    startDate: "2026-09-10",
    endDate: "2026-09-10",
    itinerary: [],
    status: "active",
  });
});

afterAll(async () => {
  if (!configured) return;
  await getAdminDb()!.recursiveDelete(getAdminDb()!.doc(`trips/${tripId}`));
});

d("getTripExperienceProfile", () => {
  it("is null before anyone submits preferences", async () => {
    expect(await getTripExperienceProfile(tripId)).toBeNull();
  });

  it("equals the sole participant's vector when only one has joined", async () => {
    await submitParticipant(
      tripId,
      input("혼자", { preferences: { ...defaultPreferenceVector(), nature: 10, food: 2 } }),
    );
    const profile = await getTripExperienceProfile(tripId);
    expect(profile!.nature).toBe(10);
    expect(profile!.food).toBe(2);
    expect(profile!.relax).toBe(PREFERENCE_NEUTRAL);
  });

  it("is the equal-weight mean once a second participant joins", async () => {
    await submitParticipant(
      tripId,
      input("둘째", { preferences: { ...defaultPreferenceVector(), nature: 4, food: 8 } }),
    );
    const profile = await getTripExperienceProfile(tripId);
    // nature (10 + 4)/2 = 7, food (2 + 8)/2 = 5
    expect(profile!.nature).toBe(7);
    expect(profile!.food).toBe(5);
    expect(Object.keys(profile!).sort()).toEqual([...PREFERENCE_KEYS].sort());
  });
});
