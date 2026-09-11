/**
 * POST /api/trip/{tripId}/replan/preview
 *   { currentLocation?: { latitude, longitude } }
 *
 * User-triggered ONLY — this route is never called automatically by a timer,
 * page load, or Travel State change (see AGENTS-spec §32). Read-only: never
 * writes the itinerary. `now` always comes from the server clock — a client
 * can never supply it (that would let a client manipulate weather/schedule
 * scoring for a time that isn't real). Returns `{ preview, explanation }`;
 * `preview.slots` is `[]` (not an error) when there's nothing eligible to
 * re-plan right now. `explanation` (STEP 11) is a human-readable summary of
 * the SAME deterministic `preview` — an LLM failure degrades it to a
 * deterministic fallback but never fails this request (see
 * features/replan/explanation).
 */
import { generateReplanPreviewWithExplanation } from "@/features/replan/replanService";
import { TripNotFoundError } from "@/features/trip/tripAdminService";

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

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const currentLocation = parseCurrentLocation(body.currentLocation);

  try {
    const { preview, explanation } = await generateReplanPreviewWithExplanation(tripId, { currentLocation });
    return Response.json({ preview, explanation });
  } catch (err) {
    if (err instanceof TripNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    console.error("[api/trip/replan/preview]", err instanceof Error ? err.message : "unknown error");
    return Response.json(
      { error: "계획을 생성하지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
