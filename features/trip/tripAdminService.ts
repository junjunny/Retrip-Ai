/**
 * features/trip/tripAdminService — server-only trip writes via the Admin SDK.
 *
 * Client security rules make `trips/{tripId}` immutable, so a confirmed place
 * edit goes through here (same trust model as trip creation: link-holder can
 * edit — a per-trip edit token is a later hardening step).
 */
import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { ExperienceProfile, ItineraryItem } from "@/types";

import { applyPlaceChoice, type PlaceChoice } from "./itineraryPlace";
import {
  applyItineraryEdit,
  coerceItinerary,
  coerceTripPreference,
  removeItineraryItem,
  type ItineraryEdit,
} from "./trip";

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

/**
 * `tripPreference` only — used by the Mini Guide route (STEP 12), which has
 * no other reason to touch the trip doc. `null` for a trip with none set
 * (pre-STEP-12) as well as for a trip that doesn't exist — a missing trip is
 * not this function's error to raise (its only caller treats "nothing to
 * guide" the same way either way).
 */
export async function getTripPreference(tripId: string): Promise<ExperienceProfile | null> {
  const snap = await requireDb().doc(`trips/${tripId}`).get();
  if (!snap.exists) return null;
  return coerceTripPreference(snap.get("tripPreference"));
}

async function loadItems(tripId: string) {
  const ref = requireDb().doc(`trips/${tripId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new TripNotFoundError();
  const data = snap.data() ?? {};
  const startDate = typeof data.startDate === "string" ? data.startDate : "";
  return { ref, items: coerceItinerary(data.itinerary, startDate) };
}

/**
 * Edits an item's schedule fields (date / time / placeName / scheduleType) and
 * renumbers. A placeName change resets the resolved place (see `applyItineraryEdit`).
 */
export async function editItineraryItem(
  tripId: string,
  order: number,
  edit: ItineraryEdit,
): Promise<ItineraryItem[]> {
  const { ref, items } = await loadItems(tripId);
  if (!items.some((it) => it.order === order)) {
    throw new ItineraryItemNotFoundError(order);
  }
  const next = applyItineraryEdit(items, order, edit);
  await ref.update({ itinerary: next });
  return next;
}

/** Deletes one item and renumbers the rest. */
export async function deleteItineraryItem(
  tripId: string,
  order: number,
): Promise<ItineraryItem[]> {
  const { ref, items } = await loadItems(tripId);
  if (!items.some((it) => it.order === order)) {
    throw new ItineraryItemNotFoundError(order);
  }
  const next = removeItineraryItem(items, order);
  await ref.update({ itinerary: next });
  return next;
}
