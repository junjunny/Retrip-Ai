/**
 * features/candidate — Candidate Generation (STEP 8): real, API-confirmed
 * alternatives for a FLEXIBLE slot right now. NOT ranking, NOT scoring, NOT a
 * recommendation, NOT Re:Plan — see ./candidateGeneration for the pure domain
 * logic and its thresholds.
 *
 * Everything here is pure and browser-safe. The server-only
 * `generateCandidatesForTrip` (Firestore + TourAPI + Kakao Local) lives in
 * `./candidateService` and must be imported from there directly, never
 * re-exported here.
 */
export {
  MAX_CANDIDATES_PER_SLOT,
  MAX_REASONABLE_DISTANCE_METERS,
  PREFERENCE_TO_CONTENT_TYPE,
  buildCandidateFromTourism,
  buildSlotCandidates,
  dedupeCandidates,
  filterInvalidCandidates,
  resolveSlotAnchor,
  selectFlexibleSlots,
  selectNearbySearchRadiusMeters,
  selectSearchContentTypeIds,
} from "./candidateGeneration";
