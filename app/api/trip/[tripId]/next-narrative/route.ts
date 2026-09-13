/**
 * GET /api/trip/{tripId}/next-narrative?order=4&fromOrder=3
 *
 * STEP 19 — a short, fact-grounded narrative about itinerary item `order`
 * (the place the traveler is about to head to), for the journey card's
 * "완료" step. `fromOrder` (optional) is the place just completed, used only
 * for narrative flow + a real current->next Kakao Mobility fact (reusing
 * the SAME `fetchDrivingRoute` the segment-mobility route already uses —
 * never a second implementation).
 *
 * `{ narrative: null }` is a NORMAL, common response: no TourAPI overview
 * exists for this place (a Kakao-only or unconfirmed item), so the LLM is
 * never even called (STEP 19 §9) — the client already has a deterministic
 * fallback message ready and must use it.
 *
 * `singleFlight`-coalesced per (tripId, order) so React Strict Mode's
 * dev-only double effect invocation can't double-fire the LLM call.
 */
import { buildNarrativeFacts, generatePlaceNarrative } from "@/features/journey";
import { coerceItinerary } from "@/features/trip/trip";
import { fetchDrivingRoute, fetchTourismDetail } from "@/lib/api";
import { getAdminDb } from "@/lib/firebase/admin";
import { singleFlight } from "@/lib/rateLimit";

export const maxDuration = 20;

function toKstDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const url = new URL(req.url);
  const order = Number(url.searchParams.get("order"));
  const fromOrder = Number(url.searchParams.get("fromOrder"));
  if (!Number.isInteger(order)) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    if (!db) throw new Error("Firebase Admin이 설정되지 않았습니다.");

    const narrative = await singleFlight(`next-narrative:${tripId}:${order}`, async () => {
      const snap = await db.doc(`trips/${tripId}`).get();
      if (!snap.exists) return null;
      const data = snap.data() ?? {};
      const startDate = typeof data.startDate === "string" ? data.startDate : "";
      const itinerary = coerceItinerary(data.itinerary, startDate);
      const item = itinerary.find((it) => it.order === order);
      if (!item) return null;

      // TourAPI content only exists behind a "tour:{contentId}" placeId
      // (see types/index.ts's ItineraryItem.placeId doc comment) — a
      // Kakao-only or unconfirmed item has no official overview to ground
      // a narrative in, so the LLM is never called for it (STEP 19 §9).
      const detail = item.placeId?.startsWith("tour:")
        ? await fetchTourismDetail(item.placeId.slice("tour:".length), null).catch(() => null)
        : null;
      if (!detail?.description) return null;

      const fromItem = Number.isInteger(fromOrder) ? itinerary.find((it) => it.order === fromOrder) : undefined;
      const route =
        fromItem?.latitude != null && fromItem?.longitude != null && item.latitude != null && item.longitude != null
          ? await fetchDrivingRoute({
              origin: { latitude: fromItem.latitude, longitude: fromItem.longitude },
              destination: { latitude: item.latitude, longitude: item.longitude },
            }).catch(() => null)
          : null;

      const facts = buildNarrativeFacts({
        placeName: item.placeName,
        address: item.address,
        detail: { overview: detail.description, event: detail.event },
        nowDate: toKstDate(new Date()),
        previousPlaceName: fromItem?.placeName ?? null,
        route: route ? { durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters } : null,
      });

      return generatePlaceNarrative(facts);
    });

    return Response.json({ narrative });
  } catch (err) {
    console.error("[api/trip/next-narrative]", err instanceof Error ? err.message : "unknown error");
    // A richer narrative is a nice-to-have, never a blocking failure.
    return Response.json({ narrative: null });
  }
}
