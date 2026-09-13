/**
 * GET /api/trip/{tripId}/segment-mobility?from=3&to=4
 *
 * Real Kakao Mobility between two of THIS trip's own confirmed itinerary
 * items (STEP 18 §9) — the exact same `fetchDrivingRoute` + `buildMobilityOptions`
 * Re:Plan's scoring already uses (features/scoring/scoringService.ts), never a
 * second implementation. Only ever called for the current -> next segment
 * (STEP 18 §11/§17), never once per segment in the whole itinerary — bounded
 * to exactly one real API call per Trip Detail view of the "다음 일정" card.
 *
 * `singleFlight`-coalesced per (tripId, from, to) so React Strict Mode's
 * dev-only double effect invocation can't double-fire it (STEP 14/18 §38).
 */
import { buildMobilityOptions } from "@/features/mobility";
import { coerceItinerary } from "@/features/trip/trip";
import { fetchDrivingRoute } from "@/lib/api";
import { getAdminDb } from "@/lib/firebase/admin";
import { singleFlight } from "@/lib/rateLimit";

export const maxDuration = 20;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const url = new URL(req.url);
  const fromOrder = Number(url.searchParams.get("from"));
  const toOrder = Number(url.searchParams.get("to"));
  if (!Number.isInteger(fromOrder) || !Number.isInteger(toOrder)) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    if (!db) throw new Error("Firebase Admin이 설정되지 않았습니다.");

    const mobility = await singleFlight(`segment-mobility:${tripId}:${fromOrder}:${toOrder}`, async () => {
      const snap = await db.doc(`trips/${tripId}`).get();
      if (!snap.exists) return null;
      const data = snap.data() ?? {};
      const startDate = typeof data.startDate === "string" ? data.startDate : "";
      const itinerary = coerceItinerary(data.itinerary, startDate);
      const from = itinerary.find((it) => it.order === fromOrder);
      const to = itinerary.find((it) => it.order === toOrder);
      if (!from || !to) return null;
      if (from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) {
        return buildMobilityOptions(null);
      }
      const route = await fetchDrivingRoute({
        origin: { latitude: from.latitude, longitude: from.longitude },
        destination: { latitude: to.latitude, longitude: to.longitude },
      }).catch(() => null);
      return buildMobilityOptions(route);
    });

    if (!mobility) return Response.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ mobility });
  } catch (err) {
    console.error("[api/trip/segment-mobility]", err instanceof Error ? err.message : "unknown error");
    return Response.json({ error: "이동정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
