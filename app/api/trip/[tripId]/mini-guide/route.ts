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
import { allowRequest, singleFlight } from "@/lib/rateLimit";

/**
 * One LLM call per hit — a refresh-spamming user just gets `{ guide: null }`
 * back (display-only, never a broken-looking error). `singleFlight` handles
 * two near-simultaneous requests for the SAME trip (e.g. React Strict Mode's
 * dev-only double effect invocation) by sharing one real call instead of the
 * second being rejected by the cooldown below — a genuine concurrent-request
 * bug, not just a hypothetical (STEP 14).
 */
const MINI_GUIDE_COOLDOWN_MS = 15_000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  const guide = await singleFlight(`mini-guide:${tripId}`, async () => {
    if (!allowRequest(`mini-guide:${tripId}`, MINI_GUIDE_COOLDOWN_MS)) {
      return null;
    }
    try {
      const tripPreference = await getTripPreference(tripId);
      if (!tripPreference) return null;
      return await generateMiniGuide(tripPreference);
    } catch (err) {
      console.error("[api/trip/mini-guide]", err instanceof Error ? err.message : "unknown error");
      // display-only content — a failure here should never look like a broken page
      return null;
    }
  });
  return Response.json({ guide });
}
