/**
 * GET /api/trip/{tripId}/situation?lat=&lng=
 *
 * Computes the trip's real Travel State (features/travel-state/travelStateService
 * — unchanged, STEP 7) and returns ONLY a user-facing sentence (STEP 18 §19),
 * via `buildSituationMessage` — never the internal status/level/score. `lat`/
 * `lng` are optional and behave exactly like Re:Plan's `currentLocation`
 * (STEP 13 §6): omitted -> traffic burden stays "unknown" -> no traffic-based
 * banner, never a guessed origin.
 *
 * `{ situation: null }` is a normal, common response — "nothing worth
 * surfacing right now" (STEP 18 §37: this is not a running dashboard).
 */
import { buildSituationMessage } from "@/features/travel-state";
import { getTripTravelState } from "@/features/travel-state/travelStateService";
import { TripNotFoundError } from "@/features/trip/tripAdminService";

export const maxDuration = 20;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const currentLocation = Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;

  try {
    const travelState = await getTripTravelState(tripId, { currentLocation });
    const situation = buildSituationMessage(travelState.weatherRisk, travelState.trafficBurden);
    return Response.json({ situation });
  } catch (err) {
    if (err instanceof TripNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    console.error("[api/trip/situation]", err instanceof Error ? err.message : "unknown error");
    // A situation banner is a nice-to-have, never a blocking failure — an
    // adapter outage degrades to "nothing to show" rather than an error.
    return Response.json({ situation: null });
  }
}
