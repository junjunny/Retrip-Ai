/**
 * Live Firestore integration tests for PHASE 1.
 *
 * Skipped by a plain `npm test` (no Firebase env). Run against the real project:
 *
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/trip.firestore.test.ts
 *
 * Created docs are titled "PHASE1_ITEST_*" and removed afterwards via the Admin
 * SDK (client rules forbid delete).
 */
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { afterAll, describe, expect, it } from "vitest";

import { createTrip, getTrip, TripValidationError } from "@/features/trip";
import { getFirestoreDb } from "@/lib/firebase/client";

const configured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
const d = describe.skipIf(!configured);

const created: string[] = [];
const TITLE = "PHASE1_ITEST";

async function makeTrip(over: Partial<Parameters<typeof createTrip>[0]> = {}) {
  const id = await createTrip({
    title: TITLE,
    destination: "부산",
    startDate: "2026-09-10",
    endDate: "2026-09-10",
    itinerary: [{ time: "14:00", placeName: "해운대" }],
    ...over,
  });
  created.push(id);
  return id;
}

// Direct Admin SDK init (bypasses lib/firebase/admin's `server-only` guard,
// which throws under vitest). Used only for test setup/teardown that the client
// security rules correctly forbid: deleting trips, writing a legacy doc.
async function adminDb() {
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore, Timestamp: AdminTimestamp } = await import(
    "firebase-admin/firestore"
  );
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string),
      ),
    });
  return { db: getFirestore(app), AdminTimestamp };
}

afterAll(async () => {
  if (!configured || created.length === 0) return;
  const { db } = await adminDb();
  await Promise.all(created.map((id) => db.doc(`trips/${id}`).delete()));
});

d("createTrip + getTrip", () => {
  it("TEST 1 — creates a basic trip and reads it back", async () => {
    const id = await makeTrip();
    expect(id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    const trip = await getTrip(id);
    expect(trip).not.toBeNull();
    expect(trip!.title).toBe(TITLE);
    expect(trip!.destination).toBe("부산");
    expect(trip!.itinerary).toEqual([
      { order: 1, time: "14:00", placeName: "해운대" },
    ]);
  });

  it("TEST 2 — stores multiple itinerary items", async () => {
    const id = await makeTrip({
      itinerary: [
        { time: "14:00", placeName: "해운대" },
        { time: "16:00", placeName: "청사포" },
        { time: "18:00", placeName: "광안리 야경" },
      ],
    });
    const trip = await getTrip(id);
    expect(trip!.itinerary.map((i) => i.placeName)).toEqual([
      "해운대",
      "청사포",
      "광안리 야경",
    ]);
  });

  it("TEST 6 — sorts itinerary by time on save", async () => {
    const id = await makeTrip({
      itinerary: [
        { time: "18:00", placeName: "광안리" },
        { time: "14:00", placeName: "해운대" },
        { time: "16:00", placeName: "청사포" },
      ],
    });
    const trip = await getTrip(id);
    expect(trip!.itinerary).toEqual([
      { order: 1, time: "14:00", placeName: "해운대" },
      { order: 2, time: "16:00", placeName: "청사포" },
      { order: 3, time: "18:00", placeName: "광안리" },
    ]);
  });

  it("TEST 7 — keeps input order for equal times", async () => {
    const id = await makeTrip({
      itinerary: [
        { time: "14:00", placeName: "해운대" },
        { time: "14:00", placeName: "청사포" },
      ],
    });
    const trip = await getTrip(id);
    expect(trip!.itinerary.map((i) => i.placeName)).toEqual(["해운대", "청사포"]);
  });

  it("TEST 9 — persists all required fields incl. a server createdAt", async () => {
    const id = await makeTrip();
    const snap = await getDoc(doc(getFirestoreDb()!, "trips", id));
    const raw = snap.data()!;
    expect(Object.keys(raw).sort()).toEqual(
      [
        "createdAt",
        "destination",
        "endDate",
        "itinerary",
        "startDate",
        "status",
        "title",
        "tripId",
      ].sort(),
    );
    expect(raw.tripId).toBe(id);
    expect(raw.status).toBe("active");
    expect(raw.createdAt instanceof Timestamp).toBe(true);
  });

  it("TEST 8 — rejects an invalid draft before any write", async () => {
    await expect(
      createTrip({
        title: "",
        destination: "",
        startDate: "2026-09-11",
        endDate: "2026-09-10",
        itinerary: [{ time: "9:00", placeName: "" }],
      }),
    ).rejects.toBeInstanceOf(TripValidationError);
  });

  it("TEST 12 — getTrip returns null for a missing id (no throw)", async () => {
    expect(await getTrip("INVALID123")).toBeNull();
  });

  it("TEST 13 — getTrip rejects (does not hang) on a malformed id", async () => {
    await expect(getTrip("bad/id")).rejects.toBeDefined();
  });

  it("TEST 14 — concurrent creates never collide or overwrite", async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => makeTrip()));
    expect(new Set(ids).size).toBe(6);
    const trips = await Promise.all(ids.map((id) => getTrip(id)));
    expect(trips.every((t) => t !== null)).toBe(true);
  });

  it("TEST 20 — legacy doc without itinerary reads back as []", async () => {
    const id = `ITEST${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    created.push(id);
    // Written via Admin SDK: the client rules (rightly) reject an itinerary-less
    // trip, but such docs can still appear from console edits / older phases.
    const { db } = await adminDb();
    await db.doc(`trips/${id}`).set({
      tripId: id,
      title: TITLE,
      destination: "부산",
      startDate: "2026-09-10",
      endDate: "2026-09-10",
      status: "active",
      // itinerary + createdAt intentionally omitted
    });
    const trip = await getTrip(id);
    expect(trip).not.toBeNull();
    expect(trip!.itinerary).toEqual([]);
  });
});

/** F — verify the deployed rules match firestore.rules (login-less: read open,
 *  create shape-validated, no client update/delete). */
d("security rules", () => {
  const isDenied = (err: unknown) =>
    String((err as { code?: string; message?: string })?.code ?? err).includes(
      "permission-denied",
    ) || String((err as Error)?.message ?? "").includes("Missing or insufficient permissions");

  async function seedTrip() {
    const id = `ITEST${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    created.push(id);
    const { db, AdminTimestamp } = await adminDb();
    await db.doc(`trips/${id}`).set({
      tripId: id,
      title: TITLE,
      destination: "부산",
      startDate: "2026-09-10",
      endDate: "2026-09-10",
      itinerary: [{ order: 1, time: "14:00", placeName: "해운대" }],
      status: "active",
      createdAt: AdminTimestamp.now(),
    });
    return id;
  }

  it("F1 — client read of a trip is allowed", async () => {
    const id = await seedTrip();
    const snap = await getDoc(doc(getFirestoreDb()!, "trips", id));
    expect(snap.exists()).toBe(true);
  });

  it("F2 — client update is denied", async () => {
    const id = await seedTrip();
    await expect(
      updateDoc(doc(getFirestoreDb()!, "trips", id), { title: "changed" }),
    ).rejects.toSatisfy(isDenied);
  });

  it("F3 — client delete is denied", async () => {
    const id = await seedTrip();
    await expect(
      deleteDoc(doc(getFirestoreDb()!, "trips", id)),
    ).rejects.toSatisfy(isDenied);
  });

  it("F4 — client create without itinerary is denied", async () => {
    const id = `ITESTBAD${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    await expect(
      setDoc(doc(getFirestoreDb()!, "trips", id), {
        tripId: id,
        title: TITLE,
        destination: "부산",
        startDate: "2026-09-10",
        endDate: "2026-09-10",
        status: "active",
        createdAt: serverTimestamp(),
      }),
    ).rejects.toSatisfy(isDenied);
  });

  it("F5 — client create with a forged (non-server) createdAt is denied", async () => {
    const id = `ITESTFAKE${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    await expect(
      setDoc(doc(getFirestoreDb()!, "trips", id), {
        tripId: id,
        title: TITLE,
        destination: "부산",
        startDate: "2026-09-10",
        endDate: "2026-09-10",
        itinerary: [{ order: 1, time: "14:00", placeName: "해운대" }],
        status: "active",
        createdAt: Timestamp.fromMillis(0),
      }),
    ).rejects.toSatisfy(isDenied);
  });

  it("F6 — client write to a sub-collection is denied", async () => {
    const id = await seedTrip();
    await expect(
      setDoc(doc(getFirestoreDb()!, "trips", id, "participants", "p1"), {
        name: "x",
      }),
    ).rejects.toSatisfy(isDenied);
  });
});
