/**
 * features/mobility — normalizes real route data into `MobilityOption[]`
 * (STEP 13). Pure: no fetch, no Firestore, no clock. I/O lives in
 * `./mobilityService`.
 *
 * WALK and TRANSIT are always `available: false` — Kakao Mobility only grants
 * 자동차 길찾기 to this project's REST key (도보/대중교통 통합 길찾기 are
 * 제휴-only APIs, see lib/api/kakao/route.ts's doc comment). This module never
 * estimates a walking/transit time to fill the gap — an unavailable mode says
 * so, honestly, rather than showing a number that isn't real API data.
 */
import type { MobilityMode, MobilityOption, RouteData } from "@/types";

export const MOBILITY_UNAVAILABLE_REASON: Record<Exclude<MobilityMode, "DRIVING">, string> = {
  WALK: "현재 이 프로젝트의 Kakao API 권한으로는 도보 경로 정보를 제공할 수 없습니다.",
  TRANSIT: "현재 이 프로젝트의 Kakao API 권한으로는 대중교통 경로 정보를 제공할 수 없습니다.",
};

export const DRIVING_ROUTE_UNAVAILABLE_REASON = "현재 경로 정보를 불러올 수 없습니다.";

/** Kakao's raw `traffic_state` code (0 unknown, 1 원활, 2 서행, 3 지체, 4 정체) -> a Korean label, or `null` for 0/unknown/no data. */
export function trafficStateLabel(code: number | null): string | null {
  switch (code) {
    case 1:
      return "원활";
    case 2:
      return "서행";
    case 3:
      return "지체";
    case 4:
      return "정체";
    default:
      return null;
  }
}

/** The single worst (highest-severity) real traffic_state code across a route's segments — `null` when no segment has real (non-zero) data. */
export function summarizeTrafficState(segments: RouteData["trafficSegments"]): number | null {
  const known = segments.map((s) => s.trafficState).filter((c): c is number => c !== null && c > 0);
  return known.length === 0 ? null : Math.max(...known);
}

function unavailableOption(mode: Exclude<MobilityMode, "DRIVING">): MobilityOption {
  return {
    mode,
    available: false,
    durationMinutes: null,
    distanceMeters: null,
    trafficLabel: null,
    transferCount: null,
    polyline: [],
    source: null,
    failureReason: MOBILITY_UNAVAILABLE_REASON[mode],
  };
}

/** `route: null` (no currentLocation, adapter failure, or never attempted) -> an honest unavailable DRIVING option — never a guessed duration. */
export function buildDrivingOption(route: RouteData | null): MobilityOption {
  if (!route) {
    return {
      mode: "DRIVING",
      available: false,
      durationMinutes: null,
      distanceMeters: null,
      trafficLabel: null,
      transferCount: null,
      polyline: [],
      source: null,
      failureReason: DRIVING_ROUTE_UNAVAILABLE_REASON,
    };
  }
  return {
    mode: "DRIVING",
    available: true,
    durationMinutes: Math.round(route.durationSeconds / 60),
    distanceMeters: route.distanceMeters,
    trafficLabel: trafficStateLabel(summarizeTrafficState(route.trafficSegments)),
    transferCount: null,
    polyline: route.polyline,
    source: "kakao-mobility",
    failureReason: null,
  };
}

/** All three modes, in display order (WALK, DRIVING, TRANSIT). Deterministic given the same `route`. */
export function buildMobilityOptions(route: RouteData | null): MobilityOption[] {
  return [unavailableOption("WALK"), buildDrivingOption(route), unavailableOption("TRANSIT")];
}
