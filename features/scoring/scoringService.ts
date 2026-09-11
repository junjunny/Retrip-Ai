/**
 * features/scoring/scoringService — reuses STEP 8's Candidate Generation
 * (never reimplemented) plus real Kakao Mobility route data to score every
 * candidate (and the "keep current" option) for a trip's FLEXIBLE slots.
 *
 * SERVER ONLY. No new Firestore persistence — scoring is recomputed on demand
 * from the same on-demand STEP 6/7/8 outputs. Route data is fetched only for
 * the (already small, capped) set of candidates STEP 8 produced, and only
 * when the caller supplies a real `currentLocation` — never inferred, never a
 * distance guessed from anywhere else.
 */
import "server-only";

import { generateCandidatesWithContext, type GenerateCandidatesOptions } from "@/features/candidate/candidateService";
import { listPreferenceVectors } from "@/features/participant/participantService";
import { fetchDrivingRoute } from "@/lib/api";
import type { CandidatePlace, ItineraryItem } from "@/types";

import { itemToCandidateView, rankScored, scoreCandidate, type RankedOption } from "./scoring";

type LatLng = { latitude: number; longitude: number };

/**
 * `null` whenever a real route can't be computed: no currentLocation supplied,
 * the place has no confirmed coordinates, or the Mobility adapter fails.
 * NEVER a guessed duration/distance.
 */
async function fetchRouteMetrics(
  currentLocation: LatLng | null,
  place: CandidatePlace,
): Promise<{ durationSeconds: number; distanceMeters: number } | null> {
  if (!currentLocation || place.latitude === null || place.longitude === null) return null;
  try {
    const route = await fetchDrivingRoute({
      origin: currentLocation,
      destination: { latitude: place.latitude, longitude: place.longitude },
    });
    return { durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters };
  } catch {
    return null;
  }
}

export type ScoreTripOptions = GenerateCandidatesOptions;

export interface SlotRanking {
  itineraryOrder: number;
  ranked: RankedOption[];
}

/**
 * Scores every candidate STEP 8 generated for each FLEXIBLE slot, plus that
 * slot's "keep current" option, and returns them ranked. `[]` slots when
 * there's nothing to score (mirrors `generateCandidatesForTrip`). Never
 * writes the itinerary.
 */
export async function scoreTripCandidates(
  tripId: string,
  options: ScoreTripOptions = {},
): Promise<SlotRanking[]> {
  const currentLocation = options.currentLocation ?? null;
  const context = await generateCandidatesWithContext(tripId, options);
  if (context.slotCandidates.length === 0) return [];

  const preferenceVectors = await listPreferenceVectors(tripId);
  const itemByOrder = new Map<number, ItineraryItem>(context.itinerary.map((it) => [it.order, it]));

  return Promise.all(
    context.slotCandidates.map(async (sc) => {
      const slot = itemByOrder.get(sc.itineraryOrder);
      // Defensive only — STEP 8 always derives sc.itineraryOrder from this same itinerary.
      if (!slot) return { itineraryOrder: sc.itineraryOrder, ranked: [] };

      const entries: { kind: "candidate" | "keepCurrent"; place: CandidatePlace }[] = [
        ...sc.candidates.map((place) => ({ kind: "candidate" as const, place })),
        { kind: "keepCurrent" as const, place: itemToCandidateView(slot) },
      ];

      const ranked = await Promise.all(
        entries.map(async ({ kind, place }) => {
          const route = await fetchRouteMetrics(currentLocation, place);
          const breakdown = scoreCandidate({
            place,
            preferenceVectors,
            experienceProfile: context.experienceProfile,
            weatherRisk: context.travelState.weatherRisk,
            trafficBurden: context.travelState.trafficBurden,
            now: context.travelState.now,
            slotTime: slot.time,
            routeDurationSeconds: route?.durationSeconds ?? null,
            routeDistanceMeters: route?.distanceMeters ?? null,
          });
          return { kind, place, breakdown };
        }),
      );

      return { itineraryOrder: sc.itineraryOrder, ranked: rankScored(ranked) };
    }),
  );
}
