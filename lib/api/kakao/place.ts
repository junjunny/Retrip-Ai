/**
 * Kakao Local API (dapi.kakao.com/v2/local) → `PlaceLocation[]`.
 *
 * Verified working with the issued REST key:
 *   /search/keyword.json   place search by name
 *   /search/address.json   address → coordinate
 *   /geo/coord2address.json coordinate → address
 *
 * SERVER ONLY (key in Authorization header). This adapter returns *candidates*;
 * it never picks one place for an ambiguous name (§12).
 */
import "server-only";

import { serverEnv } from "@/config/env";
import type { PlaceLocation } from "@/types";

import { num, str } from "../coerce";
import { ExternalApiError } from "../errors";
import { fetchJson } from "../http";

const BASE = "https://dapi.kakao.com/v2/local";
const SOURCE = "kakao/place";
const REVALIDATE = 60 * 60 * 24; // place↔coordinate mappings are stable

function authHeader(): Record<string, string> {
  const key = serverEnv.kakaoRestApiKey;
  if (!key) throw new ExternalApiError("auth", SOURCE, "KAKAO_API_KEY is not configured");
  return { Authorization: `KakaoAK ${key}` };
}

interface KakaoKeywordDoc {
  id?: string;
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  category_name?: string;
  category_group_code?: string;
  phone?: string;
  place_url?: string;
  x?: string;
  y?: string;
}

function fromKeywordDoc(d: KakaoKeywordDoc): PlaceLocation | null {
  const lat = num(d.y);
  const lng = num(d.x);
  const name = str(d.place_name);
  if (lat === null || lng === null || !name) return null;
  return {
    id: str(d.id),
    name,
    address: str(d.address_name),
    roadAddress: str(d.road_address_name),
    category: str(d.category_name),
    categoryGroupCode: str(d.category_group_code),
    phone: str(d.phone),
    latitude: lat,
    longitude: lng,
    url: str(d.place_url),
    provider: "kakao",
  };
}

/**
 * Place-name search. Returns up to `size` candidates (default 5). An empty list
 * means "not found" — the caller must not fabricate a location.
 */
export async function searchPlacesByKeyword(
  query: string,
  opts: { size?: number; longitude?: number; latitude?: number; radiusMeters?: number } = {},
): Promise<PlaceLocation[]> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({
    query: query.trim(),
    size: String(Math.min(opts.size ?? 5, 15)),
  });
  if (opts.longitude != null && opts.latitude != null) {
    params.set("x", String(opts.longitude));
    params.set("y", String(opts.latitude));
    if (opts.radiusMeters) params.set("radius", String(Math.min(opts.radiusMeters, 20000)));
  }
  const body = await fetchJson<{ documents?: KakaoKeywordDoc[] }>(
    `${BASE}/search/keyword.json?${params}`,
    { source: SOURCE, headers: authHeader(), revalidateSeconds: REVALIDATE },
  );
  return (body.documents ?? []).map(fromKeywordDoc).filter((p): p is PlaceLocation => p !== null);
}

interface KakaoAddressDoc {
  address_name?: string;
  x?: string;
  y?: string;
  road_address?: { address_name?: string } | null;
}

/** Address string → coordinate candidates. */
export async function searchAddress(query: string): Promise<PlaceLocation[]> {
  if (!query.trim()) return [];
  const body = await fetchJson<{ documents?: KakaoAddressDoc[] }>(
    `${BASE}/search/address.json?query=${encodeURIComponent(query.trim())}&size=5`,
    { source: SOURCE, headers: authHeader(), revalidateSeconds: REVALIDATE },
  );
  return (body.documents ?? [])
    .map((d): PlaceLocation | null => {
      const lat = num(d.y);
      const lng = num(d.x);
      const name = str(d.address_name);
      if (lat === null || lng === null || !name) return null;
      return {
        id: null,
        name,
        address: name,
        roadAddress: str(d.road_address?.address_name),
        category: null,
        categoryGroupCode: null,
        phone: null,
        latitude: lat,
        longitude: lng,
        url: null,
        provider: "kakao",
      };
    })
    .filter((p): p is PlaceLocation => p !== null);
}

interface Coord2AddrDoc {
  address?: { address_name?: string } | null;
  road_address?: { address_name?: string } | null;
}

/** Coordinate → address string, or `null` if the point has no address (sea, etc.). */
export async function coordToAddress(
  longitude: number,
  latitude: number,
): Promise<{ address: string | null; roadAddress: string | null } | null> {
  const body = await fetchJson<{ documents?: Coord2AddrDoc[] }>(
    `${BASE}/geo/coord2address.json?x=${longitude}&y=${latitude}`,
    { source: SOURCE, headers: authHeader(), revalidateSeconds: REVALIDATE },
  );
  const doc = body.documents?.[0];
  if (!doc) return null;
  return {
    address: str(doc.address?.address_name),
    roadAddress: str(doc.road_address?.address_name),
  };
}

export const _internal = { fromKeywordDoc };
