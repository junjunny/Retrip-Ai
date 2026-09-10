/**
 * Live Firestore integration tests for STEP 5 (group participant list, 8-axis
 * preferences, legacy preference doc). Run:
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/participant5.firestore.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PREFERENCE_KEYS,
  defaultPreferenceVector,
} from "@/features/participant/participant";
import {
  getParticipantSelf,
  listParticipants,
  submitParticipant,
} from "@/features/participant/participantService";
import { getAdminDb } from "@/lib/firebase/admin";

const configured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
const d = describe.skipIf(!configured);
const tripId = `P5ITEST${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

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
    title: "P5 통합테스트",
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

d("group participants", () => {
  it("listParticipants returns nicknames only, ordered by join time", async () => {
    await submitParticipant(tripId, input("준희"));
    await submitParticipant(tripId, input("민수"));
    await submitParticipant(tripId, input("지영"));

    const list = await listParticipants(tripId);
    expect(list.map((p) => p.nickname)).toEqual(["준희", "민수", "지영"]);
    // no preferences / secret leak
    for (const p of list) {
      expect(Object.keys(p).sort()).toEqual(["nickname", "participantId"]);
      expect(JSON.stringify(p)).not.toMatch(/secret|preferences|nature/);
    }
  });

  it("stores the full 8-axis preference vector per participant", async () => {
    const r = await submitParticipant(
      tripId,
      input("사진러", { preferences: { ...defaultPreferenceVector(), photo: 5, cafe: 4, nature: 1 } }),
    );
    const self = await getParticipantSelf(tripId, r.participantId, r.secret);
    expect(Object.keys(self!.preferences!.preferences).sort()).toEqual(
      [...PREFERENCE_KEYS].sort(),
    );
    expect(self!.preferences!.preferences.photo).toBe(5);
    expect(self!.preferences!.preferences.cafe).toBe(4);
    expect(self!.preferences!.preferences.nature).toBe(1);
  });

  it("a legacy preference doc missing cafe/photo reads back as neutral (5)", async () => {
    const db = getAdminDb()!;
    const r = await submitParticipant(tripId, input("레거시"));
    // simulate an old doc that only had 6 axes
    await db.doc(`trips/${tripId}/preferences/${r.participantId}`).set(
      { preferences: { nature: 5, culture: 2, food: 4, shopping: 1, activity: 3, relax: 2 } },
      { merge: true },
    );
    const self = await getParticipantSelf(tripId, r.participantId, r.secret);
    expect(self!.preferences!.preferences.cafe).toBe(5);
    expect(self!.preferences!.preferences.photo).toBe(5);
    expect(self!.preferences!.preferences.nature).toBe(5);
  });
});
