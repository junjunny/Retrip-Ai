/**
 * POST /api/trip/{tripId}/replan/apply
 *   { baseItineraryFingerprint, baseLocationFingerprint, generatedAt, currentLocation? }
 *
 * Only ever called after the user explicitly presses [이 계획 적용] on a
 * preview they were shown — never automatically. The request body carries
 * only a fingerprint + a timestamp receipt from that preview; it does NOT
 * carry place data. The server independently re-derives the proposal (STEP
 * 8 + STEP 9, reused, never a client-supplied place) and writes only its
 * REPLACE slots. Returns 409 if the itinerary changed since the preview was
 * generated — never applies over a stale base. Returns
 * `{ itinerary, changedCount }`.
 */
import { applyReplanPreview, ReplanStaleError } from "@/features/replan/replanService";
import { TripNotFoundError } from "@/features/trip/tripAdminService";
import { allowRequest } from "@/lib/rateLimit";

const APPLY_COOLDOWN_MS = 4_000;

function parseCurrentLocation(v: unknown): { latitude: number; longitude: number } | null {
  if (typeof v !== "object" || v === null) return null;
  const p = v as Record<string, unknown>;
  return typeof p.latitude === "number" &&
    Number.isFinite(p.latitude) &&
    typeof p.longitude === "number" &&
    Number.isFinite(p.longitude)
    ? { latitude: p.latitude, longitude: p.longitude }
    : null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  if (!allowRequest(`replan-apply:${tripId}`, APPLY_COOLDOWN_MS)) {
    return Response.json(
      { error: "너무 빠르게 다시 요청했어요. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const baseItineraryFingerprint = body.baseItineraryFingerprint;
  const baseLocationFingerprint = body.baseLocationFingerprint;
  const generatedAt = body.generatedAt;
  if (typeof baseItineraryFingerprint !== "string" || !baseItineraryFingerprint) {
    return Response.json({ error: "요청 값을 확인해주세요." }, { status: 400 });
  }
  if (typeof baseLocationFingerprint !== "string" || !baseLocationFingerprint) {
    return Response.json({ error: "요청 값을 확인해주세요." }, { status: 400 });
  }
  if (typeof generatedAt !== "string" || Number.isNaN(new Date(generatedAt).getTime())) {
    return Response.json({ error: "요청 값을 확인해주세요." }, { status: 400 });
  }

  try {
    const result = await applyReplanPreview(tripId, {
      baseItineraryFingerprint,
      baseLocationFingerprint,
      generatedAt,
      currentLocation: parseCurrentLocation(body.currentLocation),
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof TripNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ReplanStaleError) {
      return Response.json({ error: err.message, stale: true }, { status: 409 });
    }
    console.error("[api/trip/replan/apply]", err instanceof Error ? err.message : "unknown error");
    return Response.json(
      { error: "적용하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
