/**
 * lib/place — TourAPI ↔ Kakao Local place normalization.
 *
 * `match.ts`   pure deterministic matching (name / address / coord → confidence)
 * `resolve.ts` server-only: calls the adapters, then matches
 */
export {
  addressOverlap,
  addressTokens,
  haversineMeters,
  matchPlace,
  nameSimilarity,
  normalizeName,
  type PlaceMatchInput,
} from "./match";
