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
          placeConfirmed: true,
        }
      : it,
  );
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
