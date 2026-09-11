/**
 * features/trip/itineraryPlace — pure helpers for the "confirm / edit a place"
 * flow. No I/O. Firestore write goes through `tripAdminService`.
 *
 * A place confirmation NEVER touches order / date / time / scheduleType /
 * status, and NEVER invents coordinates.
 */
import type { ItineraryItem, NormalizedPlace, PlaceCandidate } from "@/types";

/** The fields a user's place confirmation / edit writes onto an itinerary item. */
export interface PlaceChoice {
  placeId: string | null;
  placeName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * Defaults to `true` (a user actively picking/confirming a place IS a
   * confirmation — STEP 3's original semantics, unchanged for existing
   * callers). Pass `false` for a place that hasn't been independently
   * verified (e.g. a Re:Plan candidate whose `verificationStatus` isn't
   * "verified" — see features/replan) — NEVER force `true` on an unconfirmed
   * place.
   */
  confirmed?: boolean;
}

/**
 * A place confirmation never trusts the client's coordinates blindly (STEP
 * 13 §19 hardening): both coordinates must be present or both absent (never
 * half a pair), and when present they must be real WGS84 values. Used at
 * every place-write boundary — the itinerary PATCH route AND
 * `applyPlaceChoices` (Re:Plan Apply) — so a malformed choice can never reach
 * Firestore regardless of which caller produced it.
 */
export function isValidPlaceChoice(choice: PlaceChoice): boolean {
  if (!choice.placeName.trim()) return false;
  if ((choice.latitude === null) !== (choice.longitude === null)) return false;
  if (choice.latitude !== null && (choice.latitude < -90 || choice.latitude > 90)) return false;
  if (choice.longitude !== null && (choice.longitude < -180 || choice.longitude > 180)) return false;
  return true;
}

/** Build a `PlaceChoice` from a `NormalizedPlace` (the "맞아요" path). */
export function placeChoiceFromNormalized(np: NormalizedPlace): PlaceChoice {
  return {
    placeId: np.placeId,
    placeName: np.placeName,
    address: np.roadAddress ?? np.address,
    latitude: np.latitude,
    longitude: np.longitude,
  };
}

/** Build a `PlaceChoice` from a candidate the user picked. */
export function placeChoiceFromCandidate(c: PlaceCandidate): PlaceChoice {
  return {
    placeId: c.placeId,
    placeName: c.name,
    address: c.address,
    latitude: c.latitude,
    longitude: c.longitude,
  };
}

/**
 * Apply a user-chosen place to the item with `order`. Updates ONLY the place
 * fields + `placeConfirmed`. Pure.
 */
export function applyPlaceChoice(
  items: ItineraryItem[],
  order: number,
  choice: PlaceChoice,
): ItineraryItem[] {
  return items.map((it) =>
    it.order === order
      ? {
          ...it,
          placeId: choice.placeId,
          placeName: choice.placeName.trim() || it.placeName,
          address: choice.address,
          latitude: choice.latitude,
          longitude: choice.longitude,
          placeConfirmed: choice.confirmed ?? true,
        }
      : it,
  );
}

/**
 * Applies several place choices in one pass (folds `applyPlaceChoice` per
 * order) — for Re:Plan Apply, which may replace multiple FLEXIBLE slots in
 * one write. A choice that fails `isValidPlaceChoice` is skipped rather than
 * applied — defense in depth beyond upstream candidate validation (STEP 13
 * §19); this should never actually trigger given Candidate Generation's own
 * filtering, but a write boundary never trusts that alone. Pure.
 */
export function applyPlaceChoices(
  items: ItineraryItem[],
  choices: readonly { order: number; choice: PlaceChoice }[],
): ItineraryItem[] {
  return choices
    .filter(({ choice }) => isValidPlaceChoice(choice))
    .reduce((acc, { order, choice }) => applyPlaceChoice(acc, order, choice), items);
}

export interface ItineraryMarker {
  order: number;
  placeName: string;
  latitude: number;
  longitude: number;
  confirmed: boolean;
}

/** Map markers — only items that actually have coordinates. Never invents any. */
export function itineraryMarkers(items: ItineraryItem[]): ItineraryMarker[] {
  return items.flatMap((it) =>
    it.latitude != null && it.longitude != null
      ? [
          {
            order: it.order,
            placeName: it.placeName,
            latitude: it.latitude,
            longitude: it.longitude,
            confirmed: it.placeConfirmed,
          },
        ]
      : [],
  );
}
