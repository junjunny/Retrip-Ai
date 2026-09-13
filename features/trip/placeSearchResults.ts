/**
 * features/trip/placeSearchResults — flattens a `NormalizedPlace` (one
 * resolved query + its alternate candidates) into a plain list a search UI
 * can render/select from. Pure. Shared by the Re:Plan origin search
 * (components/trip/ReplanPanel.tsx) and Trip Create's "가고 싶은 곳" search
 * (STEP 18) so the two don't duplicate the same primary+candidates flattening.
 */
import type { NormalizedPlace, PlaceSource } from "@/types";

export interface PlaceSearchResult {
  key: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  placeId: string | null;
  imageUrl: string | null;
  source: PlaceSource;
}

/** `[]` when nothing resolved (an honest "no result", never a guess). */
export function toPlaceSearchResults(place: NormalizedPlace): PlaceSearchResult[] {
  const out: PlaceSearchResult[] = [];
  if (place.verificationStatus !== "unresolved" && place.latitude != null && place.longitude != null) {
    out.push({
      key: "primary",
      name: place.placeName,
      address: place.roadAddress ?? place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      placeId: place.placeId,
      imageUrl: place.tourApiImageUrl,
      source: place.sources[0] ?? "kakao",
    });
  }
  for (const c of place.candidates) {
    if (c.latitude != null && c.longitude != null) {
      out.push({
        key: `${out.length}`,
        name: c.name,
        address: c.address,
        latitude: c.latitude,
        longitude: c.longitude,
        placeId: c.placeId,
        imageUrl: null,
        source: c.source,
      });
    }
  }
  return out;
}
