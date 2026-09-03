/**
 * features/trip/tripService — the only place that reads/writes `trips/*` in
 * Firestore. UI -> tripService -> Firestore. Components never call Firestore
 * directly.
 */
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase/client";
import type { ItineraryItem, Trip } from "@/types";

import {
  generateTripId,
  normalizeItinerary,
  validateTripDraft,
  type TripDraft,
} from "./trip";

/** Thrown by `createTrip` when the draft fails validation. */
export class TripValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(errors.join(" "));
    this.name = "TripValidationError";
    this.errors = errors;
  }
}

function requireDb() {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error(
      "Firebase가 설정되지 않았습니다. .env.local의 NEXT_PUBLIC_FIREBASE_* 값을 확인해주세요.",
    );
  }
  return db;
}

/**
 * Validates, normalizes (time sort + order), and writes one trip document.
 * Returns the generated tripId. Retries on the (very rare) id collision so an
 * existing trip is never overwritten.
 */
export async function createTrip(draft: TripDraft): Promise<string> {
  const errors = validateTripDraft(draft);
  if (errors.length > 0) throw new TripValidationError(errors);

  const db = requireDb();
  const itinerary = normalizeItinerary(draft.itinerary);

  for (let attempt = 0; attempt < 5; attempt++) {
    const tripId = generateTripId();
    const ref = doc(db, "trips", tripId);
    if ((await getDoc(ref)).exists()) continue;

    await setDoc(ref, {
      tripId,
      title: draft.title.trim(),
      destination: draft.destination.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate,
      itinerary,
      createdAt: serverTimestamp(),
      status: "active",
    });
    return tripId;
  }
  throw new Error("고유한 Trip ID 생성에 실패했습니다. 다시 시도해주세요.");
}

/** Reads `trips/{tripId}`. Returns `null` when the document does not exist. */
export async function getTrip(tripId: string): Promise<Trip | null> {
  const snap = await getDoc(doc(requireDb(), "trips", tripId));
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    tripId,
    title: typeof data.title === "string" ? data.title : "",
    destination: typeof data.destination === "string" ? data.destination : "",
    startDate: typeof data.startDate === "string" ? data.startDate : "",
    endDate: typeof data.endDate === "string" ? data.endDate : "",
    itinerary: coerceItinerary(data.itinerary),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
    status: data.status === "completed" ? "completed" : "active",
  };
}

/** Tolerates legacy / malformed documents: missing itinerary -> []. */
function coerceItinerary(value: unknown): ItineraryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (it): it is ItineraryItem =>
        typeof it === "object" &&
        it !== null &&
        typeof (it as ItineraryItem).time === "string" &&
        typeof (it as ItineraryItem).placeName === "string" &&
        typeof (it as ItineraryItem).order === "number",
    )
    .sort((a, b) => a.order - b.order);
}
