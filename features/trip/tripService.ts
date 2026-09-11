/**
 * features/trip/tripService — the only place that reads/writes `trips/*` in
 * Firestore. UI -> tripService -> Firestore. Components never call Firestore
 * directly.
 */
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase/client";
import type { Trip } from "@/types";

import {
  coerceItinerary,
  coerceTripPreference,
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
  const itinerary = normalizeItinerary(draft.itinerary, draft.startDate);

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
      // STEP 13: `null` unless the creator actually used the "이번 여행은
      // 어떤 여행인가요?" step — the UI only ever sends `tripPreference` when
      // the user touched it (see TripCreateForm), so an omitted field here
      // means "didn't use it", not "chose all-neutral". A trip predating
      // STEP 12 is also `null` (the field is simply absent) — the two cases
      // are indistinguishable and that's fine: both mean "fall back to the
      // participant-averaged Experience Profile" (see types/index.ts).
      tripPreference: draft.tripPreference ?? null,
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
  const startDate = typeof data.startDate === "string" ? data.startDate : "";
  return {
    tripId,
    title: typeof data.title === "string" ? data.title : "",
    destination: typeof data.destination === "string" ? data.destination : "",
    startDate,
    endDate: typeof data.endDate === "string" ? data.endDate : "",
    itinerary: coerceItinerary(data.itinerary, startDate),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
    status: data.status === "completed" ? "completed" : "active",
    tripPreference: coerceTripPreference(data.tripPreference),
  };
}

