/**
 * Resolve one place name against TourAPI + Kakao Local, then match.
 * SERVER ONLY (adapters read API keys). One source failing does not fail the
 * resolve — the other side is still used (and that gap is preserved).
 */
import "server-only";

import { searchPlacesByKeyword } from "@/lib/api/kakao/place";
import { searchTourismByKeyword } from "@/lib/api/tour/tourism";
import type { NormalizedPlace } from "@/types";

import { matchPlace, type PlaceMatchInput } from "./match";

export async function resolvePlace(
  input: PlaceMatchInput,
): Promise<NormalizedPlace> {
  const query = input.query.trim();
  if (!query) return matchPlace({ ...input, query: "" }, [], []);

  const [tour, kakao] = await Promise.all([
    searchTourismByKeyword(query, { numOfRows: 5 }).catch(() => []),
    searchPlacesByKeyword(query, {
      size: 5,
      ...(input.latitude != null && input.longitude != null
        ? { latitude: input.latitude, longitude: input.longitude }
        : {}),
    }).catch(() => []),
  ]);

  return matchPlace({ ...input, query }, tour, kakao);
}
