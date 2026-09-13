/**
 * GET /api/trip/{tripId}/resolve?q=해운대해수욕장&lat=&lng=
 * GET /api/trip/{tripId}/resolve?addr=전북특별자치도 전주시 완산구 교동 84-10
 *
 * Runs STEP 2's `resolvePlace` (TourAPI + Kakao Local, server-only) and returns
 * the `NormalizedPlace`. Suggestion only — the client shows candidates and the
 * user picks. Rate-limited per `tripId` (STEP 13 §16) — this proxies two paid
 * external APIs and takes an arbitrary free-text query, so it's the easiest
 * route in this project to turn into a free lookup service if left open.
 *
 * `addr` (STEP 17) is a separate, narrower path for when the caller already
 * has a real street address rather than a place name to search by (e.g. a
 * generic-named place a keyword search can't disambiguate) — it calls Kakao's
 * already-integrated `searchAddress` (address → coordinate) directly, never
 * TourAPI/candidate matching. Additive only: `q` behaves exactly as before.
 */
import { ExternalApiError } from "@/lib/api";
import { searchAddress } from "@/lib/api/kakao/place";
import { allowRequest, singleFlight } from "@/lib/rateLimit";
import { resolvePlace } from "@/lib/place/resolve";
import type { NormalizedPlace } from "@/types";

export const maxDuration = 20;

const RESOLVE_COOLDOWN_MS = 1_000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  const url = new URL(req.url);
  const addr = url.searchParams.get("addr")?.trim() ?? "";
  if (addr) return resolveByAddress(tripId, addr);

  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ error: "검색어를 입력해주세요." }, { status: 400 });

  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));

  // singleFlight coalesces two near-simultaneous identical lookups (e.g. React
  // Strict Mode's dev-only double effect invocation) into one real call, so
  // the cooldown below only ever rejects a genuinely NEW query (STEP 14).
  try {
    const place = await singleFlight(`resolve:${tripId}:${q}:${lat}:${lng}`, async () => {
      if (!allowRequest(`resolve:${tripId}`, RESOLVE_COOLDOWN_MS)) {
        throw new RateLimitedError();
      }
      return resolvePlace({
        query: q,
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lng) ? lng : null,
      });
    });
    return Response.json({ place });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return Response.json(
        { error: "너무 빠르게 다시 요청했어요. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }
    console.error(
      "[api/trip/resolve]",
      err instanceof Error ? err.message : "unknown error",
    );
    const status = err instanceof ExternalApiError && err.kind === "auth" ? 502 : 500;
    return Response.json(
      { error: "장소를 확인하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status },
    );
  }
}

class RateLimitedError extends Error {}

async function resolveByAddress(tripId: string, addr: string): Promise<Response> {
  try {
    const results = await singleFlight(`resolve-addr:${tripId}:${addr}`, async () => {
      if (!allowRequest(`resolve:${tripId}`, RESOLVE_COOLDOWN_MS)) {
        throw new RateLimitedError();
      }
      return searchAddress(addr);
    });
    const hit = results[0] ?? null;
    const place: NormalizedPlace = {
      query: addr,
      placeName: hit?.name ?? addr,
      placeId: null,
      address: hit?.address ?? null,
      roadAddress: hit?.roadAddress ?? null,
      latitude: hit?.latitude ?? null,
      longitude: hit?.longitude ?? null,
      tourApiContentId: null,
      tourApiCategoryCode: null,
      tourApiImageUrl: null,
      kakaoPlaceId: null,
      kakaoCategory: null,
      kakaoPlaceUrl: null,
      confidence: hit ? "high" : "low",
      verificationStatus: hit ? "verified" : "unresolved",
      sources: hit ? ["kakao"] : [],
      candidates: [],
    };
    return Response.json({ place });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return Response.json(
        { error: "너무 빠르게 다시 요청했어요. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }
    console.error(
      "[api/trip/resolve][addr]",
      err instanceof Error ? err.message : "unknown error",
    );
    const status = err instanceof ExternalApiError && err.kind === "auth" ? 502 : 500;
    return Response.json(
      { error: "주소를 확인하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status },
    );
  }
}
