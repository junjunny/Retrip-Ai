/**
 * features/trip/tripAdminService — server-only trip writes via the Admin SDK.
 *
 * Client security rules make `trips/{tripId}` immutable, so a confirmed place
 * edit goes through here (same trust model as trip creation: link-holder can
 * edit — a per-trip edit token is a later hardening step).
 */
import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { ItineraryItem } from "@/types";

import { applyPlaceChoice, type PlaceChoice } from "./itineraryPlace";
import { coerceItinerary } from "./trip";

export class TripNotFoundError extends Error {
  constructor() {
    super("여행을 찾을 수 없습니다.");
    this.name = "TripNotFoundError";
  }
}
export class ItineraryItemNotFoundError extends Error {
  constructor(order: number) {
    super(`일정 항목(${order})을 찾을 수 없습니다.`);
    this.name = "ItineraryItemNotFoundError";
  }
}

function requireDb() {
  const db = getAdminDb();
  if (!db) {
    throw new Error(
      "Firebase Admin이 설정되지 않았습니다. FIREBASE_SERVICE_ACCOUNT_KEY를 확인해주세요.",
    );
  }
  return db;
}

/**
 * Applies a user-confirmed place to one itinerary item and persists it.
 * Preserves order / date / time / scheduleType / status. Returns the new list.
 */
export async function updateItineraryPlace(
  tripId: string,
  order: number,
  choice: PlaceChoice,
): Promise<ItineraryItem[]> {
  const ref = requireDb().doc(`trips/${tripId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new TripNotFoundError();

  const data = snap.data() ?? {};
  const startDate = typeof data.startDate === "string" ? data.startDate : "";
  const items = coerceItinerary(data.itinerary, startDate);
  if (!items.some((it) => it.order === order)) {
    throw new ItineraryItemNotFoundError(order);
  }

  const next = applyPlaceChoice(items, order, choice);
  await ref.update({ itinerary: next });
  return next;
}
