/**
 * GET /api/trip/{tripId}/mini-guide
 *
 * Read-only, display-only content — fetched automatically when the trip
 * detail page loads (unlike Re:Plan, this is never a plan/itinerary
 * decision, so there's no "user must trigger it" requirement; see
 * AGENTS-spec §0.2 — the ban is on automatic ITINERARY CHANGES, not on
 * showing informational text). Returns `{ guide: null }` when the trip has
 * no `tripPreference` set (nothing to guide) or doesn't exist — never a 404
 * for "no guide yet", since that's a normal state, not an error.
 */
import { generateMiniGuide } from "@/features/miniGuide/miniGuideService";
import { getTripPreference } from "@/features/trip/tripAdminService";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  try {
    const tripPreference = await getTripPreference(tripId);
    if (!tripPreference) return Response.json({ guide: null });
    const guide = await generateMiniGuide(tripPreference);
    return Response.json({ guide });
  } catch (err) {
    console.error("[api/trip/mini-guide]", err instanceof Error ? err.message : "unknown error");
    // display-only content — a failure here should never look like a broken page
    return Response.json({ guide: null });
  }
}
