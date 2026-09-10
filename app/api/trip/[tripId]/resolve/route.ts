/**
 * GET /api/trip/{tripId}/resolve?q=해운대해수욕장&lat=&lng=
 *
 * Runs STEP 2's `resolvePlace` (TourAPI + Kakao Local, server-only) and returns
 * the `NormalizedPlace`. Suggestion only — the client shows candidates and the
 * user picks. `tripId` is accepted for symmetry / future rate-limiting.
 */
import { ExternalApiError } from "@/lib/api";
import { resolvePlace } from "@/lib/place/resolve";

export const maxDuration = 20;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ error: "검색어를 입력해주세요." }, { status: 400 });

  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));

  try {
    const place = await resolvePlace({
      query: q,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
    });
    return Response.json({ place });
  } catch (err) {
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
