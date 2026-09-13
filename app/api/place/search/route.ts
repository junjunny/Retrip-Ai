/**
 * GET /api/place/search?q=경기전
 *
 * Same `resolvePlace` (TourAPI + Kakao Local, server-only) as
 * `/api/trip/{tripId}/resolve` — the only difference is this one runs BEFORE
 * a trip exists (STEP 18's "이번 여행에서 가고 싶은 곳" step in Trip Create),
 * so there is no `tripId` to scope the rate limit to. Suggestion only — the
 * client shows candidates and the user picks; never a blind `results[0]`.
 * Rate-limited globally (not per-trip, since none exists yet) — same
 * cooldown as the per-trip route, reusing the same `allowRequest`/
 * `singleFlight` infrastructure (STEP 18 §11/§38: never a second rate-limit
 * implementation).
 */
import { ExternalApiError } from "@/lib/api";
import { allowRequest, singleFlight } from "@/lib/rateLimit";
import { resolvePlace } from "@/lib/place/resolve";

export const maxDuration = 20;

const SEARCH_COOLDOWN_MS = 1_000;

class RateLimitedError extends Error {}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ error: "검색어를 입력해주세요." }, { status: 400 });

  try {
    const place = await singleFlight(`place-search:${q}`, async () => {
      if (!allowRequest("place-search", SEARCH_COOLDOWN_MS)) {
        throw new RateLimitedError();
      }
      return resolvePlace({ query: q, latitude: null, longitude: null });
    });
    return Response.json({ place });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return Response.json(
        { error: "너무 빠르게 다시 요청했어요. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }
    console.error("[api/place/search]", err instanceof Error ? err.message : "unknown error");
    const status = err instanceof ExternalApiError && err.kind === "auth" ? 502 : 500;
    return Response.json(
      { error: "장소를 찾지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status },
    );
  }
}
