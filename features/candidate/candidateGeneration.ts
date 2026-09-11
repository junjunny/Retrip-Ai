/**
 * features/candidate — pure Candidate Generation calculators (STEP 8).
 *
 * "Which real, API-confirmed alternatives exist for a FLEXIBLE slot right now"
 * — NOT which one is best (STEP 9 Scoring), NOT changing the itinerary (STEP 10
 * Re:Plan). Nothing here calls an API, touches Firestore, reads the clock, or
 * picks a random number — I/O lives in `./candidateService`.
 *
 * Deduplication and place-matching reuse `lib/place/match.ts` (the same engine
 * STEP 2/3 use to resolve a user-typed place name) rather than a second
 * implementation.
 */
import { haversineMeters, matchPlace, normalizeName } from "@/lib/place/match";
import type {
  CandidatePlace,
  ExperienceProfile,
  ItineraryItem,
  PlaceLocation,
  PreferenceKey,
  RiskLevel,
  SlotCandidates,
  TourismPlace,
} from "@/types";

/**
 * Final candidate budget per FLEXIBLE slot. Small on purpose: it bounds both
 * the Kakao Local verification calls this module's caller makes (one per
 * pre-dedup candidate, capped here) and the scoring cost STEP 9 will pay per
 * slot. Not a "top N are best" judgement — just a generation budget.
 */
export const MAX_CANDIDATES_PER_SLOT = 5;

/** Two candidates farther apart than this from the search anchor can't both be "near here" — a sanity hard-filter, not a preference. */
export const MAX_REASONABLE_DISTANCE_METERS = 50_000;

/**
 * PreferenceKey -> real TourAPI `contentTypeId` codes (see lib/api/tour/tourism.ts;
 * 12 관광지, 14 문화시설, 15 축제공연행사, 28 레포츠, 32 숙박, 38 쇼핑, 39 음식점).
 * TourAPI's taxonomy is coarser than Re:Trip's 8 preference axes — there is no
 * dedicated "카페"/"사진"/"휴식" code, so those axes fall back to the closest
 * real code rather than inventing one. This is a search-space hint, never a
 * final filter.
 */
export const PREFERENCE_TO_CONTENT_TYPE: Record<PreferenceKey, readonly number[]> = {
  nature: [12],
  culture: [14, 15],
  food: [39],
  cafe: [39], // no dedicated code — closest real one
  shopping: [38],
  activity: [28],
  photo: [12, 14], // no dedicated code — scenic/cultural spots are the closest real ones
  relax: [12, 32], // no dedicated code — 관광지/숙박 are the closest real ones
};

/** Generic destination browse when there's no group signal to lean on. */
const DEFAULT_CONTENT_TYPES: readonly number[] = [12, 39];

/** Content types that offer shelter from weather. */
const INDOOR_CONTENT_TYPES: readonly number[] = [14, 38, 39, 32];

// ---------------------------------------------------------------------------
// Step 1-2: which itinerary items are in scope
// ---------------------------------------------------------------------------

/**
 * FLEXIBLE, not-yet-completed items scheduled for `now.date` at or after
 * `now.time`. Other dates, FIXED items, completed items, and already-past
 * time slots are never candidate-generation targets.
 */
export function selectFlexibleSlots(
  itinerary: readonly ItineraryItem[],
  now: { date: string; time: string },
): ItineraryItem[] {
  return itinerary.filter(
    (it) =>
      it.date === now.date &&
      it.scheduleType === "flexible" &&
      it.status !== "completed" &&
      it.time >= now.time,
  );
}

// ---------------------------------------------------------------------------
// Step 4-6: search context
// ---------------------------------------------------------------------------

/**
 * Which TourAPI contentTypeId codes to search. Uses the group's Experience
 * Profile to lean toward axes rated above-neutral; when weather risk is high,
 * ADDS indoor-capable categories without removing outdoor ones (a search-space
 * broadening, never a hard "no outdoor" filter — see AGENTS-spec §7). This
 * picks WHERE to look, never which result is best.
 */
export function selectSearchContentTypeIds(
  profile: ExperienceProfile | null,
  weatherRisk: RiskLevel,
): number[] {
  let types: number[];
  if (!profile) {
    types = [...DEFAULT_CONTENT_TYPES];
  } else {
    const preferred = (Object.keys(PREFERENCE_TO_CONTENT_TYPE) as PreferenceKey[]).filter(
      (k) => profile[k] > 5, // above PREFERENCE_NEUTRAL
    );
    types = preferred.length > 0
      ? [...new Set(preferred.flatMap((k) => PREFERENCE_TO_CONTENT_TYPE[k]))]
      : [...DEFAULT_CONTENT_TYPES];
  }
  if (weatherRisk === "high") {
    types = [...new Set([...types, ...INDOOR_CONTENT_TYPES])];
  }
  return types;
}

/**
 * How wide a nearby-search radius to use, from Travel State's `trafficBurden`
 * — heavy real congestion narrows the search toward closer options; "low"/
 * "medium"/"unknown" all use the default (never guessing a narrower radius
 * without a real high-congestion signal). This is the ONLY way trafficBurden
 * shapes Candidate Generation: it never calls Kakao Mobility per-candidate
 * (that would be one route request per candidate — see AGENTS-spec §8) and it
 * never excludes a candidate outright.
 */
export function selectNearbySearchRadiusMeters(trafficBurden: RiskLevel): number {
  return trafficBurden === "high" ? 1500 : 3000;
}

/** The coordinate to anchor a nearby-search on: the slot's own confirmed place if it has one, else the trip-level fallback (see candidateService). `null` propagates — never guessed. */
export function resolveSlotAnchor(
  slot: ItineraryItem,
  tripReferenceLocation: { latitude: number; longitude: number } | null,
): { latitude: number; longitude: number } | null {
  if (slot.latitude !== null && slot.longitude !== null) {
    return { latitude: slot.latitude, longitude: slot.longitude };
  }
  return tripReferenceLocation;
}

// ---------------------------------------------------------------------------
// Step 7-8: normalize raw adapter data into CandidatePlace
// ---------------------------------------------------------------------------

/**
 * One TourAPI result -> one `CandidatePlace`, verified against Kakao Local
 * results via the SAME matcher STEP 2/3 use (never a blind "first result").
 * `kakaoResults` may be `[]` (Kakao unavailable/no match) — the candidate is
 * still built from the TourAPI data alone, just without a "verified" upgrade.
 */
export function buildCandidateFromTourism(
  tour: TourismPlace,
  kakaoResults: readonly PlaceLocation[],
): CandidatePlace {
  const resolved = matchPlace(
    { query: tour.name, address: tour.address, latitude: tour.latitude, longitude: tour.longitude },
    [tour],
    [...kakaoResults],
  );
  return {
    placeId: resolved.placeId,
    placeName: resolved.placeName,
    address: resolved.address,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    category: tour.contentTypeId,
    source: resolved.sources[0] ?? "tour-korservice",
    verificationStatus: resolved.verificationStatus,
    candidateReason: resolved.sources.includes("kakao")
      ? `TourAPI contentTypeId ${tour.contentTypeId} + Kakao Local 검증`
      : `TourAPI contentTypeId ${tour.contentTypeId}`,
  };
}

// ---------------------------------------------------------------------------
// Step 9-11: dedup, hard filter, cap
// ---------------------------------------------------------------------------

/** Same `placeId` first; a `null`-placeId pair falls back to normalized-name equality (reuses lib/place/match's text normalization). Keeps the first occurrence. */
export function dedupeCandidates(candidates: readonly CandidatePlace[]): CandidatePlace[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const out: CandidatePlace[] = [];
  for (const c of candidates) {
    const idKey = c.placeId;
    const nameKey = normalizeName(c.placeName);
    if (idKey !== null) {
      if (seenIds.has(idKey)) continue;
      seenIds.add(idKey);
    } else {
      if (seenNames.has(nameKey)) continue;
    }
    seenNames.add(nameKey);
    out.push(c);
  }
  return out;
}

/**
 * Removes candidates that technically/logically cannot be a candidate:
 *  - no usable name, or a coordinate pair that's only half-present
 *  - matches an already-COMPLETED item (already done, not "an alternative")
 *  - matches a FIXED item elsewhere in the trip (protected, never a swap target)
 *  - farther than `MAX_REASONABLE_DISTANCE_METERS` from the search anchor, when both are known
 * "Doesn't look great" is explicitly NOT this function's job — that's STEP 9.
 */
export function filterInvalidCandidates(
  candidates: readonly CandidatePlace[],
  itinerary: readonly ItineraryItem[],
  anchor: { latitude: number; longitude: number } | null,
): CandidatePlace[] {
  const completedNames = new Set(
    itinerary.filter((it) => it.status === "completed").map((it) => normalizeName(it.placeName)),
  );
  const fixedNames = new Set(
    itinerary.filter((it) => it.scheduleType === "fixed").map((it) => normalizeName(it.placeName)),
  );

  return candidates.filter((c) => {
    if (!c.placeName.trim()) return false;
    if ((c.latitude === null) !== (c.longitude === null)) return false; // half a coordinate is invalid
    const key = normalizeName(c.placeName);
    if (completedNames.has(key)) return false;
    if (fixedNames.has(key)) return false;
    if (anchor && c.latitude !== null && c.longitude !== null) {
      const dist = haversineMeters(anchor.latitude, anchor.longitude, c.latitude, c.longitude);
      if (dist > MAX_REASONABLE_DISTANCE_METERS) return false;
    }
    return true;
  });
}

/** Dedupe -> hard filter -> cap at `MAX_CANDIDATES_PER_SLOT`, wrapped with the `keepCurrent` control value. Deterministic given the same raw candidates. */
export function buildSlotCandidates(
  slot: ItineraryItem,
  rawCandidates: readonly CandidatePlace[],
  itinerary: readonly ItineraryItem[],
  anchor: { latitude: number; longitude: number } | null,
): SlotCandidates {
  const deduped = dedupeCandidates(rawCandidates);
  const filtered = filterInvalidCandidates(deduped, itinerary, anchor);
  return {
    itineraryOrder: slot.order,
    keepCurrent: true,
    candidates: filtered.slice(0, MAX_CANDIDATES_PER_SLOT),
  };
}
