/**
 * features/candidate/candidateService — fetches real place data (TourAPI +
 * Kakao Local) and runs Candidate Generation for a trip's FLEXIBLE slots.
 *
 * SERVER ONLY. Reuses STEP 7's Travel State (weatherRisk, KST `now`) and
 * STEP 6's Experience Profile rather than recomputing either. No GPS: a
 * current location may be passed in, never inferred.
 */
import "server-only";

import { getTripExperienceProfile } from "@/features/experience/experienceService";
import { getTripTravelState } from "@/features/travel-state/travelStateService";
import { TripNotFoundError } from "@/features/trip/tripAdminService";
import { coerceItinerary, coerceTripPreference } from "@/features/trip/trip";
import {
  fetchTourismByArea,
  fetchTourismNearby,
  searchAddress,
  searchPlacesByKeyword,
} from "@/lib/api";
import { getAdminDb } from "@/lib/firebase/admin";
import { destinationToKtoArea } from "@/lib/region";
import type {
  CandidatePlace,
  ExperienceProfile,
  ItineraryItem,
  SlotCandidates,
  TourismPlace,
  TravelState,
} from "@/types";

import {
  MAX_CANDIDATES_PER_SLOT,
  buildCandidateFromTourism,
  buildSlotCandidates,
  resolveSlotAnchor,
  selectFlexibleSlots,
  selectNearbySearchRadiusMeters,
  selectSearchContentTypeIds,
} from "./candidateGeneration";

function requireDb() {
  const db = getAdminDb();
  if (!db) {
    throw new Error(
      "Firebase Admin이 설정되지 않았습니다. FIREBASE_SERVICE_ACCOUNT_KEY를 확인해주세요.",
    );
  }
  return db;
}

// Bounds how much raw data we pull before dedup/filter/cap — not a quality
// judgement, just an I/O budget (see AGENTS-spec §13).
const RAW_RESULTS_PER_QUERY = 8;
// Small headroom over the final per-slot cap so dedup/hard-filter losses don't
// starve the result — still bounded, never "verify everything".
const PRE_VERIFY_CAP = MAX_CANDIDATES_PER_SLOT * 2;

type LatLng = { latitude: number; longitude: number };

/**
 * currentLocation (if given) > a confirmed itinerary place's real coordinates
 * > the trip destination geocoded via Kakao Local > null. Never a GPS guess,
 * never a made-up coordinate.
 */
async function resolveTripReferenceLocation(
  itinerary: readonly ItineraryItem[],
  destination: string,
  currentLocation: LatLng | null,
): Promise<LatLng | null> {
  if (currentLocation) return currentLocation;

  const confirmed = itinerary.find(
    (it) => it.placeConfirmed && it.latitude !== null && it.longitude !== null,
  );
  if (confirmed) return { latitude: confirmed.latitude!, longitude: confirmed.longitude! };

  try {
    const results = await searchAddress(destination);
    const first = results[0];
    return first ? { latitude: first.latitude, longitude: first.longitude } : null;
  } catch {
    return null; // geocoding unavailable — no fabricated coordinate
  }
}

/** Real TourAPI results only. `[]` (never a crash) when a query fails or there's no usable location context at all. */
async function fetchRawTourism(
  contentTypeIds: readonly number[],
  anchor: LatLng | null,
  destination: string,
  radiusMeters: number,
): Promise<TourismPlace[]> {
  const areaCode = anchor ? null : destinationToKtoArea(destination)?.ktoAreaCode ?? null;
  if (!anchor && !areaCode) return [];

  const perType = await Promise.all(
    contentTypeIds.map((contentTypeId) =>
      anchor
        ? fetchTourismNearby({
            latitude: anchor.latitude,
            longitude: anchor.longitude,
            contentTypeId,
            radiusMeters,
            numOfRows: RAW_RESULTS_PER_QUERY,
          }).catch(() => [] as TourismPlace[])
        : fetchTourismByArea({
            areaCode: areaCode!,
            contentTypeId,
            numOfRows: RAW_RESULTS_PER_QUERY,
          }).catch(() => [] as TourismPlace[]),
    ),
  );
  return perType.flat();
}

/**
 * Verifies a bounded number of raw TourAPI results against Kakao Local (the
 * same matcher STEP 2/3 use — never a blind first result). A Kakao failure on
 * one place still keeps that place as a TourAPI-only candidate.
 */
async function verifyWithKakao(tourPlaces: readonly TourismPlace[]): Promise<CandidatePlace[]> {
  const capped = tourPlaces.slice(0, PRE_VERIFY_CAP);
  return Promise.all(
    capped.map(async (tour) => {
      const kakaoResults = await searchPlacesByKeyword(tour.name, {
        ...(tour.latitude != null && tour.longitude != null
          ? { latitude: tour.latitude, longitude: tour.longitude }
          : {}),
      }).catch(() => []);
      return buildCandidateFromTourism(tour, kakaoResults);
    }),
  );
}

export interface GenerateCandidatesOptions {
  /** Injected for testability / explicit snapshots — passed straight through to Travel State. */
  now?: Date;
  /** Same contract as Travel State's: never inferred, only ever what the caller supplies. */
  currentLocation?: LatLng | null;
}

/**
 * `generateCandidatesForTrip`'s full working context — the trip data plus the
 * STEP 6/7 outputs it already had to compute along the way. Exists so a caller
 * that also needs Travel State / Experience Profile (STEP 9 scoring) doesn't
 * recompute them a second time (a second Firestore read + a second real
 * weather/adapter round trip) — NOT a behavior change to candidate generation
 * itself; `generateCandidatesForTrip` below is unchanged and delegates here.
 */
export interface CandidateGenerationContext {
  slotCandidates: SlotCandidates[];
  travelState: TravelState;
  experienceProfile: ExperienceProfile | null;
  itinerary: ItineraryItem[];
}

export async function generateCandidatesWithContext(
  tripId: string,
  options: GenerateCandidatesOptions = {},
): Promise<CandidateGenerationContext> {
  const snap = await requireDb().doc(`trips/${tripId}`).get();
  if (!snap.exists) throw new TripNotFoundError();
  const data = snap.data() ?? {};
  const startDate = typeof data.startDate === "string" ? data.startDate : "";
  const destination = typeof data.destination === "string" ? data.destination : "";
  const itinerary = coerceItinerary(data.itinerary, startDate);

  // STEP 12: "what does THIS trip's group care about" now comes from the
  // trip's own tripPreference when it has one — a legacy trip (tripPreference
  // null) falls back to STEP 6's participant-averaged profile, unchanged.
  // Skipping the participant-average computation entirely when tripPreference
  // exists also saves a Firestore read of every preference doc.
  const tripPreference = coerceTripPreference(data.tripPreference);
  const currentLocation = options.currentLocation ?? null;
  const [travelState, participantExperienceProfile] = await Promise.all([
    getTripTravelState(tripId, { now: options.now, currentLocation }),
    tripPreference ? Promise.resolve(null) : getTripExperienceProfile(tripId),
  ]);
  const experienceProfile = tripPreference ?? participantExperienceProfile;

  const slots = selectFlexibleSlots(itinerary, travelState.now);
  if (slots.length === 0) {
    return { slotCandidates: [], travelState, experienceProfile, itinerary };
  }

  const tripReferenceLocation = await resolveTripReferenceLocation(itinerary, destination, currentLocation);
  const contentTypeIds = selectSearchContentTypeIds(experienceProfile, travelState.weatherRisk);
  const radiusMeters = selectNearbySearchRadiusMeters(travelState.trafficBurden);

  const slotCandidates = await Promise.all(
    slots.map(async (slot) => {
      const anchor = resolveSlotAnchor(slot, tripReferenceLocation);
      const raw = await fetchRawTourism(contentTypeIds, anchor, destination, radiusMeters);
      const candidates = await verifyWithKakao(raw);
      return buildSlotCandidates(slot, candidates, itinerary, anchor);
    }),
  );

  return { slotCandidates, travelState, experienceProfile, itinerary };
}

/**
 * Generates real-place candidates for every FLEXIBLE, not-yet-completed item
 * scheduled today, at or after `now`. Returns `[]` when there's nothing to
 * generate for (e.g. no flexible slots left today) — never throws for that.
 * Existing itinerary data is only ever read, never written.
 */
export async function generateCandidatesForTrip(
  tripId: string,
  options: GenerateCandidatesOptions = {},
): Promise<SlotCandidates[]> {
  return (await generateCandidatesWithContext(tripId, options)).slotCandidates;
}
