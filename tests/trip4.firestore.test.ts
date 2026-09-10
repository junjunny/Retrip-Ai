/**
 * Live Firestore integration tests for STEP 4 (date-grouped itinerary, empty
 * itinerary, edit / delete item). Run:
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/trip4.firestore.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";

import { createTrip, getTrip } from "@/features/trip";
import {
  deleteItineraryItem,
  editItineraryItem,
} from "@/features/trip/tripAdminService";

const configured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
const d = describe.skipIf(!configured);
const created: string[] = [];

async function adminDb() {
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string)),
    });
  return getFirestore(app);
}

afterAll(async () => {
  if (!configured || created.length === 0) return;
  const db = await adminDb();
  await Promise.all(created.map((id) => db.doc(`trips/${id}`).delete()));
});

d("STEP 4 — date-grouped itinerary", () => {
  it("stores per-day dates + scheduleType, order across days by (date,time)", async () => {
    const id = await createTrip({
      title: "STEP4_ITEST",
      destination: "부산",
      startDate: "2026-09-18",
      endDate: "2026-09-20",
      itinerary: [
        { date: "2026-09-19", time: "09:00", placeName: "day2 아침", scheduleType: "flexible" },
        { date: "2026-09-18", time: "20:00", placeName: "공연", scheduleType: "fixed" },
        { date: "2026-09-18", time: "10:00", placeName: "해운대", scheduleType: "flexible" },
      ],
    });
    created.push(id);
    const trip = await getTrip(id);
    expect(trip!.itinerary.map((i) => [i.order, i.date, i.time, i.placeName, i.scheduleType])).toEqual([
      [1, "2026-09-18", "10:00", "해운대", "flexible"],
      [2, "2026-09-18", "20:00", "공연", "fixed"],
      [3, "2026-09-19", "09:00", "day2 아침", "flexible"],
    ]);
    // new items: unconfirmed, no coords
    expect(trip!.itinerary.every((i) => !i.placeConfirmed && i.latitude === null && i.placeId === null)).toBe(true);
  });

  it("creates a trip with an empty itinerary", async () => {
    const id = await createTrip({
      title: "STEP4_ITEST empty",
      destination: "부산",
      startDate: "2026-09-18",
      endDate: "2026-09-18",
      itinerary: [],
    });
    created.push(id);
    const trip = await getTrip(id);
    expect(trip!.itinerary).toEqual([]);
  });
});

d("STEP 4 — edit / delete via admin service", () => {
  async function seed() {
    const id = await createTrip({
      title: "STEP4_ITEST ed",
      destination: "부산",
      startDate: "2026-09-18",
      endDate: "2026-09-19",
      itinerary: [
        { date: "2026-09-18", time: "10:00", placeName: "A" },
        { date: "2026-09-18", time: "12:00", placeName: "B" },
        { date: "2026-09-18", time: "14:00", placeName: "C" },
      ],
    });
    created.push(id);
    return id;
  }

  it("edit time re-sorts + renumbers", async () => {
    const id = await seed();
    const items = await editItineraryItem(id, 1, { time: "13:00" }); // A → after B
    expect(items.map((i) => [i.order, i.placeName])).toEqual([
      [1, "B"],
      [2, "A"],
      [3, "C"],
    ]);
    expect((await getTrip(id))!.itinerary.map((i) => i.placeName)).toEqual(["B", "A", "C"]);
  });

  it("edit placeName clears the resolved place", async () => {
    const id = await seed();
    // first confirm a place on item 1 (simulate)
    await editItineraryItem(id, 1, { placeName: "해운대해수욕장" });
    const db = await adminDb();
    const cur = (await db.doc(`trips/${id}`).get()).data()!.itinerary;
    cur[0] = { ...cur[0], placeId: "kakao:7913306", latitude: 35.15, longitude: 129.16, placeConfirmed: true };
    await db.doc(`trips/${id}`).update({ itinerary: cur });
    // now rename it
    const items = await editItineraryItem(id, 1, { placeName: "광안리해수욕장" });
    const a = items.find((i) => i.placeName === "광안리해수욕장")!;
    expect(a).toMatchObject({ placeId: null, latitude: null, longitude: null, placeConfirmed: false });
  });

  it("delete removes + renumbers", async () => {
    const id = await seed();
    const items = await deleteItineraryItem(id, 2); // remove B
    expect(items.map((i) => [i.order, i.placeName])).toEqual([
      [1, "A"],
      [2, "C"],
    ]);
    expect((await getTrip(id))!.itinerary.length).toBe(2);
  });

  it("edit / delete on a missing order → ItineraryItemNotFoundError", async () => {
    const id = await seed();
    await expect(editItineraryItem(id, 99, { time: "11:00" })).rejects.toMatchObject({
      name: "ItineraryItemNotFoundError",
    });
    await expect(deleteItineraryItem(id, 99)).rejects.toMatchObject({
      name: "ItineraryItemNotFoundError",
    });
  });
});
