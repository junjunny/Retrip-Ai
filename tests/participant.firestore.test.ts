/**
 * Live Firestore integration tests for PHASE 2 (participant + preferences).
 *
 * Skipped by a plain `npm test`. Run against the real project:
 *
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/participant.firestore.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defaultPreferenceVector } from "@/features/participant/participant";
import {
  countParticipants,
  getParticipantSelf,
  ParticipantAuthError,
  ParticipantValidationError,
  submitParticipant,
  TripNotFoundError,
} from "@/features/participant/participantService";
import { getAdminDb } from "@/lib/firebase/admin";

const configured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
const d = describe.skipIf(!configured);

const tripId = `P2ITEST${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

const validInput = (over: Record<string, unknown> = {}) => ({
  nickname: "준희",
  preferences: defaultPreferenceVector(),
  pace: "normal" as const,
  indoorOutdoor: "balanced" as const,
  ...over,
});

beforeAll(async () => {
  if (!configured) return;
  const db = getAdminDb()!;
  await db.doc(`trips/${tripId}`).set({
    tripId,
    title: "P2 통합테스트 여행",
    destination: "부산",
    startDate: "2026-09-10",
    endDate: "2026-09-11",
    itinerary: [{ order: 1, time: "14:00", placeName: "해운대" }],
    status: "active",
  });
});

afterAll(async () => {
  if (!configured) return;
  const db = getAdminDb()!;
  await db.recursiveDelete(db.doc(`trips/${tripId}`));
});

d("submitParticipant / getParticipantSelf", () => {
  it("creates a participant + preference doc on first submit", async () => {
    const res = await submitParticipant(tripId, validInput({ nickname: "A" }));
    expect(res.participantId).toBeTruthy();
    expect(res.secret).toBeTruthy();
    expect(res.participant.preferenceStatus).toBe("completed");
    expect(res.participant.nickname).toBe("A");
    expect(res.preferences.preferences).toEqual(defaultPreferenceVector());

    const self = await getParticipantSelf(tripId, res.participantId, res.secret);
    expect(self?.participant.nickname).toBe("A");
    expect(self?.preferences?.pace).toBe("normal");
  });

  it("updates in place on re-submit — no fan-out", async () => {
    const first = await submitParticipant(tripId, validInput({ nickname: "B" }));
    const countAfterFirst = await countParticipants(tripId);

    const updated = await submitParticipant(tripId, {
      participantId: first.participantId,
      secret: first.secret,
      nickname: "B-changed",
      preferences: { ...defaultPreferenceVector(), food: 5, nature: 1 },
      pace: "fast",
      indoorOutdoor: "outdoor",
    });

    expect(updated.participantId).toBe(first.participantId);
    expect(updated.participant.nickname).toBe("B-changed");
    expect(updated.preferences.preferences.food).toBe(5);
    expect(updated.preferences.pace).toBe("fast");
    expect(await countParticipants(tripId)).toBe(countAfterFirst);
  });

  it("rejects a re-submit with a wrong secret", async () => {
    const p = await submitParticipant(tripId, validInput({ nickname: "C" }));
    await expect(
      submitParticipant(tripId, {
        participantId: p.participantId,
        secret: "wrong-secret",
        ...validInput({ nickname: "C-hack" }),
      }),
    ).rejects.toBeInstanceOf(ParticipantAuthError);
  });

  it("rejects a submit for a non-existent trip", async () => {
    await expect(
      submitParticipant("NOSUCHTRIP", validInput()),
    ).rejects.toBeInstanceOf(TripNotFoundError);
  });

  it("rejects an invalid submit before any write", async () => {
    const before = await countParticipants(tripId);
    await expect(
      submitParticipant(tripId, validInput({ preferences: { ...defaultPreferenceVector(), food: 9 } })),
    ).rejects.toBeInstanceOf(ParticipantValidationError);
    expect(await countParticipants(tripId)).toBe(before);
  });

  it("keeps 3 different participants separate", async () => {
    const t = `P2ITEST${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const db = getAdminDb()!;
    await db.doc(`trips/${t}`).set({
      tripId: t,
      title: "x",
      destination: "x",
      startDate: "2026-09-10",
      endDate: "2026-09-10",
      itinerary: [{ order: 1, time: "10:00", placeName: "x" }],
      status: "active",
    });
    try {
      const a = await submitParticipant(t, {
        nickname: "A",
        preferences: { ...defaultPreferenceVector(), nature: 5 },
        pace: "slow",
        indoorOutdoor: "outdoor",
      });
      const b = await submitParticipant(t, {
        nickname: "B",
        preferences: { ...defaultPreferenceVector(), food: 5 },
        pace: "normal",
        indoorOutdoor: "balanced",
      });
      const c = await submitParticipant(t, {
        nickname: "C",
        preferences: { ...defaultPreferenceVector(), shopping: 5 },
        pace: "fast",
        indoorOutdoor: "indoor",
      });
      expect(new Set([a.participantId, b.participantId, c.participantId]).size).toBe(3);
      expect(await countParticipants(t)).toBe(3);

      const selfA = await getParticipantSelf(t, a.participantId, a.secret);
      const selfC = await getParticipantSelf(t, c.participantId, c.secret);
      expect(selfA?.preferences?.preferences.nature).toBe(5);
      expect(selfC?.preferences?.preferences.shopping).toBe(5);
      expect(selfA?.preferences?.preferences.shopping).toBe(3);
    } finally {
      await db.recursiveDelete(db.doc(`trips/${t}`));
    }
  });

  it("getParticipantSelf: null for unknown id, throws on wrong secret", async () => {
    expect(await getParticipantSelf(tripId, "nope", "nope")).toBeNull();
    const p = await submitParticipant(tripId, validInput({ nickname: "D" }));
    await expect(
      getParticipantSelf(tripId, p.participantId, "bad"),
    ).rejects.toBeInstanceOf(ParticipantAuthError);
  });
});
