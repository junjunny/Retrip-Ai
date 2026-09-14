/**
 * features/demo/demoReplanOverride — SERVER ONLY. The one narrow, explicit,
 * demo-scoped connection between a Demo scenario and the real Re:Plan
 * pipeline (STEP 22 §49/§61).
 *
 * Context: the 대전 demo's trigger item ("대청호자연수변공원", a real, TourAPI-
 * and Kakao-verified 관광지 in 동구 추동) is scripted to be near the group's
 * intended replacement place, "명상정원" (대전 동구 추동 680 — also real,
 * verified via the exact same `resolvePlace` pipeline every real candidate
 * uses). But real candidate generation (`features/candidate/candidateService.ts`)
 * can never surface it: it discovers candidates via TourAPI's
 * `locationBasedList2` operation, and that operation's own index does not
 * return this specific content record from ANY real nearby anchor — verified
 * by live probe (radius up to 5km, contentTypeId 12) — the same class of gap
 * STEP 16 already documented for "국립무형유산원" not existing in TourAPI's
 * dataset at all. This is an external-data-coverage gap, not a scoring
 * disagreement: real deterministic scoring still decides WHETHER to replace
 * the slot at all, from real candidates it actually found nearby (e.g.
 * "추동인공생태습지") — this module only swaps WHICH real place fills a
 * REPLACE decision the real pipeline already made on its own, for this one
 * named scenario + slot, using the exact same real adapters every other
 * candidate uses (`resolvePlace`, `fetchDrivingRoute`, and — via the
 * existing `tourApiContentId` on the swapped-in `CandidatePlace` —
 * `fetchTourismDetail`, already called downstream by
 * features/replan/explanation/explanationService.ts's `fetchPlaceDetails`
 * with ZERO changes needed there). It never forces a KEEP slot into a
 * REPLACE, never invents a distance/duration/image, and only ever activates
 * for `demoScenarioId === "daejeon"` on the exact trigger place name — every
 * other trip (every real trip, and the other two demos) is completely
 * unaffected; nothing here is imported by `features/candidate` or
 * `features/scoring`, so the domain algorithms themselves stay untouched.
 */
import "server-only";

import { buildMobilityOptions } from "@/features/mobility";
import { fetchDrivingRoute } from "@/lib/api";
import { resolvePlace } from "@/lib/place/resolve";
import type { CandidatePlace, PlaceSource } from "@/types";

import type { ReplanPreview } from "@/features/replan/replan";

export const DAEJEON_SCENARIO_ID = "daejeon";
/** The scenario's scripted trigger place — see this module's doc comment. */
export const DAEJEON_TRIGGER_PLACE_NAME = "대청호자연수변공원";
/** The scenario's intended replacement — real, verified, never a hardcoded coordinate (see `resolvePlace` below). */
export const DAEJEON_REPLACEMENT_QUERY = "명상정원";

/**
 * `preview` unchanged unless: this is the 대전 demo AND real scoring already
 * decided to REPLACE the exact trigger slot. When both hold, resolves
 * "명상정원" through the SAME real `resolvePlace` pipeline every candidate
 * uses, computes a REAL Kakao Mobility route when a real `currentLocation`
 * is available (never fabricated — `null`/unavailable exactly like any
 * other candidate without one), and swaps only that one slot's `proposed`
 * place + mobility. `score.breakdown` (the internal numbers, never shown to
 * the user) is left as real scoring computed it for whichever real
 * candidate actually won — this only changes which real place's identity,
 * image, address, and real route are displayed and written on Apply.
 * Any real-API failure here simply leaves the real pipeline's own organic
 * pick in place — never a fabricated fallback.
 */
export async function applyDaejeonReplacementOverride(
  preview: ReplanPreview,
  demoScenarioId: string | null | undefined,
  currentLocation: { latitude: number; longitude: number } | null,
): Promise<ReplanPreview> {
  if (demoScenarioId !== DAEJEON_SCENARIO_ID) return preview;

  const slotIndex = preview.slots.findIndex(
    (s) => s.action === "REPLACE" && s.current.placeName === DAEJEON_TRIGGER_PLACE_NAME,
  );
  if (slotIndex === -1) return preview;
  const slot = preview.slots[slotIndex];

  try {
    const resolved = await resolvePlace({ query: DAEJEON_REPLACEMENT_QUERY, latitude: null, longitude: null });
    if (!resolved || resolved.verificationStatus === "unresolved" || resolved.latitude == null || resolved.longitude == null) {
      return preview;
    }

    const route = currentLocation
      ? await fetchDrivingRoute({
          origin: currentLocation,
          destination: { latitude: resolved.latitude, longitude: resolved.longitude },
        }).catch(() => null)
      : null;

    const place: CandidatePlace = {
      placeId: resolved.placeId,
      placeName: resolved.placeName,
      address: resolved.roadAddress ?? resolved.address,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      category: null,
      tourApiContentId: resolved.tourApiContentId,
      imageUrl: resolved.tourApiImageUrl,
      source: (resolved.sources[0] ?? "kakao") as PlaceSource,
      verificationStatus: resolved.verificationStatus,
      candidateReason: resolved.sources.includes("kakao")
        ? "Demo 시나리오 대안 (TourAPI + Kakao Local 검증)"
        : "Demo 시나리오 대안 (TourAPI 검증)",
    };

    const slots = [...preview.slots];
    slots[slotIndex] = {
      ...slot,
      proposed: {
        placeId: place.placeId,
        placeName: place.placeName,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        source: place.source,
        verificationStatus: place.verificationStatus,
        imageUrl: place.imageUrl,
      },
      score: {
        ...slot.score,
        place,
        route: route ? { durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters } : null,
        mobility: buildMobilityOptions(route),
      },
    };
    return { ...preview, slots };
  } catch {
    return preview;
  }
}
