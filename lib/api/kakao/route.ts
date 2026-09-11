/**
 * Kakao Mobility Directions (apis-navi.kakaomobility.com/v1/directions) → `RouteData`.
 *
 * Verified working with the issued REST key. `duration` is traffic-aware for
 * priority RECOMMEND; per-road `traffic_speed` / `traffic_state` are passed
 * through as raw values. This adapter does NOT turn them into a "traffic burden"
 * score — that is Travel State Engine's job (§3-C).
 *
 * SERVER ONLY.
 */
import "server-only";

import { serverEnv } from "@/config/env";
import type { RouteData, RoutePolylinePoint } from "@/types";

import { num, str } from "../coerce";
import { ExternalApiError } from "../errors";
import { fetchJson } from "../http";

const BASE = "https://apis-navi.kakaomobility.com/v1/directions";
const SOURCE = "kakao/route";
// Traffic changes minute to minute — short TTL, and callers that need "now"
// should pass revalidate 0 via a dedicated path later.
const REVALIDATE = 60 * 2;

interface RawRoad {
  name?: string;
  distance?: number;
  duration?: number;
  traffic_speed?: number;
  traffic_state?: number;
  /** flattened [lng, lat, lng, lat, ...] in path order. */
  vertexes?: number[];
}
interface RawSection {
  roads?: RawRoad[];
}
interface RawRoute {
  result_code?: number;
  result_msg?: string;
  summary?: {
    distance?: number;
    duration?: number;
    priority?: string;
    fare?: { taxi?: number; toll?: number };
  };
  sections?: RawSection[];
}
interface RawDirections {
  routes?: RawRoute[];
}

export interface DirectionsParams {
  origin: { longitude: number; latitude: number };
  destination: { longitude: number; latitude: number };
  /** RECOMMEND (traffic-aware, default) | TIME | DISTANCE */
  priority?: "RECOMMEND" | "TIME" | "DISTANCE";
}

export async function fetchDrivingRoute(p: DirectionsParams): Promise<RouteData> {
  const key = serverEnv.kakaoRestApiKey;
  if (!key) throw new ExternalApiError("auth", SOURCE, "KAKAO_API_KEY is not configured");

  const params = new URLSearchParams({
    origin: `${p.origin.longitude},${p.origin.latitude}`,
    destination: `${p.destination.longitude},${p.destination.latitude}`,
    priority: p.priority ?? "RECOMMEND",
  });

  const body = await fetchJson<RawDirections>(`${BASE}?${params}`, {
    source: SOURCE,
    headers: { Authorization: `KakaoAK ${key}` },
    revalidateSeconds: REVALIDATE,
  });

  const route = body.routes?.[0];
  if (!route) throw new ExternalApiError("bad_response", SOURCE, "no route in response");
  if (route.result_code !== 0) {
    // result_code 104 = 출발/도착지 5km 이내, 101 = 도로 없음 등 — not retryable
    throw new ExternalApiError(
      "bad_response",
      SOURCE,
      `route not found (result_code ${route.result_code}: ${route.result_msg ?? ""})`,
    );
  }

  const summary = route.summary ?? {};
  const distance = num(summary.distance);
  const duration = num(summary.duration);
  if (distance === null || duration === null) {
    throw new ExternalApiError("bad_response", SOURCE, "route summary missing distance/duration");
  }

  const roads = (route.sections ?? []).flatMap((s) => s.roads ?? []);

  const trafficSegments = roads.map((r) => ({
    name: str(r.name) ?? "",
    distanceMeters: num(r.distance) ?? 0,
    durationSeconds: num(r.duration) ?? 0,
    speedKmh: num(r.traffic_speed),
    trafficState: num(r.traffic_state),
  }));

  const polyline: RoutePolylinePoint[] = roads.flatMap((r) => decodeVertexes(r.vertexes));

  return {
    distanceMeters: distance,
    durationSeconds: duration,
    taxiFare: num(summary.fare?.taxi),
    tollFare: num(summary.fare?.toll),
    priority: str(summary.priority) ?? (p.priority ?? "RECOMMEND"),
    trafficSegments,
    polyline,
    fetchedAt: new Date().toISOString(),
    provider: "kakao-mobility",
  };
}

/** [lng, lat, lng, lat, ...] -> [{latitude, longitude}, ...]. `undefined`/odd-length input -> []. */
function decodeVertexes(vertexes: number[] | undefined): RoutePolylinePoint[] {
  if (!Array.isArray(vertexes)) return [];
  const points: RoutePolylinePoint[] = [];
  for (let i = 0; i + 1 < vertexes.length; i += 2) {
    points.push({ longitude: vertexes[i], latitude: vertexes[i + 1] });
  }
  return points;
}
